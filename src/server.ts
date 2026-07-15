import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import app from "./index.js";
import { loadAppEnv } from "./lib/env.js";

const local = new Hono();

local.get("/", (c) => c.redirect("/Home.dc.html", 302));
local.use("*", serveStatic({ root: "./public" }));
local.route("/", app);
local.notFound((c) => c.text("ページが見つかりません。", 404));

const port = Number(process.env.PORT || 8000);
const env = loadAppEnv();

serve({
  fetch: (request) => local.fetch(request, env),
  port,
}, ({ port: listeningPort }) => {
  console.log(`Local server: http://localhost:${listeningPort}`);
});
