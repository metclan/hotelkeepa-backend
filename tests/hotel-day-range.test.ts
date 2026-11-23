import assert from "node:assert/strict";
import { test } from "node:test";
import { hotelDayRange } from "../src/utils/hotel-day-range.js";

test("today follows the hotel's date across UTC midnight", () => {
  const { start, end } = hotelDayRange(new Date("2026-11-22T23:30:00Z"), "Africa/Lagos");
  assert.equal(start.toISOString(), "2026-11-22T23:00:00.000Z");
  assert.equal(end.toISOString(), "2026-11-23T23:00:00.000Z");
});

test("today ends at the next local midnight on a daylight-saving transition", () => {
  const { start, end } = hotelDayRange(new Date("2026-03-08T16:00:00Z"), "America/New_York");
  assert.equal(start.toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(end.toISOString(), "2026-03-09T04:00:00.000Z");
});
