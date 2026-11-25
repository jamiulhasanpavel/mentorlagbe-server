import { z } from "zod";

export const tuitionSchema = z.object({
  title: z.string().trim().min(3).max(150),
  subject: z.string().trim().min(2).max(100),
  description: z.string().trim().max(5000).optional(),
  location: z.string().trim().max(200).optional(),
  budget: z.number().nonnegative().optional(),
  className: z.string().trim().max(80).optional(),
  schedule: z.string().trim().max(100).optional(),
  mode: z.enum(["Online", "At student home", "At tutor home", "Hybrid"]).optional(),
  gender: z.string().trim().max(80).optional(),
});

export const tuitionStatusSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]),
});
