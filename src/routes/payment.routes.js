import { Router, raw } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDB } from "../config/db.js";
import { createAuth } from "../config/auth.js";
import {
  constructWebhookEvent,
  createBillingPortalSession,
  createCheckoutSession,
  getPaidPlan,
  retrieveCheckoutSession,
  retrieveSubscription,
} from "../services/stripe.service.js";

const router = Router();
export const webhookRoutes = Router();

const checkoutSchema = z.object({
  planId: z.enum(["student-plus", "tutor-pro"]),
});

const toDatabaseId = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : id);

const getSession = async (req) => {
  const auth = createAuth(getDB());
  return auth.api.getSession({
    headers: new Headers({ cookie: req.headers.cookie || "" }),
  });
};

async function saveCompletedCheckout(checkout) {
  const userId = checkout.metadata?.userId;
  const planId = checkout.metadata?.planId;
  const plan = getPaidPlan(planId);
  if (!userId || !plan) {
    throw new Error("Stripe checkout metadata is missing a valid user or plan.");
  }

  const db = getDB();
  const users = db.collection("user");
  const user = await users.findOne(
    { _id: toDatabaseId(userId) },
    { projection: { role: 1 } },
  );
  if (!user || user.role !== plan.role) {
    throw new Error("Stripe checkout user role does not match the purchased plan.");
  }

  const paid = checkout.payment_status === "paid";
  const now = new Date();
  const stripeInvoiceId =
    typeof checkout.invoice === "string" ? checkout.invoice : null;
  const payment = {
    stripeSessionId: checkout.id,
    stripeInvoiceId,
    stripeSubscriptionId:
      typeof checkout.subscription === "string" ? checkout.subscription : null,
    stripePaymentIntentId:
      typeof checkout.payment_intent === "string" ? checkout.payment_intent : null,
    userId,
    planId,
    amount: checkout.amount_total ?? 0,
    currency: checkout.currency ?? plan.currency,
    status: paid ? "paid" : "pending",
    updatedAt: now,
  };
  await db.collection("payment").updateOne(
    stripeInvoiceId
      ? { stripeInvoiceId }
      : { stripeSessionId: checkout.id },
    {
      $set: payment,
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );

  if (paid) {
    await users.updateOne(
      { _id: toDatabaseId(userId) },
      {
        $set: {
          plan: planId,
          planStatus: "active",
          stripeCustomerId:
            typeof checkout.customer === "string" ? checkout.customer : null,
          stripeSubscriptionId: payment.stripeSubscriptionId,
          planUpdatedAt: now,
          updatedAt: now,
        },
      },
    );
  }

  return payment;
}

function getInvoiceSubscriptionId(invoice) {
  if (typeof invoice.subscription === "string") return invoice.subscription;
  const nestedSubscription = invoice.parent?.subscription_details?.subscription;
  return typeof nestedSubscription === "string" ? nestedSubscription : null;
}

async function updatePlanFromSubscription(subscription, planStatus) {
  const userId = subscription.metadata?.userId;
  const planId = subscription.metadata?.planId;
  const plan = getPaidPlan(planId);
  if (!userId || !plan) {
    throw new Error("Stripe subscription metadata is missing a valid user or plan.");
  }

  const now = new Date();
  await getDB().collection("user").updateOne(
    { _id: toDatabaseId(userId), stripeSubscriptionId: subscription.id },
    {
      $set: {
        plan: planStatus === "canceled" ? "free" : planId,
        planStatus,
        planUpdatedAt: now,
        updatedAt: now,
      },
      ...(planStatus === "canceled"
        ? { $unset: { stripeSubscriptionId: "" } }
        : {}),
    },
  );
}

async function savePaidInvoice(invoice) {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  const subscription = await retrieveSubscription(subscriptionId);
  const userId = subscription.metadata?.userId;
  const planId = subscription.metadata?.planId;
  const plan = getPaidPlan(planId);
  if (!userId || !plan) {
    throw new Error("Stripe invoice subscription metadata is missing a valid user or plan.");
  }

  const db = getDB();
  const user = await db.collection("user").findOne(
    { _id: toDatabaseId(userId) },
    { projection: { role: 1 } },
  );
  if (!user || user.role !== plan.role) {
    throw new Error("Stripe invoice user role does not match the purchased plan.");
  }

  const now = new Date();
  await db.collection("payment").updateOne(
    { stripeInvoiceId: invoice.id },
    {
      $set: {
        stripeInvoiceId: invoice.id,
        stripeSubscriptionId: subscriptionId,
        stripePaymentIntentId:
          typeof invoice.payment_intent === "string" ? invoice.payment_intent : null,
        userId,
        planId,
        amount: invoice.amount_paid ?? 0,
        currency: invoice.currency ?? plan.currency,
        status: "paid",
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );

  await db.collection("user").updateOne(
    { _id: toDatabaseId(userId), stripeSubscriptionId: subscriptionId },
    {
      $set: {
        plan: planId,
        planStatus: "active",
        planUpdatedAt: now,
        updatedAt: now,
      },
    },
  );
}

router.post("/checkout", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Choose a valid paid plan" });
    }

    const plan = getPaidPlan(parsed.data.planId);
    const user = await getDB().collection("user").findOne(
      { _id: toDatabaseId(session.user.id) },
      { projection: { role: 1, plan: 1, planStatus: 1, stripeCustomerId: 1 } },
    );
    if (!user || user.role !== plan.role || session.user.role !== plan.role) {
      return res.status(403).json({
        success: false,
        message: `The ${plan.name} plan is available to ${plan.role} accounts only`,
      });
    }
    if (user.plan === parsed.data.planId && user.planStatus === "active") {
      return res.status(409).json({ success: false, message: "This plan is already active" });
    }

    const checkout = await createCheckoutSession({
      planId: parsed.data.planId,
      userId: session.user.id,
      email: session.user.email,
      customerId: user.stripeCustomerId,
    });
    if (!checkout.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }
    return res.json({ success: true, url: checkout.url });
  } catch (error) {
    return next(error);
  }
});

