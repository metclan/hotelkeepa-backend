import { Request, Response } from "express";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { sendTelegramError } from "../utils/telegram.js";
import { hotelDayRange } from "../utils/hotel-day-range.js";
import { z } from "zod";

const prisma = new PrismaClient();

export const fetchDashboardOverview = async (req: Request, res: Response) => {
  const locationId = req.user?.locationId;
  if (!locationId) {
    res.status(403).json({ message: "Select a hotel to view the dashboard." });
    return;
  }

  try {
    const hotel = await prisma.location.findUnique({ where: { id: locationId }, select: { timezone: true } });
    const timezone = hotel?.timezone ?? "Africa/Lagos";
    const now = new Date();
    const { start, end } = hotelDayRange(now, timezone);
    const today = { gte: start, lt: end };
    const dateKey = (date: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: timezone }).format(date);
    const activeRoom: Prisma.ReservationLineWhereInput = {
      status: { in: ["reserved", "checked_in", "checked_out"] },
    };
    const [totalBookings, checkedIn, checkedOut, arrivingToday, leavingToday, overdue, rooms] = await prisma.$transaction([
      prisma.reservation.count({ where: { locationId } }),
      prisma.reservationLine.count({
        where: { reservation: { locationId }, ...activeRoom, checkInDate: today },
      }),
      prisma.reservationLine.count({
        where: { reservation: { locationId }, status: "checked_out", checkOutDate: today },
      }),
      prisma.reservation.count({
        where: { locationId, arrivalDate: today, reservationLines: { some: activeRoom } },
      }),
      prisma.reservation.count({
        where: { locationId, departureDate: today, reservationLines: { some: activeRoom } },
      }),
      prisma.reservationLine.count({
        where: { status: "checked_in", reservation: { locationId, departureDate: { lt: now } } },
      }),
      prisma.room.groupBy({ by: ["status"], where: { locationId }, _count: { _all: true } }),
    ]);
    const overview = {
      date: dateKey(start),
      rooms: rooms.map(room => ({ status: room.status, count: room._count._all })),
      bookingActivity: { totalBookings, checkedIn, checkedOut, arrivingToday, leavingToday, overdue },
    };
    if (!req.user?.isOwner && !req.locationAdmin && !req.permissions?.includes("dashboard:revenue:view")) {
      res.json(overview);
      return;
    }

    const [reservations, sales, departments, payments, outstanding] = await prisma.$transaction([
      prisma.reservation.aggregate({
        where: {
          locationId,
          reservationDate: today,
          reservationLines: { some: activeRoom },
        },
        _sum: { totalAmount: true },
      }),
      prisma.posOrder.groupBy({
        by: ["departmentId"],
        // Checkout is the last write to a paid order, including one held overnight.
        where: { status: "paid", updatedAt: today, register: { locationId } },
        _sum: { total: true },
      }),
      prisma.department.findMany({
        where: { locationId },
        select: { id: true, name: true, canSell: true, isActive: true },
        orderBy: { name: "asc" },
      }),
      prisma.payment.aggregate({
        where: { locationId, direction: "ingoing", paymentDate: today, allocations: { some: { transactionType: "reservation" } } },
        _sum: { amount: true },
      }),
      prisma.$queryRaw<{ amount: Prisma.Decimal; bills: bigint }[]>`
        SELECT COALESCE(SUM(balance), 0) AS amount, COUNT(*) AS bills
        FROM (
          SELECT r.totalAmount - COALESCE((
            SELECT SUM(CASE WHEN p.direction = 'ingoing' THEN a.amountApplied ELSE -a.amountApplied END)
            FROM PaymentAllocation a JOIN Payment p ON p.id = a.paymentId
            WHERE a.transactionType = 'reservation' AND a.transactionId = r.id AND p.locationId = r.locationId
          ), 0) AS balance
          FROM Reservation r
          WHERE r.locationId = ${locationId} AND r.paymentStatus IN ('due', 'partially_paid')
            AND EXISTS (
              SELECT 1 FROM ReservationLine l
              WHERE l.reservationId = r.id AND l.status IN ('reserved', 'checked_in', 'checked_out')
            )
        ) AS balances
        WHERE balance > 0
      `,
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    const reservationRevenue = reservations._sum.totalAmount ?? new Prisma.Decimal(0);
    const salesByDepartment = new Map(sales.map(sale => [sale.departmentId, sale._sum.total]));
    const departmentRevenue = departments
      .filter(department => (department.isActive && department.canSell) || salesByDepartment.has(department.id))
      .map(({ id, name }) => ({
        id,
        name,
        revenue: salesByDepartment.get(id) ?? new Prisma.Decimal(0),
      }));
    const knownDepartments = new Set(departments.map(department => department.id));
    const deletedDepartmentSales = sales.filter(sale => !knownDepartments.has(sale.departmentId));
    if (deletedDepartmentSales.length) {
      departmentRevenue.push({
        id: "deleted-departments",
        name: "Deleted Departments",
        revenue: deletedDepartmentSales.reduce((total, sale) => total.plus(sale._sum.total ?? 0), new Prisma.Decimal(0)),
      });
    }
    const totalRevenue = departmentRevenue.reduce((total, department) => total.plus(department.revenue), reservationRevenue);

    const previousDays = [];
    let boundary = start;
    for (let index = 0; index < 6; index += 1) {
      const range = hotelDayRange(new Date(boundary.getTime() - 1), timezone);
      previousDays.unshift(range);
      boundary = range.start;
    }
    const history = await Promise.all(previousDays.map(async range => {
      const day = { gte: range.start, lt: range.end };
      const [bookings, orders] = await Promise.all([
        prisma.reservation.aggregate({
          where: { locationId, reservationDate: day, reservationLines: { some: activeRoom } },
          _sum: { totalAmount: true },
        }),
        prisma.posOrder.aggregate({
          where: { status: "paid", updatedAt: day, register: { locationId } },
          _sum: { total: true },
        }),
      ]);
      return { date: dateKey(range.start), revenue: (bookings._sum.totalAmount ?? new Prisma.Decimal(0)).plus(orders._sum.total ?? 0) };
    }));
    res.json({
      ...overview,
      totalRevenue,
      reservationRevenue,
      departments: departmentRevenue,
      paymentsReceived: totalRevenue.minus(reservationRevenue).plus(payments._sum.amount ?? 0),
      outstandingBalance: outstanding[0]?.amount ?? "0",
      outstandingBills: Number(outstanding[0]?.bills ?? 0),
      history: [...history, { date: dateKey(start), revenue: totalRevenue }],
    });
  } catch (error) {
    sendTelegramError(error instanceof Error ? error : new Error(String(error)), {
      endpoint: "/api/v1/reports/dashboard-overview",
      method: "GET",
    });
    res.status(500).json({ message: "Failed to load dashboard overview." });
  }
};

const reportPagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(10),
  search: z.string().trim().optional(),
});

