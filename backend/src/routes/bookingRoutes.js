const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const { protect } = require("../middleware/auth");

// Protected routes
router.post("/", protect, bookingController.createBooking);
router.get("/my-bookings", protect, bookingController.getUserBookings);
router.get(
  "/details/:reservationId",
  protect,
  bookingController.getBookingDetails,
);
router.delete("/:reservationId", protect, bookingController.cancelBooking);

// Public route
router.get("/available-slots", bookingController.getAvailableSlots);

module.exports = router;
