import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { extname, join } from "node:path";

const root = new URL("../", import.meta.url);
const dist = new URL("../public/", import.meta.url);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && [".html", ".js"].includes(extname(entry.name)) && entry.name !== "package-lock.json") {
    await cp(new URL(entry.name, root), new URL(entry.name, dist));
  }
}

await cp(new URL("assets", root), new URL("assets", dist), { recursive: true });

console.log(`Static assets prepared in ${join(new URL(dist).pathname)}`);
