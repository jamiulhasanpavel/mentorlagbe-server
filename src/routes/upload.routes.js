import { Router } from "express";
import { z } from "zod";
import { createAuth } from "../config/auth.js";
import { getDB } from "../config/db.js";
import { uploadImage } from "../services/imgbb.service.js";

const router = Router();

const imageSchema = z.object({
  image: z.string().startsWith("data:image/").max(7 * 1024 * 1024),
  name: z.string().trim().max(100).optional(),
});

router.post("/avatar", async (req, res, next) => {
  try {
    const auth = createAuth(getDB());
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: req.headers.cookie || "" }),
    });

    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const parsed = imageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "A base64 image is required",
      });
    }

    const commaIndex = parsed.data.image.indexOf(",");
    if (commaIndex < 0) {
      return res.status(400).json({ success: false, message: "Invalid base64 image" });
    }

    const uploaded = await uploadImage(
      parsed.data.image.slice(commaIndex + 1),
      parsed.data.name,
    );

    await getDB().collection("user").updateOne(
      { _id: session.user.id },
      { $set: { image: uploaded.url, updatedAt: new Date() } },
    );

    res.json({ success: true, message: "Profile photo uploaded", url: uploaded.url });
  } catch (error) {
    next(error);
  }
});

export default router;
