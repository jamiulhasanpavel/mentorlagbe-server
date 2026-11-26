import { z } from "zod";

export const applicationSchema = z.object({
  tuitionId: z.string().trim().min(24).max(24),
  message: z.string().trim().min(10).max(3000),
  preferredSchedule: z.string().trim().max(120).optional(),
});

export const applicationStatusSchema = z.object({
  status: z.enum(["pending", "accepted", "rejected"]),
});
