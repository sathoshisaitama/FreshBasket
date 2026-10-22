import { Inngest } from "inngest";
import { db } from "./db.js";
import { assignOrder } from "./orders.js";
import { reconcilePayments } from "./payments.js";
export const inngest = new Inngest({ id: "freshbasket" });
export async function runMaintenance() {
  const ready = await db.order.findMany({
    where: { status: "READY", partnerId: null },
    take: 50,
  });
  for (const order of ready) {
    try {
      await assignOrder(order.id);
    } catch (e) {
      if (e.status !== 409 && e.code !== "P2002") throw e;
    }
  }
  await reconcilePayments();
  if (process.env.ADMIN_EMAIL) {
    const low = await db.product.findMany({
      where: { active: true, stock: { lte: 5 } },
    });
    const day = new Date().toISOString().slice(0, 10);
    if (low.length)
      await db.notification.upsert({
        where: { key: `stock:${day}` },
        update: {},
        create: {
          key: `stock:${day}`,
          recipient: process.env.ADMIN_EMAIL,
          subject: "FreshBasket low stock",
          text: low.map((p) => `${p.name}: ${p.stock} remaining`).join("\n"),
        },
      });
  }
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
export async function sendPendingMail() {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
    return { configured: false };
  const pending = await db.notification.findMany({
    where: {
      sentAt: null,
      createdAt: { gt: new Date(Date.now() - 23 * 3600000) },
    },
    take: 25,
    orderBy: { createdAt: "asc" },
  });
  for (const mail of pending) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": mail.id,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [mail.recipient],
        subject: mail.subject,
        text: mail.text,
      }),
    });
    if (!response.ok)
      throw new Error(`Email provider returned ${response.status}`);
    await db.notification.update({
      where: { id: mail.id },
      data: { sentAt: new Date() },
    });
  }
  // Older unsent emails need manual review to avoid the provider's dedupe expiry.
  return { processed: pending.length };
}
export const functions = [
  inngest.createFunction(
    { id: "maintenance", triggers: [{ cron: "* * * * *" }] },
    async ({ step }) => step.run("maintain", runMaintenance),
  ),
  inngest.createFunction(
    { id: "email-outbox", triggers: [{ cron: "* * * * *" }] },
    async ({ step }) => step.run("send", sendPendingMail),
  ),
];
