/**
 * Middleware to handle errors globally
 */
const errorHandler = (err, req, res, next) => {
  const error = { ...err };
  error.message = err.message;

  // Log to console for dev
  console.error(err);

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const message = `Duplicate field value entered`;
    error.statusCode = 400;
    error.message = message;
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const message = Object.values(err.errors).map((val) => val.message);
    error.statusCode = 400;
    error.message = message;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    const message = "Invalid token";
    error.statusCode = 401;
    error.message = message;
  }

  if (err.name === "TokenExpiredError") {
    const message = "Token expired";
    error.statusCode = 401;
    error.message = message;
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || "Server Error",
    ...(process.env.NODE_ENV === "development" && { error: err }),
  });
};

module.exports = errorHandler;
