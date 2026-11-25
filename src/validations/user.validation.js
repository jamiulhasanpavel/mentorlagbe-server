import { z } from "zod";

export const userProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  image: z.url().max(2048).nullable().optional(),
  phone: z.string().trim().max(30).optional(),
  bio: z.string().trim().max(500).optional(),
  bannerImage: z.url().max(2048).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one profile field is required",
});
