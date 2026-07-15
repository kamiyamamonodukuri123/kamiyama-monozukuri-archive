import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppBindings } from "./app.js";
import { ApiError, requireConfigured } from "./app.js";
import type { AppEnv } from "./env.js";

const ACCESS_COOKIE = "km_access_token";
const REFRESH_COOKIE = "km_refresh_token";

export function createAnonClient(env: AppEnv): SupabaseClient {
  return createClient(
    requireConfigured(env.SUPABASE_URL, "SUPABASE_URL"),
    requireConfigured(env.SUPABASE_ANON_KEY, "SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function createAdminClient(env: AppEnv): SupabaseClient {
  return createClient(
    requireConfigured(env.SUPABASE_URL, "SUPABASE_URL"),
    requireConfigured(env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function setSessionCookies(c: Context<AppBindings>, session: Session): void {
  const secure = new URL(c.req.url).protocol === "https:";
  const common = { httpOnly: true, secure, sameSite: "Lax" as const, path: "/" };
  setCookie(c, ACCESS_COOKIE, session.access_token, { ...common, maxAge: session.expires_in });
  setCookie(c, REFRESH_COOKIE, session.refresh_token, { ...common, maxAge: 60 * 60 * 24 * 30 });
}

export function clearSessionCookies(c: Context<AppBindings>): void {
  const secure = new URL(c.req.url).protocol === "https:";
  const options = { httpOnly: true, secure, sameSite: "Lax" as const, path: "/" };
  deleteCookie(c, ACCESS_COOKIE, options);
  deleteCookie(c, REFRESH_COOKIE, options);
}

export async function currentUser(c: Context<AppBindings>) {
  let accessToken = getCookie(c, ACCESS_COOKIE);
  const refreshToken = getCookie(c, REFRESH_COOKIE);
  if (!accessToken && !refreshToken) return null;

  const supabase = createAnonClient(c.env);
  let authUserId: string | undefined;

  if (accessToken) {
    const { data } = await supabase.auth.getUser(accessToken);
    authUserId = data.user?.id;
  }

  if (!authUserId && refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (!error && data.session) {
      setSessionCookies(c, data.session);
      accessToken = data.session.access_token;
      authUserId = data.user?.id;
    }
  }

  if (!authUserId || !accessToken) return null;
  return c.get("prisma").user.findUnique({ where: { id: authUserId } });
}

export async function requireUser(c: Context<AppBindings>) {
  const user = await currentUser(c);
  if (!user) throw new ApiError(401, "ログインが必要です。");
  return user;
}

export function requireSameOrigin(c: Context<AppBindings>): void {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return;
  const origin = c.req.header("Origin");
  if (!origin) return;
  if (origin !== new URL(c.req.url).origin) {
    throw new ApiError(403, "許可されていない送信元です。");
  }
}
