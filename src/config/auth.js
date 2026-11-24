import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";

export const createAuth = (db) => {
  if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is required");
  }

  return betterAuth({
    database: mongodbAdapter(db),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:5000",
    trustedOrigins: [process.env.CLIENT_URL || "http://localhost:5173"],
    user: {
      additionalFields: {
        role: {
          type: ["student", "tutor", "admin"],
          required: true,
          defaultValue: "student",
          input: true,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
    },
  });
};
