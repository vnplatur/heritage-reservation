const mongoose = require("mongoose");

const siteSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please provide a site name"],
    trim: true,
    maxlength: [100, "Site name cannot exceed 100 characters"],
  },
  description: {
    type: String,
    required: [true, "Please provide a description"],
  },
  location: {
    type: String,
    required: [true, "Please provide a location"],
  },
  dailyCapacity: {
    type: Number,
    required: [true, "Please provide daily capacity"],
    min: [1, "Capacity must be at least 1"],
  },
  hourlyCapacity: {
    type: Number,
    required: [true, "Please provide hourly capacity"],
    min: [1, "Hourly capacity must be at least 1"],
  },
  operatingHours: {
    openTime: {
      type: String,
      required: true,
      default: "09:00",
    },
    closeTime: {
      type: String,
      required: true,
      default: "18:00",
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Site", siteSchema);
