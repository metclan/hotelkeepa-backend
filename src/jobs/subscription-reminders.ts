import { PrismaClient } from "../generated/prisma/client.js";
import { escapeHtml, sendEmail } from "../lib/email.service.js";

const db = new PrismaClient();

async function sendRenewalReminders() {
  const billingUrl = new URL("/settings/subscription", process.env.FRONTEND_URL);
  const now = new Date();
  const through = new Date(now.getTime() + 30 * 86_400_000);
  const due = await db.subscription.findMany({
    where: {
      location: { isActive: true, isDeleted: false },
      startDate: { lte: now },
      endDate: { gt: now, lte: through },
      renewalReminderAt: null,
    },
    select: {
      id: true, endDate: true,
      location: { select: { id: true, name: true, timezone: true } },
      business: {
        select: { users: { where: { isOwner: true, isActive: true, emailVerified: true }, select: { email: true } } },
      },
    },
  });

  for (const term of due) {
    const { location, endDate } = term;
    if (!location || !endDate || !term.business.users.length) continue;
    const next = await db.subscription.findFirst({
      where: { locationId: location.id, startDate: { gte: endDate } },
      select: { id: true },
    });
    if (next) continue;
    const claimed = await db.subscription.updateMany({
      where: { id: term.id, renewalReminderAt: null },
      data: { renewalReminderAt: now },
    });
    if (!claimed.count) continue;
    const expiry = new Intl.DateTimeFormat("en-NG", { dateStyle: "long", timeZone: location.timezone }).format(endDate);
    try {
      for (const owner of term.business.users) {
        await sendEmail({
          to: owner.email,
          subject: "Your Hotelkeepa subscription expires soon",
          html: `<p>The subscription for ${escapeHtml(location.name || "your hotel")} ends on ${escapeHtml(expiry)}.</p><p><a href="${escapeHtml(billingUrl.href)}">View billing and renew</a></p>`,
        });
      }
    } catch {
      await db.subscription.updateMany({
        where: { id: term.id, renewalReminderAt: now },
        data: { renewalReminderAt: null },
      });
      process.exitCode = 1;
      console.error("Could not send a Hotelkeepa subscription reminder");
    }
  }
}

sendRenewalReminders()
  .catch(() => {
    console.error("Could not run Hotelkeepa subscription reminders");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
