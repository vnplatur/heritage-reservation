const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const reservationSchema = new mongoose.Schema({
  reservationId: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Please provide a user"],
  },
  site: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Site",
    required: [true, "Please provide a site"],
  },
  timeSlot: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TimeSlot",
    required: [true, "Please provide a time slot"],
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
  time: {
    type: String,
    required: true,
  },
  ticketCount: {
    type: Number,
    required: [true, "Please provide ticket count"],
    min: [1, "Minimum 1 ticket required"],
    max: [10, "Maximum 10 tickets per reservation"],
  },
  status: {
    type: String,
    enum: ["confirmed", "cancelled", "pending"],
    default: "confirmed",
    index: true,
  },
  totalPrice: {
    type: Number,
    required: true,
  },
  guestDetails: {
    visitorName: String,
    visitorEmail: String,
    phone: String,
  },
  transactionId: {
    type: String,
    unique: true,
    sparse: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  cancelledAt: Date,
});

// Index for querying user reservations
reservationSchema.index({ user: 1, createdAt: -1 });

// Index for querying site reservations
reservationSchema.index({ site: 1, date: 1 });

module.exports = mongoose.model("Reservation", reservationSchema);
