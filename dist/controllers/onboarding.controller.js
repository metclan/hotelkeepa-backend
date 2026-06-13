import { PrismaClient } from "../generated/prisma/client.js";
import { z } from "zod";
const prisma = new PrismaClient();
const onboardingNewBusinessSchema = z.object({
    hotelName: z.string().trim().min(1, "Hotel name is required"),
    countryId: z.string().trim().min(1, "Country is required"),
    currencyId: z.string().trim().min(1, "Currency is required"),
});
export const onboardNewBusiness = async (req, res) => {
    try {
        const result = onboardingNewBusinessSchema.safeParse(req.body);
        const user = req.user;
        if (!user) {
            res.status(401).json({ messgae: "Unauthorized" });
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
        const { hotelName, countryId, currencyId } = result.data;
        // Start a transaction
        await prisma.$transaction(async (tx) => {
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
                where: { businessId: existingBusiness.id },
            });
            if (!existingLocation) {
                throw Error("Business location not found for onboarding");
            }
            await tx.location.update({
                where: { id: existingLocation.id },
                data: { name: hotelName },
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
                    onboardingStage: { increment: 1 },
                    locationId: existingLocation.id,
                },
            });
        });
        res.status(201).json({ message: "Succesfully onboarded" });
    }
    catch (err) {
        console.log(err);
    }
};
