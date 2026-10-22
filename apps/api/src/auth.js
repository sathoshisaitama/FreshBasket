import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import argon2 from "argon2";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { db, HttpError } from "./db.js";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const safeUser = { id: true, name: true, email: true, role: true };
export async function auth(req, res, next) {
  const token = req.cookies.session;
  if (typeof token !== "string")
    throw new HttpError(401, "Please sign in to continue");
  const session = await db.session.findUnique({
    where: { tokenHash: hash(token) },
    include: { user: { select: safeUser } },
  });
  if (!session || session.expiresAt < new Date())
    throw new HttpError(401, "Please sign in again");
  res.locals.user = session.user;
  next();
}
export const role =
  (...roles) =>
  (_req, res, next) => {
    if (!roles.includes(res.locals.user.role))
      throw new HttpError(403, "You do not have access to this action");
    next();
  };
const credentials = z.object({
  email: z
    .email()
    .max(200)
    .transform((s) => s.trim().toLowerCase()),
  password: z.string().min(10).max(128),
});
export const authRouter = Router();
authRouter.use(
  rateLimit({
    windowMs: 15 * 60000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
async function signIn(user, req, res) {
  if (req.cookies.session)
    await db.session.deleteMany({
      where: { tokenHash: hash(req.cookies.session) },
    });
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await db.session.create({
    data: { tokenHash: hash(token), userId: user.id, expiresAt },
  });
  res.cookie("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
}
authRouter.post("/register", async (req, res) => {
  const i = credentials
    .extend({ name: z.string().trim().min(2).max(80) })
    .parse(req.body);
  const user = await db.user.create({
    data: {
      name: i.name,
      email: i.email,
      passwordHash: await argon2.hash(i.password),
      role: "USER",
    },
  });
  await signIn(user, req, res);
});
authRouter.post("/login", async (req, res) => {
  const i = credentials.parse(req.body);
  const user = await db.user.findUnique({ where: { email: i.email } });
  if (!user || !(await argon2.verify(user.passwordHash, i.password)))
    throw new HttpError(401, "Email or password is incorrect");
  await signIn(user, req, res);
});
authRouter.get("/me", auth, (_req, res) => res.json(res.locals.user));
authRouter.post("/logout", async (req, res) => {
  if (req.cookies.session)
    await db.session.deleteMany({
      where: { tokenHash: hash(req.cookies.session) },
    });
  res.clearCookie("session", { path: "/" });
  res.json({ ok: true });
});
