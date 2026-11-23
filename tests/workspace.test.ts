import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { canAccessLocation } from "../src/lib/workspace-policy.js";
import { workspaceHandlers } from "../src/controllers/workspace.controller.js";
import { createRequireAuth, requirePermission } from "../src/middleware/middleware.js";

const user = { id: "user-a", businessId: "business-a", locationId: "hotel-a", roleId: "role-a", isOwner: false, isActive: true, onboardingStage: 2 };
const hotel = { id: "hotel-b", businessId: "business-a", isActive: true, isDeleted: false };
const membership = { userId: user.id, locationId: hotel.id, roleId: "role-b", isActive: true, allDepartments: false };
function request(extra: Record<string, unknown> = {}) {
  return { user: { ...user }, session: { id: "session-a" }, params: {}, query: {}, body: {}, permissions: [], get: () => undefined, headers: {}, method: "GET", ...extra } as unknown as Request;
}
function response() {
  const result = { statusCode: 200, body: undefined as any, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
  return result;
}
async function invoke(db: unknown, action: keyof ReturnType<typeof workspaceHandlers>, req: Request) {
  const res = response();
  await workspaceHandlers(db as PrismaClient)[action](req, res as unknown as Response);
  return res;
}

test("hotel access requires matching business and active location/membership, even for owners", () => {
  assert.equal(canAccessLocation(user, hotel, membership), true);
  assert.equal(canAccessLocation(user, hotel, null), false);
  assert.equal(canAccessLocation(user, hotel, { ...membership, isActive: false }), false);
  assert.equal(canAccessLocation(user, hotel, { ...membership, userId: "other" }), false);
  assert.equal(canAccessLocation(user, hotel, { ...membership, locationId: "other-hotel" }), false);
  assert.equal(canAccessLocation({ ...user, isOwner: true }, hotel, null), true);
  assert.equal(canAccessLocation({ ...user, isOwner: true }, { ...hotel, businessId: "other-business" }, null), false);
  assert.equal(canAccessLocation({ ...user, isOwner: true }, { ...hotel, isActive: false }, null), false);
  assert.equal(canAccessLocation(user, { ...hotel, isDeleted: true }, membership), false);
});

test("switching updates this session only and rejects foreign, disabled or unassigned hotels", async () => {
  const updates: unknown[] = [];
  const db = { location: { findUnique: async () => hotel }, userLocation: { findUnique: async () => membership }, session: { update: async (value: unknown) => updates.push(value) } };
  const result = await invoke(db, "switchLocation", request({ params: { id: hotel.id } }));
  assert.equal(result.statusCode, 200);
  assert.deepEqual(updates, [{ where: { id: "session-a" }, data: { activeLocationId: "hotel-b" } }]);
  for (const target of [{ ...hotel, businessId: "other" }, { ...hotel, isActive: false }]) {
    db.location.findUnique = async () => target;
    assert.equal((await invoke(db, "switchLocation", request({ params: { id: hotel.id } }))).statusCode, 403);
  }
  db.location.findUnique = async () => hotel;
  db.userLocation.findUnique = async () => ({ ...membership, isActive: false });
  assert.equal((await invoke(db, "switchLocation", request({ params: { id: hotel.id } }))).statusCode, 403);
  assert.equal(updates.length, 1);
});

test("middleware uses fresh session hotel and its role instead of stale authentication fields", async () => {
  const db = {
    user: { findUnique: async () => user }, session: { findUnique: async () => ({ id: "session-a", activeLocationId: "hotel-b" }) },
    location: { findUnique: async () => hotel }, userLocation: { findUnique: async () => membership },
    role: { findFirst: async ({ where }: any) => { assert.deepEqual(where, { id: "role-b", locationId: "hotel-b" }); return { id: "role-b", isAdmin: false }; } },
  };
  const authSession = { user, session: { id: "session-a" } };
  const middleware = createRequireAuth(db as unknown as PrismaClient, async () => authSession as any);
  const req = request(); let passed = false;
  await middleware(req, response() as unknown as Response, () => { passed = true; });
  assert.equal(passed, true);
  assert.equal(req.user?.locationId, "hotel-b");
  assert.equal(req.user?.roleId, "role-b");
  assert.equal(req.allDepartments, false);
  const stale = request({ method: "PATCH", get: () => "hotel-a" }); const res = response();
  passed = false;
  await middleware(stale, res as unknown as Response, () => { passed = true; });
  assert.equal(passed, false); assert.equal(res.statusCode, 409);
});

test("revoked hotel access falls back to an accessible hotel and never retains the revoked scope", async () => {
  let membershipReads = 0; let stored: any;
  const db = {
    user: { findUnique: async () => user },
    session: { findUnique: async () => ({ id: "session-a", activeLocationId: "revoked" }), update: async (data: unknown) => { stored = data; } },
    location: { findUnique: async () => ({ ...hotel, id: "revoked" }), findFirst: async (args: any) => { assert.deepEqual(args.where.userAccess, { some: { userId: "user-a", isActive: true } }); return hotel; } },
    userLocation: { findUnique: async () => (++membershipReads === 1 ? null : membership) }, role: { findFirst: async () => ({ id: "role-b", isAdmin: false }) },
  };
  const middleware = createRequireAuth(db as unknown as PrismaClient, async () => ({ user, session: { id: "session-a" } }) as any);
  const req = request(); let passed = false;
  await middleware(req, response() as unknown as Response, () => { passed = true; });
  assert.equal(passed, true); assert.equal(req.user?.locationId, "hotel-b");
  assert.deepEqual(stored, { where: { id: "session-a" }, data: { activeLocationId: "hotel-b" } });
});

test("department mutation requires management permission and cannot target another hotel's department", async () => {
  let reads = 0;
  const db = { department: { findFirst: async ({ where }: any) => { reads++; assert.equal(where.locationId, "hotel-a"); return null; } } };
  assert.equal((await invoke(db, "updateDepartment", request({ params: { id: "foreign" }, body: { name: "Bar" } }))).statusCode, 403);
  assert.equal(reads, 0);
  assert.equal((await invoke(db, "updateDepartment", request({ user: { ...user, isOwner: true }, params: { id: "foreign" }, body: { name: "Bar" } }))).statusCode, 404);
});

test("restricted staff see only active assigned departments in their selected hotel", async () => {
  let where: any;
  const db = { department: { findMany: async (args: any) => { where = args.where; return []; } } };
  const result = await invoke(db, "listDepartments", request());
  assert.equal(result.body.canManage, false);
  assert.deepEqual(where, { locationId: "hotel-a", isActive: true, users: { some: { userId: "user-a", isActive: true } } });
  await invoke(db, "listDepartments", request({ permissions: ["departments:manage"] }));
  assert.deepEqual(where, { locationId: "hotel-a" });
  await invoke(db, "listDepartments", request({ allDepartments: true }));
  assert.deepEqual(where, { locationId: "hotel-a", isActive: true });
});

test("department disable/reactivate preserves membership history and deletion rejects assigned departments", async () => {
  const changes: any[] = [];
  const department = { id: "dept-a", locationId: "hotel-a", isActive: true };
  const db: any = { department: { findFirst: async () => department, update: async (args: any) => { changes.push(args.data); return department; }, delete: async () => { throw new Error("Should not delete"); } }, userDepartment: { count: async () => 1 } };
  db.$transaction = async (callback: any) => callback(db);
  const req = { user: { ...user, isOwner: true }, params: { id: "dept-a" } };
  assert.equal((await invoke(db, "updateDepartment", request({ ...req, body: { isActive: false } }))).statusCode, 200);
  assert.equal(changes[0].isActive, false); assert.ok(changes[0].disabledAt instanceof Date);
  assert.equal((await invoke(db, "updateDepartment", request({ ...req, body: { isActive: true } }))).statusCode, 200);
  assert.equal(changes[1].disabledAt, null);
  assert.equal((await invoke(db, "deleteDepartment", request(req))).statusCode, 409);
});

test("staff assignments reject foreign members, duplicates and disabled departments before writes", async () => {
  const department = { id: "dept-a", locationId: "hotel-a", isActive: true };
  let writes = 0;
  const db: any = { department: { findFirst: async () => department }, userLocation: { count: async () => 0 }, userDepartment: { updateMany: async () => writes++ } };
  db.$transaction = async (callback: any) => callback(db);
  const req = { user: { ...user, isOwner: true }, params: { id: "dept-a" }, body: { members: [{ userId: "foreign-user", role: "staff" }] } };
  assert.equal((await invoke(db, "saveDepartmentMembers", request(req))).statusCode, 400);
  assert.equal(writes, 0);
  assert.equal((await invoke(db, "saveDepartmentMembers", request({ ...req, body: { members: [req.body.members[0], req.body.members[0]] } }))).statusCode, 400);
  department.isActive = false;
  assert.equal((await invoke(db, "saveDepartmentMembers", request(req))).statusCode, 409);
});

test("department create rejects caller-supplied hotel IDs and uses the selected hotel", async () => {
  let created: any;
  const db = { department: { create: async ({ data }: any) => { created = data; return data; } } };
  const req = { user: { ...user, isOwner: true }, body: { name: "Pool Bar", holdsInventory: true, canSell: true } };
  assert.equal((await invoke(db, "createDepartment", request({ ...req, body: { ...req.body, locationId: "other-hotel" } }))).statusCode, 400);
  assert.equal((await invoke(db, "createDepartment", request(req))).statusCode, 201);
  assert.equal(created.locationId, "hotel-a");
});

test("location creation initializes roles, creator access, guest, payment methods and chosen departments", async () => {
  const recorded: Record<string, any> = {};
  const db: any = {
    business: { update: async () => ({ id: "business-a" }) }, subscription: { findFirst: async () => null },
    location: { create: async ({ data }: any) => { recorded.location = data; return { ...data, id: "new-hotel" }; } },
    permission: { findMany: async () => [] }, role: { create: async ({ data }: any) => { assert.equal(data.locationId, "new-hotel"); return { id: "new-admin", isAdmin: data.isAdmin }; } },
    userLocation: { create: async ({ data }: any) => { recorded.membership = data; } },
    customer: { create: async ({ data }: any) => { recorded.guest = data; } },
    customLabels: { createMany: async ({ data }: any) => { recorded.payments = data; } },
    department: { createMany: async ({ data }: any) => { recorded.departments = data; } },
  };
  db.$transaction = async (callback: any) => callback(db);
  const result = await invoke(db, "createLocation", request({ user: { ...user, isOwner: true }, body: {
    name: "Metclan Abuja", address: "1 Hotel Road", city: "Abuja", state: "FCT", timezone: "Africa/Lagos", setupPreset: "full_service",
  } }));
  assert.equal(result.statusCode, 201);
  assert.equal(recorded.location.businessId, "business-a");
  assert.deepEqual(recorded.membership, { userId: "user-a", locationId: "new-hotel", roleId: "new-admin", allDepartments: true });
  assert.equal(recorded.guest.locationId, "new-hotel");
  assert.equal(recorded.payments.length, 5);
  assert.deepEqual(recorded.departments.map((department: any) => department.name), ["Main Store", "Bar", "Restaurant"]);
  assert.equal(recorded.departments[0].canSell, false);
});

test("location creation respects subscription caps and forbids ordinary staff", async () => {
  const db: any = { business: { update: async () => ({}) }, subscription: { findFirst: async () => ({ plan: { maxLocations: 1 } }) }, location: { count: async () => 1, create: async () => { throw new Error("Must not create"); } } };
  db.$transaction = async (callback: any) => callback(db);
  const body = { name: "Hotel", address: "Street", city: "City", state: "State", timezone: "UTC" };
  assert.equal((await invoke(db, "createLocation", request({ body }))).statusCode, 403);
  assert.equal((await invoke(db, "createLocation", request({ user: { ...user, isOwner: true }, body }))).statusCode, 409);
});

test("hotel membership changes are owner-only and reject roles or users outside the hotel/business", async () => {
  const db: any = { location: { findFirst: async () => hotel }, user: { findFirst: async () => user }, role: { findFirst: async () => null } };
  const req = { params: { id: "hotel-b", userId: "user-a" }, body: { roleId: "foreign-role", isActive: true, allDepartments: false } };
  assert.equal((await invoke(db, "saveLocationMember", request(req))).statusCode, 403);
  assert.equal((await invoke(db, "saveLocationMember", request({ ...req, user: { ...user, isOwner: true } }))).statusCode, 400);
});


test("hotel role permissions protect operational endpoints and admin/owner access is explicit", () => {
  const gate = requirePermission("rooms:create");
  for (const extra of [{}, { permissions: ["rooms:view"] }]) {
    let passed = false; const res = response();
    gate(request(extra), res as unknown as Response, () => { passed = true; });
    assert.equal(passed, false); assert.equal(res.statusCode, 403);
  }
  for (const extra of [{ permissions: ["rooms:create"] }, { locationAdmin: true }, { user: { ...user, isOwner: true } }]) {
    let passed = false;
    gate(request(extra), response() as unknown as Response, () => { passed = true; });
    assert.equal(passed, true);
  }
});
