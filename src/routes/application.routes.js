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

const toDatabaseId = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : id);

router.post("/", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (session.user.role !== "student") {
      return res.status(403).json({ success: false, message: "Student access required" });
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
      status: "approved",
      isActive: { $ne: false },
    });
    if (!tuition) {
      return res.status(404).json({ success: false, message: "Approved tuition not found" });
    }
    if (tuition.userId === session.user.id) {
      return res.status(403).json({ success: false, message: "You cannot apply to your own tuition" });
    }

    const existing = await db.collection("application").findOne({
      tuitionId: parsed.data.tuitionId,
      studentId: session.user.id,
    });
    if (existing) {
      return res.status(409).json({ success: false, message: "Application already submitted" });
    }

    if (!(session.user.plan === "student-plus" && session.user.planStatus === "active")) {
      const applicationCount = await db.collection("application").countDocuments({
        studentId: session.user.id,
      });
      if (applicationCount >= 1) {
        return res.status(403).json({
          success: false,
          message: "Free student accounts can submit one application. Upgrade to Student Pro for unlimited applications.",
        });
      }
    }

    const now = new Date();
    const application = {
      tuitionId: parsed.data.tuitionId,
      studentId: session.user.id,
      message: parsed.data.message,
      preferredSchedule: parsed.data.preferredSchedule || "",
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
    if (session.user.role !== "student") {
      return res.status(403).json({ success: false, message: "Student access required" });
    }

    const db = getDB();
    const applications = await db
      .collection("application")
      .find({ studentId: session.user.id })
      .sort({ createdAt: -1 })
      .toArray();
    const tuitionIds = applications
      .map(({ tuitionId }) => tuitionId)
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    const tuitions = tuitionIds.length
      ? await db.collection("tuition")
        .find({ _id: { $in: tuitionIds } })
        .project({ _id: 1, title: 1, budget: 1, userId: 1 })
        .toArray()
      : [];
    const tutorIds = [...new Set(tuitions.map(({ userId }) => userId).filter(Boolean))]
      .map(toDatabaseId);
    const tutors = tutorIds.length
      ? await db.collection("user")
        .find({ _id: { $in: tutorIds } })
        .project({ _id: 1, name: 1, email: 1 })
        .toArray()
      : [];
    const tutorById = new Map(tutors.map((tutor) => [String(tutor._id), tutor]));
    const tuitionById = new Map(tuitions.map((tuition) => [String(tuition._id), tuition]));

    res.json({
      success: true,
      data: applications.map(({ _id, ...application }) => {
        const tuition = tuitionById.get(application.tuitionId);
        const tutor = tutorById.get(String(toDatabaseId(tuition?.userId || "")));
        return {
          ...application,
          tuitionTitle: tuition?.title || "Tuition no longer available",
          tutorName: tutor?.name || "Tutor",
          ...(tutor?.email ? { tutorEmail: tutor.email } : {}),
          ...(typeof tuition?.budget === "number" ? { monthlyFee: tuition.budget } : {}),
          id: String(_id),
        };
      }),
    });
  } catch (error) {
    next(error);
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

    const db = getDB();
    const tuitions = await db.collection("tuition")
      .find({ userId: session.user.id })
      .project({ _id: 1, title: 1 })
      .toArray();
    const tuitionIds = tuitions.map(({ _id }) => String(_id));
    const applications = tuitionIds.length
      ? await db.collection("application")
        .find({ tuitionId: { $in: tuitionIds } })
        .sort({ createdAt: -1 })
        .toArray()
      : [];
    const studentIds = [...new Set(applications.map(({ studentId }) => studentId).filter(Boolean))]
      .map(toDatabaseId);
    const students = studentIds.length
      ? await db.collection("user")
        .find({ _id: { $in: studentIds } })
        .project({ _id: 1, name: 1, email: 1, phone: 1 })
        .toArray()
      : [];
    const studentById = new Map(students.map((student) => [String(student._id), student]));
    const tuitionTitles = new Map(
      tuitions.map(({ _id, title }) => [String(_id), title]),
    );

    res.json({
      success: true,
      data: applications.map(({ _id, ...application }) => {
        const student = studentById.get(String(toDatabaseId(application.studentId)));
        return {
          ...application,
          tuitionTitle: tuitionTitles.get(application.tuitionId) || "",
          studentName: student?.name || "Student",
          ...(student?.email ? { studentEmail: student.email } : {}),
          ...(student?.phone ? { studentPhone: student.phone } : {}),
          id: String(_id),
        };
      }),
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
    if (session.user.role !== "tutor" && session.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Tutor or admin access required" });
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

    if (session.user.role === "tutor") {
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

    if (!result) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }

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
    if (session.user.role !== "student" && session.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Student or admin access required" });
    }
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid application ID" });
    }

    const db = getDB();
    const filter = { _id: new ObjectId(req.params.id) };
    if (session.user.role !== "admin") {
      filter.studentId = session.user.id;
      filter.status = "pending";
    }

    const result = await db.collection("application").deleteOne(filter);
    if (!result.deletedCount) {
      return res.status(404).json({
        success: false,
        message: "Pending application not found for this student",
      });
    }

    res.json({ success: true, message: "Application deleted" });
  } catch (error) {
    next(error);
  }
});

export default router;
