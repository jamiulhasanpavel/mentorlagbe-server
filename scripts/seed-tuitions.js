import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const tutorEmail = process.env.SEED_TUTOR_EMAIL || "tutor@mentorlagbe.com";

const sampleTuitions = [
  {
    id: "665000000000000000000001",
    title: "Need an experienced tutor for HSC Physics",
    subject: "Physics",
    description: "Looking for a patient tutor to help with HSC Physics and admission preparation.",
    location: "Dhanmondi, Dhaka",
    budget: 8000,
    className: "HSC",
    schedule: "3 days per week, evening",
    mode: "At student home",
    gender: "Any",
    status: "approved",
  },
  {
    id: "665000000000000000000002",
    title: "Class 9 Mathematics and General Science tutor",
    subject: "Mathematics",
    description: "Weekly support for school lessons, homework, and exam preparation.",
    location: "Uttara, Dhaka",
    budget: 6000,
    className: "Class 9",
    schedule: "4 days per week, after 5 PM",
    mode: "At student home",
    gender: "Any",
    status: "approved",
  },
  {
    id: "665000000000000000000003",
    title: "Online English tutor for IELTS preparation",
    subject: "English",
    description: "Seeking structured speaking, writing, and reading practice for IELTS.",
    location: "Online",
    budget: 7000,
    className: "IELTS",
    schedule: "3 days per week",
    mode: "Online",
    gender: "Any",
    status: "approved",
  },
  {
    id: "665000000000000000000004",
    title: "University admission Chemistry support",
    subject: "Chemistry",
    description: "Need help revising core chemistry topics and solving admission questions.",
    location: "Mirpur, Dhaka",
    budget: 9000,
    className: "Admission",
    schedule: "4 days per week, evening",
    mode: "Hybrid",
    gender: "Any",
    status: "approved",
  },
  {
    id: "665000000000000000000005",
    title: "Class 5 English and Mathematics tutor",
    subject: "English",
    description: "Friendly tutor needed for regular primary-level lessons and revision.",
    location: "Bashundhara, Dhaka",
    budget: 5000,
    className: "Class 5",
    schedule: "5 days per week, afternoon",
    mode: "At student home",
    gender: "Any",
    status: "approved",
  },
  {
    id: "665000000000000000000006",
    title: "Bangla medium Biology tutor for HSC",
    subject: "Biology",
    description: "Need clear explanations and regular model-test practice.",
    location: "Mohammadpur, Dhaka",
    budget: 7500,
    className: "HSC",
    schedule: "3 days per week",
    mode: "At student home",
    gender: "Any",
    status: "approved",
  },
  {
    id: "665000000000000000000007",
    title: "Online programming mentor for beginners",
    subject: "Programming",
    description: "Looking for guidance with JavaScript fundamentals and small projects.",
    location: "Online",
    budget: 10000,
    className: "Beginner",
    schedule: "2 days per week",
    mode: "Online",
    gender: "Any",
    status: "pending",
  },
  {
    id: "665000000000000000000008",
    title: "Class 10 Accounting tutor",
    subject: "Accounting",
    description: "Support needed for accounting concepts and board exam preparation.",
    location: "Banasree, Dhaka",
    budget: 6500,
    className: "Class 10",
    schedule: "3 days per week, evening",
    mode: "At tutor home",
    gender: "Any",
    status: "pending",
  },
];

async function seedTuitions() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || "mentorlagbe");
    const tutor = await db.collection("user").findOne(
      { email: tutorEmail, role: "tutor" },
      { projection: { _id: 1 } },
    );

    if (!tutor) {
      throw new Error(
        `Tutor account ${tutorEmail} was not found. Register a tutor account or set SEED_TUTOR_EMAIL.`,
      );
    }

    const now = new Date();
    let insertedCount = 0;
    let alreadyPresentCount = 0;

    for (const [index, sample] of sampleTuitions.entries()) {
      const { id, ...fields } = sample;
      const document = {
        ...fields,
        userId: String(tutor._id),
        isActive: true,
        createdAt: new Date(now.getTime() - index * 60 * 60 * 1000),
        updatedAt: now,
      };
      const result = await db.collection("tuition").updateOne(
        { _id: new ObjectId(id) },
        { $setOnInsert: document },
        { upsert: true },
      );

      insertedCount += result.upsertedCount;
      alreadyPresentCount += result.matchedCount;
    }

    console.log(
      `Tuition seed complete: ${insertedCount} inserted, ${alreadyPresentCount} already present.`,
    );
  } finally {
    await client.close();
  }
}

seedTuitions().catch((error) => {
  console.error("Failed to seed tuitions:", error);
  process.exitCode = 1;
});
