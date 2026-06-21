const Site = require("../models/Site");

/**
 * Get all sites
 */
exports.getAllSites = async (req, res, next) => {
  try {
    const sites = await Site.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: sites.length,
      sites,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single site by ID
 */
exports.getSiteById = async (req, res, next) => {
  try {
    const site = await Site.findById(req.params.id);

    if (!site) {
      return res.status(404).json({
        success: false,
        message: "Site not found",
      });
    }

    res.status(200).json({
      success: true,
      site,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new site (Admin only)
 */
exports.createSite = async (req, res, next) => {
  try {
    const {
      name,
      description,
      location,
      dailyCapacity,
      hourlyCapacity,
      operatingHours,
    } = req.body;

    const site = await Site.create({
      name,
      description,
      location,
      dailyCapacity,
      hourlyCapacity,
      operatingHours,
    });

    res.status(201).json({
      success: true,
      message: "Site created successfully",
      site,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update site (Admin only)
 */
exports.updateSite = async (req, res, next) => {
  try {
    let site = await Site.findById(req.params.id);

    if (!site) {
      return res.status(404).json({
        success: false,
        message: "Site not found",
      });
    }

    site = await Site.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: "Site updated successfully",
      site,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete site (Admin only)
 */
exports.deleteSite = async (req, res, next) => {
  try {
    const site = await Site.findByIdAndDelete(req.params.id);

    if (!site) {
      return res.status(404).json({
        success: false,
        message: "Site not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Site deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
