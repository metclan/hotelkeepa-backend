import { z } from "zod";

const name = z.string().trim().min(1).max(191);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid 24-hour time");
const timezone = z.string().min(1).max(100).refine((value) => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "Select a valid timezone");
export const locationSchema = z.object({
  name, address: name, city: name, state: name,
  timezone, defaultCheckoutTime: clock.default("12:00"), defaultCheckinTime: clock.default("12:00"),
  setupPreset: z.enum(["reservations_only", "reservations_bar", "full_service"]).default("reservations_only"),
}).strict();
export const departmentSchema = z.object({
  name, holdsInventory: z.boolean().default(false), canSell: z.boolean().default(false), managesTables: z.boolean().default(false), kitchenOrders: z.boolean().default(false),
  invoiceHeading: z.string().trim().max(191).nullable().optional(),
  invoicePrefix: z.string().trim().max(20).regex(/^[A-Za-z0-9-]*$/, "Use letters, numbers and hyphens").nullable().optional(),
});
export const updateDepartmentSchema = departmentSchema.partial().extend({ isActive: z.boolean().optional() }).strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one change");
export const departmentMembersSchema = z.object({
  members: z.array(z.object({ userId: z.string().min(1), role: z.enum(["staff", "manager"]) }).strict()).max(500),
}).strict().refine(({ members }) => new Set(members.map((member) => member.userId)).size === members.length, "Duplicate users are not allowed");
export const locationMemberSchema = z.object({
  roleId: z.string().min(1), isActive: z.boolean(), allDepartments: z.boolean(),
}).strict();
