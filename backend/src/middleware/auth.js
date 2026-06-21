const jwt = require("jsonwebtoken");

/**
 * Middleware to protect routes with JWT authentication
 * Verifies token and attaches user info to request
 */
const protect = async (req, res, next) => {
  let token;

  // Get token from headers
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  // Make sure token exists
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized to access this route. Please provide a token.",
    });
  }

  try {
    // Verify token with explicit algorithm
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    if (!decoded || !decoded.id || typeof decoded.role !== "string") {
      return res.status(401).json({
        success: false,
        message: "Not authorized to access this route. Invalid token payload.",
      });
    }

    if (!["user", "admin"].includes(decoded.role)) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to access this route. Invalid user role.",
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Not authorized to access this route. Invalid token.",
    });
  }
};

/**
 * Middleware to restrict access to specific roles
 * @param {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`,
      });
    }
    next();
  };
};

module.exports = { protect, authorize };
