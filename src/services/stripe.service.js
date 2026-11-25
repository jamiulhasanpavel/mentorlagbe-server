import Stripe from "stripe";

const plans = {
  "student-plus": {
    name: "Student Pro",
    amount: 29900,
    currency: "bdt",
    role: "student",
  },
  "tutor-pro": {
    name: "Tutor Pro",
    amount: 49900,
    currency: "bdt",
    role: "tutor",
  },
};

const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  return new Stripe(process.env.STRIPE_SECRET_KEY);
};

export function getPaidPlan(planId) {
  return Object.prototype.hasOwnProperty.call(plans, planId) ? plans[planId] : undefined;
}

export const createCheckoutSession = async ({ planId, userId, email, customerId }) => {
  const stripe = getStripe();
  const plan = getPaidPlan(planId);
  if (!plan) {
    throw new Error("The requested Stripe plan does not exist.");
  }

  const successUrl =
    process.env.STRIPE_SUCCESS_URL || "http://localhost:3000/payment/success";
  const cancelUrl =
    process.env.STRIPE_CANCEL_URL || "http://localhost:3000/payment/cancel";

  const checkoutOptions = {
    mode: "subscription",
    success_url: `${successUrl}${successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: plan.currency,
          unit_amount: plan.amount,
          recurring: { interval: "month" },
          product_data: { name: plan.name },
        },
      },
    ],
    metadata: { userId: String(userId), planId: String(planId) },
    subscription_data: {
      metadata: { userId: String(userId), planId: String(planId) },
    },
  };
  if (customerId) {
    checkoutOptions.customer = customerId;
  } else {
    checkoutOptions.customer_email = email;
  }
  return stripe.checkout.sessions.create(checkoutOptions);
};

export async function retrieveCheckoutSession(sessionId) {
  return getStripe().checkout.sessions.retrieve(sessionId);
}

export async function retrieveSubscription(subscriptionId) {
  return getStripe().subscriptions.retrieve(subscriptionId);
}

export async function createBillingPortalSession(customerId) {
  const returnUrl =
    process.env.STRIPE_PORTAL_RETURN_URL ||
    "http://localhost:3000/dashboard/profile";
  return getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

export const constructWebhookEvent = (payload, signature) => {
  const stripe = getStripe();
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET,
  );
};
