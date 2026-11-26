import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { createAuth } from "../config/auth.js";

const router = Router();

const getSession = async (req) => {
  const auth = createAuth(getDB());
  return auth.api.getSession({
    headers: new Headers({ cookie: req.headers.cookie || "" }),
  });
};

const getTuitionIds = (applications) =>
  applications
    .map(({ tuitionId }) => tuitionId)
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));

async function addTuitionTitles(db, applications) {
  const tuitionIds = getTuitionIds(applications);
  const tuitions = tuitionIds.length
    ? await db.collection("tuition")
      .find({ _id: { $in: tuitionIds } })
      .project({ _id: 1, title: 1 })
      .toArray()
    : [];
  const titles = new Map(tuitions.map(({ _id, title }) => [String(_id), title]));

  return applications.map((application) => ({
    ...application,
    tuitionTitle: titles.get(application.tuitionId) || "Tuition no longer available",
  }));
}

router.get("/", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const db = getDB();
    const role = session.user.role;

    if (role === "admin") {
      const [
        users,
        tutors,
        totalTuitions,
        pendingTuitions,
        approvedTuitions,
        applications,
        paidPayments,
        revenueResult,
      ] = await Promise.all([
        db.collection("user").countDocuments(),
        db.collection("user").countDocuments({ role: "tutor" }),
        db.collection("tuition").countDocuments(),
        db.collection("tuition").countDocuments({ status: "pending" }),
        db.collection("tuition").countDocuments({ status: "approved" }),
        db.collection("application").countDocuments(),
        db.collection("payment").countDocuments({ status: "paid" }),
        db.collection("payment").aggregate([
          { $match: { status: "paid" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]).toArray(),
      ]);

      return res.json({
        success: true,
        data: {
          role,
          plan: session.user.plan || "free",
          planStatus: session.user.planStatus || "inactive",
          stats: {
            users,
            tutors,
            totalTuitions,
            pendingTuitions,
            approvedTuitions,
            applications,
            paidPayments,
            revenue: revenueResult[0]?.total || 0,
          },
        },
      });
    }

    if (role === "student") {
      const applications = await db.collection("application")
        .find({ studentId: session.user.id })
        .sort({ createdAt: -1 })
        .toArray();
      const recentApplications = await addTuitionTitles(db, applications.slice(0, 5));

      return res.json({
        success: true,
        data: {
          role,
          plan: session.user.plan || "free",
          planStatus: session.user.planStatus || "inactive",
          stats: {
            totalApplications: applications.length,
            pendingApplications: applications.filter(({ status }) => status === "pending").length,
            acceptedApplications: applications.filter(({ status }) => status === "accepted").length,
          },
          recentApplications: recentApplications.map(({ _id, ...application }) => ({
            ...application,
            id: String(_id),
          })),
        },
      });
    }

    if (role === "tutor") {
      const tuitions = await db.collection("tuition")
        .find({ userId: session.user.id })
        .sort({ createdAt: -1 })
        .toArray();
      const tuitionIds = tuitions.map(({ _id }) => String(_id));
      const applications = tuitionIds.length
        ? await db.collection("application")
          .find({ tuitionId: { $in: tuitionIds } })
          .sort({ createdAt: -1 })
          .toArray()
        : [];
      const recentApplications = await addTuitionTitles(db, applications.slice(0, 5));

      return res.json({
        success: true,
        data: {
          role,
          plan: session.user.plan || "free",
          planStatus: session.user.planStatus || "inactive",
          stats: {
            totalTuitions: tuitions.length,
            activeTuitions: tuitions.filter(
              ({ status, isActive }) => status === "approved" && isActive !== false,
            ).length,
            pendingTuitions: tuitions.filter(({ status }) => status === "pending").length,
            totalApplicants: applications.length,
            pendingApplications: applications.filter(({ status }) => status === "pending").length,
          },
          recentApplications: recentApplications.map(({ _id, ...application }) => ({
            ...application,
            id: String(_id),
          })),
        },
      });
    }

    return res.status(403).json({ success: false, message: "Unsupported account role" });
  } catch (error) {
    next(error);
  }
});

export default router;
