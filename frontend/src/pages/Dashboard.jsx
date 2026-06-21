import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import io from "socket.io-client";
import BookingForm from "../components/BookingForm";
import AdminSiteManager from "../components/AdminSiteManager";
import "./Dashboard.css";

const Dashboard = () => {
  const [sites, setSites] = useState([]);
  const [userBookings, setUserBookings] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [slotRefreshKey, setSlotRefreshKey] = useState(0);
  const socketRef = useRef(null);

  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user"));

  // Initialize WebSocket connection
  useEffect(() => {
    const socket = io("http://localhost:5000", {
      auth: {
        token,
      },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("✓ Socket connected", socket.id);
      socket.emit("join-site", selectedSite?._id);
    });

    socket.on("capacity-update", (data) => {
      console.log("Capacity update received", data);
      if (data.siteId === selectedSite?._id) {
        setSlotRefreshKey((prev) => prev + 1);
      }
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error", err.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, selectedSite]);

  useEffect(() => {
    if (socketRef.current && selectedSite) {
      socketRef.current.emit("join-site", selectedSite._id);
    }
  }, [selectedSite]);

  // Fetch sites and user bookings
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sitesRes, bookingsRes] = await Promise.all([
          axios.get("/api/sites"),
          axios.get("/api/bookings/my-bookings", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        setSites(sitesRes.data.sites || []);
        setUserBookings(bookingsRes.data.reservations || []);
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  const handleCancelBooking = async (reservationId) => {
    if (!window.confirm("Are you sure you want to cancel this booking?")) {
      return;
    }

    try {
      await axios.delete(`/api/bookings/${reservationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setUserBookings((prev) =>
        prev.filter((booking) => booking._id !== reservationId),
      );

      alert("Booking cancelled successfully");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to cancel booking");
    }
  };

  const handleBookingSuccess = (reservation) => {
    setUserBookings((prev) => [reservation, ...prev]);
    alert("Booking confirmed successfully!");
  };

  if (loading) {
    return <div className="dashboard-loading">Loading...</div>;
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <h1>Heritage Site Reservations</h1>
          <nav className="dashboard-nav">
            <button
              type="button"
              className={selectedSite ? "nav-button" : "nav-button active"}
              onClick={() => setSelectedSite(null)}
            >
              Explore Sites
            </button>
            <button
              type="button"
              className={selectedSite ? "nav-button active" : "nav-button"}
              onClick={() => {
                if (sites.length > 0) {
                  setSelectedSite(sites[0]);
                }
              }}
            >
              Book Tickets
            </button>
          </nav>
        </div>

        <div className="dashboard-userline">
          <p>
            Welcome, {user?.name}! |{" "}
            <button
              type="button"
              className="logout-button"
              onClick={() => {
                localStorage.clear();
                window.location.href = "/login";
              }}
            >
              Logout
            </button>
          </p>
        </div>
      </header>

      <div className="dashboard-grid">
        <section className="dashboard-section site-panel">
          <h2>Available Heritage Sites</h2>
          <div className="sites-grid">
            {sites.map((site) => (
              <div key={site._id} className="site-card">
                <h3>{site.name}</h3>
                <p className="site-location">📍 {site.location}</p>
                <p className="site-description">{site.description}</p>
                <div className="site-capacity">
                  <span>Daily Capacity: {site.dailyCapacity}</span>
                  <span>Hourly Capacity: {site.hourlyCapacity}</span>
                </div>
                <button
                  onClick={() => setSelectedSite(site)}
                  className="btn-explore"
                >
                  Book Tickets
                </button>
              </div>
            ))}
          </div>
        </section>

        {user?.role === "admin" && (
          <section className="dashboard-section admin-panel">
            <h2>Admin Site Management</h2>
            <AdminSiteManager
              sites={sites}
              token={token}
              onSitesChange={setSites}
            />
          </section>
        )}

        <section className="dashboard-section booking-panel">
          <h2>
            {selectedSite
              ? `Book at ${selectedSite.name}`
              : "Booking Interface"}
          </h2>
          {selectedSite ? (
            <BookingForm
              siteId={selectedSite._id}
              onBookingSuccess={handleBookingSuccess}
              refreshKey={slotRefreshKey}
            />
          ) : (
            <div className="booking-placeholder">
              <p>Select a site from the list to open the booking form.</p>
            </div>
          )}
        </section>

        <section className="dashboard-section">
          <h2>My Bookings</h2>
          {userBookings.length === 0 ? (
            <p className="empty-state">You haven't made any bookings yet.</p>
          ) : (
            <div className="bookings-list">
              {userBookings.map((booking) => (
                <div
                  key={booking._id}
                  className={`booking-card booking-${booking.status}`}
                >
                  <div className="booking-header">
                    <h4>{booking.site?.name}</h4>
                    <span className={`status-badge status-${booking.status}`}>
                      {booking.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="booking-details">
                    <p>
                      📅 {new Date(booking.date).toLocaleDateString()} at{" "}
                      {booking.time}
                    </p>
                    <p>🎫 {booking.ticketCount} ticket(s)</p>
                    <p>💰 ${booking.totalPrice}</p>
                    <p>Reservation ID: {booking.reservationId}</p>
                  </div>
                  {booking.status === "confirmed" && (
                    <button
                      onClick={() => handleCancelBooking(booking._id)}
                      className="btn-cancel"
                    >
                      Cancel Booking
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
