import { Hono } from "hono";
import { z } from "zod";
import type { UserRole } from "../generated/prisma/enums";
import type { AppBindings } from "../lib/app";
import { ApiError } from "../lib/app";
import {
  clearSessionCookies,
  createAdminClient,
  createAnonClient,
  currentUser,
  setSessionCookies,
} from "../lib/supabase";

const roleMap: Record<string, UserRole> = {
  "学生": "STUDENT",
  "教員": "TEACHER",
  "学校スタッフ": "STAFF",
  "卒業生": "ALUMNI",
  "その他の学校関係者": "OTHER",
};

const registerSchema = z.object({
  email: z.string().email("メールアドレスを正しく入力してください。"),
  password: z.string().min(8).regex(/[A-Za-z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/),
  username: z.string().regex(/^[a-zA-Z0-9_.-]{3,30}$/),
  lastName: z.string().trim().min(1).max(50),
  firstName: z.string().trim().min(1).max(50),
  role: z.string(),
  affiliation: z.string().trim().max(100),
});

const loginSchema = z.object({
  email: z.string().email("メールアドレスを正しく入力してください。"),
  password: z.string().min(1),
});

export const authRoutes = new Hono<AppBindings>();

authRoutes.post("/register", async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  const input = parsed.data;
  const role = roleMap[input.role];
  if (!role) throw new ApiError(400, "ユーザー区分を選択してください。");

  const prisma = c.get("prisma");
  const duplicate = await prisma.user.findFirst({
    where: { OR: [{ email: input.email.toLowerCase() }, { username: input.username }] },
    select: { email: true, username: true },
  });
  if (duplicate?.email === input.email.toLowerCase()) throw new ApiError(409, "このメールアドレスは登録済みです。");
  if (duplicate?.username === input.username) throw new ApiError(409, "このユーザー名は既に使用されています。");

  const supabase = createAnonClient(c.env);
  const { data, error } = await supabase.auth.signUp({
    email: input.email.toLowerCase(),
    password: input.password,
    options: {
      data: {
        username: input.username,
        last_name: input.lastName,
        first_name: input.firstName,
      },
    },
  });
  if (error || !data.user) throw new ApiError(400, error?.message ?? "アカウントを作成できませんでした。");

  try {
    const user = await prisma.user.create({
      data: {
        id: data.user.id,
        email: input.email.toLowerCase(),
        username: input.username,
        lastName: input.lastName,
        firstName: input.firstName,
        role,
        affiliation: input.affiliation || null,
      },
    });
    if (data.session) setSessionCookies(c, data.session);
    return c.json({ user, requiresEmailConfirmation: !data.session }, 201);
  } catch (error) {
    const admin = createAdminClient(c.env);
    const cleanup = await admin.auth.admin.deleteUser(data.user.id);
    if (cleanup.error) console.error(JSON.stringify({ event: "auth_cleanup_failed", message: cleanup.error.message }));
    throw error;
  }
});

authRoutes.post("/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  const supabase = createAnonClient(c.env);
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.session || !data.user) throw new ApiError(401, "メールアドレスまたはパスワードが正しくありません。");

  const prisma = c.get("prisma");
  let profile = await prisma.user.findUnique({ where: { id: data.user.id } });
  if (!profile) {
    const metadata = data.user.user_metadata;
    const username = typeof metadata.username === "string" ? metadata.username : `user_${data.user.id.slice(0, 8)}`;
    profile = await prisma.user.create({
      data: {
        id: data.user.id,
        email: data.user.email ?? parsed.data.email.toLowerCase(),
        username,
        lastName: typeof metadata.last_name === "string" ? metadata.last_name : "未設定",
        firstName: typeof metadata.first_name === "string" ? metadata.first_name : "未設定",
      },
    });
  }
  setSessionCookies(c, data.session);
  return c.json({ user: profile });
});

authRoutes.post("/logout", async (c) => {
  clearSessionCookies(c);
  return c.json({ ok: true });
});

authRoutes.get("/session", async (c) => {
  const user = await currentUser(c);
  return c.json({ user });
});
