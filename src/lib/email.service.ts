// lib/email.service.ts
import { sendSesEmail, type EmailOptions } from "./email.js";

export const escapeHtml = (value: string) => value.replace(/[&<>"\']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\'": "&#39;" })[character]!);
type InviteEmailOptions = {
  to: string;
  name: string;
  inviteUrl: string;
  invitedBy: string;
  expiresAt: Date;
};
export const sendInviteEmail = async (options: InviteEmailOptions) => {
  const { to, name, inviteUrl, invitedBy, expiresAt } = options;

  await sendEmail({
    to,
    subject: "You've been invited to join",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hello ${escapeHtml(name)},</h2>
        <p>${escapeHtml(invitedBy)} has invited you to join their hotel management system.</p>
        <p>Click the button below to set up your account:</p>
        <a 
          href="${escapeHtml(inviteUrl)}" 
          style="
            display: inline-block;
            padding: 12px 24px;
            background-color: #4F46E5;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin: 16px 0;
          "
        >
          Accept Invitation
        </a>
        <p style="color: #6B7280; font-size: 14px;">
          This link expires on ${expiresAt.toDateString()}.
          If you didn't expect this email, you can safely ignore it.
        </p>
      </div>
    `,
  });
};

// Every transactional email uses the same SES transport.
export const sendEmail = (options: EmailOptions) => sendSesEmail(options);

export const sendWelcomeEmail = async ({ to, name }: { to: string; name: string }) => {
  await sendEmail({
    to, subject: "Welcome to Hotelkeepa",
    text: `Hi ${name}, welcome to Hotelkeepa. Sign in to set up your hotel or access your team's workspace.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>Welcome to Hotelkeepa</h2><p>Hi ${escapeHtml(name)},</p><p>Your account is ready. Sign in to set up your hotel or access your team's workspace.</p></div>`,
  });
};
