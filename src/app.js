import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import userRoutes from "./routes/user.routes.js";
import messageRoutes from "./routes/message.routes.js";
import tuitionRoutes from "./routes/tuition.routes.js";
import applicationRoutes from "./routes/application.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import paymentRoutes, { webhookRoutes } from "./routes/payment.routes.js";

const app = express();
const allowedClientOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedClientOrigins,
    credentials: true,
  }),
);
app.use(cookieParser());

app.use("/api/payments", webhookRoutes);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({ success: true, message: "MentorLagbe API is running" });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is healthy",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/tuition", tuitionRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/profile", uploadRoutes);
app.use("/api/payments", paymentRoutes);

export default app;
