import { Hono } from "hono";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import type { Visibility } from "../generated/prisma/enums.js";
import type { AppBindings } from "../lib/app.js";
import { ApiError } from "../lib/app.js";
import { createAdminClient, currentUser, requireUser } from "../lib/supabase.js";
import { removeImages, uploadImage, type StoredImage } from "../lib/storage.js";

const workSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().max(100),
  catchcopy: z.string().trim().max(120),
  description: z.string().trim().max(1000),
  background: z.string().trim().max(500),
  category: z.string().trim().max(50).optional().default(""),
  dateStart: z.string().optional().default(""),
  dateEnd: z.string().optional().default(""),
  members: z.string().trim().max(500),
  className: z.string().trim().max(100),
  tech: z.string().trim().max(200),
  accessLink: z.string().trim().max(500),
  docsLink: z.string().trim().max(500),
  visibility: z.enum(["public", "school", "private"]),
  commentSetting: z.enum(["allow", "deny"]),
  tags: z.array(z.string().trim().min(1).max(40)).max(10),
  images: z.array(z.string().max(7_000_000)).max(4),
});

const visibilityMap: Record<string, Visibility> = {
  public: "PUBLIC",
  school: "SCHOOL",
  private: "PRIVATE",
};

const includeWork = {
  author: { select: { username: true, lastName: true, firstName: true, affiliation: true, avatarUrl: true } },
  images: { orderBy: { sortOrder: "asc" as const } },
  workTags: { include: { tag: true } },
  _count: { select: { likes: true, bookmarks: true, comments: true } },
};

function dateOrNull(value: string): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function validatePublish(input: z.infer<typeof workSchema>): void {
  const missing: string[] = [];
  if (!input.title) missing.push("作品タイトル");
  if (!input.description) missing.push("作品説明");
  if (!input.members) missing.push("制作メンバー");
  if (!input.className) missing.push("授業名またはプロジェクト名");
  if (input.tags.length === 0) missing.push("タグ");
  if (input.images.length === 0) missing.push("サムネイル");
  if (missing.length) throw new ApiError(400, `${missing.join("、")}は必須です。`);
}

async function resolveWorkImages(c: Parameters<typeof requireUser>[0], userId: string, images: string[]) {
  const admin = createAdminClient(c.env);
  const stored: StoredImage[] = [];
  const newlyUploadedPaths: string[] = [];
  try {
    for (const image of images) {
      if (image.startsWith("data:")) {
        const uploaded = await uploadImage(admin, c.env.SUPABASE_STORAGE_BUCKET, "works", userId, image);
        stored.push(uploaded);
        newlyUploadedPaths.push(uploaded.storagePath);
        continue;
      }
      const marker = `/storage/v1/object/public/${c.env.SUPABASE_STORAGE_BUCKET}/`;
      const path = new URL(image).pathname.split(marker)[1];
      if (!path || !path.startsWith(`works/${userId}/`)) throw new ApiError(400, "作品画像のURLが不正です。");
      stored.push({ imageUrl: image, storagePath: path });
    }
    return { stored, newlyUploadedPaths };
  } catch (error) {
    await removeImages(admin, c.env.SUPABASE_STORAGE_BUCKET, newlyUploadedPaths);
    throw error;
  }
}

function workData(input: z.infer<typeof workSchema>, status: "DRAFT" | "PUBLISHED", images: StoredImage[]) {
  const tags = [...new Set(input.tags)];
  return {
    title: input.title || "無題の下書き",
    catchcopy: input.catchcopy || null,
    description: input.description || "",
    background: input.background || null,
    category: input.category || null,
    dateStart: dateOrNull(input.dateStart),
    dateEnd: dateOrNull(input.dateEnd),
    members: input.members || "",
    className: input.className || "",
    tech: input.tech || null,
    accessLink: input.accessLink || null,
    docsLink: input.docsLink || null,
    visibility: visibilityMap[input.visibility] ?? "SCHOOL",
    allowComments: input.commentSetting === "allow",
    status,
    publishedAt: status === "PUBLISHED" ? new Date() : null,
    images: {
      create: images.map((image, sortOrder) => ({ ...image, sortOrder })),
    },
    workTags: {
      create: tags.map((name) => ({
        tag: { connectOrCreate: { where: { name }, create: { name } } },
      })),
    },
  } satisfies Prisma.WorkCreateWithoutAuthorInput;
}

export const workRoutes = new Hono<AppBindings>();

