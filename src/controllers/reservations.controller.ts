import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import { Request, Response } from "express";
import { PrismaClient } from "../generated/prisma/client.js";
import { sendTelegramError } from "../utils/telegram.js";
import { generatesIds } from "../utils/generateIds.js";
import { formatPaymentMethod } from "../utils/payment-format.js";
const prisma = new PrismaClient();
const bookingReceiptTemplate = readFileSync(
  join(process.cwd(), "src/templates/booking.receipt.pos.hbs"),
  "utf8",
);

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderBookingReceipt = (
  template: string,
  data: Record<string, unknown>,
) =>
  template
    .replace(
      /{{#each rooms}}([\s\S]*?){{\/each}}/g,
      (_match, roomTemplate: string) =>
        ((data.rooms as Record<string, unknown>[] | undefined) ?? [])
          .map((room) =>
            roomTemplate.replace(/{{\s*([\w.]+)\s*}}/g, (_roomMatch, key) =>
              escapeHtml(room[key]),
            ),
          )
          .join(""),
    )
    .replace(/{{\s*([\w.]+)\s*}}/g, (_match, key) => escapeHtml(data[key]));

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(Number(value ?? 0));

const formatReceiptDate = (value: Date) =>
  new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);

const getNumberOfNights = (arrivalDate: Date, departureDate: Date) => {
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const nights = Math.ceil(
    (departureDate.getTime() - arrivalDate.getTime()) / millisecondsPerDay,
  );
  return Math.max(nights, 1);
};

const startOfDay = (value: string) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};
export const bookingSchema = z
  .object({
    customerId: z.string().trim().min(1, "Guest is required"),
    reservationDate: z.string().trim().min(1, "Reservation date is required"),
    arrivalDate: z.string().trim().min(1, "Arrival date and time is required"),
    autoCheckIn: z.boolean().default(false),
    departureDate: z
      .string()
      .trim()
      .min(1, "Departure date and time is required"),
    totalAmount: z.number().min(0, "Total amount cannot be negative"),
    payments: z
      .array(
        z.object({
          paymentMethodId: z.string(),
          amount: z.number().min(0, "Amount must be non-negative"),
          isChange: z.boolean().default(false),
        }),
      )
      .min(1, "At least one payment method is required"),
    notes: z.string().trim().optional(),
    rooms: z
      .array(
        z.object({
          roomId: z.string().trim().min(1),
          nights: z.number().int().min(1),
          pricePerNight: z.number().min(0),
          adults: z.number().int().min(0),
          children: z.number().int().min(0),
        }),
      )
      .min(1, "Select at least one room"),
  })
  .refine(
    (values) =>
      startOfDay(values.arrivalDate) >= startOfDay(values.reservationDate),
    {
      message: "Arrival must be on or after the reservation date",
      path: ["arrivalDate"],
    },
  )
  .refine(
    (values) => new Date(values.departureDate) > new Date(values.arrivalDate),
    {
      message: "Departure must be after arrival",
      path: ["departureDate"],
    },
  );
