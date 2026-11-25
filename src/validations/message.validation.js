import { z } from "zod";

export const messageSchema = z.object({
  tutorId: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(2).max(150),
  message: z.string().trim().min(10).max(3000),
});

export const messageReplySchema = z.object({
  message: z.string().trim().min(10).max(3000),
});
