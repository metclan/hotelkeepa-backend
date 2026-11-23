import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

export type EmailOptions = { to: string; subject: string; html: string; text?: string };

export function buildSesEmail(options: EmailOptions, from: string, replyTo?: string, configurationSet?: string) {
  return new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [options.to] },
    ReplyToAddresses: replyTo ? [replyTo] : undefined,
    ConfigurationSetName: configurationSet || undefined,
    Content: { Simple: {
      Subject: { Data: options.subject, Charset: "UTF-8" },
      Body: {
        Html: { Data: options.html, Charset: "UTF-8" },
        ...(options.text ? { Text: { Data: options.text, Charset: "UTF-8" } } : {}),
      },
    } },
  });
}

let client: SESv2Client | undefined;
export async function sendSesEmail(options: EmailOptions): Promise<void> {
  const from = process.env.SES_FROM_EMAIL?.trim();
  const region = process.env.AWS_REGION?.trim();
  if (!from || !region) throw new Error("SES_FROM_EMAIL and AWS_REGION are required for email delivery");
  // Uses the AWS credential chain (environment credentials or deployment IAM role).
  client ??= new SESv2Client({ region, maxAttempts: 2 });
  await client.send(buildSesEmail(options, from, process.env.SES_REPLY_TO_EMAIL, process.env.SES_CONFIGURATION_SET));
}
