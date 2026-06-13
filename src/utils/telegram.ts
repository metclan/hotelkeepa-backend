import { PrismaClient } from "../generated/prisma/client.js";
import TelegramBot from "node-telegram-bot-api";

const isDevelopment = process.env.NODE_ENV === "development";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const bot = TELEGRAM_BOT_TOKEN
  ? new TelegramBot(TELEGRAM_BOT_TOKEN, {
      polling: !isDevelopment, // Only enable polling in production
    })
  : null;

const prisma = new PrismaClient();

interface ErrorMessage {
  context?: Record<string, unknown>;
  message: string;
  stack?: string;
  timestamp?: string;
}

// Handle /businesses command
if (bot) {
  bot.onText(/\/businesses/, async (msg) => {
    try {
      // Only allow the configured chat ID to use this command
      if (msg.chat.id.toString() !== CHAT_ID) {
        await bot.sendMessage(msg.chat.id, "Unauthorized");
        return;
      }

      // Fetch all businesses with their owner information
      const businesses = await prisma.business.findMany({
        orderBy: {
          name: "asc",
        },
        select: {
          name: true,
          owner: {
            select: {
              email: true,
              phone: true,
            },
          },
        },
      });

      if (businesses.length === 0) {
        await bot.sendMessage(CHAT_ID, "No businesses found");
        return;
      }

      // Format the business list
      // const businessList = businesses.map((business) => {
      //   const phone = business.owner.phone
      //     ? `\nPhone: ${business.owner.phone}`
      //     : "";
      //   return `🏢 <b>${business.name}</b>\nEmail: ${business.owner.email}${phone}`;
      // });

      // Send the formatted message
      // await bot.sendMessage(CHAT_ID, businessList.join("\n\n"), {
      //   parse_mode: "HTML",
      // });
    } catch (error) {
      console.error("Error fetching businesses:", error);
      await bot.sendMessage(CHAT_ID, "Failed to fetch businesses");
    }
  });
}

/**
 * Sends an error message to Telegram asynchronously
 * @param error - Error object or message string
 * @param context - Additional context to include with the error
 */
export function sendTelegramError(
  error: Error | string,
  context?: Record<string, unknown>,
) {
  const errorMessage: ErrorMessage = {
    context,
    message: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
  };

  if (isDevelopment) {
    // In development, log to console with formatting
    console.error("\n🚨 Error Alert");
    console.error("\nMessage:", errorMessage.message);
    if (errorMessage.stack) {
      console.error("\nStack Trace:", errorMessage.stack);
    }
    if (errorMessage.context && Object.keys(errorMessage.context).length > 0) {
      console.error(
        "\nContext:",
        JSON.stringify(errorMessage.context, null, 2),
      );
    }
    console.error("\nTime:", errorMessage.timestamp, "\n");
    return;
  }

  if (!CHAT_ID) {
    console.error("TELEGRAM_CHAT_ID is not set");
    return;
  }
  if (!bot) {
    console.error("TELEGRAM_BOT_TOKEN is not set");
    return;
  }

  const formattedMessage = formatErrorMessage(errorMessage);

  // Send message asynchronously
  setImmediate(() => {
    bot
      .sendMessage(CHAT_ID, formattedMessage, { parse_mode: "HTML" })
      .catch((err) => {
        console.error("Failed to send error to Telegram:", err);
      });
  });
}

/**
 * Formats the error message for Telegram
 */
function formatErrorMessage(error: ErrorMessage): string {
  const parts = [
    "🚨 <b>Error Alert</b>",
    "",
    `<b>Message:</b>\n${error.message}`,
  ];

  if (error.stack) {
    parts.push("", "<b>Stack Trace:</b>", `<pre>${error.stack}</pre>`);
  }

  if (error.context && Object.keys(error.context).length > 0) {
    parts.push(
      "",
      "<b>Context:</b>",
      `<pre>${JSON.stringify(error.context, null, 2)}</pre>`,
    );
  }

  parts.push("", `<i>Time: ${error.timestamp}</i>`);

  return parts.join("\n");
}
