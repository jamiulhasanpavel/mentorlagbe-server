import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";

export const createAuth = (db) => {
  if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is required");
  }

  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const trustedOrigins = (
    process.env.BETTER_AUTH_TRUSTED_ORIGINS ||
    process.env.CLIENT_URL ||
    "http://localhost:3000"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return betterAuth({
    database: mongodbAdapter(db),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
    trustedOrigins,
    user: {
      additionalFields: {
        role: {
          type: ["student", "tutor"],
          required: true,
          defaultValue: "student",
          input: true,
        },
        plan: {
          type: ["free", "student-plus", "tutor-pro"],
          required: true,
          defaultValue: "free",
          input: false,
        },
        planStatus: {
          type: ["inactive", "active", "past_due", "canceled"],
          required: true,
          defaultValue: "inactive",
          input: false,
        },
        phone: {
          type: "string",
          required: false,
          input: false,
        },
        bio: {
          type: "string",
          required: false,
          input: false,
        },
        bannerImage: {
          type: "string",
          required: false,
          input: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
    },
    ...(googleClientId && googleClientSecret
      ? {
          socialProviders: {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            },
          },
        }
      : {}),
  });
};
