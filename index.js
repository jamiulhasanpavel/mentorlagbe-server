import "dotenv/config";
import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";
import { getDB } from "./src/config/db.js";
import { mountAuthRoutes } from "./src/routes/auth.routes.js";
import { errorHandler, notFoundHandler } from "./src/middlewares/errorHandler.js";

const port = process.env.PORT || 5000;
let initialization;

function initializeApp() {
  if (!initialization) {
    initialization = connectDB()
      .then(() => {
        mountAuthRoutes(app, getDB());
        app.use(notFoundHandler);
        app.use(errorHandler);
      })
      .catch((error) => {
        initialization = undefined;
        throw error;
      });
  }

  return initialization;
}

export default async function handler(req, res) {
  try {
    await initializeApp();
    return app(req, res);
  } catch (error) {
    console.error("Failed to initialize API:", error);
    if (!res.headersSent) {
      return res.status(503).json({
        success: false,
        message: "The API is temporarily unavailable.",
      });
    }
  }
}

if (process.env.VERCEL !== "1") {
  initializeApp()
    .then(() => {
      app.listen(port, () => {
        console.log(`Server running on port ${port}`);
      });
    })
    .catch((error) => {
      console.error("Failed to start server:", error.message);
      if (process.env.MONGODB_URI?.includes("<username>")) {
        console.error("Set the real MongoDB Atlas URI in .env");
      }
      process.exit(1);
    });
}

