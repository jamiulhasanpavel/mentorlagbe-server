import "dotenv/config";
import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";

const port = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

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

