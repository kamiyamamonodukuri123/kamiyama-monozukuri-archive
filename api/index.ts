import app from "../src/index.js";
import { loadAppEnv } from "../src/lib/env.js";

export default {
  fetch(request: Request): Response | Promise<Response> {
    const url = new URL(request.url);

    // Vercel adds the rewrite's catch-all value as a query parameter because
    // the public request path is preserved for the function.
    url.searchParams.delete("path");

    return app.fetch(new Request(url, request), loadAppEnv());
  },
};
