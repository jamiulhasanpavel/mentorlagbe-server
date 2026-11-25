import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { createAuth } from "../config/auth.js";
import { tuitionSchema, tuitionStatusSchema } from "../validations/tuition.validation.js";

const router = Router();

const getSession = async (req) => {
  const auth = createAuth(getDB());
  return auth.api.getSession({
    headers: new Headers({ cookie: req.headers.cookie || "" }),
  });
};

const getQueryValue = (value) =>
  typeof value === "string" ? value.trim().slice(0, 100) : "";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

router.get("/", async (req, res, next) => {
  try {
    const {
      status: requestedStatus,
      subject: requestedSubject,
      search: requestedSearch,
      query: requestedQuery,
      location: requestedLocation,
      className: requestedClassName,
      mode: requestedMode,
      page = "1",
      limit = "10",
      sort = "newest",
    } = req.query;
    const status = getQueryValue(requestedStatus) || "approved";
    if (!["approved", "pending", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid tuition status" });
    }

    if (status !== "approved") {
      const session = await getSession(req);
      if (!session) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      if (session.user.role !== "admin") {
        return res.status(403).json({ success: false, message: "Admin access required" });
      }
    }

    const requestedPage = Math.max(1, Number.parseInt(String(page), 10) || 1);
    const limitNumber = Math.min(
      100,
      Math.max(1, Number.parseInt(String(limit), 10) || 10),
    );
    const filter = { status };

    if (status === "approved") filter.isActive = { $ne: false };
    const subject = getQueryValue(requestedSubject);
    const search = getQueryValue(requestedSearch || requestedQuery);
    const location = getQueryValue(requestedLocation);
    const className = getQueryValue(requestedClassName);
    const mode = getQueryValue(requestedMode);
    if (subject) filter.subject = { $regex: escapeRegex(subject), $options: "i" };
    if (location) filter.location = { $regex: escapeRegex(location), $options: "i" };
    if (className) filter.className = { $regex: escapeRegex(className), $options: "i" };
    if (mode) filter.mode = { $regex: `^${escapeRegex(mode)}$`, $options: "i" };
    if (search) {
      const searchPattern = { $regex: escapeRegex(search), $options: "i" };
      filter.$or = [
        { title: searchPattern },
        { subject: searchPattern },
        { description: searchPattern },
        { location: searchPattern },
        { className: searchPattern },
      ];
    }

    const collection = getDB().collection("tuition");
    const total = await collection.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limitNumber));
    const pageNumber = Math.min(requestedPage, totalPages);
    const tuitions = await collection
      .find(filter)
      .sort(sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .toArray();

    res.json({
      success: true,
      data: tuitions.map(({ _id, ...tuition }) => ({
        ...tuition,
        id: String(_id),
      })),
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/mine", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (session.user.role !== "tutor") {
      return res.status(403).json({ success: false, message: "Tutor access required" });
    }

    const tuitions = await getDB()
      .collection("tuition")
      .find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({
      success: true,
      data: tuitions.map(({ _id, ...tuition }) => ({
        ...tuition,
        id: String(_id),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid tuition ID" });
    }

    const db = getDB();
    const tuition = await db.collection("tuition").findOne({
      _id: new ObjectId(req.params.id),
    });

    if (!tuition) {
      return res.status(404).json({ success: false, message: "Tuition not found" });
    }

    const isPubliclyVisible = tuition.status === "approved" && tuition.isActive !== false;
    if (!isPubliclyVisible) {
      const session = await getSession(req);
      const isAdmin = session?.user.role === "admin";
      const isOwner =
        session?.user.role === "tutor" && tuition.userId === session.user.id;
      if (!isAdmin && !isOwner) {
        return res.status(404).json({ success: false, message: "Tuition not found" });
      }
    }

    const { _id, ...data } = tuition;
    res.json({ success: true, data: { ...data, id: String(_id) } });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (session.user.role !== "tutor") {
      return res.status(403).json({ success: false, message: "Tutor access required" });
    }

    const parsed = tuitionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid tuition data",
        errors: parsed.error.flatten(),
      });
    }

    const now = new Date();
    const tuition = {
      ...parsed.data,
      userId: session.user.id,
      status: "pending",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const result = await getDB().collection("tuition").insertOne(tuition);

    res.status(201).json({
      success: true,
      message: "Tuition submitted for moderation",
      data: { ...tuition, id: String(result.insertedId) },
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
    if (session.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid tuition ID" });
    }

    const parsed = tuitionStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid moderation status" });
    }

    const result = await getDB().collection("tuition").findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: parsed.data.status, updatedAt: new Date() } },
      { returnDocument: "after" },
    );

    if (!result) {
      return res.status(404).json({ success: false, message: "Tuition not found" });
    }

    const { _id, ...data } = result;
    res.json({ success: true, message: "Moderation status updated", data: { ...data, id: String(_id) } });
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
    if (!["tutor", "admin"].includes(session.user.role)) {
      return res.status(403).json({ success: false, message: "Tutor access required" });
    }
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid tuition ID" });
    }

    const filter = { _id: new ObjectId(req.params.id) };
    if (session.user.role === "tutor") filter.userId = session.user.id;

    const result = await getDB().collection("tuition").deleteOne(filter);
    if (!result.deletedCount) {
      return res.status(404).json({ success: false, message: "Tuition not found" });
    }

    res.json({ success: true, message: "Tuition deleted" });
  } catch (error) {
    next(error);
  }
});

export default router;
