import { copyFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFlag = process.argv.indexOf("--outdir");
const outDir = path.resolve(repositoryRoot, outFlag >= 0 ? process.argv[outFlag + 1] ?? "" : "dist");
await mkdir(outDir, { recursive: true });

async function buildClient(entryPoint, format = "iife") {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "browser",
    format,
    target: ["es2022"],
    minify: true,
    legalComments: "eof",
    write: false,
  });
  const output = result.outputFiles?.[0]?.text;
  if (!output) throw new Error(`Client build did not produce JavaScript for ${entryPoint}.`);
  return output;
}
const [clientJs, hubClientJs, html, styles, hubHtml, hubStyles, faviconSvg] = await Promise.all([
  buildClient(path.join(repositoryRoot, "src/client.ts")),
  buildClient(path.join(repositoryRoot, "src/hub-client.ts")),
  readFile(path.join(repositoryRoot, "src/index.html"), "utf8"),
  readFile(path.join(repositoryRoot, "src/styles.css"), "utf8"),
  readFile(path.join(repositoryRoot, "src/hub.html"), "utf8"),
  readFile(path.join(repositoryRoot, "src/hub.css"), "utf8"),
  readFile(path.join(repositoryRoot, "src/favicon.svg"), "utf8"),
]);

await build({
  entryPoints: [path.join(repositoryRoot, "src/server.ts")],
  outfile: path.join(outDir, "server.mjs"),
  absWorkingDir: repositoryRoot,
  bundle: true,
  platform: "node",
  format: "esm",
  target: ["node20.20"],
  minify: false,
  legalComments: "eof",
  packages: "bundle",
  plugins: [{
    name: "embedded-workbench-assets",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^#workbench-assets$/ }, () => ({ path: "assets", namespace: "workbench" }));
      pluginBuild.onLoad({ filter: /.*/, namespace: "workbench" }, () => ({
        contents: `export const HTML=${JSON.stringify(html)};export const CLIENT_JS=${JSON.stringify(clientJs)};export const STYLES_CSS=${JSON.stringify(styles)};export const HUB_HTML=${JSON.stringify(hubHtml)};export const HUB_CLIENT_JS=${JSON.stringify(hubClientJs)};export const HUB_STYLES_CSS=${JSON.stringify(hubStyles)};export const FAVICON_SVG=${JSON.stringify(faviconSvg)};`,
        loader: "js",
      }));
    },
  }],
});
await build({
  entryPoints: [path.join(repositoryRoot, "src/testing.ts")],
  outfile: path.join(outDir, "testing.mjs"),
  absWorkingDir: repositoryRoot,
  bundle: true,
  platform: "node",
  format: "esm",
  target: ["node20.20"],
  minify: false,
  legalComments: "eof",
  packages: "bundle",
});
await Promise.all([
  copyFile(path.join(repositoryRoot, "LICENSE"), path.join(outDir, "LICENSE")),
  copyFile(path.join(repositoryRoot, "THIRD_PARTY_NOTICES.md"), path.join(outDir, "THIRD_PARTY_NOTICES.md")),
]);
process.stdout.write(`Built ${path.relative(repositoryRoot, path.join(outDir, "server.mjs"))}, testing.mjs, and legal notices\n`);
