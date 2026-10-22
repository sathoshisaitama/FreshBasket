import { app } from "./app.js";
import { db } from "./db.js";
const server = app.listen(Number(process.env.API_PORT) || 4000, () =>
  console.log("FreshBasket API ready on port", process.env.API_PORT || 4000),
);
process.on("SIGTERM", () =>
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  }),
);
