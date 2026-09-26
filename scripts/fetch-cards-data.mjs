#!/usr/bin/env node
/**
 * Vendored fetch of card JSON pinned via data/cards-pin.json.
 * Prefers the tagged GitHub archive; falls back to a local cards-data checkout.
 * See README.md.
 */
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pin = JSON.parse(readFileSync(join(root, "data/cards-pin.json"), "utf8"));
const outDir = join(root, "vendor/cards-data");

function resolveLocalRoot() {
  if (process.env.CARDS_DATA_ROOT) return process.env.CARDS_DATA_ROOT;
  const candidates = [
    join(root, "../netrunner-cards-data"),
    "/home/ubuntu/repos/netrunner-cards-data",
    "/home/ubuntu/netrunner-cards-data",
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "data", "pool.json"))) return c;
  }
  return null;
}

function copyDataTree(srcDataDir) {
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(srcDataDir)) {
    const from = join(srcDataDir, name);
    const to = join(outDir, name);
    if (existsSync(to)) rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
  }
}

async function fetchFromArchive() {
  const url = pin.archiveUrl;
  process.stdout.write(`Fetching archive ${url}\n`);
  const res = await fetch(url, {
    headers: { "User-Agent": "netrunner-engine-fetch-cards" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const tmp = mkdtempSync(join(tmpdir(), "cards-data-"));
  const tgz = join(tmp, "cards.tgz");
  try {
    await pipeline(Readable.fromWeb(res.body), createWriteStream(tgz));
    execFileSync("tar", ["-xzf", tgz, "-C", tmp], { stdio: "inherit" });
    const entries = readdirSync(tmp).filter((n) => n !== "cards.tgz");
    if (entries.length !== 1) {
      throw new Error(`Expected one top-level dir in archive, got: ${entries.join(", ")}`);
    }
    const extracted = join(tmp, entries[0]);
    const dataDir = join(extracted, pin.dataPrefix ?? "data");
    if (!existsSync(join(dataDir, "pool.json"))) {
      throw new Error(`Archive missing ${pin.dataPrefix ?? "data"}/pool.json`);
    }
    if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
    copyDataTree(dataDir);
    return "archive";
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function fetchFromLocal(localRoot) {
  const dataDir = join(localRoot, pin.dataPrefix ?? "data");
  process.stdout.write(`Using local cards data: ${localRoot}\n`);
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  copyDataTree(dataDir);
  return "local";
}

function assertRequired() {
  for (const rel of pin.required ?? []) {
    const path = join(outDir, rel);
    if (!existsSync(path)) {
      throw new Error(`Missing required path after fetch: vendor/cards-data/${rel}`);
    }
  }
}

const localRoot = resolveLocalRoot();
let source;
// Prefer explicit CARDS_DATA_ROOT (local WIP / sibling checkout) over the pin archive.
if (process.env.CARDS_DATA_ROOT && localRoot) {
  source = fetchFromLocal(localRoot);
} else {
  try {
    source = await fetchFromArchive();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Archive fetch failed (${msg})\n`);
    if (!localRoot) {
      throw new Error(
        `Could not fetch pinned cards ${pin.tag} and no local checkout found. ` +
          `Create/publish ${pin.repo} @ ${pin.tag}, or set CARDS_DATA_ROOT.`,
      );
    }
    source = fetchFromLocal(localRoot);
  }
}

assertRequired();

writeFileSync(
  join(outDir, "PIN.json"),
  JSON.stringify(
    {
      tag: pin.tag,
      repo: pin.repo,
      rawBase: pin.rawBase,
      archiveUrl: pin.archiveUrl,
      source,
      fetchedAt: new Date().toISOString(),
      required: pin.required,
    },
    null,
    2,
  ) + "\n",
);

console.log(`Pinned cards data ${pin.tag} → ${outDir} (via ${source})`);
