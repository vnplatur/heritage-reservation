import React, { useState, useEffect } from "react";
import axios from "axios";
import { format } from "date-fns";
import "./Booking.css";

const BookingForm = ({ siteId, onBookingSuccess, refreshKey = 0 }) => {
  const [formData, setFormData] = useState({
    date: "",
    time: "",
    ticketCount: 1,
    visitorName: "",
    visitorEmail: "",
    phone: "",
  });

  const [availableSlots, setAvailableSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const token = localStorage.getItem("token");

  // Reset form and slots when the selected site changes
  useEffect(() => {
    setFormData({
      date: "",
      time: "",
      ticketCount: 1,
      visitorName: "",
      visitorEmail: "",
      phone: "",
    });
    setAvailableSlots([]);
    setError("");
    setSuccess("");
  }, [siteId]);

  // Fetch available slots when date changes or when capacity updates externally
  useEffect(() => {
    if (formData.date) {
      fetchAvailableSlots(formData.date);
    } else {
      setAvailableSlots([]);
    }
  }, [formData.date, siteId, refreshKey]);

  const fetchAvailableSlots = async (date) => {
    try {
      const response = await axios.get("/api/bookings/available-slots", {
        params: {
          siteId,
          date,
        },
      });
      setAvailableSlots(response.data.timeSlots || []);
    } catch (err) {
      console.error("Error fetching slots:", err);
      setAvailableSlots([]);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await axios.post(
        "/api/bookings",
        {
          siteId,
          date: new Date(formData.date).toISOString(),
          time: formData.time,
          ticketCount: parseInt(formData.ticketCount),
          visitorName: formData.visitorName,
          visitorEmail: formData.visitorEmail,
          phone: formData.phone,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      setSuccess("✓ Booking confirmed! Check your email for details.");
      setFormData({
        date: "",
        time: "",
        ticketCount: 1,
        visitorName: "",
        visitorEmail: "",
        phone: "",
      });

      if (onBookingSuccess) {
        onBookingSuccess(response.data.reservation);
      }

      setTimeout(() => setSuccess(""), 5000);
    } catch (err) {
      setError(
        err.response?.data?.message || "Booking failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="booking-form-container">
      <h3>Reserve Your Tickets</h3>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form onSubmit={handleSubmit} className="booking-form">
        <div className="form-row">
          <div className="form-group">
            <label>Select Date *</label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              required
              min={format(new Date(), "yyyy-MM-dd")}
            />
          </div>

          <div className="form-group">
            <label>Select Time *</label>
            <select
              name="time"
              value={formData.time}
              onChange={handleChange}
              required
            >
              <option value="">Choose a time slot</option>
              {availableSlots.map((slot) => (
                <option key={slot._id} value={slot.time}>
                  {slot.time} ({slot.availableTickets} tickets available)
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Number of Tickets *</label>
            <select
              name="ticketCount"
              value={formData.ticketCount}
              onChange={handleChange}
              required
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <option key={num} value={num}>
                  {num} ticket{num > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Visitor Name</label>
            <input
              type="text"
              name="visitorName"
              value={formData.visitorName}
              onChange={handleChange}
              placeholder="Your full name"
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="visitorEmail"
              value={formData.visitorEmail}
              onChange={handleChange}
              placeholder="your@email.com"
            />
          </div>

          <div className="form-group">
            <label>Phone</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="Your phone number"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !formData.date || !formData.time}
          className="btn-submit"
        >
          {loading
            ? "Processing..."
            : `Book Tickets ($${formData.ticketCount * 500})`}
        </button>
      </form>
    </div>
  );
};

export default BookingForm;
