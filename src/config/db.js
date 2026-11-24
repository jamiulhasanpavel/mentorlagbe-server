import { MongoClient } from "mongodb";

let client;
let db;

export const connectDB = async () => {
  if (db) {
    return db;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
  });
  await client.connect();
  db = client.db(process.env.DB_NAME || "mentorlagbe");
  console.log("Successfully connected to MongoDB");

  return db;
};

export const getDB = () => {
  if (!db) {
    throw new Error("Database is not connected");
  }

  return db;
};

export const closeDB = async () => {
  if (!client) {
    return;
  }

  await client.close();
  client = undefined;
  db = undefined;
};