function reservationReport(includeBookingDetails: boolean) {
  return async (req: Request, res: Response) => {
    const locationId = req.user?.locationId;
    const parsed = reportPagination.safeParse(req.query);
    if (!locationId || !parsed.success) {
      res.status(400).json({ message: "Select a hotel and a valid report page." });
      return;
    }
    const { page, limit, search } = parsed.data;
    try {
      const where: Prisma.ReservationWhereInput = {
        locationId,
        ...(search && { OR: [
          { bookingNumber: { contains: search } },
          { reservationLines: { some: { room: { roomNumber: { contains: search } } } } },
        ] }),
      };
      const [bookings, total] = await Promise.all([
        prisma.reservation.findMany({
          where,
          orderBy: [{ reservationDate: "desc" }, { id: "asc" }],
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            bookingNumber: true,
            paymentStatus: true,
            totalAmount: true,
            reservationDate: true,
            arrivalDate: true,
            departureDate: true,
            user: { select: { name: true } },
            customer: { select: { id: true, firstName: true, lastName: true } },
            reservationLines: includeBookingDetails ? {
              select: { status: true, roomId: true, pricePerNight: true, room: { select: { id: true, roomNumber: true, status: true } } },
            } : false,
          },
        }),
        prisma.reservation.count({ where }),
      ]);
      const allocations = await prisma.paymentAllocation.findMany({
        where: {
          transactionType: "reservation",
          transactionId: { in: bookings.map(booking => booking.id) },
          payment: { locationId },
        },
        select: {
          transactionId: true,
          amountApplied: true,
          payment: { select: {
            direction: true,
            paymentDate: true,
            paymentMethods: includeBookingDetails ? false : { select: { amount: true, customLabels: { select: { label: true } } } },
          } },
        },
      });
      const payments = new Map<string, { amount: Prisma.Decimal; paymentDate: Date; paymentMethods: typeof allocations[number]["payment"]["paymentMethods"] }[]>();
      for (const { transactionId, amountApplied, payment } of allocations) {
        if (!transactionId) continue;
        const entries = payments.get(transactionId) ?? [];
        const sign = payment.direction === "ingoing" ? 1 : -1;
        entries.push({
          amount: amountApplied.times(sign),
          paymentDate: payment.paymentDate,
          paymentMethods: payment.paymentMethods?.map(method => ({ ...method, amount: method.amount.times(sign) })) ?? [],
        });
        payments.set(transactionId, entries);
      }
      res.json({
        data: bookings.map(booking => ({ ...booking, payments: payments.get(booking.id) ?? [] })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      sendTelegramError(error instanceof Error ? error : new Error(String(error)), {
        endpoint: includeBookingDetails ? "/api/v1/reports/reservations" : "/api/v1/reports/payments",
        method: "GET",
      });
      res.status(500).json({ message: "Failed to load the report." });
    }
  };
}

export const fetchReservationsReport = reservationReport(true);
export const fetchPaymentsReport = reservationReport(false);

export async function fetchOccupancyReport(req: Request, res: Response) {
  const locationId = req.user?.locationId;
  if (!locationId) {
    res.status(403).json({ message: "Select a hotel to view occupancy." });
    return;
  }
  try {
    const rooms = await prisma.room.findMany({
      where: { locationId },
      orderBy: { roomNumber: "asc" },
      select: {
        id: true, roomNumber: true, floor: true, status: true,
        roomType: { select: { id: true, name: true, pricePerNight: true } },
        reservationLines: {
          where: {
            reservation: { locationId },
            OR: [
              { status: "checked_in" },
              { status: "reserved", reservation: { departureDate: { gt: new Date() } } },
            ],
          },
          orderBy: [{ status: "desc" }, { reservation: { arrivalDate: "asc" } }, { id: "asc" }],
          take: 1,
          select: { checkInDate: true, checkOutDate: true, reservation: { select: {
            arrivalDate: true, departureDate: true,
            customer: { select: { firstName: true, lastName: true } },
          } } },
        },
      },
    });
    res.json({ data: rooms.map(({ reservationLines, ...room }) => {
      const line = reservationLines[0];
      const reservation = line?.reservation;
      return {
        room,
        guest: reservation ? [reservation.customer.firstName, reservation.customer.lastName].filter(Boolean).join(" ") : "-",
        checkIn: line?.checkInDate ?? reservation?.arrivalDate,
        checkOut: line?.checkOutDate ?? reservation?.departureDate,
      };
    }) });
  } catch (error) {
    sendTelegramError(error instanceof Error ? error : new Error(String(error)), { endpoint: "/api/v1/reports/occupancy", method: "GET" });
    res.status(500).json({ message: "Failed to load occupancy." });
  }
}
