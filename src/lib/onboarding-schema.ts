import { z } from "zod";

export function validLogo(value: string): boolean {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 200 * 1024 || bytes.toString("base64") !== match[2]) return false;
  if (match[1] === "png") return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (match[1] === "jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

export const onboardingNewBusinessSchema = z.object({
  hotelName: z.string().trim().min(1, "Hotel name is required").max(191),
  address: z.string().trim().min(1, "Address is required").max(191),
  city: z.string().trim().min(1, "City is required").max(191),
  state: z.string().trim().min(1, "State is required").max(191),
  countryId: z.string().trim().min(1, "Country is required"),
  currencyId: z.string().trim().min(1, "Currency is required"),
  setupPreset: z.enum(["reservations_only", "reservations_bar", "full_service"]),
  defaultCheckoutTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid checkout time"),
  timezone: z.string().min(1).max(100).refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
    catch { return false; }
  }, "Select a valid timezone"),
  logo: z.string().max(280000).refine(validLogo, "Choose a PNG, JPEG or WebP logo up to 200 KB").nullable().optional(),
});
