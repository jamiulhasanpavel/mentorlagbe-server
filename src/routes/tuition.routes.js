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

router.get("/", async (req, res, next) => {
  try {
    const {
      status = "approved",
      subject,
      search,
      page = "1",
      limit = "10",
      sort = "newest",
    } = req.query;
    const pageNumber = Math.max(1, Number.parseInt(String(page), 10) || 1);
    const limitNumber = Math.min(
      100,
      Math.max(1, Number.parseInt(String(limit), 10) || 10),
    );
    const filter = {};

    if (status) filter.status = status;
    if (subject) filter.subject = { $regex: String(subject), $options: "i" };
    if (search) {
      const searchPattern = { $regex: String(search).trim(), $options: "i" };
      filter.$or = [
        { title: searchPattern },
        { subject: searchPattern },
        { description: searchPattern },
        { location: searchPattern },
      ];
    }

    const collection = getDB().collection("tuition");
    const [total, tuitions] = await Promise.all([
      collection.countDocuments(filter),
      collection
        .find(filter)
        .sort(sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .toArray(),
    ]);

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
        totalPages: Math.ceil(total / limitNumber),
      },
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

    const tuition = await getDB()
      .collection("tuition")
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!tuition) {
      return res.status(404).json({ success: false, message: "Tuition not found" });
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
    if (!["student", "admin"].includes(session.user.role)) {
      return res.status(403).json({ success: false, message: "Student access required" });
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
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid tuition ID" });
    }

    const filter = { _id: new ObjectId(req.params.id) };
    if (session.user.role !== "admin") filter.userId = session.user.id;

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
