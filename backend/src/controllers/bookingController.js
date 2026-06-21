const Reservation = require("../models/Reservation");
const TimeSlot = require("../models/TimeSlot");
const Site = require("../models/Site");
const LockManager = require("../utils/lockManager");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const parseTimeSlotRange = (openTime, closeTime) => {
  const times = [];
  const [openHour, openMinute] = openTime.split(":").map(Number);
  const [closeHour, closeMinute] = closeTime.split(":").map(Number);
  let current = new Date();
  current.setHours(openHour, openMinute, 0, 0);
  const end = new Date();
  end.setHours(closeHour, closeMinute, 0, 0);

  while (current < end) {
    const hour = current.getHours().toString().padStart(2, "0");
    const minute = current.getMinutes().toString().padStart(2, "0");
    times.push(`${hour}:${minute}`);
    current.setHours(current.getHours() + 1);
  }

  return times;
};

const buildAvailableSlot = (siteId, date, time, capacity, existingSlot) => ({
  _id: existingSlot ? existingSlot._id : `${siteId}_${date}_${time}`,
  site: siteId,
  date: date instanceof Date ? date : new Date(date),
  time,
  totalCapacity: capacity,
  availableTickets: existingSlot ? existingSlot.availableTickets : capacity,
});

/**
 * Create a new booking with application-level locking + MongoDB ACID transactions
 *
 * CONCURRENCY SAFETY MECHANISM:
 * 1. Application-level lock acquired first (pessimistic locking)
 * 2. MongoDB transaction for multi-document ACID compliance
 * 3. Optimistic versioning as secondary fallback
 */