// Validation schema for pagination
const reservationPaginationSchema = z.object({
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
export const createBooking = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    const result = bookingSchema.safeParse(req.body);
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
      customerId,
      reservationDate,
      arrivalDate,
      departureDate,
      totalAmount,
      payments,
      rooms,
      notes,
      autoCheckIn,
    } = result.data;
    // Check for availability of rooms
    const roomIds = rooms.map((r: { roomId: string }) => r.roomId);
    const conflicts = await prisma.reservationLine.findMany({
      where: {
        roomId: { in: roomIds },
        status: { notIn: ["cancelled", "checked_out", "no_show"] },
        reservation: {
          AND: [
            { arrivalDate: { lt: new Date(departureDate) } },
            { departureDate: { gt: new Date(arrivalDate) } },
          ],
        },
      },
      select: {
        room: { select: { roomNumber: true, id: true } },
        reservation: { select: { arrivalDate: true, departureDate: true } },
      },
    });
    if (conflicts.length > 0) {
      const unaiablableRooms = [...new Set(conflicts.map((c) => c.room.id))];
      res.status(409).json({
        mesage: "Some rooms are unavailable for the selected dates",
        unaiablableRooms,
      });
      return;
    }
    // Create a reservation transaction
    const newReservation = await prisma.$transaction(async (tx) => {
      // Increment the booking count
      const increment = await tx.documentSequence.upsert({
        where: {
          locationId_transactionType: {
            locationId: user.locationId!,
            transactionType: "reservation",
          },
        },
        update: { currentNumber: { increment: 1 } },
        create: {
          currentNumber: 1,
          transactionType: "reservation",
          locationId: user.locationId,
        },
      });
      const bookingNumber = generatesIds({
        type: "BK",
        count: increment.currentNumber,
      });
      const { totalAmountPaid, paymentStatus, inboundPayments } =
        formatPaymentMethod({
          totalAmount,
          payments,
        });
      // Create a new reservation
      const newReservation = await tx.reservation.create({
        data: {
          locationId: user.locationId,
          bookingNumber,
          userId: user.id,
          notes,
          customerId,
          reservationDate,
          paymentStatus,
          arrivalDate,
          departureDate,
          totalAmount,
        },
      });
      // Create reservation lines
      await Promise.all(
        rooms.map(async (item) => {
          // Add the reservation line
          await tx.reservationLine.create({
            data: {
              reservationId: newReservation.id,
              numberOfAdults: item.adults,
              numberOfChildren: item.children,
              ...(autoCheckIn
                ? { checkInDate: arrivalDate, status: "checked_in" }
                : {}),
              roomId: item.roomId,
              pricePerNight: item.pricePerNight,
            },
          });
          // Change room status if the reservation is today
          await tx.room.update({
            where: {
              id: item.roomId,
            },
            data: {
              status: "occupied",
            },
          });
        }),
      );

      // Create payments and payment allocations
      await tx.payment.create({
        data: {
          locationId: user.locationId,
          contactType: "customer",
          createdById: user.id,
          amount: totalAmountPaid,
          direction: "ingoing",
          contactId: customerId,
          paymentDate: reservationDate,
          reference: bookingNumber,
          paymentMethods: {
            create: inboundPayments.map(({ paymentMethodId, amount }) => ({
              paymentMethodId,
              amount,
            })),
          },
          allocations: {
            create: {
              amountApplied: totalAmountPaid,
              transactionId: newReservation.id,
              transactionType: "reservation",
              allocationType: "reservation",
            },
          },
        },
      });
      return { bookingNumber, reservationId: newReservation.id };
    });
    res.status(200).json({
      message: "Created room successfully",
      data: { ...newReservation },
    });
  } catch (error) {
    sendTelegramError(
      error instanceof Error ? error : new Error(String(error)),
      {
        endpoint: "/api/v1/reservations",
        method: "POST",
        requestBody: req.body,
      },
    );
    res.status(500).json({
      message: "Failed to create reservation",
    });
  }
};

