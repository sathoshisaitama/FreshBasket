import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { serve } from "inngest/express";
import { z, ZodError } from "zod";
import argon2 from "argon2";
import { db, HttpError } from "./db.js";
import { auth, role, authRouter } from "./auth.js";
import {
  checkoutSchema,
  createOrder,
  includeOrder,
  publicOrder,
  canRead,
  cancelCod,
  assignOrder,
  changeStatus,
} from "./orders.js";
import { stripe, stripeWebhook, checkoutSession } from "./payments.js";
import { inngest, functions } from "./jobs.js";
export const app = express();
app.use(helmet());
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhook,
);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use("/api/inngest", serve({ client: inngest, functions }));
// Exact origin checks protect cookie-authenticated writes, including login.
app.use("/api", (req, _res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin !== process.env.WEB_URL
  )
    throw new HttpError(403, "Untrusted request origin");
  next();
});
app.get("/api/health", async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ ok: true });
});
app.get("/api/config", (_req, res) =>
  res.json({ onlinePayment: Boolean(stripe), currency: "INR" }),
);
app.use("/api/auth", authRouter);
app.get("/api/products", async (req, res) => {
  const q = z
    .object({
      search: z.string().max(100).optional(),
      category: z.string().max(50).optional(),
      organic: z.enum(["true", "false"]).optional(),
    })
    .parse(req.query);
  res.json(
    await db.product.findMany({
      where: {
        active: true,
        ...(q.category ? { category: q.category } : {}),
        ...(q.organic === "true" ? { organic: true } : {}),
        ...(q.search
          ? { name: { contains: q.search, mode: "insensitive" } }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 100,
    }),
  );
});
app.post("/api/checkout", auth, role("USER"), async (req, res) => {
  const input = checkoutSchema.parse(req.body);
  const key = z.string().uuid().parse(req.headers["idempotency-key"]);
  if (input.paymentMethod === "STRIPE" && !stripe)
    throw new HttpError(503, "Online payment is not configured");
  const order = await createOrder(res.locals.user.id, input, key);
  res
    .status(201)
    .json(
      input.paymentMethod === "STRIPE"
        ? await checkoutSession(order)
        : { orderId: order.id },
    );
});
app.get("/api/orders", auth, async (_req, res) => {
  const user = res.locals.user;
  let where = { userId: user.id };
  if (user.role === "ADMIN") where = {};
  if (user.role === "DELIVERY_PARTNER") {
    const p = await db.deliveryPartner.findUnique({
      where: { userId: user.id },
    });
    where = { partnerId: p?.id || "none" };
  }
  res.json(
    (
      await db.order.findMany({
        where,
        include: includeOrder,
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    ).map((o) => publicOrder(o, user)),
  );
});
app.get("/api/orders/:id", auth, async (req, res) => {
  const o = await db.order.findUnique({
    where: { id: req.params.id },
    include: includeOrder,
  });
  await canRead(o, res.locals.user);
  res.json(publicOrder(o, res.locals.user));
});
app.post("/api/orders/:id/cancel", auth, role("USER"), async (req, res) =>
  res.json(await cancelCod(req.params.id, res.locals.user)),
);
app.post("/api/orders/:id/pay", auth, role("USER"), async (req, res) => {
  const o = await db.order.findUnique({ where: { id: req.params.id } });
  if (!o || o.userId !== res.locals.user.id)
    throw new HttpError(404, "Order not found");
  if (o.paymentMethod !== "STRIPE")
    throw new HttpError(400, "This is a cash-on-delivery order");
  res.json(await checkoutSession(o));
});
const productSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().max(500),
  category: z.string().min(2).max(50),
  priceMinor: z.number().int().min(1).max(10000000),
  stock: z.number().int().min(0).max(100000),
  organic: z.boolean(),
  image: z
    .string()
    .max(500)
    .refine(
      (s) => s.startsWith("/assets/") || /^https:\/\//.test(s),
      "Use an asset path or HTTPS image URL",
    ),
  unit: z.string().min(1).max(30),
  active: z.boolean().optional(),
});
app.get("/api/admin/products", auth, role("ADMIN"), async (_req, res) =>
  res.json(await db.product.findMany({ orderBy: { name: "asc" } })),
);
app.post("/api/admin/products", auth, role("ADMIN"), async (req, res) =>
  res
    .status(201)
    .json(await db.product.create({ data: productSchema.parse(req.body) })),
);
app.patch("/api/admin/products/:id", auth, role("ADMIN"), async (req, res) =>
  res.json(
    await db.product.update({
      where: { id: req.params.id },
      data: productSchema.partial().parse(req.body),
    }),
  ),
);
app.delete("/api/admin/products/:id", auth, role("ADMIN"), async (req, res) =>
  res.json(
    await db.product.update({
      where: { id: req.params.id },
      data: { active: false },
    }),
  ),
);
app.get("/api/admin/partners", auth, role("ADMIN"), async (_req, res) =>
  res.json(
    await db.deliveryPartner.findMany({
      include: { user: { select: { name: true, email: true } } },
    }),
  ),
);
app.post("/api/admin/partners", auth, role("ADMIN"), async (req, res) => {
  const i = z
    .object({
      name: z.string().min(2).max(80),
      email: z.email().transform((s) => s.toLowerCase()),
      password: z.string().min(10).max(128),
    })
    .parse(req.body);
  const passwordHash = await argon2.hash(i.password);
  const p = await db.deliveryPartner.create({
    data: {
      user: {
        create: {
          name: i.name,
          email: i.email,
          passwordHash,
          role: "DELIVERY_PARTNER",
        },
      },
    },
    include: { user: { select: { name: true, email: true } } },
  });
  res.status(201).json(p);
});
app.post(
  "/api/admin/orders/:id/assign",
  auth,
  role("ADMIN"),
  async (req, res) => {
    const i = z
      .object({ partnerId: z.string().uuid().optional() })
      .parse(req.body);
    res.json(await assignOrder(req.params.id, i.partnerId));
  },
);
const transitionLimit = rateLimit({
  windowMs: 60000,
  limit: 15,
  keyGenerator: (_req, res) => res.locals.user.id,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
app.patch(
  "/api/orders/:id/status",
  auth,
  role("ADMIN", "DELIVERY_PARTNER"),
  transitionLimit,
  async (req, res) => {
    const i = z
      .object({
        status: z.enum(["PACKING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"]),
        code: z
          .string()
          .regex(/^\d{6}$/)
          .optional(),
      })
      .parse(req.body);
    res.json(
      await changeStatus(req.params.id, i.status, res.locals.user, i.code),
    );
  },
);
app.put(
  "/api/delivery/orders/:id/location",
  auth,
  role("DELIVERY_PARTNER"),
  async (req, res) => {
    const i = z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
      .parse(req.body);
    const partner = await db.deliveryPartner.findUnique({
      where: { userId: res.locals.user.id },
    });
    const result = await db.order.updateMany({
      where: {
        id: req.params.id,
        partnerId: partner?.id || "none",
        status: "OUT_FOR_DELIVERY",
      },
      data: { ...i, locationAt: new Date() },
    });
    if (!result.count)
      throw new HttpError(403, "No active delivery assigned to you");
    res.json({ ok: true });
  },
);
app.patch(
  "/api/delivery/availability",
  auth,
  role("DELIVERY_PARTNER"),
  async (req, res) => {
    const { available } = z.object({ available: z.boolean() }).parse(req.body);
    res.json(
      await db.deliveryPartner.update({
        where: { userId: res.locals.user.id },
        data: { available },
      }),
    );
  },
);
app.get(
  "/api/delivery/profile",
  auth,
  role("DELIVERY_PARTNER"),
  async (_req, res) =>
    res.json(
      await db.deliveryPartner.findUnique({
        where: { userId: res.locals.user.id },
      }),
    ),
);
app.use("/api", (_req, res) =>
  res.status(404).json({ message: "Endpoint not found" }),
);
app.use((err, _req, res, _next) => {
  if (err instanceof ZodError)
    return res
      .status(400)
      .json({
        message: err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
  if (err.code === "P2002")
    return res
      .status(409)
      .json({ message: "That record already exists or is currently assigned" });
  if (err.code === "P2025")
    return res.status(404).json({ message: "Record not found" });
  if (!err.status) console.error(err.message);
  res
    .status(err.status || 500)
    .json({
      message: err.status ? err.message : "Something went wrong. Please retry.",
    });
});
export default app;
