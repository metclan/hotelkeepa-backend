import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { createLogoStorage, logoObjectKey } from "../src/lib/logo-storage.js";
import { buildSesEmail } from "../src/lib/email.js";
import { sendEmail, sendInviteEmail, sendWelcomeEmail } from "../src/lib/email.service.js";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=";

test("R2 upload uses a business-scoped safe path and returns the public URL", async () => {
  const commands: (PutObjectCommand | DeleteObjectCommand)[] = [];
  const storage = createLogoStorage({ send: async (command) => { commands.push(command); } }, "hotel-assets", "https://assets.example.com/");
  const stored = await storage.upload("business-123", "Metclan Hotel / Ikeja", png);
  assert.match(stored.key, /^logo\/business-123-metclan-hotel-ikeja\/logofolder\/[a-f0-9-]+\.png$/);
  assert.equal(stored.url, `https://assets.example.com/${stored.key}`);
  const command = commands[0];
  assert.ok(command instanceof PutObjectCommand);
  assert.equal(command.input.Bucket, "hotel-assets");
  assert.equal(command.input.ContentType, "image/png");
  assert.ok(Buffer.isBuffer(command.input.Body));
  await storage.remove(stored.key);
  assert.ok(commands[1] instanceof DeleteObjectCommand);
  assert.equal(commands[1].input.Key, stored.key);
  assert.notEqual(logoObjectKey("business-123", "Metclan Hotel", "png"), stored.key);
});

test("invalid images and paths never reach R2; upload failures propagate", async () => {
  let requests = 0;
  const storage = createLogoStorage({ send: async () => { requests++; throw new Error("R2 unavailable"); } }, "assets", "https://assets.example.com");
  await assert.rejects(storage.upload("business-123", "Hotel", "data:image/png;base64,aGVsbG8="), /Invalid hotel logo/);
  assert.equal(requests, 0);
  assert.throws(() => logoObjectKey("../other-business", "Hotel", "png"), /Invalid business ID/);
  assert.throws(() => createLogoStorage({ send: async () => {} }, "assets", "http://assets.example.com"), /HTTPS/);
  await assert.rejects(storage.upload("business-123", "Hotel", png), /R2 unavailable/);
});

test("SES command contains sender, recipient, UTF-8 content and optional routing", () => {
  const command = buildSesEmail({ to: "guest@example.com", subject: "Welcome", html: "<p>Hello</p>", text: "Hello" }, "Hotelkeepa <hello@example.com>", "support@example.com", "transactional");
  assert.deepEqual(command.input.Destination, { ToAddresses: ["guest@example.com"] });
  assert.equal(command.input.FromEmailAddress, "Hotelkeepa <hello@example.com>");
  assert.equal(command.input.Content?.Simple?.Body?.Text?.Data, "Hello");
  assert.equal(command.input.Content?.Simple?.Subject?.Charset, "UTF-8");
  assert.equal(command.input.ConfigurationSetName, "transactional");
});

test("welcome, invitation, reset and generic messages all use SES without sending live mail", async () => {
  const previousFrom = process.env.SES_FROM_EMAIL;
  const previousRegion = process.env.AWS_REGION;
  process.env.SES_FROM_EMAIL = "hello@example.com";
  process.env.AWS_REGION = "eu-west-1";
  const commands: SendEmailCommand[] = [];
  const transport = mock.method(SESv2Client.prototype, "send", async (command: SendEmailCommand) => { commands.push(command); return { MessageId: "test" }; });
  try {
    await sendWelcomeEmail({ to: "owner@example.com", name: "<Owner>" });
    await sendInviteEmail({ to: "staff@example.com", name: "<Staff>", invitedBy: "Owner & Co", inviteUrl: "https://example.com/invite?token=test", expiresAt: new Date("2026-12-01") });
    await sendEmail({ to: "owner@example.com", subject: "Reset your password", html: "Reset link" });
    await sendEmail({ to: "owner@example.com", subject: "Other message", html: "Message" });
    assert.equal(commands.length, 4);
    assert.match(commands[0].input.Content!.Simple!.Body!.Html!.Data!, /&lt;Owner&gt;/);
    assert.match(commands[1].input.Content!.Simple!.Body!.Html!.Data!, /Owner &amp; Co/);
    transport.mock.mockImplementation(async () => { throw new Error("SES unavailable"); });
    await assert.rejects(sendEmail({ to: "owner@example.com", subject: "Test", html: "Test" }), /SES unavailable/);
  } finally {
    transport.mock.restore();
    if (previousFrom === undefined) delete process.env.SES_FROM_EMAIL; else process.env.SES_FROM_EMAIL = previousFrom;
    if (previousRegion === undefined) delete process.env.AWS_REGION; else process.env.AWS_REGION = previousRegion;
  }
});
