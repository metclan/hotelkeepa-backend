import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { bulkRoomHandler } from "../src/controllers/bulk-room.controller.js";
import { bulkRoomSchema } from "../src/lib/bulk-room-schema.js";
const payload = { startNumber: "101", endNumber: "108", roomTypeId: "deluxe", floor: "1st Floor", status: "available" };
function database(existing: string[] = []) {
  const calls: any = { writes: [], committed: false };
  const tx: any = {
    roomType: { findFirst: async (args: any) => { calls.typeWhere = args.where; return { id: "deluxe" }; } },
    room: {
      findMany: async (args: any) => { calls.conflictWhere = args.where; return existing.map((roomNumber) => ({ roomNumber })); },
      createMany: async (args: any) => { calls.writes.push(args); return { count: args.data.length }; },
    },
  };
  const db = { $transaction: async (callback: any) => { const result = await callback(tx); calls.committed = true; return result; } } as unknown as PrismaClient;
  return { db, tx, calls };
}
async function invoke(db: PrismaClient, body: unknown = payload, user: unknown = { id: "staff", locationId: "hotel-a" }) {
  const res = { code: 200, body: undefined as any, status(code: number) { this.code = code; return this; }, json(value: unknown) { this.body = value; return this; } };
  await bulkRoomHandler(db)({ body, user } as Request, res as unknown as Response);
  return res;
}
test("101–108 creates eight rooms with the selected hotel, type, floor and status", async () => {
  const { db, calls } = database(); const result = await invoke(db);
  assert.equal(result.code, 201); assert.equal(result.body.data.count, 8);
  const rooms = calls.writes[0].data;
  assert.deepEqual(rooms.map((room: any) => room.roomNumber), ["101", "102", "103", "104", "105", "106", "107", "108"]);
  assert.ok(rooms.every((room: any) => room.locationId === "hotel-a" && room.roomTypeId === "deluxe" && room.floor === "1st Floor" && room.status === "available"));
  assert.deepEqual(calls.typeWhere, { id: "deluxe", locationId: "hotel-a" });
  assert.equal(calls.conflictWhere.locationId, "hotel-a"); assert.equal(calls.committed, true);
  assert.equal(calls.writes[0].skipDuplicates, undefined);
});
test("existing numbers reject the batch without any writes", async () => {
  const { db, calls } = database(["103", "106"]); const result = await invoke(db);
  assert.equal(result.code, 409); assert.deepEqual(result.body.conflicts, ["103", "106"]);
  assert.match(result.body.message, /No rooms were created/); assert.equal(calls.writes.length, 0); assert.equal(calls.committed, false);
});
test("concurrent unique-key conflicts do not commit the transaction", async () => {
  const { db, tx, calls } = database(); tx.room.createMany = async () => { throw Object.assign(new Error("Duplicate"), { code: "P2002" }); };
  assert.equal((await invoke(db)).code, 409); assert.equal(calls.committed, false);
});
test("foreign hotel room types are rejected before room writes", async () => {
  const { db, tx, calls } = database(); tx.roomType.findFirst = async () => null;
  assert.equal((await invoke(db)).code, 400); assert.equal(calls.writes.length, 0);
});
test("invalid, reversed and excessive ranges never write", async () => {
  for (const [startNumber, endNumber] of [["", "108"], ["101.5", "108"], ["-1", "108"], ["1e2", "108"], ["109", "101"], ["1", "501"], ["1", "999999999999999"]]) {
    const { db, calls } = database();
    assert.equal((await invoke(db, { ...payload, startNumber, endNumber })).code, 400, `${startNumber}–${endNumber}`);
    assert.equal(calls.writes.length, 0);
  }
});
test("ranges include both endpoints and preserve leading zeroes", async () => {
  const { db, calls } = database();
  assert.equal((await invoke(db, { ...payload, startNumber: "001", endNumber: "003" })).code, 201);
  assert.deepEqual(calls.writes[0].data.map((room: any) => room.roomNumber), ["001", "002", "003"]);
  assert.equal((await invoke(database().db, { ...payload, startNumber: "108", endNumber: "108" })).body.data.count, 1);
});
test("500 rooms are permitted, but clients cannot override the hotel scope", async () => {
  assert.equal(bulkRoomSchema.safeParse({ ...payload, startNumber: "1", endNumber: "500" }).success, true);
  const { db, calls } = database(); assert.equal((await invoke(db, { ...payload, locationId: "other" })).code, 400); assert.equal(calls.writes.length, 0);
});
test("authentication and a selected hotel are required", async () => {
  const { db } = database(); assert.equal((await invoke(db, payload, null)).code, 401);
  assert.equal((await invoke(db, payload, { id: "staff", locationId: "" })).code, 403);
});
