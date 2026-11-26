import { betterAuth } from "better-auth";
import { PrismaClient } from "./generated/prisma/client.js";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { sendEmail, sendWelcomeEmail, escapeHtml } from "./lib/email.service.js";
import { DEFAULT_ROLES } from "./lib/defaultRoles.js";

const prisma = new PrismaClient();

const pendingInvitation = (email: string) => prisma.invitation.findFirst({
  where: { email, status: "pending", expiresAt: { gt: new Date() } },
  select: { id: true },
});

async function reserveVerificationEmail(userId: string) {
  const now = new Date();
  const windowCutoff = new Date(now.getTime() - 60 * 60 * 1000);
  const cooldownCutoff = new Date(now.getTime() - 60 * 1000);
  const available = {
    id: userId,
    emailVerified: false,
    OR: [{ verificationEmailLastSentAt: null }, { verificationEmailLastSentAt: { lte: cooldownCutoff } }],
  };
  // Conditional writes let concurrent requests share the same account limit.
  const reset = await prisma.user.updateMany({
    where: {
      ...available,
      AND: [{ OR: [{ verificationEmailWindowStart: null }, { verificationEmailWindowStart: { lte: windowCutoff } }] }],
    },
    data: {
      verificationEmailWindowStart: now,
      verificationEmailLastSentAt: now,
      verificationEmailsSent: 1,
    },
  });
  if (reset.count) return true;
  const increment = await prisma.user.updateMany({
    where: {
      ...available,
      verificationEmailWindowStart: { gt: windowCutoff },
      verificationEmailsSent: { lt: 3 },
    },
    data: { verificationEmailLastSentAt: now, verificationEmailsSent: { increment: 1 } },
  });
  return increment.count > 0;
}

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
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email" || !ctx.request) return;
      const email = ctx.body?.email?.trim().toLowerCase();
      if (email && await pendingInvitation(email)) {
        throw new APIError("BAD_REQUEST", { message: "Use the invitation link sent to your email to create your account." });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const result = ctx.context.returned as { user?: { id: string } } | undefined;
      if (!result?.user) return;
      const newUser = await prisma.user.findUnique({ where: { id: result.user.id } });
      if (!newUser || newUser.businessId || await pendingInvitation(newUser.email)) return;
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
        await tx.userLocation.create({
          data: { userId: newUser.id, locationId: newLocation.id, allDepartments: true },
        });
        await tx.customer.create({
          data: {
            businessId: business.id,
            locationId: newLocation.id,
            firstName: "Walking Customer",
            phone: "system",
            isWalking: true,
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
        await tx.userLocation.update({
          where: { userId_locationId: { userId: newUser.id, locationId: newLocation.id } },
          data: { roleId: adminRole.id },
        });
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
    requireEmailVerification: true,
    sendResetPassword: async ({ user, token }) => {
      const resetUrl = new URL("/reset-password", process.env.FRONTEND_URL);
      resetUrl.searchParams.set("token", token);
      const frontendUrl = resetUrl.toString();
      await sendEmail({
        to: user.email,
        subject: "Reset your password",
        html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Reset Your Password</h2>
            <p>Hi ${escapeHtml(user.name)},</p>
            <p>We received a request to reset your password. Click the button below:</p>
            <a 
              href="${escapeHtml(frontendUrl)}"
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
    sendOnSignIn: false,
    sendVerificationEmail: async ({ user, url }, request) => {
      if (!request && await pendingInvitation(user.email)) return;
      if (!(await reserveVerificationEmail(user.id))) return;
      const link = new URL(url);
      const callback = new URL("/login", process.env.FRONTEND_URL || "https://hotelkeepa.com");
      callback.searchParams.set("verified", "true");
      link.searchParams.set("callbackURL", callback.href);
      await sendEmail({
        to: user.email,
        subject: "Verify your Hotelkeepa email",
        html: `<p>Hi ${escapeHtml(user.name)},</p><p><a href="${escapeHtml(link.href)}">Verify your email address</a> to finish setting up your Hotelkeepa account.</p>`,
      }).catch(() => console.error("SES verification email delivery failed"));
    },
    afterEmailVerification: async (user) => {
      await sendWelcomeEmail({ to: user.email, name: user.name }).catch(() => {
        console.error("SES welcome email delivery failed");
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
