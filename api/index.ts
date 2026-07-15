import app from "../src/index.js";
import { loadAppEnv } from "../src/lib/env.js";

export default function handler(request: Request): Response | Promise<Response> {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto === "http" ? "http" : "https";
  const host = request.headers.get("x-forwarded-host")
    ?? request.headers.get("host")
    ?? process.env.VERCEL_URL
    ?? "localhost";
  const url = new URL(request.url, `${protocol}://${host}`);

  // Vercel adds the rewrite's catch-all value as a query parameter because
  // the public request path is preserved for the function.
  url.searchParams.delete("path");

  return app.fetch(new Request(url, request), loadAppEnv());
}
