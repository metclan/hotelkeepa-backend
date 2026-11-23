import { test } from "node:test";
import assert from "node:assert/strict";
import { onboardingNewBusinessSchema as schema } from "../src/lib/onboarding-schema.js";

const details = {
  hotelName: "Metclan Hotel", address: "1 Main Street", city: "Ikeja", state: "Lagos",
  countryId: "country", currencyId: "currency", setupPreset: "reservations_only",
  defaultCheckoutTime: "12:00", timezone: "Africa/Lagos", logo: null,
};

test("requires hotel details and final preferences before completion", () => {
  assert.equal(schema.safeParse(details).success, true);
  for (const field of ["hotelName", "address", "city", "state", "countryId", "currencyId", "setupPreset", "defaultCheckoutTime", "timezone"]) {
    const incomplete: Record<string, unknown> = { ...details };
    delete incomplete[field];
    assert.equal(schema.safeParse(incomplete).success, false, field);
  }
});

test("accepts all three operation choices and rejects unknown presets", () => {
  for (const setupPreset of ["reservations_only", "reservations_bar", "full_service"]) {
    assert.equal(schema.safeParse({ ...details, setupPreset }).success, true);
  }
  assert.equal(schema.safeParse({ ...details, setupPreset: "anything" }).success, false);
});

test("validates local checkout clock and IANA timezone", () => {
  for (const defaultCheckoutTime of ["00:00", "23:59", "11:30"]) assert.equal(schema.safeParse({ ...details, defaultCheckoutTime }).success, true);
  for (const defaultCheckoutTime of ["24:00", "12:60", "9:00", "noon"]) assert.equal(schema.safeParse({ ...details, defaultCheckoutTime }).success, false);
  assert.equal(schema.safeParse({ ...details, timezone: "Mars/Hotel" }).success, false);
  assert.equal(schema.safeParse({ ...details, timezone: "UTC" }).success, true);
});

test("logo is optional; verifies raster type, signature and size", () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=";
  assert.equal(schema.safeParse({ ...details, logo: png }).success, true);
  assert.equal(schema.safeParse({ ...details, logo: undefined }).success, true);
  for (const logo of ["data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,aGVsbG8=", "https://example.com/logo.png", "data:image/png;base64," + Buffer.alloc(201 * 1024).toString("base64")]) {
    assert.equal(schema.safeParse({ ...details, logo }).success, false);
  }
});
