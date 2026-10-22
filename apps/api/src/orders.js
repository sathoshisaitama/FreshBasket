import { createHash, randomInt } from "node:crypto";
import { z } from "zod";
import { db, transaction, HttpError } from "./db.js";
export const addressSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/),
  line: z.string().trim().min(8).max(300),
  city: z.string().trim().min(2).max(80),
  postalCode: z.string().regex(/^[0-9]{6}$/),
});
export const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(30),
      }),
    )
    .min(1)
    .max(50),
  address: addressSchema,
  paymentMethod: z.enum(["COD", "STRIPE"]),
});
export const includeOrder = {
  items: true,
  history: { orderBy: { createdAt: "asc" } },
  partner: { include: { user: { select: { name: true } } } },
};
export function publicOrder(order, viewer) {
  const { deliveryCode, checkoutKey, requestHash, stripeSessionId, ...safe } =
    order;
  return {
    ...safe,
    ...(viewer.id === order.userId &&
    !["CANCELLED", "DELIVERED"].includes(order.status)
      ? { deliveryCode }
      : {}),
  };
}
export async function canRead(order, user) {
  if (!order) throw new HttpError(404, "Order not found");
  if (user.role === "ADMIN" || order.userId === user.id) return;
  const p = await db.deliveryPartner.findUnique({ where: { userId: user.id } });
  if (!p || p.id !== order.partnerId)
    throw new HttpError(403, "This order is not assigned to you");
}
export async function queueReceipt(tx, order) {
  const user = await tx.user.findUnique({ where: { id: order.userId } });
  await tx.notification.upsert({
    where: { key: `receipt:${order.id}` },
    update: {},
    create: {
      key: `receipt:${order.id}`,
      recipient: user.email,
      subject: "Your FreshBasket order is confirmed",
      text: `Order ${order.id}: INR ${(order.totalMinor / 100).toFixed(2)}. Track it in your account.`,
    },
  });
}
export async function createOrder(userId, input, key) {
  const quantities = new Map();
  for (const i of input.items)
    quantities.set(
      i.productId,
      (quantities.get(i.productId) || 0) + i.quantity,
    );
  const items = [...quantities]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, quantity]) => ({ productId, quantity }));
  if (items.some((i) => i.quantity > 30))
    throw new HttpError(400, "Maximum 30 of each product");
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ ...input, items }))
    .digest("hex");
  const run = () =>
    transaction(async (tx) => {
      const existing = await tx.order.findUnique({
        where: { userId_checkoutKey: { userId, checkoutKey: key } },
        include: includeOrder,
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new HttpError(409, "Checkout changed. Start a new checkout.");
        return existing;
      }
      let subtotalMinor = 0;
      const snapshots = [];
      for (const item of items) {
        const p = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (!p || !p.active)
          throw new HttpError(409, "A product is no longer available");
        const changed = await tx.product.updateMany({
          where: { id: p.id, active: true, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (!changed.count)
          throw new HttpError(409, `${p.name} does not have enough stock`);
        subtotalMinor += p.priceMinor * item.quantity;
        snapshots.push({
          productId: p.id,
          name: p.name,
          image: p.image,
          priceMinor: p.priceMinor,
          quantity: item.quantity,
        });
      }
      const deliveryMinor = subtotalMinor >= 49900 ? 0 : 3900;
      const status =
        input.paymentMethod === "COD" ? "CONFIRMED" : "PENDING_PAYMENT";
      const order = await tx.order.create({
        data: {
          userId,
          checkoutKey: key,
          requestHash,
          address: input.address,
          paymentMethod: input.paymentMethod,
          status,
          subtotalMinor,
          deliveryMinor,
          totalMinor: subtotalMinor + deliveryMinor,
          expiresAt: new Date(Date.now() + 35 * 60000),
          deliveryCode: String(randomInt(100000, 1000000)),
          items: { create: snapshots },
          history: {
            create: { status, note: "Order created", actorId: userId },
          },
        },
        include: includeOrder,
      });
      if (status === "CONFIRMED") await queueReceipt(tx, order);
      return order;
    });
  try {
    return await run();
  } catch (e) {
    if (e.code === "P2002") return run();
    throw e;
  }
}
export async function cancelCod(id, user) {
  return transaction(async (tx) => {
    const o = await tx.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!o || o.userId !== user.id) throw new HttpError(404, "Order not found");
    if (o.status === "CANCELLED") return { ok: true };
    if (o.status !== "CONFIRMED" || o.paymentMethod !== "COD")
      throw new HttpError(
        409,
        "Only confirmed cash-on-delivery orders can be cancelled here",
      );
    await tx.order.update({
      where: { id },
      data: {
        status: "CANCELLED",
        history: {
          create: {
            status: "CANCELLED",
            note: "Cancelled by customer",
            actorId: user.id,
          },
        },
      },
    });
    for (const i of o.items)
      await tx.product.update({
        where: { id: i.productId },
        data: { stock: { increment: i.quantity } },
      });
    return { ok: true };
  });
}
export async function assignOrder(orderId, partnerId) {
  return transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "READY" || order.partnerId)
      throw new HttpError(409, "Order must be ready and unassigned");
    const partner = await tx.deliveryPartner.findFirst({
      where: {
        ...(partnerId ? { id: partnerId } : {}),
        available: true,
        orders: { none: { status: { in: ["READY", "OUT_FOR_DELIVERY"] } } },
      },
      orderBy: { id: "asc" },
    });
    if (!partner) throw new HttpError(409, "No available delivery partner");
    await tx.order.update({
      where: { id: orderId },
      data: {
        partnerId: partner.id,
        history: {
          create: { status: "READY", note: "Delivery partner assigned" },
        },
      },
    });
    return { ok: true };
  });
}
export async function changeStatus(id, status, user, code) {
  return transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id } });
    if (!o) throw new HttpError(404, "Order not found");
    if (user.role === "ADMIN") {
      if (
        !(
          (o.status === "CONFIRMED" && status === "PACKING") ||
          (o.status === "PACKING" && status === "READY")
        )
      )
        throw new HttpError(409, "Invalid order transition");
    } else {
      const p = await tx.deliveryPartner.findUnique({
        where: { userId: user.id },
      });
      if (!p || o.partnerId !== p.id)
        throw new HttpError(403, "Order is not assigned to you");
      if (
        !(
          (o.status === "READY" && status === "OUT_FOR_DELIVERY") ||
          (o.status === "OUT_FOR_DELIVERY" && status === "DELIVERED")
        )
      )
        throw new HttpError(409, "Invalid delivery transition");
      if (status === "DELIVERED" && code !== o.deliveryCode)
        throw new HttpError(400, "Delivery code is incorrect");
    }
    await tx.order.update({
      where: { id },
      data: {
        status,
        ...(status === "DELIVERED" ? { paymentStatus: "PAID" } : {}),
        history: {
          create: {
            status,
            note:
              status === "DELIVERED" && o.paymentMethod === "COD"
                ? "Delivered; cash collection confirmed"
                : "Status updated",
            actorId: user.id,
          },
        },
      },
    });
    return { ok: true };
  });
}
