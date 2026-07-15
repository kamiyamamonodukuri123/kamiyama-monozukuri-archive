import app from "../src/index.js";
import { loadAppEnv } from "../src/lib/env.js";

export default function handler(request: Request): Response | Promise<Response> {
  return app.fetch(request, loadAppEnv());
}
