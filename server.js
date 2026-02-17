/**
 * Live Bus Tracking Backend
 * Express + MongoDB Atlas + Socket.IO
 * Node.js v22 compatible
 */

require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

/* ============================
   Middleware
   ============================ */
app.use(cors());
app.use(express.json());

/* ============================
   Socket.IO Setup
   ============================ */
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

/* ============================
   MongoDB Connection
   ============================ */
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI is not defined");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) =>
    console.error("❌ MongoDB connection error:", err)
  );

/* ============================
   MongoDB Schema
   ============================ */
const BusSchema = new mongoose.Schema({
  busId: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now },
});

const Bus = mongoose.model("Bus", BusSchema);

/* ============================
   Health Check
   ============================ */
app.get("/", (req, res) => {
  res.send("Backend is running");
});

/* ============================
   Throttle Control
   ============================ */
const lastBroadcastTime = {};

/* ============================
   Socket.IO Logic (IMPORTANT)
   ============================ */
io.on("connection", (socket) => {
  console.log("🟢 Client connected:", socket.id);

  socket.on("location:update", async (data) => {
    try {
      console.log("📍 Location received:", data);

      const { busId, lat, lng } = data;

      if (!busId || lat == null || lng == null) {
        console.warn("⚠️ Invalid location payload");
        return;
      }

      // Save latest location
      await Bus.findOneAndUpdate(
        { busId },
        { lat, lng, updatedAt: new Date() },
        { upsert: true, new: true }
      );

      // Throttle broadcasts (every 3 seconds)
      const now = Date.now();
      if (
        lastBroadcastTime[busId] &&
        now - lastBroadcastTime[busId] < 3000
      ) {
        return;
      }

      lastBroadcastTime[busId] = now;

      // Broadcast to viewers
      io.emit("location:broadcast", data);
    } catch (err) {
      console.error("❌ Error handling location update:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 Client disconnected:", socket.id);
  });
});

/* ============================
   Start Server
   ============================ */
const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
