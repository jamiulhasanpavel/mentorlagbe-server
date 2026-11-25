import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { createAuth } from "../config/auth.js";
import {
  messageReplySchema,
  messageSchema,
} from "../validations/message.validation.js";

const router = Router();

const getSession = async (req) => {
  const auth = createAuth(getDB());
  return auth.api.getSession({
    headers: new Headers({ cookie: req.headers.cookie || "" }),
  });
};

const toDatabaseId = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : id);

const serializeMessage = ({ _id, ...message }) => ({
  ...message,
  id: String(_id),
});

router.post("/", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (session.user.role !== "student") {
      return res.status(403).json({ success: false, message: "Student access required" });
    }

    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid message data",
        errors: parsed.error.flatten(),
      });
    }

    const db = getDB();
    const tutor = await db.collection("user").findOne(
      { _id: toDatabaseId(parsed.data.tutorId), role: "tutor" },
      { projection: { name: 1 } },
    );
    if (!tutor) {
      return res.status(404).json({ success: false, message: "Tutor not found" });
    }

    const now = new Date();
    const message = {
      senderId: session.user.id,
      senderName: session.user.name,
      tutorId: String(tutor._id),
      tutorName: tutor.name,
      subject: parsed.data.subject,
      message: parsed.data.message,
      replies: [],
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection("message").insertOne(message);

    return res.status(201).json({
      success: true,
      message: "Message sent",
      data: { ...message, id: String(result.insertedId) },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (session.user.role !== "student") {
      return res.status(403).json({ success: false, message: "Student access required" });
    }

    const messages = await getDB()
      .collection("message")
      .find({ senderId: session.user.id })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();

    return res.json({
      success: true,
      data: messages.map(serializeMessage),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/tutor", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (session.user.role !== "tutor") {
      return res.status(403).json({ success: false, message: "Tutor access required" });
    }

    const messages = await getDB()
      .collection("message")
      .find({ tutorId: session.user.id })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();

    return res.json({
      success: true,
      data: messages.map(serializeMessage),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/replies", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (session.user.role !== "tutor") {
      return res.status(403).json({ success: false, message: "Tutor access required" });
    }
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid message ID" });
    }

    const parsed = messageReplySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid reply data",
        errors: parsed.error.flatten(),
      });
    }

    const now = new Date();
    const result = await getDB().collection("message").findOneAndUpdate(
      {
        _id: new ObjectId(req.params.id),
        tutorId: session.user.id,
      },
      {
        $push: {
          replies: {
            senderId: session.user.id,
            message: parsed.data.message,
            createdAt: now,
          },
        },
        $set: { updatedAt: now },
      },
      { returnDocument: "after" },
    );

    if (!result) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    return res.json({
      success: true,
      message: "Reply sent",
      data: serializeMessage(result),
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
