import { betterAuth } from "better-auth";
import { PrismaClient } from "./generated/prisma/client.js";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { createAuthMiddleware } from "better-auth/api";
import { sendEmail } from "./lib/email.service.js";
import { DEFAULT_ROLES } from "./lib/defaultRoles.js";

const prisma = new PrismaClient();

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BASEURL || "https://api.hotelkeepa.com",
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
      const invitation = await prisma.invitation.findFirst({
        where: {
          email: newUser.email,
          status: "pending",
        },
      });
      if (invitation) return;
      await prisma.$transaction(async (tx) => {
        // Create a new business
        const business = await tx.business.create({
          data: {
            name: null,
          },
        });
        // Create new location
        const newLocation = await tx.location.create({
          data: {
            name: null,
            businessId: business.id,
          },
        });
        // Fetch all permissions from DB
        const allPermissions = await tx.permission.findMany({
          select: { id: true, code: true },
        });
        const getPermissionIds = (codes: string[]) =>
          allPermissions
            .filter((p) => codes.includes(p.code))
            .map((p) => ({ permissionId: p.id }));
        // Create all default roles with permissions
        const createdRoles = await Promise.all(
          DEFAULT_ROLES.map((role) =>
            tx.role.create({
              data: {
                locationId: newLocation.id,
                name: role.name,
                isAdmin: role.isAdmin,
                rolePermissions: {
                  create: getPermissionIds(role.permissions),
                },
              },
            }),
          ),
        );
        const adminRole = createdRoles.find((r) => r.isAdmin === true);
        if (!adminRole) {
          throw new Error("Admin role could not be created");
        }
        // Update user role and mark as owner
        await tx.user.update({
          where: {
            id: newUser.id,
          },
          data: {
            isOwner: true,
            roleId: adminRole.id,
            businessId: business.id,
            locationId: newLocation.id,
          },
        });
      });
    }),
  },
  trustedOrigins: [
    process.env.FRONTEND_URL!,
    "https://www.hotelkeepa.com",
    "https://hotelkeepa.com",
  ],
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
