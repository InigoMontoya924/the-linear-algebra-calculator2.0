import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const publicRoot = join(root, "public");

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, "client"), { recursive: true });
await mkdir(join(dist, "server"), { recursive: true });
await cp(publicRoot, join(dist, "client"), { recursive: true });

const worker = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    if (env && env.ASSETS && typeof env.ASSETS.fetch === "function") {
      const assetUrl = new URL(pathname, url);
      const response = await env.ASSETS.fetch(new Request(assetUrl, request));
      if (response.status !== 404) return response;
    }
    return new Response("Not found", { status: 404 });
  }
};
`;

await writeFile(join(dist, "server", "index.js"), worker);

const html = await readFile(join(publicRoot, "index.html"), "utf8");
if (!html.includes("The Linear Algebra Calculator 2.0") || !html.includes("app.js")) {
  throw new Error("Product HTML is incomplete");
}

console.log("Built The Linear Algebra Calculator 2.0");
