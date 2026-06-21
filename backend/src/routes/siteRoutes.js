const express = require("express");
const router = express.Router();
const siteController = require("../controllers/siteController");
const { protect, authorize } = require("../middleware/auth");

// Public routes
router.get("/", siteController.getAllSites);
router.get("/:id", siteController.getSiteById);

// Admin routes
router.post("/", protect, authorize("admin"), siteController.createSite);
router.put("/:id", protect, authorize("admin"), siteController.updateSite);
router.delete("/:id", protect, authorize("admin"), siteController.deleteSite);

module.exports = router;
