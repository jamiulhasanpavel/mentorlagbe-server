import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { createAuth } from "../config/auth.js";
import {
  applicationSchema,
  applicationStatusSchema,
} from "../validations/application.validation.js";

const router = Router();

const getSession = async (req) => {
  const auth = createAuth(getDB());
  return auth.api.getSession({
    headers: new Headers({ cookie: req.headers.cookie || "" }),
  });
};

router.post("/", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (session.user.role !== "tutor") {
      return res.status(403).json({ success: false, message: "Tutor access required" });
    }

    const parsed = applicationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid application data",
        errors: parsed.error.flatten(),
      });
    }
    if (!ObjectId.isValid(parsed.data.tuitionId)) {
      return res.status(400).json({ success: false, message: "Invalid tuition ID" });
    }

    const db = getDB();
    const tuition = await db.collection("tuition").findOne({
      _id: new ObjectId(parsed.data.tuitionId),
    });
    if (!tuition) {
      return res.status(404).json({ success: false, message: "Tuition not found" });
    }

    const existing = await db.collection("application").findOne({
      tuitionId: parsed.data.tuitionId,
      tutorId: session.user.id,
    });
    if (existing) {
      return res.status(409).json({ success: false, message: "Application already submitted" });
    }

    const now = new Date();
    const application = {
      tuitionId: parsed.data.tuitionId,
      tutorId: session.user.id,
      message: parsed.data.message,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection("application").insertOne(application);

    res.status(201).json({
      success: true,
      message: "Application submitted",
      data: { ...application, id: String(result.insertedId) },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const applications = await getDB()
      .collection("application")
      .find({ tutorId: session.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      success: true,
      data: applications.map(({ _id, ...application }) => ({
        ...application,
        id: String(_id),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/status", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (session.user.role !== "student" && session.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Tuition owner or admin access required" });
    }
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid application ID" });
    }

    const parsed = applicationStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid application status" });
    }

    const db = getDB();
    const application = await db.collection("application").findOne({
      _id: new ObjectId(req.params.id),
    });
    if (!application) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }

    if (session.user.role === "student") {
      const tuition = await db.collection("tuition").findOne({
        _id: new ObjectId(application.tuitionId),
        userId: session.user.id,
      });
      if (!tuition) {
        return res.status(403).json({ success: false, message: "Tuition owner access required" });
      }
    }

    const result = await db.collection("application").findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: parsed.data.status, updatedAt: new Date() } },
      { returnDocument: "after" },
    );

    const { _id, ...data } = result;
    res.json({ success: true, message: "Application status updated", data: { ...data, id: String(_id) } });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid application ID" });
    }

    const filter = { _id: new ObjectId(req.params.id) };
    if (session.user.role !== "admin") filter.tutorId = session.user.id;

    const result = await getDB().collection("application").deleteOne(filter);
    if (!result.deletedCount) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }

    res.json({ success: true, message: "Application deleted" });
  } catch (error) {
    next(error);
  }
});

export default router;