exports.createBooking = async (req, res, next) => {
  const lockerId = uuidv4(); // Unique identifier for this request
  let transactionsEnabled = true;
  let session = null;

  if (mongoose.connection.transactionsSupported === false) {
    transactionsEnabled = false;
  } else {
    session = await mongoose.startSession();
    try {
      session.startTransaction();
    } catch (error) {
      transactionsEnabled = false;
      console.warn(
        "MongoDB transactions unavailable, falling back to lock-only booking mode.",
        error.message,
      );
      await session.endSession();
      session = null;
    }
  }

  try {
    const { siteId, date, time, ticketCount } = req.body;
    const userId = req.user.id;
    const requestedDate = new Date(date);

    // ===== VALIDATION =====
    if (
      !siteId ||
      !date ||
      !time ||
      !ticketCount ||
      isNaN(requestedDate.getTime())
    ) {
      if (transactionsEnabled) await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Please provide a valid siteId, date, time, and ticketCount",
      });
    }

    if (ticketCount < 1 || ticketCount > 10) {
      if (transactionsEnabled) await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Ticket count must be between 1 and 10",
      });
    }

    // ===== FETCH SITE =====
    let siteQuery = Site.findById(siteId);
    if (transactionsEnabled) siteQuery = siteQuery.session(session);
    const site = await siteQuery;

    if (!site) {
      if (transactionsEnabled) await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Site not found",
      });
    }

    // ===== ACQUIRE APPLICATION-LEVEL LOCK =====
    const lockResourceId = `booking_${siteId}_${requestedDate.toISOString()}_${time}`;
    const lockAcquired = await LockManager.acquireLock(
      lockResourceId,
      lockerId,
      5,
      150,
    );

    if (!lockAcquired) {
      if (transactionsEnabled) await session.abortTransaction();
      return res.status(429).json({
        success: false,
        message:
          "This time slot is currently being booked by another user. Please try again.",
        retryAfter: 1,
      });
    }

    try {
      let timeSlotQuery = TimeSlot.findOne({
        site: siteId,
        date: requestedDate,
        time,
      });
      if (transactionsEnabled) timeSlotQuery = timeSlotQuery.session(session);
      let timeSlot = await timeSlotQuery;

      if (!timeSlot) {
        const createOptions = transactionsEnabled ? { session } : undefined;
        const created = await TimeSlot.create(
          [
            {
              site: siteId,
              date: requestedDate,
              time,
              totalCapacity: site.hourlyCapacity,
              availableTickets: site.hourlyCapacity,
            },
          ],
          createOptions,
        );
        timeSlot = created[0];
      }

      if (timeSlot.availableTickets < ticketCount) {
        if (transactionsEnabled) await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Not enough tickets available. Only ${timeSlot.availableTickets} tickets left.`,
        });
      }

      const updateOptions = { new: true };
      if (transactionsEnabled) updateOptions.session = session;

      const updateResult = await TimeSlot.findOneAndUpdate(
        {
          _id: timeSlot._id,
          availableTickets: { $gte: ticketCount },
        },
        {
          $inc: { availableTickets: -ticketCount },
          updatedAt: new Date(),
        },
        updateOptions,
      );

      if (!updateResult) {
        if (transactionsEnabled) await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message:
            "Not enough tickets available. Please choose a different time slot.",
        });
      }

      let reservation;
      try {
        const createOptions = transactionsEnabled ? { session } : undefined;
        reservation = await Reservation.create(
          [
            {
              reservationId: uuidv4(),
              user: userId,
              site: siteId,
              timeSlot: timeSlot._id,
              date: requestedDate,
              time,
              ticketCount,
              status: "confirmed",
              totalPrice: ticketCount * 500,
              transactionId: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              guestDetails: {
                visitorName: req.body.visitorName || "Not Provided",
                visitorEmail: req.body.visitorEmail || req.user.email,
                phone: req.body.phone || "Not Provided",
              },
            },
          ],
          createOptions,
        );
      } catch (createError) {
        if (!transactionsEnabled) {
          await TimeSlot.findByIdAndUpdate(timeSlot._id, {
            $inc: { availableTickets: ticketCount },
            updatedAt: new Date(),
          });
        }
        throw createError;
      }

      if (transactionsEnabled) {
        await session.commitTransaction();
      }

      if (req.app?.io) {
        req.app.io.to(`site_${siteId}`).emit("capacity-update", {
          siteId,
          date: requestedDate.toISOString(),
          time,
          availableTickets: updateResult.availableTickets,
        });
        req.app.io.to("admin-dashboard").emit("capacity-update", {
          siteId,
          date: requestedDate.toISOString(),
          time,
          availableTickets: updateResult.availableTickets,
        });
      }

      res.status(201).json({
        success: true,
        message: "Booking confirmed successfully",
        reservation: reservation[0],
        remainingCapacity: updateResult.availableTickets,
      });
    } finally {
      await LockManager.releaseLock(lockResourceId, lockerId);
    }
  } catch (error) {
    if (transactionsEnabled && session) await session.abortTransaction();
    next(error);
  } finally {
    if (session) await session.endSession();
  }
};

/**
 * Cancel a booking
 */
exports.cancelBooking = async (req, res, next) => {
  const lockerId = uuidv4();
  let transactionsEnabled = true;
  let session = null;

  if (mongoose.connection.transactionsSupported === false) {
    transactionsEnabled = false;
  } else {
    session = await mongoose.startSession();
    try {
      session.startTransaction();
    } catch (error) {
      transactionsEnabled = false;
      console.warn(
        "MongoDB transactions unavailable for cancellation, falling back to lock-only mode.",
        error.message,
      );
      await session.endSession();
      session = null;
    }
  }

  try {
    const { reservationId } = req.params;
    const userId = req.user.id;

    const lockResourceId = `cancel_${reservationId}`;
    const lockAcquired = await LockManager.acquireLock(
      lockResourceId,
      lockerId,
      5,
      150,
    );
    if (!lockAcquired) {
      if (transactionsEnabled) await session.abortTransaction();
      return res.status(429).json({
        success: false,
        message: "Cancellation is already being processed. Please try again.",
      });
    }

    try {
      let reservationQuery = Reservation.findOne({
        _id: reservationId,
        user: userId,
      });
      if (transactionsEnabled)
        reservationQuery = reservationQuery.session(session);
      const reservation = await reservationQuery;

      if (!reservation) {
        if (transactionsEnabled) await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: "Reservation not found",
        });
      }

      if (reservation.status === "cancelled") {
        if (transactionsEnabled) await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Reservation is already cancelled",
        });
      }

      const updateOptions = { new: true };
      if (transactionsEnabled) updateOptions.session = session;

      await Reservation.findByIdAndUpdate(
        reservationId,
        {
          status: "cancelled",
          cancelledAt: new Date(),
        },
        transactionsEnabled ? { session } : undefined,
      );

      const updatedTimeSlot = await TimeSlot.findByIdAndUpdate(
        reservation.timeSlot,
        {
          $inc: { availableTickets: reservation.ticketCount },
          updatedAt: new Date(),
        },
        updateOptions,
      );

      if (!updatedTimeSlot) {
        if (transactionsEnabled) await session.abortTransaction();
        return res.status(500).json({
          success: false,
          message: "Unable to release tickets. Try again later.",
        });
      }

      if (transactionsEnabled) {
        await session.commitTransaction();
      }

      if (req.app?.io) {
        req.app.io.to(`site_${reservation.site}`).emit("capacity-update", {
          siteId: reservation.site.toString(),
          date: reservation.date.toISOString(),
          time: reservation.time,
          availableTickets: updatedTimeSlot.availableTickets,
        });
        req.app.io.to("admin-dashboard").emit("capacity-update", {
          siteId: reservation.site.toString(),
          date: reservation.date.toISOString(),
          time: reservation.time,
          availableTickets: updatedTimeSlot.availableTickets,
        });
      }

      res.status(200).json({
        success: true,
        message: "Booking cancelled successfully",
      });
    } finally {
      await LockManager.releaseLock(lockResourceId, lockerId);
    }
  } catch (error) {
    if (transactionsEnabled && session) await session.abortTransaction();
    next(error);
  } finally {
    if (session) await session.endSession();
  }
};

/**
 * Get user's bookings
 */
exports.getUserBookings = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const reservations = await Reservation.find({ user: userId })
      .populate("site", "name location")
      .populate("timeSlot")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reservations.length,
      reservations,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get available time slots for a site
 */
exports.getAvailableSlots = async (req, res, next) => {
  try {
    const { siteId, date } = req.query;

    if (!siteId || !date) {
      return res.status(400).json({
        success: false,
        message: "Please provide siteId and date",
      });
    }

    const site = await Site.findById(siteId);
    if (!site) {
      return res.status(404).json({
        success: false,
        message: "Site not found",
      });
    }

    const requestedDate = new Date(date);
    const existingSlots = await TimeSlot.find({
      site: siteId,
      date: requestedDate,
    }).sort({ time: 1 });

    const hourlyTimes = parseTimeSlotRange(
      site.operatingHours.openTime,
      site.operatingHours.closeTime,
    );

    const timeSlots = hourlyTimes.map((time) => {
      const existingSlot = existingSlots.find((slot) => slot.time === time);
      return buildAvailableSlot(
        siteId,
        requestedDate,
        time,
        site.hourlyCapacity,
        existingSlot,
      );
    });

    res.status(200).json({
      success: true,
      count: timeSlots.length,
      timeSlots,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get booking details
 */
exports.getBookingDetails = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    const userId = req.user.id;

    const reservation = await Reservation.findOne({
      _id: reservationId,
      user: userId,
    })
      .populate("site")
      .populate("timeSlot");

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    res.status(200).json({
      success: true,
      reservation,
    });
  } catch (error) {
    next(error);
  }
};
