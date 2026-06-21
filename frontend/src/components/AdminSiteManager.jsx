import React, { useState, useEffect } from "react";
import axios from "axios";

const emptySite = {
  name: "",
  description: "",
  location: "",
  dailyCapacity: 100,
  hourlyCapacity: 20,
  operatingHours: {
    openTime: "09:00",
    closeTime: "18:00",
  },
};

const AdminSiteManager = ({ sites, token, onSitesChange }) => {
  const [selectedSite, setSelectedSite] = useState(null);
  const [formData, setFormData] = useState(emptySite);
  const [statusMessage, setStatusMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedSite) {
      setFormData(emptySite);
      setStatusMessage(null);
    }
  }, [selectedSite]);

  const setField = (field, value) => {
    if (field === "openTime" || field === "closeTime") {
      setFormData((prev) => ({
        ...prev,
        operatingHours: {
          ...prev.operatingHours,
          [field]: value,
        },
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const clearSelection = () => {
    setSelectedSite(null);
    setFormData(emptySite);
    setStatusMessage(null);
  };

  const submitSite = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        location: formData.location,
        dailyCapacity: Number(formData.dailyCapacity),
        hourlyCapacity: Number(formData.hourlyCapacity),
        operatingHours: {
          openTime: formData.operatingHours.openTime,
          closeTime: formData.operatingHours.closeTime,
        },
      };

      const config = {
        headers: { Authorization: `Bearer ${token}` },
      };

      let result;
      if (selectedSite) {
        result = await axios.put(
          `/api/sites/${selectedSite._id}`,
          payload,
          config,
        );
        const updatedSite = result.data.site;
        onSitesChange((prev) =>
          prev.map((site) =>
            site._id === updatedSite._id ? updatedSite : site,
          ),
        );
        setStatusMessage("Site updated successfully.");
      } else {
        result = await axios.post("/api/sites", payload, config);
        const newSite = result.data.site;
        onSitesChange((prev) => [newSite, ...prev]);
        setStatusMessage("Site created successfully.");
        setFormData(emptySite);
      }
    } catch (error) {
      const message =
        error.response?.data?.message ||
        "Unable to save site. Please try again.";
      setStatusMessage(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-site-manager">
      <div className="admin-site-header">
        <h3>{selectedSite ? "Edit Site" : "Create New Heritage Site"}</h3>
        {selectedSite && (
          <button
            type="button"
            className="btn-secondary"
            onClick={clearSelection}
          >
            Create New
          </button>
        )}
      </div>

      <form className="admin-site-form" onSubmit={submitSite}>
        <label>
          Name
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={(e) => setField("name", e.target.value)}
            required
          />
        </label>

        <label>
          Location
          <input
            type="text"
            name="location"
            value={formData.location}
            onChange={(e) => setField("location", e.target.value)}
            required
          />
        </label>

        <label>
          Description
          <textarea
            name="description"
            rows="3"
            value={formData.description}
            onChange={(e) => setField("description", e.target.value)}
            required
          />
        </label>

        <div className="admin-site-row">
          <label>
            Daily Capacity
            <input
              type="number"
              name="dailyCapacity"
              min="1"
              value={formData.dailyCapacity}
              onChange={(e) => setField("dailyCapacity", e.target.value)}
              required
            />
          </label>

          <label>
            Hourly Capacity
            <input
              type="number"
              name="hourlyCapacity"
              min="1"
              value={formData.hourlyCapacity}
              onChange={(e) => setField("hourlyCapacity", e.target.value)}
              required
            />
          </label>
        </div>

        <div className="admin-site-row">
          <label>
            Open Time
            <input
              type="time"
              name="openTime"
              value={formData.operatingHours.openTime}
              onChange={(e) => setField("openTime", e.target.value)}
              required
            />
          </label>

          <label>
            Close Time
            <input
              type="time"
              name="closeTime"
              value={formData.operatingHours.closeTime}
              onChange={(e) => setField("closeTime", e.target.value)}
              required
            />
          </label>
        </div>

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving..." : selectedSite ? "Update Site" : "Create Site"}
        </button>

        {statusMessage && <p className="admin-site-status">{statusMessage}</p>}
      </form>

      <div className="admin-site-list">
        <h4>Existing Sites</h4>
        {sites.length === 0 ? (
          <p>No sites available.</p>
        ) : (
          sites.map((site) => (
            <div key={site._id} className="admin-site-item">
              <div>
                <strong>{site.name}</strong>
                <p>{site.location}</p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setSelectedSite(site);
                  setFormData({
                    name: site.name,
                    description: site.description,
                    location: site.location,
                    dailyCapacity: site.dailyCapacity,
                    hourlyCapacity: site.hourlyCapacity,
                    operatingHours: {
                      openTime: site.operatingHours.openTime,
                      closeTime: site.operatingHours.closeTime,
                    },
                  });
                }}
              >
                Edit
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminSiteManager;
