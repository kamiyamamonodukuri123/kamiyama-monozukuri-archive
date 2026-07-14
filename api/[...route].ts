import app from "../src/index";
import { loadAppEnv } from "../src/lib/env";

export default function handler(request: Request): Response | Promise<Response> {
  return app.fetch(request, loadAppEnv());
}
