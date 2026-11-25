import { requirePermission } from "../../middleware/middleware.js";
import {
  createBooking,
  fetchReservations,
  fetchReservationCalendar,
  fetchReservationById,
  fetchCurrentRoomReservation,
  fetchReservationPayment,
  fetchReservationBalance,
  receiveReservationPayment,
  deleteReservation,
  printBookingReceipt,
  checkIn,
  checkOut,
} from "../../controllers/reservations.controller.js";
import { Router } from "express";

const router = Router();
router.get("/", requirePermission("bookings:view"), fetchReservations);
router.get("/calendar", requirePermission("bookings:view"), fetchReservationCalendar);
router.get("/current-room/:roomId", requirePermission("rooms:view", "bookings:view"), fetchCurrentRoomReservation);
router.get("/:reservationId/payment", requirePermission("bookings:view"), fetchReservationPayment);
router.get("/:reservationId/payment-balance", requirePermission("bookings:view", "bookings:payments:receive"), fetchReservationBalance);
router.post("/:reservationId/payment", requirePermission("bookings:view", "bookings:payments:receive"), receiveReservationPayment);
router.get("/:reservationId/print", requirePermission("bookings:print"), printBookingReceipt);
router.post("/:reservationLineId/check-in", requirePermission("bookings:edit"), checkIn);
router.post("/:reservationLineId/check-out", requirePermission("bookings:edit"), checkOut);
router.get("/:reservationId", requirePermission("bookings:view"), fetchReservationById);
router.delete("/:reservationId", requirePermission("bookings:delete"), deleteReservation);
router.post("/", requirePermission("bookings:create"), createBooking);

export { router as reservationRouter };
