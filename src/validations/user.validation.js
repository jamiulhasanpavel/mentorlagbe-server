import { z } from "zod";

export const userProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  image: z.url().max(2048).nullable().optional(),
});
