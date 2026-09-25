#!/usr/bin/env node
/**
 * Vendored fetch of Comprehensive Rules JSON pinned to tag v26.03.
 * See data/cr-pin.json and README.md.
 */
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pin = JSON.parse(readFileSync(join(root, "data/cr-pin.json"), "utf8"));
const outDir = join(root, "vendor/cr-data");

mkdirSync(outDir, { recursive: true });

async function fetchFile(relPath) {
  const url = `${pin.rawBase}/${relPath}`;
  const dest = join(outDir, relPath.replace(/^data\//, ""));
  mkdirSync(dirname(dest), { recursive: true });
  process.stdout.write(`Fetching ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return dest;
}

const written = [];
for (const file of pin.files) {
  written.push(await fetchFile(file));
}

writeFileSync(
  join(outDir, "PIN.json"),
  JSON.stringify(
    {
      tag: pin.tag,
      repo: pin.repo,
      rawBase: pin.rawBase,
      fetchedAt: new Date().toISOString(),
      files: pin.files,
    },
    null,
    2,
  ) + "\n",
);

console.log(`Pinned CR data ${pin.tag} → ${outDir}`);
for (const f of written) console.log(`  ${f}`);
