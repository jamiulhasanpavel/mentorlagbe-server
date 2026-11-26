import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDB } from "../config/db.js";
import { createAuth } from "../config/auth.js";
import { verifyToken } from "../middlewares/verifyToken.js";
import { userProfileSchema } from "../validations/user.validation.js";

const router = Router();

const updateRoleSchema = z.object({
  role: z.enum(["student", "tutor", "admin"]),
});

const getSession = async (req) => {
  const auth = createAuth(getDB());
  return auth.api.getSession({
    headers: new Headers({ cookie: req.headers.cookie || "" }),
  });
};

const toDatabaseId = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : id);

router.get("/tutors/:id/profile", async (req, res, next) => {
  try {
    const tutor = await getDB().collection("user").findOne(
      { _id: toDatabaseId(req.params.id), role: "tutor" },
      { projection: { name: 1, image: 1, bio: 1, bannerImage: 1 } },
    );
    if (!tutor) {
      return res.status(404).json({ success: false, message: "Tutor not found" });
    }

    const { _id, ...profile } = tutor;
    return res.json({
      success: true,
      data: { ...profile, id: String(_id) },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (session.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "50"), 10) || 50));
    const users = await getDB().collection("user")
      .find({})
      .project({ name: 1, email: 1, image: 1, role: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();
    const total = await getDB().collection("user").countDocuments();

    return res.json({
      success: true,
      data: users.map(({ _id, ...user }) => ({ ...user, id: String(_id) })),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/admin/:id/role", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (session.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const parsed = updateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    const users = getDB().collection("user");
    const userId = toDatabaseId(req.params.id);
    const user = await users.findOne({ _id: userId }, { projection: { role: 1 } });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (String(userId) === session.user.id) {
      return res.status(403).json({ success: false, message: "You cannot change your own role" });
    }
    if (user.role === "admin" && parsed.data.role !== "admin") {
      const adminCount = await users.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res.status(409).json({
          success: false,
          message: "The last administrator cannot be demoted",
        });
      }
    }

    await users.updateOne(
      { _id: userId },
      { $set: { role: parsed.data.role, updatedAt: new Date() } },
    );
    return res.json({ success: true, message: "User role updated", data: { id: req.params.id, role: parsed.data.role } });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", async (req, res, next) => {
  try {
    const db = getDB();
    const session = await getSession(req);

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    return res.json({
      success: true,
      data: session.user,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/me", async (req, res, next) => {
  try {
    const db = getDB();
    const session = await getSession(req);

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const parsed = userProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid profile data",
        errors: parsed.error.flatten(),
      });
    }
    if (parsed.data.bannerImage !== undefined && session.user.role !== "tutor") {
      return res.status(403).json({
        success: false,
        message: "Only tutor accounts can update a tutor banner",
      });
    }

    await db.collection("user").updateOne(
      { _id: ObjectId.isValid(session.user.id) ? new ObjectId(session.user.id) : session.user.id },
      { $set: { ...parsed.data, updatedAt: new Date() } },
    );

    const updated = await db.collection("user").findOne({
      _id: ObjectId.isValid(session.user.id) ? new ObjectId(session.user.id) : session.user.id,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const { _id, ...profile } = updated;
    return res.json({
      success: true,
      message: "Profile updated",
      data: { ...profile, id: String(_id) },
    });
  } catch (error) {
    return next(error);
  }
});

router.delete("/me", verifyToken, (req, res) => {
  res.status(501).json({
    success: false,
    message: "Account deletion is not implemented",
  });
});

export default router;
