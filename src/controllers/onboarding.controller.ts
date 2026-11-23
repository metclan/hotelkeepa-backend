import { Request, Response } from "express";
import { PrismaClient } from "../generated/prisma/client.js";
import { getLogoStorage, type StoredLogo } from "../lib/logo-storage.js";
import { onboardingNewBusinessSchema } from "../lib/onboarding-schema.js";

const prisma = new PrismaClient();

export const onboardNewBusiness = async (req: Request, res: Response) => {
  let uploadedLogo: StoredLogo | undefined;
  let committed = false;
  try {
    const result = onboardingNewBusinessSchema.safeParse(req.body);
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    if (!user.isOwner) {
      res.status(403).json({ message: "Only the business owner can complete hotel setup" });
      return;
    }
    if (!result.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }
    const { hotelName, countryId, currencyId, setupPreset, address, city, state, defaultCheckoutTime, timezone, logo } = result.data;
    // Verify ownership against persisted data before writing an external object.
    const owner = await prisma.user.findUnique({ where: { id: user.id } });
    if (!owner?.isOwner || !owner.businessId || !owner.locationId || owner.businessId !== user.businessId) {
      res.status(403).json({ message: "Hotel owner access is required" });
      return;
    }
    if (owner.onboardingStage !== 1) {
      res.status(409).json({ message: "Hotel setup has already been completed" });
      return;
    }
    if (logo) uploadedLogo = await getLogoStorage().upload(owner.businessId, hotelName, logo);
    // Start a transaction
    await prisma.$transaction(async (tx) => {
      // Read the persisted stage within the transaction to reject repeat submissions.
      const currentUser = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      const claimed = await tx.user.updateMany({
        where: { id: user.id, onboardingStage: 1 },
        data: { onboardingStage: 2 },
      });
      if (claimed.count !== 1) throw new Error("ONBOARDING_COMPLETE");
      // Update the company name
      const existingBusiness = await tx.business.update({
        where: { id: user.businessId },
        data: { name: hotelName, currencyId, countryId },
      });
      if (!existingBusiness) {
        throw Error("Business has to be created before edit");
      }
      // Update the location name
      const existingLocation = await tx.location.findFirst({
        where: { id: currentUser.locationId ?? "", businessId: existingBusiness.id },
      });

      if (!existingLocation) {
        throw Error("Business location not found for onboarding");
      }
      await tx.location.update({
        where: { id: existingLocation.id },
        data: { name: hotelName, setupPreset, address, city, state, defaultCheckoutTime, timezone, logo: uploadedLogo?.url ?? null, logoKey: uploadedLogo?.key ?? null },
      });
      const departments = setupPreset === "full_service"
        ? [
            { name: "Main Store", holdsInventory: true, canSell: false },
            { name: "Bar", holdsInventory: true, canSell: true },
            { name: "Restaurant", holdsInventory: true, canSell: true, kitchenOrders: true, managesTables: true },
          ]
        : setupPreset === "reservations_bar"
          ? [{ name: "Bar", holdsInventory: true, canSell: true }]
          : [];
      for (const department of departments) {
        await tx.department.upsert({
          where: { locationId_name: { locationId: existingLocation.id, name: department.name } },
          create: { ...department, locationId: existingLocation.id, invoiceHeading: `${hotelName} — ${department.name}` },
          update: {},
        });
      }
      await tx.userLocation.upsert({
        where: { userId_locationId: { userId: user.id, locationId: existingLocation.id } },
        create: { userId: user.id, locationId: existingLocation.id, allDepartments: true },
        update: { isActive: true, allDepartments: true },
      });
      // Add 5 payment options by default
      await tx.customLabels.createMany({
        data: [
          {
            locationId: existingLocation.id,
            isActive: true,
            label: "Cash",
            type: "payment",
          },
          {
            locationId: existingLocation.id,
            isActive: true,
            label: "Bank Transfer",
            type: "payment",
          },
          {
            locationId: existingLocation.id,
            isActive: true,
            label: "Card",
            type: "payment",
          },
          {
            locationId: existingLocation.id,
            isActive: false,
            label: "Mobile Money",
            type: "payment",
          },
          {
            locationId: existingLocation.id,
            isActive: false,
            label: "Other",
            type: "payment",
          },
        ],
      });
      // Update the user onboarding stage
      await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          onboardingStage: 2,
          locationId: existingLocation.id,
        },
      });
    });
    committed = true;
    res.status(201).json({ message: "Succesfully onboarded" });
  } catch (err) {
    // Only remove this request's unique object when the database did not commit.
    if (uploadedLogo && !committed) {
      try { await getLogoStorage().remove(uploadedLogo.key); }
      catch { console.error("Could not clean up uncommitted hotel logo"); }
    }
    console.error("Hotel onboarding failed", err instanceof Error ? err.name : "Unknown error");
    if (err instanceof Error && err.message === "ONBOARDING_COMPLETE") {
      res.status(409).json({ message: "Hotel setup has already been completed" });
      return;
    }
    res.status(500).json({ message: "Could not complete hotel setup. Please try again." });
  }
};
