import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import argon2 from "argon2";
// Always target a dedicated test database. This suite only deletes its own fixtures.
if (!process.env.DATABASE_URL?.includes("_test"))
  throw new Error(
    "Set DATABASE_URL to a migrated database whose name contains _test.",
  );
process.env.WEB_URL ||= "http://localhost:5173";
const { app } = await import("../apps/api/src/app.js");
const { db } = await import("../apps/api/src/db.js");
const { settleSession } = await import("../apps/api/src/payments.js");
const origin = process.env.WEB_URL,
  password = "IntegrationPass123!";
const suffix = randomUUID(),
  userIds = [],
  products = [],
  eventIds = [];
let customer, other, admin, partner, partner2, mainOrder;
const address = {
  name: "Test customer",
  phone: "9999999999",
  line: "12 Test Street",
  city: "Hyderabad",
  postalCode: "500001",
};
function post(agent, path, body, method = "post") {
  return agent[method](`/api${path}`).set("Origin", origin).send(body);
}
async function account(role, name) {
  const user = await db.user.create({
    data: {
      email: `${name}-${suffix}@example.test`,
      name,
      passwordHash: await argon2.hash(password),
      role,
    },
  });
  userIds.push(user.id);
  if (role === "DELIVERY_PARTNER")
    await db.deliveryPartner.create({ data: { userId: user.id } });
  const agent = request.agent(app);
  const r = await post(agent, "/auth/login", { email: user.email, password });
  assert.equal(r.status, 200);
  return { agent, user };
}
async function product(stock = 20) {
  const p = await db.product.create({
    data: {
      name: `Test ${suffix}`,
      category: "Produce",
      priceMinor: 10000,
      stock,
      image: "/assets/fruits_vegetables.png",
      unit: "pack",
    },
  });
  products.push(p.id);
  return p;
}
async function checkout(who, p, key = randomUUID(), quantity = 1) {
  return post(who.agent, "/checkout", {
    items: [{ productId: p.id, quantity }],
    address,
    paymentMethod: "COD",
    totalMinor: 1,
  }).set("Idempotency-Key", key);
}
before(async () => {
  customer = await account("USER", "customer");
  other = await account("USER", "other");
  admin = await account("ADMIN", "admin");
  partner = await account("DELIVERY_PARTNER", "partner");
  partner2 = await account("DELIVERY_PARTNER", "partner-two");
});
after(async () => {
  const orders = await db.order.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const ids = orders.map((o) => o.id);
  await db.orderHistory.deleteMany({ where: { orderId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await db.order.deleteMany({ where: { id: { in: ids } } });
  await db.notification.deleteMany({
    where: { recipient: { endsWith: `${suffix}@example.test` } },
  });
  await db.webhookEvent.deleteMany({ where: { id: { in: eventIds } } });
  await db.product.deleteMany({ where: { id: { in: products } } });
  await db.deliveryPartner.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});
test("anonymous and customer users cannot access admin APIs", async () => {
  assert.equal((await request(app).get("/api/admin/products")).status, 401);
  assert.equal((await customer.agent.get("/api/admin/products")).status, 403);
});
test("rejects cookie-authenticated writes from another origin", async () => {
  const r = await customer.agent
    .post("/api/auth/logout")
    .set("Origin", "https://attacker.test")
    .send({});
  assert.equal(r.status, 403);
});
test("registration ignores supplied admin role", async () => {
  const r = await post(request.agent(app), "/auth/register", {
    name: "New user",
    email: `new-${suffix}@example.test`,
    password,
    role: "ADMIN",
  });
  assert.equal(r.status, 200);
  userIds.push(r.body.id);
  assert.equal(r.body.role, "USER");
  assert.equal(r.body.passwordHash, undefined);
});
test("checkout calculates prices and handles repeated keys once", async () => {
  const p = await product(),
    key = randomUUID();
  const first = await checkout(customer, p, key);
  assert.equal(first.status, 201);
  mainOrder = first.body.orderId;
  const second = await checkout(customer, p, key);
  assert.equal(second.body.orderId, mainOrder);
  const o = await db.order.findUnique({ where: { id: mainOrder } });
  assert.equal(o.totalMinor, 13900);
  assert.equal(
    (await db.product.findUnique({ where: { id: p.id } })).stock,
    19,
  );
  assert.equal((await checkout(customer, p, key, 2)).status, 409);
});
test("insufficient inventory rolls back checkout", async () => {
  const p = await product(1);
  assert.equal((await checkout(customer, p, randomUUID(), 2)).status, 409);
  assert.equal((await db.product.findUnique({ where: { id: p.id } })).stock, 1);
});
test("orders are private and delivery codes are hidden from admins", async () => {
  assert.equal((await other.agent.get(`/api/orders/${mainOrder}`)).status, 403);
  const r = await admin.agent.get(`/api/orders/${mainOrder}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.deliveryCode, undefined);
});
test("packing transitions and assignment enforce the workflow", async () => {
  assert.equal(
    (
      await post(
        admin.agent,
        `/orders/${mainOrder}/status`,
        { status: "READY" },
        "patch",
      )
    ).status,
    409,
  );
  for (const status of ["PACKING", "READY"])
    assert.equal(
      (
        await post(
          admin.agent,
          `/orders/${mainOrder}/status`,
          { status },
          "patch",
        )
      ).status,
      200,
    );
  const p = await db.deliveryPartner.findUnique({
    where: { userId: partner.user.id },
  });
  assert.equal(
    (
      await post(admin.agent, `/admin/orders/${mainOrder}/assign`, {
        partnerId: p.id,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await post(admin.agent, `/admin/orders/${mainOrder}/assign`, {
        partnerId: p.id,
      })
    ).status,
    409,
  );
});
test("only assigned partner can pick up and update location", async () => {
  assert.equal(
    (
      await post(
        partner2.agent,
        `/orders/${mainOrder}/status`,
        { status: "OUT_FOR_DELIVERY" },
        "patch",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post(
        partner.agent,
        `/orders/${mainOrder}/status`,
        { status: "OUT_FOR_DELIVERY" },
        "patch",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await post(
        partner.agent,
        `/delivery/orders/${mainOrder}/location`,
        { latitude: 17.4, longitude: 78.4 },
        "put",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await post(
        partner2.agent,
        `/delivery/orders/${mainOrder}/location`,
        { latitude: 17.4, longitude: 78.4 },
        "put",
      )
    ).status,
    403,
  );
});
test("delivery requires correct code and stops further location writes", async () => {
  const r = await customer.agent.get(`/api/orders/${mainOrder}`);
  assert.match(r.body.deliveryCode, /^\d{6}$/);
  assert.equal(
    (
      await post(
        partner.agent,
        `/orders/${mainOrder}/status`,
        { status: "DELIVERED", code: "000000" },
        "patch",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await post(
        partner.agent,
        `/orders/${mainOrder}/status`,
        { status: "DELIVERED", code: r.body.deliveryCode },
        "patch",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await post(
        partner.agent,
        `/delivery/orders/${mainOrder}/location`,
        { latitude: 17.4, longitude: 78.4 },
        "put",
      )
    ).status,
    403,
  );
  assert.equal(
    (await customer.agent.get(`/api/orders/${mainOrder}`)).body.paymentStatus,
    "PAID",
  );
});
test("cancellation restores stock only once", async () => {
  const p = await product(4),
    r = await checkout(customer, p);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await post(customer.agent, `/orders/${r.body.orderId}/cancel`, {}))
        .status,
      200,
    );
  assert.equal((await db.product.findUnique({ where: { id: p.id } })).stock, 4);
});
test("payment settlement validates totals and deduplicates events", async () => {
  const { createOrder } = await import("../apps/api/src/orders.js");
  const p = await product();
  const order = await createOrder(
    customer.user.id,
    {
      items: [{ productId: p.id, quantity: 1 }],
      address,
      paymentMethod: "STRIPE",
    },
    randomUUID(),
  );
  const session = {
    id: `cs_${suffix}`,
    metadata: { orderId: order.id },
    client_reference_id: order.id,
    currency: "inr",
    amount_total: order.totalMinor,
    payment_status: "paid",
    status: "complete",
  };
  await assert.rejects(
    settleSession({ ...session, amount_total: 1 }, `bad_${suffix}`),
  );
  const event = `evt_${suffix}`;
  eventIds.push(event);
  await settleSession(session, event);
  await settleSession(session, event);
  assert.equal(
    (await db.order.findUnique({ where: { id: order.id } })).paymentStatus,
    "PAID",
  );
  assert.equal(
    await db.orderHistory.count({
      where: { orderId: order.id, note: "Stripe payment verified" },
    }),
    1,
  );
});
test("logout revokes the server-side session", async () => {
  assert.equal((await post(other.agent, "/auth/logout", {})).status, 200);
  assert.equal((await other.agent.get("/api/auth/me")).status, 401);
});
