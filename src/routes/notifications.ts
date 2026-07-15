import { Hono } from "hono";
import type { AppBindings } from "../lib/app.js";
import { requireUser } from "../lib/supabase.js";

export const notificationRoutes = new Hono<AppBindings>();

notificationRoutes.get("/", async (c) => {
  const user = await requireUser(c);
  const notifications = await c.get("prisma").notification.findMany({
    where: { recipientId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return c.json({ notifications });
});

notificationRoutes.post("/:id/read", async (c) => {
  const user = await requireUser(c);
  await c.get("prisma").notification.updateMany({
    where: { id: c.req.param("id"), recipientId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return c.json({ ok: true });
});
