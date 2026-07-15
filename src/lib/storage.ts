import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./app.js";

const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

export type StoredImage = { imageUrl: string; storagePath: string };

function decodeImage(dataUrl: string): { bytes: Uint8Array; contentType: string; extension: string } {
  const match = DATA_URL.exec(dataUrl);
  if (!match?.[1] || !match[2]) throw new ApiError(400, "対応していない画像形式です。");
  const binary = atob(match[2]);
  if (binary.length > 5 * 1024 * 1024) throw new ApiError(413, "画像は1枚5MB以内にしてください。");
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const extension = match[1] === "image/jpeg" ? "jpg" : match[1].slice("image/".length);
  return { bytes, contentType: match[1], extension };
}

export async function uploadImage(
  supabase: SupabaseClient,
  bucket: string,
  folder: string,
  ownerId: string,
  dataUrl: string,
): Promise<StoredImage> {
  const image = decodeImage(dataUrl);
  const storagePath = `${folder}/${ownerId}/${crypto.randomUUID()}.${image.extension}`;
  const { error } = await supabase.storage.from(bucket).upload(storagePath, image.bytes, {
    contentType: image.contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new ApiError(500, `画像の保存に失敗しました: ${error.message}`);
  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return { imageUrl: data.publicUrl, storagePath };
}

export async function removeImages(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) console.error(JSON.stringify({ event: "storage_cleanup_failed", message: error.message }));
}
