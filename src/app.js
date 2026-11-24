import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({ success: true, message: "MentorLagbe API is running" });
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
