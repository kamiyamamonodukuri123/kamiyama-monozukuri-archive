import { Hono } from "hono";
import { z } from "zod";
import type { UserRole } from "../generated/prisma/enums.js";
import type { AppBindings } from "../lib/app.js";
import { ApiError } from "../lib/app.js";
import { createAdminClient, requireUser } from "../lib/supabase.js";
import { removeImages, uploadImage } from "../lib/storage.js";

const roleMap: Record<string, UserRole> = {
  "学生": "STUDENT",
  "教員": "TEACHER",
  "学校スタッフ": "STAFF",
  "卒業生": "ALUMNI",
  "その他の学校関係者": "OTHER",
};

const profileSchema = z.object({
  lastName: z.string().trim().min(1).max(50),
  firstName: z.string().trim().min(1).max(50),
  role: z.string(),
  affiliation: z.string().trim().max(100),
  bio: z.string().trim().max(300),
  skills: z.array(z.string().trim().min(1).max(50)).max(10),
});

const avatarSchema = z.object({ dataUrl: z.string().max(7_000_000) });

export const profileRoutes = new Hono<AppBindings>();

profileRoutes.get("/", async (c) => {
  const user = await requireUser(c);
  const works = await c.get("prisma").work.findMany({
    where: { authorId: user.id, status: "PUBLISHED" },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      workTags: { include: { tag: true } },
      _count: { select: { likes: true, bookmarks: true, comments: true } },
    },
    orderBy: { publishedAt: "desc" },
  });
  return c.json({
    user,
    works,
    stats: {
      workCount: works.length,
      likeCount: works.reduce((total, work) => total + work._count.likes, 0),
    },
  });
});

profileRoutes.patch("/", async (c) => {
  const user = await requireUser(c);
  const parsed = profileSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  const role = roleMap[parsed.data.role];
  if (!role) throw new ApiError(400, "ユーザー区分を選択してください。");
  const updated = await c.get("prisma").user.update({
    where: { id: user.id },
    data: {
      lastName: parsed.data.lastName,
      firstName: parsed.data.firstName,
      role,
      affiliation: parsed.data.affiliation || null,
      bio: parsed.data.bio || null,
      skills: [...new Set(parsed.data.skills)],
    },
  });
  return c.json({ user: updated });
});

profileRoutes.post("/avatar", async (c) => {
  const user = await requireUser(c);
  const parsed = avatarSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new ApiError(400, "プロフィール画像を確認してください。");
  const admin = createAdminClient(c.env);
  const stored = await uploadImage(admin, c.env.SUPABASE_STORAGE_BUCKET, "avatars", user.id, parsed.data.dataUrl);
  const oldPath = user.avatarUrl ? new URL(user.avatarUrl).pathname.split(`/object/public/${c.env.SUPABASE_STORAGE_BUCKET}/`)[1] : undefined;
  const updated = await c.get("prisma").user.update({ where: { id: user.id }, data: { avatarUrl: stored.imageUrl } });
  if (oldPath) await removeImages(admin, c.env.SUPABASE_STORAGE_BUCKET, [oldPath]);
  return c.json({ user: updated });
});
