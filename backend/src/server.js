const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");
const connectDB = require("./config/database");
const errorHandler = require("./middleware/errorHandler");

// Load env variables
dotenv.config({ path: "./.env" });

// Create Express app
const app = express();
const server = http.createServer(app);

// Create Socket.io instance with CORS enabled
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Connect to database
connectDB();

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== WEBSOCKET CONNECTION HANDLING =====
let connectedUsers = {};

io.on("connection", (socket) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    console.warn(`Socket ${socket.id} denied - no token provided.`);
    socket.disconnect(true);
    return;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch (error) {
    console.warn(`Socket ${socket.id} denied - invalid token.`);
    socket.disconnect(true);
    return;
  }

  if (
    !decoded ||
    !decoded.id ||
    typeof decoded.id !== "string" ||
    typeof decoded.role !== "string" ||
    !["user", "admin"].includes(decoded.role)
  ) {
    console.warn(`Socket ${socket.id} denied - invalid token payload.`);
    socket.disconnect(true);
    return;
  }

  socket.user = decoded;
  console.log(
    `✓ User connected: ${socket.id} (${socket.user.id}) role=${socket.user.role}`,
  );

  if (socket.user.role === "admin") {
    socket.join("admin-dashboard");
  }

  socket.on("join-site", (siteId) => {
    if (!siteId) return;
    socket.join(`site_${siteId}`);
    if (socket.user.role === "admin") {
      socket.join("admin-dashboard");
    }

    connectedUsers[socket.id] = { siteId, role: socket.user.role };
    console.log(`✓ User ${socket.id} joined site ${siteId}`);
  });

  socket.on("disconnect", () => {
    delete connectedUsers[socket.id];
    console.log(`✗ User disconnected: ${socket.id}`);
  });
});

// Attach io to app for use in controllers
app.io = io;

// ===== ROUTES =====
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/sites", require("./routes/siteRoutes"));
app.use("/api/bookings", require("./routes/bookingRoutes"));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date(),
  });
});

// ===== ERROR HANDLING =====
app.use(errorHandler);

// ===== START SERVER =====
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║  Heritage Reservation System Backend Started       ║
║  Server: http://localhost:${PORT}              ║
║  Environment: ${process.env.NODE_ENV}              ║
╚════════════════════════════════════════════════════╝
  `);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error(`✗ Unhandled Rejection: ${err.message}`);
  process.exit(1);
});

module.exports = { app, server, io };
