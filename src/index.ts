import { Hono } from "hono";
import type { AppBindings } from "./lib/app.js";
import { ApiError } from "./lib/app.js";
import { createPrisma } from "./lib/prisma.js";
import { requireSameOrigin } from "./lib/supabase.js";
import { authRoutes } from "./routes/auth.js";
import { eventRoutes } from "./routes/events.js";
import { notificationRoutes } from "./routes/notifications.js";
import { profileRoutes } from "./routes/profile.js";
import { workRoutes } from "./routes/works.js";

const app = new Hono<AppBindings>();

app.use("/api/*", async (c, next) => {
  requireSameOrigin(c);
  const prisma = createPrisma(c.env);
  c.set("prisma", prisma);
  try {
    await next();
  } finally {
    await prisma.$disconnect();
  }
});

app.get("/api/health", (c) => c.json({ ok: true, service: "kamiyama-monozukuri-archive" }));
app.route("/api/auth", authRoutes);
app.route("/api/profile", profileRoutes);
app.route("/api/works", workRoutes);
app.route("/api/events", eventRoutes);
app.route("/api/notifications", notificationRoutes);

app.notFound((c) => {
  const url = new URL(c.req.url);
  if (url.pathname.startsWith("/api/")) return c.json({ error: "APIが見つかりません。" }, 404);
  return c.json({ error: "Not Found" }, 404);
});

app.onError((error, c) => {
  if (error instanceof ApiError) return c.json({ error: error.message }, error.status);
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : undefined;
  console.error(JSON.stringify({
    event: "request_failed",
    path: new URL(c.req.url).pathname,
    method: c.req.method,
    message: error instanceof Error ? error.message : String(error),
    cause: cause?.message,
  }));
  return c.json({ error: "サーバーでエラーが発生しました。" }, 500);
});

export default app;
