import "dotenv/config";
import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";
import { getDB } from "./src/config/db.js";
import { mountAuthRoutes } from "./src/routes/auth.routes.js";
import { errorHandler, notFoundHandler } from "./src/middlewares/errorHandler.js";

const port = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  mountAuthRoutes(app, getDB());
  app.use(notFoundHandler);
  app.use(errorHandler);

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start server:", error.message);
  if (process.env.MONGODB_URI?.includes("<username>")) {
    console.error("Set the real MongoDB Atlas URI in .env");
  }
  process.exit(1);
});

