import "dotenv/config";
import argon2 from "argon2";
import { db } from "../src/db.js";
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 10)
  throw new Error(
    "Set SEED_PASSWORD to at least 10 characters in apps/api/.env before seeding.",
  );
const passwordHash = await argon2.hash(password);
for (const [email, name, role] of [
  ["customer@freshbasket.test", "Vishal", "USER"],
  ["admin@freshbasket.test", "Store manager", "ADMIN"],
  ["partner@freshbasket.test", "Delivery partner", "DELIVERY_PARTNER"],
]) {
  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role, passwordHash },
  });
  if (role === "DELIVERY_PARTNER")
    await db.deliveryPartner.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
}
const products = [
  [
    "Farm-fresh vegetables",
    "Produce",
    14900,
    "1 kg basket",
    "fruits_vegetables.png",
    true,
  ],
  [
    "Seasonal fruit selection",
    "Produce",
    22900,
    "1 kg basket",
    "fruits_vegetables.png",
    true,
  ],
  [
    "Everyday cooking vegetables",
    "Produce",
    9900,
    "750 g",
    "fruits_vegetables.png",
    false,
  ],
  [
    "Breakfast dairy & eggs",
    "Dairy & eggs",
    18900,
    "combo",
    "dairy_eggs.png",
    false,
  ],
  [
    "Fresh dairy essentials",
    "Dairy & eggs",
    12900,
    "pack",
    "dairy_eggs.png",
    false,
  ],
  [
    "Baker’s breakfast selection",
    "Bakery",
    15900,
    "4 pieces",
    "bakery.png",
    false,
  ],
  ["Weekend bakery box", "Bakery", 24900, "6 pieces", "bakery.png", false],
  [
    "Refreshing drinks pack",
    "Beverages",
    11900,
    "2 bottles",
    "drinks.png",
    false,
  ],
  [
    "Pantry starter basket",
    "Pantry",
    34900,
    "combo",
    "pantry_staples.png",
    false,
  ],
  [
    "Organic pantry essentials",
    "Pantry",
    39900,
    "combo",
    "pantry_staples.png",
    true,
  ],
  ["Movie-night snacks", "Snacks", 14900, "combo", "snacks.png", false],
  ["Afternoon snack selection", "Snacks", 8900, "pack", "snacks.png", false],
  ["Freezer favourites", "Frozen", 27900, "combo", "frozen_foods.png", false],
  [
    "Personal care essentials",
    "Personal care",
    29900,
    "kit",
    "personal_care.png",
    false,
  ],
  ["Baby care essentials", "Baby care", 44900, "kit", "baby_care.png", false],
  [
    "Seafood & meat selection",
    "Meat & seafood",
    49900,
    "1 kg",
    "meat_seafood.png",
    false,
  ],
];
for (const [
  index,
  [name, category, priceMinor, unit, image, organic],
] of products.entries()) {
  const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
  await db.product.upsert({
    where: { id },
    update: {},
    create: {
      id,
      name,
      category,
      priceMinor,
      unit,
      image: `/assets/${image}`,
      organic,
      stock: 25,
      description:
        "A thoughtfully selected grocery bundle for your everyday essentials. Sample catalog for this portfolio project.",
    },
  });
}
console.log(
  "Seeded 16 products and three local demo accounts. Existing accounts and stock were preserved.",
);
await db.$disconnect();
