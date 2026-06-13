import { betterAuth } from "better-auth";
import { PrismaClient } from "./generated/prisma/client.js";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { createAuthMiddleware } from "better-auth/api";
import { sendEmail } from "./lib/email.service.js";

const prisma = new PrismaClient();

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BASEURL || "http://localhost:5001",
  database: prismaAdapter(prisma, {
    provider: "mysql",
  }),
  user: {
    additionalFields: {
      onboardingStage: {
        type: "number",
        defaultValue: 1,
        input: false, // user can't set this themselves
      },
      locationId: {
        type: "string",
        defaultValue: undefined,
        input: false,
      },
      isOwner: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
      businessId: {
        type: "string",
        defaultValue: undefined,
        input: false,
      },
      roleId: {
        type: "string",
        defaultValue: undefined,
        input: false,
      },
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const newUser = ctx.context.newSession?.user;
      if (!newUser) return;

      // Create a new business
      const business = await prisma.business.create({
        data: {
          name: null,
        },
      });
      // Create new location
      const newLocation = await prisma.location.create({
        data: {
          name: null,
          businessId: business.id,
        },
      });
      // Create new admin role
      const newRole = await prisma.role.create({
        data: {
          locationId: newLocation.id,
          name: "Admin",
          isAdmin: true,
        },
      });
      // Update user role and mark as owner
      const existingUser = await prisma.user.update({
        where: {
          id: newUser.id,
        },
        data: {
          isOwner: true,
          roleId: newRole.id,
          businessId: business.id,
        },
      });
    }),
  },
  trustedOrigins: ["http://localhost:3000", "https://gadgetkeep.com"],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      const parsedUrl = new URL(url);
      const token = parsedUrl.pathname.split("/").pop();
      const frontendUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
      await sendEmail({
        to: user.email,
        subject: "Reset your password",
        html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Reset Your Password</h2>
            <p>Hi ${user.name},</p>
            <p>We received a request to reset your password. Click the button below:</p>
            <a 
              href="${frontendUrl}"
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
              Reset Password
            </a>
            <p style="color: #6B7280; font-size: 14px;">
              This link expires in 1 hour. If you didn't request this, ignore this email.
            </p>
          </div>`,
      });
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your email",
        html: `Click here to verify your email : ${url}`,
      });
    },
  },
  // socialProviders : {
  //     google : {
  //         clientId : process.env.GOOGLE_CLIENT_ID || "",
  //         clientSecret : process.env.GOOGLE_CLIENT_SECRET || "",
  //     }
  // }
});
