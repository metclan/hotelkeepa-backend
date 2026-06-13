import { z } from "zod";
import { Request, Response } from "express";
import { PrismaClient } from "../generated/prisma/client.js";
import { sendTelegramError } from "../utils/telegram.js";

export const GENDERS = ["male", "female", "other"] as const;
const optionalTrimmedString = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const optionalDateString = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || !Number.isNaN(new Date(value).getTime()),
    "Enter a valid date",
  )
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const prisma = new PrismaClient();

export const customerSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: optionalTrimmedString,
  phone: z.string().trim().min(1, "Phone number is required"),
  email: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || z.email().safeParse(value).success,
      "Enter a valid email address",
    )
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  dateOfBirth: optionalDateString,
  address: optionalTrimmedString,
  gender: z.enum(GENDERS).optional(),
  idType: optionalTrimmedString,
  idNumber: optionalTrimmedString,
  nationality: optionalTrimmedString,
  occupation: optionalTrimmedString,
});

const customerPaginationSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 10)),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 1)),
  search: z.string().optional(),
});

export const createCustomer = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    const result = customerSchema.safeParse(req.body);
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
    const {
      firstName,
      lastName,
      phone,
      email,
      dateOfBirth,
      address,
      gender,
      idType,
      idNumber,
      nationality,
      occupation,
    } = result.data;
    // Ensure no other customer has same phone number
    const alreadyExists = await prisma.customer.findFirst({
      where: { phone, locationId: user.locationId },
    });
    if (alreadyExists) {
      res
        .status(409)
        .json({ message: "customer already exists with this phone number " });
      return;
    }
    await prisma.customer.create({
      data: {
        locationId: user.locationId,
        firstName,
        lastName,
        phone,
        email,
        dateOfBirth,
        address,
        gender,
        idType,
        idNumber,
        nationality,
        occupation,
      },
    });
    res.status(200).json({ message: "Created room successfully" });
  } catch (error) {
    sendTelegramError(
      error instanceof Error ? error : new Error(String(error)),
      {
        endpoint: "/api/v1/customers",
        method: "POST",
        requestBody: req.body,
      },
    );
    res.status(500).json({
      message: "Failed to create customer",
    });
  }
};

export const fetchCustomers = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    const {
      search,
      limit = 10,
      page,
    } = customerPaginationSchema.parse(req.query);
    const skip = (page - 1) * limit;
    // Fetch the room
    const where: any = {
      locationId: user.locationId,
    };
    if (search) {
      where.OR = [
        { phone: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
      ];
    }
    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          address: true,
          dateOfBirth: true,
        },
        skip,
        take: limit,
        where,
      }),
      prisma.customer.count({ where }),
    ]);
    res.status(200).json({
      data: customers,
      pagination: {
        limit,
        page,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    sendTelegramError(
      error instanceof Error ? error : new Error(String(error)),
      {
        endpoint: "/api/v1/customers",
        method: "GET",
        requestQuery: req.query,
      },
    );
    res.status(500).json({
      message: "Failed to fetch customers",
    });
  }
};
