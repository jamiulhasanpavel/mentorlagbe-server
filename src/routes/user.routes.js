import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDB } from "../config/db.js";
import { createAuth } from "../config/auth.js";
import { verifyToken } from "../middlewares/verifyToken.js";

const router = Router();

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  image: z.url().max(2048).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one profile field is required",
});

router.get("/me", async (req, res, next) => {
  try {
    const db = getDB();
    const auth = createAuth(db);
    const session = await auth.api.getSession({
      headers: new Headers({
        cookie: req.headers.cookie || "",
      }),
    });

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
    const auth = createAuth(db);
    const session = await auth.api.getSession({
      headers: new Headers({
        cookie: req.headers.cookie || "",
      }),
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid profile data",
        errors: parsed.error.flatten(),
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
