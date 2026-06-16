import {
  createBooking,
  fetchReservations,
  fetchReservationById,
  fetchReservationPayment,
  deleteReservation,
  printBookingReceipt,
  checkIn,
  checkOut,
} from "../../controllers/reservations.controller.js";
import { Router } from "express";

const router = Router();
router.get("/", fetchReservations);
router.get("/:reservationId/payment", fetchReservationPayment);
router.get("/:reservationId/print", printBookingReceipt);
router.post("/:reservationLineId/check-in", checkIn);
router.post("/:reservationLineId/check-out", checkOut);
router.get("/:reservationId", fetchReservationById);
router.delete("/:reservationId", deleteReservation);
router.post("/", createBooking);

export { router as reservationRouter };
