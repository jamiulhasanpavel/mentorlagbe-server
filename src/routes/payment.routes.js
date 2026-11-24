import { Router, raw } from "express";
import { z } from "zod";
import { getDB } from "../config/db.js";
import { createAuth } from "../config/auth.js";
import {
  constructWebhookEvent,
  createCheckoutSession,
} from "../services/stripe.service.js";

const router = Router();

const checkoutSchema = z.object({
  planId: z.string().trim().min(1).max(100),
  amount: z.number().int().positive(),
});

router.post("/checkout", async (req, res, next) => {
  try {
    const auth = createAuth(getDB());
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: req.headers.cookie || "" }),
    });
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid checkout data" });
    }

    const checkout = await createCheckoutSession({
      ...parsed.data,
      userId: session.user.id,
    });

    res.json({ success: true, url: checkout.url });
  } catch (error) {
    next(error);
  }
});

router.post("/webhook", raw({ type: "application/json" }), async (req, res, next) => {
  try {
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") {
      return res.status(400).json({ success: false, message: "Missing Stripe signature" });
    }

    const event = constructWebhookEvent(req.body, signature);

    if (event.type === "checkout.session.completed") {
      const checkout = event.data.object;
      await getDB().collection("payment").updateOne(
        { stripeSessionId: checkout.id },
        {
          $set: {
            status: "paid",
            userId: checkout.metadata?.userId,
            planId: checkout.metadata?.planId,
            amount: checkout.amount_total,
            currency: checkout.currency,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );
    }

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});

export default router;
export const webhookRoutes = Router();

webhookRoutes.post("/webhook", raw({ type: "application/json" }), async (req, res, next) => {
  try {
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") {
      return res.status(400).json({ success: false, message: "Missing Stripe signature" });
    }

    const event = constructWebhookEvent(req.body, signature);

    if (event.type === "checkout.session.completed") {
      const checkout = event.data.object;
      await getDB().collection("payment").updateOne(
        { stripeSessionId: checkout.id },
        {
          $set: {
            status: "paid",
            userId: checkout.metadata?.userId,
            planId: checkout.metadata?.planId,
            amount: checkout.amount_total,
            currency: checkout.currency,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );
    }

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});
