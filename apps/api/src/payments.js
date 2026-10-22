import Stripe from "stripe";
import { db, transaction, HttpError } from "./db.js";
import { queueReceipt } from "./orders.js";
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
export async function checkoutSession(order) {
  if (!stripe)
    throw new HttpError(
      503,
      "Online payment is not configured. Choose cash on delivery.",
    );
  if (order.status !== "PENDING_PAYMENT") return { orderId: order.id };
  if (order.stripeSessionId) {
    const session = await stripe.checkout.sessions.retrieve(
      order.stripeSessionId,
    );
    return { orderId: order.id, url: session.url };
  }
  if (order.expiresAt.getTime() - Date.now() < 30 * 60000)
    throw new HttpError(
      409,
      "Checkout window closed. Contact support to reconcile this payment attempt.",
    );
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      payment_method_types: ["card"],
      client_reference_id: order.id,
      metadata: { orderId: order.id },
      line_items: [
        {
          price_data: {
            currency: "inr",
            product_data: { name: `FreshBasket order ${order.id.slice(0, 8)}` },
            unit_amount: order.totalMinor,
          },
          quantity: 1,
        },
      ],
      expires_at: Math.floor(order.expiresAt.getTime() / 1000),
      success_url: `${process.env.WEB_URL}/orders/${order.id}?payment=return`,
      cancel_url: `${process.env.WEB_URL}/orders/${order.id}`,
    },
    { idempotencyKey: `checkout:${order.id}` },
  );
  await db.order.update({
    where: { id: order.id },
    data: { stripeSessionId: session.id },
  });
  return { orderId: order.id, url: session.url };
}
export async function settleSession(session, eventId) {
  const run = () =>
    transaction(async (tx) => {
      if (await tx.webhookEvent.findUnique({ where: { id: eventId } })) return;
      const order = await tx.order.findUnique({
        where: { id: session.metadata?.orderId || "" },
        include: { items: true },
      });
      if (
        !order ||
        order.paymentMethod !== "STRIPE" ||
        session.client_reference_id !== order.id ||
        session.currency !== "inr" ||
        session.amount_total !== order.totalMinor ||
        (order.stripeSessionId && order.stripeSessionId !== session.id)
      )
        throw new HttpError(400, "Payment details do not match order");
      if (session.payment_status === "paid") {
        if (order.status === "CANCELLED")
          throw new Error("Paid session requires manual reconciliation");
        if (order.paymentStatus !== "PAID") {
          await tx.order.update({
            where: { id: order.id },
            data: {
              stripeSessionId: session.id,
              paymentStatus: "PAID",
              status: "CONFIRMED",
              history: {
                create: {
                  status: "CONFIRMED",
                  note: "Stripe payment verified",
                },
              },
            },
          });
          await queueReceipt(tx, order);
        }
      } else if (
        session.status === "expired" &&
        order.status === "PENDING_PAYMENT"
      ) {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: "CANCELLED",
            stripeSessionId: session.id,
            history: {
              create: {
                status: "CANCELLED",
                note: "Payment expired; stock restored",
              },
            },
          },
        });
        for (const i of order.items)
          await tx.product.update({
            where: { id: i.productId },
            data: { stock: { increment: i.quantity } },
          });
      } else return;
      await tx.webhookEvent.create({ data: { id: eventId } });
    });
  try {
    return await run();
  } catch (e) {
    if (e.code === "P2002") return run();
    throw e;
  }
}
export async function stripeWebhook(req, res) {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET)
    throw new HttpError(503, "Payments are not configured");
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    throw new HttpError(400, "Invalid webhook signature");
  }
  if (
    [
      "checkout.session.completed",
      "checkout.session.expired",
      "checkout.session.async_payment_succeeded",
    ].includes(event.type)
  )
    await settleSession(event.data.object, event.id);
  res.json({ received: true });
}
export async function reconcilePayments() {
  if (!stripe) return;
  const orders = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", stripeSessionId: { not: null } },
    take: 50,
    orderBy: { createdAt: "asc" },
  });
  for (const order of orders) {
    const s = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
    if (s.payment_status === "paid" || s.status === "expired")
      await settleSession(
        s,
        `reconcile:${s.id}:${s.status}:${s.payment_status}`,
      );
  }
  // Orphaned attempts without a saved Stripe session are retained for manual review.
  // Releasing stock here could oversell an order that Stripe actually charged.
}
