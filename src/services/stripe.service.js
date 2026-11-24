import Stripe from "stripe";

const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  return new Stripe(process.env.STRIPE_SECRET_KEY);
};

export const createCheckoutSession = async ({ amount, currency = "bdt", userId, planId }) => {
  const stripe = getStripe();

  return stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${process.env.STRIPE_SUCCESS_URL || "http://localhost:3000/payment/success"}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: process.env.STRIPE_CANCEL_URL || "http://localhost:3000/payment/cancel",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amount,
          product_data: { name: planId },
        },
      },
    ],
    metadata: { userId: String(userId), planId: String(planId) },
  });
};

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