router.get("/session/:sessionId", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { sessionId } = req.params;
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
      return res.status(400).json({ success: false, message: "Invalid checkout session ID" });
    }

    const checkout = await retrieveCheckoutSession(sessionId);
    if (checkout.metadata?.userId !== session.user.id) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    const payment = await saveCompletedCheckout(checkout);
    return res.json({
      success: true,
      data: {
        ...payment,
        id: checkout.id,
        status:
          checkout.status === "expired"
            ? "expired"
            : payment.status,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/portal", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await getDB().collection("user").findOne(
      { _id: toDatabaseId(session.user.id) },
      { projection: { stripeCustomerId: 1 } },
    );
    if (typeof user?.stripeCustomerId !== "string") {
      return res.status(409).json({ success: false, message: "No Stripe billing account is available" });
    }

    const portal = await createBillingPortalSession(user.stripeCustomerId);
    return res.json({ success: true, url: portal.url });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (session.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "50"), 10) || 50));
    const collection = getDB().collection("payment");
    const [payments, total] = await Promise.all([
      collection.find({})
        .project({
          stripeSessionId: 1,
          stripeInvoiceId: 1,
          stripeSubscriptionId: 1,
          stripePaymentIntentId: 1,
          userId: 1,
          planId: 1,
          amount: 1,
          currency: 1,
          status: 1,
          createdAt: 1,
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      collection.countDocuments(),
    ]);

    return res.json({
      success: true,
      data: payments.map(({ _id, ...payment }) => ({ ...payment, id: String(_id) })),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    return next(error);
  }
});

webhookRoutes.post("/webhook", raw({ type: "application/json" }), async (req, res, next) => {
  try {
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") {
      return res.status(400).json({ success: false, message: "Missing Stripe signature" });
    }

    const event = constructWebhookEvent(req.body, signature);
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      await saveCompletedCheckout(event.data.object);
    } else if (event.type === "checkout.session.expired") {
      await getDB().collection("payment").updateOne(
        { stripeSessionId: event.data.object.id, status: "pending" },
        { $set: { status: "expired", updatedAt: new Date() } },
      );
    } else if (event.type === "invoice.paid") {
      await savePaidInvoice(event.data.object);
    } else if (event.type === "invoice.payment_failed") {
      const subscriptionId = getInvoiceSubscriptionId(event.data.object);
      if (subscriptionId) {
        const subscription = await retrieveSubscription(subscriptionId);
        await updatePlanFromSubscription(subscription, "past_due");
        const plan = getPaidPlan(subscription.metadata?.planId);
        await getDB().collection("payment").updateOne(
          { stripeInvoiceId: event.data.object.id },
          {
            $set: {
              stripeInvoiceId: event.data.object.id,
              stripeSubscriptionId: subscriptionId,
              userId: subscription.metadata?.userId,
              planId: subscription.metadata?.planId,
              amount: event.data.object.amount_due ?? 0,
              currency: event.data.object.currency ?? plan?.currency ?? "usd",
              status: "failed",
              updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true },
        );
      }
    } else if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      if (subscription.status === "active") {
        await updatePlanFromSubscription(subscription, "active");
      } else if (subscription.status === "past_due" || subscription.status === "unpaid") {
        await updatePlanFromSubscription(subscription, "past_due");
      }
    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      await updatePlanFromSubscription(subscription, "canceled");
    }

    return res.json({ received: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