workRoutes.get("/", async (c) => {
  const user = await currentUser(c);
  const q = (c.req.query("q") ?? "").trim();
  const sort = c.req.query("sort") ?? "new";
  const category = c.req.query("category") ?? "";
  const visibility: Visibility[] = user ? ["PUBLIC", "SCHOOL"] : ["PUBLIC"];
  const where: Prisma.WorkWhereInput = {
    status: "PUBLISHED",
    visibility: { in: visibility },
    ...(category && category !== "all" ? { category } : {}),
    ...(q ? {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { members: { contains: q, mode: "insensitive" } },
        { author: { username: { contains: q, mode: "insensitive" } } },
        { workTags: { some: { tag: { name: { contains: q, mode: "insensitive" } } } } },
      ],
    } : {}),
  };
  const orderBy: Prisma.WorkOrderByWithRelationInput = sort === "views"
    ? { viewCount: "desc" }
    : sort === "likes"
      ? { likes: { _count: "desc" } }
      : { publishedAt: "desc" };
  const [works, total] = await Promise.all([
    c.get("prisma").work.findMany({ where, include: includeWork, orderBy, take: 50 }),
    c.get("prisma").work.count({ where }),
  ]);
  return c.json({ works, total });
});

workRoutes.get("/draft", async (c) => {
  const user = await requireUser(c);
  const work = await c.get("prisma").work.findFirst({
    where: { authorId: user.id, status: "DRAFT" },
    include: includeWork,
    orderBy: { updatedAt: "desc" },
  });
  return c.json({ work });
});

workRoutes.post("/draft", async (c) => {
  const user = await requireUser(c);
  const parsed = workSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  const input = parsed.data;
  const existing = input.id
    ? await c.get("prisma").work.findFirst({ where: { id: input.id, authorId: user.id, status: "DRAFT" }, include: { images: true } })
    : null;
  if (input.id && !existing) throw new ApiError(404, "下書きが見つかりません。");
  const resolved = await resolveWorkImages(c, user.id, input.images);
  const data = workData(input, "DRAFT", resolved.stored);
  try {
    const work = existing
      ? await c.get("prisma").work.update({
          where: { id: existing.id },
          data: { ...data, images: { deleteMany: {}, ...data.images }, workTags: { deleteMany: {}, ...data.workTags } },
          include: includeWork,
        })
      : await c.get("prisma").work.create({ data: { ...data, author: { connect: { id: user.id } } }, include: includeWork });
    if (existing) {
      const retained = new Set(resolved.stored.map((item) => item.storagePath));
      await removeImages(createAdminClient(c.env), c.env.SUPABASE_STORAGE_BUCKET, existing.images.map((item) => item.storagePath).filter((path) => !retained.has(path)));
    }
    return c.json({ work }, existing ? 200 : 201);
  } catch (error) {
    await removeImages(createAdminClient(c.env), c.env.SUPABASE_STORAGE_BUCKET, resolved.newlyUploadedPaths);
    throw error;
  }
});

workRoutes.post("/", async (c) => {
  const user = await requireUser(c);
  const parsed = workSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  validatePublish(parsed.data);
  const existing = parsed.data.id
    ? await c.get("prisma").work.findFirst({ where: { id: parsed.data.id, authorId: user.id, status: "DRAFT" }, include: { images: true } })
    : null;
  if (parsed.data.id && !existing) throw new ApiError(404, "公開する下書きが見つかりません。");
  const resolved = await resolveWorkImages(c, user.id, parsed.data.images);
  const data = workData(parsed.data, "PUBLISHED", resolved.stored);
  try {
    const work = existing
      ? await c.get("prisma").work.update({
          where: { id: existing.id },
          data: { ...data, images: { deleteMany: {}, ...data.images }, workTags: { deleteMany: {}, ...data.workTags } },
          include: includeWork,
        })
      : await c.get("prisma").work.create({ data: { ...data, author: { connect: { id: user.id } } }, include: includeWork });
    if (existing) {
      const retained = new Set(resolved.stored.map((item) => item.storagePath));
      await removeImages(createAdminClient(c.env), c.env.SUPABASE_STORAGE_BUCKET, existing.images.map((item) => item.storagePath).filter((path) => !retained.has(path)));
    }
    return c.json({ work }, 201);
  } catch (error) {
    await removeImages(createAdminClient(c.env), c.env.SUPABASE_STORAGE_BUCKET, resolved.newlyUploadedPaths);
    throw error;
  }
});

workRoutes.get("/:id", async (c) => {
  const user = await currentUser(c);
  const work = await c.get("prisma").work.findUnique({ where: { id: c.req.param("id") }, include: includeWork });
  if (!work || work.status !== "PUBLISHED") throw new ApiError(404, "作品が見つかりません。");
  if (work.visibility === "PRIVATE" && work.authorId !== user?.id) throw new ApiError(404, "作品が見つかりません。");
  if (work.visibility === "SCHOOL" && !user) throw new ApiError(401, "この作品の閲覧にはログインが必要です。");
  return c.json({ work });
});