export const fetchReservations = async (req: Request, res: Response) => {
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
    } = reservationPaginationSchema.parse(req.query);
    const skip = (page - 1) * limit;
    // Fetch the room
    const where: any = {
      locationId: user.locationId,
    };
    if (search) {
      where.OR = [
        {
          roomNumber: {
            contains: search,
          },
        },
      ];
    }
    const [reservations, total] = await Promise.all([
      prisma.reservation.findMany({
        orderBy: { reservationDate: "desc" },
        select: {
          id: true,
          bookingNumber: true,
          paymentStatus: true,
          totalAmount: true,
          reservationDate: true,
          user: {
            select: {
              name: true,
            },
          },
          arrivalDate: true,
          departureDate: true,
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
        },
        skip,
        take: limit,
        where,
      }),
      prisma.reservation.count({ where }),
    ]);
    res.status(200).json({
      data: reservations,
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
        endpoint: "/api/v1/reservations",
        method: "GET",
        requestBody: req.body,
      },
    );
    res.status(500).json({
      message: "Failed to fetch reservation",
    });
  }
};
export const fetchReservationById = async (req: Request, res: Response) => {
  const { reservationId } = req.params;
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    if (!reservationId) {
      res.status(400).json({ message: "Reservation ID required " });
      return;
    }
    const fetchReservation = await prisma.reservation.findUnique({
      where: { id: reservationId.toString(), locationId: user.locationId },
      select: {
        id: true,
        bookingNumber: true,
        paymentStatus: true,
        totalAmount: true,
        reservationDate: true,
        reservationLines: {
          select: {
            id: true,
            checkInDate: true,
            checkOutDate: true,
            numberOfChildren: true,
            numberOfAdults: true,
            pricePerNight: true,
            status: true,
            room: {
              select: {
                roomNumber: true,
                roomType: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        user: {
          select: {
            name: true,
          },
        },
        arrivalDate: true,
        departureDate: true,
        customer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });
    if (!fetchReservation) {
      res.status(403).json({ message: "Reservation not found " });
      return;
    }
    res.status(200).json({ data: fetchReservation });
  } catch (error) {
    sendTelegramError(
      error instanceof Error ? error : new Error(String(error)),
      {
        endpoint: `/api/v1/reservations/${reservationId}`,
        method: "GET",
      },
    );
    res.status(500).json({
      message: "Failed to fetch reservation by id",
    });
  }
};

export const fetchReservationPayment = async (req: Request, res: Response) => {
  const { reservationId } = req.params;
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    if (!reservationId) {
      res.status(400).json({ message: "Reservation ID required " });
      return;
    }
    const fetchReservationPayment = await prisma.payment.findMany({
      where: {
        locationId: user.locationId,
        allocations: {
          some: {
            transactionType: "reservation",
            transactionId: reservationId.toString(),
          },
        },
      },
      select: {
        paymentDate: true,
        amount: true,
        paymentMethods: {
          select: {
            amount: true,
            customLabels: {
              select: {
                label: true,
              },
            },
          },
        },
      },
    });
    if (!fetchReservationPayment) {
      res.status(403).json({ message: "Reservation not found " });
      return;
    }
    res.status(200).json({ data: fetchReservationPayment });
  } catch (error) {
    sendTelegramError(
      error instanceof Error ? error : new Error(String(error)),
      {
        endpoint: `/api/v1/reservations/${reservationId}`,
        method: "GET",
      },
    );
    res.status(500).json({
      message: "Failed to fetch reservation by id",
    });
  }
};

export const deleteReservation = async (req: Request, res: Response) => {
  const { reservationId } = req.params;
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    if (!reservationId) {
      res.status(400).json({ message: "Reservation ID required " });
      return;
    }
    const fetchReservation = await prisma.reservation.findUnique({
      where: { id: reservationId.toString(), locationId: user.locationId },
    });
    if (!fetchReservation) {
      res.status(403).json({ message: "Reservation not found " });
      return;
    }
    // Create delete reservation transaction
    await prisma.$transaction(async (tx) => {
      // Delete reservation
      await tx.reservation.delete({
        where: { id: reservationId.toString(), locationId: user.locationId },
      });
      // Delete payments
      await tx.payment.deleteMany({
        where: {
          locationId: user.locationId,
          allocations: {
            some: {
              transactionType: "reservation",
              transactionId: reservationId.toString(),
            },
          },
        },
      });
    });
    res.status(200).json({ message: "Deleted successfully" });
  } catch (error) {
    sendTelegramError(
      error instanceof Error ? error : new Error(String(error)),
      {
        endpoint: `/api/v1/reservations/${reservationId}`,
        method: "DELETE",
      },
    );
    res.status(500).json({
      message: "Failed to delete reservation by id",
    });
  }
};
export const printBookingReceipt = async (req: Request, res: Response) => {
  const { reservationId } = req.params;
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    if (!reservationId) {
      res.status(400).json({ message: "Reservation ID required " });
      return;
    }
    const [paymentInformation, reservationInformation, locationInformation] =
      await Promise.all([
        prisma.payment.findMany({
          where: {
            locationId: user.locationId,
            allocations: {
              some: {
                transactionType: "reservation",
                transactionId: reservationId.toString(),
              },
            },
          },
          select: {
            paymentDate: true,
            amount: true,
            paymentMethods: {
              select: {
                amount: true,
                customLabels: {
                  select: {
                    label: true,
                  },
                },
              },
            },
          },
        }),
        prisma.reservation.findUnique({
          where: { id: reservationId.toString(), locationId: user.locationId },
          select: {
            id: true,
            bookingNumber: true,
            totalAmount: true,
            reservationDate: true,
            user: {
              select: {
                name: true,
              },
            },
            arrivalDate: true,
            departureDate: true,
            customer: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
            reservationLines: {
              select: {
                pricePerNight: true,
                room: {
                  select: {
                    roomNumber: true,
                  },
                },
              },
            },
          },
        }),
        prisma.location.findUnique({
          where: {
            id: user.locationId,
          },
          select: {
            name: true,
            address: true,
            phone: true,
          },
        }),
      ]);
    if (!reservationInformation || !locationInformation) {
      res.status(403).json({ message: "Reservation not found " });
      return;
    }
    const numberOfNights = getNumberOfNights(
      reservationInformation.arrivalDate,
      reservationInformation.departureDate,
    );
    const totalAmountPaid = paymentInformation.reduce(
      (init, sub) => init + Number(sub.amount),
      0,
    );
    const paymentMethods = [
      ...new Set(
        paymentInformation.flatMap((payment) =>
          payment.paymentMethods.map(
            (method) => method.customLabels?.label ?? "Unknown",
          ),
        ),
      ),
    ].join(", ");
    const totalAmount = Number(reservationInformation.totalAmount);
    const data = {
      companyName: locationInformation.name ?? "",
      companyAddress: locationInformation.address ?? "",
      companyPhone: locationInformation.phone ?? "",
      bookedBy: reservationInformation.user.name ?? "",
      bookingNumber: reservationInformation.bookingNumber ?? "",
      bookingDate: formatReceiptDate(reservationInformation.reservationDate),
      guestName: [
        reservationInformation.customer.firstName,
        reservationInformation.customer.lastName,
      ]
        .filter(Boolean)
        .join(" "),
      guestPhone: reservationInformation.customer.phone,
      arrivalDate: formatReceiptDate(reservationInformation.arrivalDate),
      departureDate: formatReceiptDate(reservationInformation.departureDate),
      numberOfNights,
      rooms: reservationInformation.reservationLines.map((line) => ({
        roomNumber: line.room.roomNumber,
        rate: formatCurrency(line.pricePerNight),
        amount: formatCurrency(Number(line.pricePerNight) * numberOfNights),
      })),
      totalAmount: formatCurrency(totalAmount),
      amountPaid: formatCurrency(totalAmountPaid),
      balance: formatCurrency(totalAmount - totalAmountPaid),
      paymentMethod: paymentMethods || "N/A",
    };
    const receiptHtml = renderBookingReceipt(bookingReceiptTemplate, data);
    res
      .status(200)
      .type("html")
      .json({ receiptHtml: receiptHtml, printerType: "pos80mm" });
  } catch (error) {
    sendTelegramError(
      error instanceof Error ? error : new Error(String(error)),
      {
        endpoint: `/api/v1/reservations/${reservationId}`,
        method: "GET",
      },
    );
    res.status(500).json({
      message: "Failed to fetch reservation by id",
    });
  }
};
export const checkIn = async (req: Request, res: Response) => {
  const { reservationLineId } = req.params;
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    if (!reservationLineId) {
      res.status(400).json({ message: "Reservation ID required " });
      return;
    }
    const reservationLine = await prisma.reservationLine.findUnique({
      where: {
        id: reservationLineId.toString(),
        reservation: { locationId: user.locationId },
      },
      select: {
        status: true,
        roomId: true,
        reservation: {
          select: {
            departureDate: true,
            arrivalDate: true,
          },
        },
      },
    });
    if (!reservationLine) {
      res.status(403).json({ message: "Reservation not found for checkin" });
      return;
    }
    // already checkin in
    if (reservationLine.status === "checked_in") {
      res.status(400).json({ message: "Guest is already checked in " });
      return;
    }
    // already check out
    if (reservationLine.status === "checked_out") {
      res
        .status(400)
        .json({ message: "This reservation has already been checkout out" });
      return;
    }
    // cancelled
    if (reservationLine.status === "cancelled") {
      res
        .status(400)
        .json({ message: "Cannot check in a cancelled reservation" });
      return;
    }
    const now = new Date();
    const departureDate = new Date(reservationLine.reservation.departureDate);
    if (now >= departureDate) {
      res.status(400).json({ message: "Cannot check in after departure date" });
      return;
    }
    // early check-in warning
    const arrivalDate = new Date(reservationLine.reservation.arrivalDate);
    if (now < arrivalDate) {
      res
        .status(400)
        .json({ message: "Guest cannot check in before arrival date/time" });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.reservationLine.update({
        where: { id: reservationLineId.toString() },
        data: {
          status: "checked_in",
          checkInDate: now,
        },
      });
      // update the room status to occupied
      await tx.room.update({
        where: { id: reservationLine.roomId },
        data: { status: "occupied" },
      });
    });
    res.status(200).json({
      message: "Guest checked in successfully",
    });
  } catch (error) {
    sendTelegramError(
      error instanceof Error ? error : new Error(String(error)),
      {
        endpoint: `/api/v1/reservations/${reservationLineId}/checkin`,
        method: "POST",
      },
    );
    res.status(500).json({
      message: "Failed to check in guest",
    });
  }
};
export const checkOut = async (req: Request, res: Response) => {
  const { reservationLineId } = req.params;
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    if (!reservationLineId) {
      res.status(400).json({ message: "Reservation ID required " });
      return;
    }
    const reservationLine = await prisma.reservationLine.findUnique({
      where: {
        id: reservationLineId.toString(),
        reservation: { locationId: user.locationId },
      },
      select: {
        status: true,
        roomId: true,
        reservation: {
          select: {
            id: true,
            departureDate: true,
            arrivalDate: true,
          },
        },
      },
    });
    if (!reservationLine) {
      res.status(403).json({ message: "Reservation not found for checkin" });
      return;
    }
    // already check out
    if (reservationLine.status === "checked_out") {
      res
        .status(400)
        .json({ message: "This reservation has already been checkout out" });
      return;
    }
    // cancelled
    if (reservationLine.status === "cancelled") {
      res
        .status(400)
        .json({ message: "Cannot check in a cancelled reservation" });
      return;
    }
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.reservationLine.update({
        where: { id: reservationLineId.toString() },
        data: {
          status: "checked_out",
          checkOutDate: now,
        },
      });
      // update the room status to maintainance
      await tx.room.update({
        where: { id: reservationLine.roomId },
        data: { status: "maintenance" },
      });
      // Update the reservation departure date to checkout time and date
      await tx.reservation.update({
        where: { id: reservationLine.reservation.id.toString() },
        data: { departureDate: now },
      });
    });
    res.status(200).json({
      message: "Guest checked in successfully",
    });
  } catch (error) {
    sendTelegramError(
      error instanceof Error ? error : new Error(String(error)),
      {
        endpoint: `/api/v1/reservations/${reservationLineId}/checkin`,
        method: "POST",
      },
    );
    res.status(500).json({
      message: "Failed to check in guest",
    });
  }
};
