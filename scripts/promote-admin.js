import "dotenv/config";
import { MongoClient } from "mongodb";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function promoteAdmin() {
  const [emailArgument, confirmation, ...extraArguments] = process.argv.slice(2);
  if (!emailArgument || confirmation !== "--confirm" || extraArguments.length > 0) {
    throw new Error("Usage: npm run admin:promote -- <account-email> --confirm");
  }

  const email = emailArgument.trim();
  if (!email || !email.includes("@")) {
    throw new Error("A valid account email is required.");
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || "mentorlagbe");
    const users = db.collection("user");
    const matches = await users
      .find(
        { email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } },
        { projection: { role: 1 } },
      )
      .limit(2)
      .toArray();

    if (matches.length === 0) {
      throw new Error(`No account found for ${email}. Create the account before promoting it.`);
    }
    if (matches.length > 1) {
      throw new Error(`More than one account matches ${email}; no account was changed.`);
    }

    const user = matches[0];
    if (user.role === "admin") {
      console.log(`${email} already has the admin role.`);
      return;
    }
    if (user.role !== "student" && user.role !== "tutor") {
      throw new Error(`Account ${email} has an unsupported role; no account was changed.`);
    }

    const result = await users.updateOne(
      { _id: user._id, role: user.role },
      { $set: { role: "admin", updatedAt: new Date() } },
    );
    if (result.matchedCount !== 1) {
      throw new Error(`Account ${email} changed during promotion; no account was changed.`);
    }

    console.log(`Promoted ${email} to admin.`);
  } finally {
    await client.close();
  }
}

promoteAdmin().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  const uri = process.env.MONGODB_URI;
  console.error(
    "Admin promotion failed:",
    uri ? message.replace(uri, "[redacted MongoDB URI]") : message,
  );
  process.exitCode = 1;
});
