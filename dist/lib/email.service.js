// lib/email.service.ts
import { transporter } from "./email.js";
export const sendInviteEmail = async (options) => {
    const { to, name, inviteUrl, invitedBy, expiresAt } = options;
    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject: "You've been invited to join",
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hello ${name},</h2>
        <p>${invitedBy} has invited you to join their hotel management system.</p>
        <p>Click the button below to set up your account:</p>
        <a 
          href="${inviteUrl}" 
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
// reusable generic send function
export const sendEmail = async ({ to, subject, html }) => {
    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject,
        html,
    });
};
