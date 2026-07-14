import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppBindings } from "./app";
import { requireConfigured } from "./app";

const ACCESS_COOKIE = "km_titleedit_access";
const TITLEEDIT_PASSKEY = "taitoruteirei02";
const ACCESS_LIFETIME_SECONDS = 60 * 60 * 12;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signature(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

function safeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index]! ^ b[index]!;
  return difference === 0;
}

export function isTitleEditPasskey(passkey: string): boolean {
  return safeEqual(passkey, TITLEEDIT_PASSKEY);
}

export async function grantTitleEditAccess(c: Context<AppBindings>): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_LIFETIME_SECONDS;
  const payload = String(expiresAt);
  const token = `${payload}.${await signature(requireConfigured(c.env.SESSION_SECRET, "SESSION_SECRET"), payload)}`;
  setCookie(c, ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: ACCESS_LIFETIME_SECONDS,
  });
}

export async function hasTitleEditAccess(c: Context<AppBindings>): Promise<boolean> {
  const token = getCookie(c, ACCESS_COOKIE);
  if (!token) return false;
  const separator = token.indexOf(".");
  if (separator < 1) return false;
  const payload = token.slice(0, separator);
  const receivedSignature = token.slice(separator + 1);
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const expectedSignature = await signature(requireConfigured(c.env.SESSION_SECRET, "SESSION_SECRET"), payload);
  return safeEqual(receivedSignature, expectedSignature);
}
