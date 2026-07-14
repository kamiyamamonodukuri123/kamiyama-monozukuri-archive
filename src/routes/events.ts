import { Hono } from "hono";
import { z } from "zod";
import type { EventType } from "../generated/prisma/enums";
import type { AppBindings } from "../lib/app";
import { ApiError } from "../lib/app";
import { createAdminClient, currentUser, requireUser } from "../lib/supabase";
import { removeImages, uploadImage } from "../lib/storage";
import { grantTitleEditAccess, hasTitleEditAccess, isTitleEditPasskey } from "../lib/titleedit-auth";

const eventSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000),
  type: z.enum(["exhibit", "call", "contest", "other"]),
  place: z.string().trim().max(200),
  start: z.string().optional().default(""),
  end: z.string().optional().default(""),
  image: z.string().max(7_000_000).optional().default(""),
  isPublished: z.boolean().optional().default(true),
});

const typeMap: Record<string, EventType> = {
  exhibit: "EXHIBITION",
  call: "RECRUITMENT",
  contest: "CONTEST",
  other: "OTHER",
};

function dateOrNull(value: string): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function canManageEvents(user: Awaited<ReturnType<typeof requireUser>>): boolean {
  return user.role === "ADMIN" || user.isApproved && ["TEACHER", "STAFF"].includes(user.role);
}

export const eventRoutes = new Hono<AppBindings>();

eventRoutes.get("/access", async (c) => c.json({ ok: await hasTitleEditAccess(c) }));

eventRoutes.post("/access", async (c) => {
  const input = z.object({ passkey: z.string().min(1).max(100) }).safeParse(await c.req.json());
  if (!input.success || !isTitleEditPasskey(input.data.passkey)) {
    throw new ApiError(401, "パスキーが正しくありません。");
  }
  await grantTitleEditAccess(c);
  return c.json({ ok: true });
});

eventRoutes.get("/", async (c) => {
  const passkeyAccess = await hasTitleEditAccess(c);
  const user = passkeyAccess ? null : await currentUser(c);
  const includeUnpublished = c.req.query("manage") === "1" && (passkeyAccess || !!user && canManageEvents(user));
  const events = await c.get("prisma").event.findMany({
    where: includeUnpublished ? {} : { isPublished: true },
    include: { creator: { select: { username: true, lastName: true, firstName: true } } },
    orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
  return c.json({ events, canManage: !!includeUnpublished });
});

eventRoutes.post("/", async (c) => {
  const passkeyAccess = await hasTitleEditAccess(c);
  const user = passkeyAccess ? null : await requireUser(c);
  if (!passkeyAccess && !canManageEvents(user!)) throw new ApiError(403, "イベントを掲載する権限がありません。");
  const parsed = eventSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  let stored: Awaited<ReturnType<typeof uploadImage>> | undefined;
  if (parsed.data.image) {
    stored = await uploadImage(createAdminClient(c.env), c.env.SUPABASE_STORAGE_BUCKET, "events", user?.id ?? "titleedit", parsed.data.image);
  }
  try {
    const event = await c.get("prisma").event.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description || null,
        type: typeMap[parsed.data.type] ?? "OTHER",
        place: parsed.data.place || null,
        startAt: dateOrNull(parsed.data.start),
        endAt: dateOrNull(parsed.data.end),
        imageUrl: stored?.imageUrl,
        storagePath: stored?.storagePath,
        isPublished: parsed.data.isPublished,
        creatorId: user?.id ?? null,
      },
    });
    return c.json({ event }, 201);
  } catch (error) {
    if (stored) await removeImages(createAdminClient(c.env), c.env.SUPABASE_STORAGE_BUCKET, [stored.storagePath]);
    throw error;
  }
});

eventRoutes.patch("/:id", async (c) => {
  const passkeyAccess = await hasTitleEditAccess(c);
  const user = passkeyAccess ? null : await requireUser(c);
  if (!passkeyAccess && !canManageEvents(user!)) throw new ApiError(403, "イベントを編集する権限がありません。");
  const existing = await c.get("prisma").event.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) throw new ApiError(404, "イベントが見つかりません。");
  if (!passkeyAccess && user!.role !== "ADMIN" && existing.creatorId !== user!.id) throw new ApiError(403, "このイベントは編集できません。");
  const parsed = eventSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  let stored: Awaited<ReturnType<typeof uploadImage>> | undefined;
  if (parsed.data.image?.startsWith("data:")) {
    stored = await uploadImage(createAdminClient(c.env), c.env.SUPABASE_STORAGE_BUCKET, "events", user?.id ?? "titleedit", parsed.data.image);
  }
  const event = await c.get("prisma").event.update({
    where: { id: existing.id },
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      type: typeMap[parsed.data.type] ?? "OTHER",
      place: parsed.data.place || null,
      startAt: dateOrNull(parsed.data.start),
      endAt: dateOrNull(parsed.data.end),
      imageUrl: stored?.imageUrl ?? existing.imageUrl,
      storagePath: stored?.storagePath ?? existing.storagePath,
      isPublished: parsed.data.isPublished,
    },
  });
  if (stored && existing.storagePath) await removeImages(createAdminClient(c.env), c.env.SUPABASE_STORAGE_BUCKET, [existing.storagePath]);
  return c.json({ event });
});

eventRoutes.delete("/:id", async (c) => {
  const passkeyAccess = await hasTitleEditAccess(c);
  const user = passkeyAccess ? null : await requireUser(c);
  if (!passkeyAccess && !canManageEvents(user!)) throw new ApiError(403, "イベントを削除する権限がありません。");
  const existing = await c.get("prisma").event.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) throw new ApiError(404, "イベントが見つかりません。");
  if (!passkeyAccess && user!.role !== "ADMIN" && existing.creatorId !== user!.id) throw new ApiError(403, "このイベントは削除できません。");
  await c.get("prisma").event.delete({ where: { id: existing.id } });
  if (existing.storagePath) await removeImages(createAdminClient(c.env), c.env.SUPABASE_STORAGE_BUCKET, [existing.storagePath]);
  return c.json({ ok: true });
});
