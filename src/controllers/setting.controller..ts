import { Request, Response } from "express";
import { PrismaClient } from "../generated/prisma/client.js";

const prisma = new PrismaClient(); 

export const createBusiness = (req: Request, res: Response) => {
    // Logic to create a new business
    res.status(201).json({ message: "Business created successfully" });
}

export const getCountries = async (req: Request, res: Response) => {
  try {
    const countries = await prisma.country.findMany({
      orderBy: {
        name: "asc",
      },
      select: {
        code: true,
        id: true,
        name: true,
        currency : {
            select : {
                id : true,
                name : true, 
                symbol : true, 
            }
        },
      },
    });

    res.status(200).json(countries);

    return;
  } catch (error) {
    console.error("Error fetching countries:", error);
    res.status(500).json({ message: "Internal server error" });

    return;
  }
};
export const getCurrencies = async (req: Request, res: Response) => {
  try {
    // // Validate pagination parameters
    // const result = paginationSchema.safeParse(req.query);
    // if (!result.success) {
    //   res.status(400).json({
    //     errors: result.error.errors.map((err) => ({
    //       field: err.path.join("."),
    //       message: err.message,
    //     })),
    //     message: "Invalid pagination parameters",
    //   });

    //   return;
    // }
    // Get total count for pagination
    const total = await prisma.currency.count();

    // Fetch currencies with pagination
    const currencies = await prisma.currency.findMany({
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
        symbol: true,
      },
    });

    res.status(200).json({
      data: currencies,
    });

    return;
  } catch (error: unknown) {
    // Send error to Telegram
    // sendTelegramError(
    //   error instanceof Error ? error : new Error(String(error)),
    //   {
    //     endpoint: "/api/v1/currencies",
    //     method: "GET",
    //   },
    // );

    // Send response
    res.status(500).json({
      message: "Internal server error",
    });

    return;
  }
};