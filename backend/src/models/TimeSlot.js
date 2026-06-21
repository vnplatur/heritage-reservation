const mongoose = require("mongoose");

const timeSlotSchema = new mongoose.Schema(
  {
    site: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Site",
      required: [true, "Please provide a site"],
    },
    date: {
      type: Date,
      required: [true, "Please provide a date"],
      index: true,
    },
    time: {
      type: String,
      required: [true, "Please provide a time (HH:MM format)"],
      match: [
        /^([01]\d|2[0-3]):([0-5]\d)$/,
        "Please provide time in HH:MM format",
      ],
    },
    totalCapacity: {
      type: Number,
      required: true,
      min: 1,
    },
    availableTickets: {
      type: Number,
      required: true,
      min: 0,
    },
    // Version field for optimistic concurrency control
    __v: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // Enable versioning for optimistic locking
    optimisticConcurrency: true,
  },
);

// Compound index for unique site + date + time combination
timeSlotSchema.index({ site: 1, date: 1, time: 1 }, { unique: true });

module.exports = mongoose.model("TimeSlot", timeSlotSchema);
