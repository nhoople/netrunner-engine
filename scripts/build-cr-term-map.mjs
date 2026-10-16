#!/usr/bin/env node
/**
 * Merge pinned CR terms.json with hand-maintained statuses in data/cr-term-map.json.
 * Prefer sibling checkout, then vendor/cr-data/data/terms.json.
 *
 * Usage: node scripts/build-cr-term-map.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mapPath = join(root, "data/cr-term-map.json");
const candidates = [
  join(root, "../netrunner-comprehensive-rules-data/data/terms.json"),
  join(root, "vendor/cr-data/data/terms.json"),
];

const termsPath = candidates.find((p) => existsSync(p));
if (!termsPath) {
  console.error("terms.json not found. Clone CR data or add terms.json to vendor.");
  process.exit(1);
}

const terms = JSON.parse(readFileSync(termsPath, "utf8"));
const prev = existsSync(mapPath)
  ? JSON.parse(readFileSync(mapPath, "utf8"))
  : { terms: [] };
const prevBy = new Map(
  (prev.terms ?? []).map((e) => [`${e.type}\0${e.term.toLowerCase()}`, e]),
);

const seen = new Map();
for (const t of terms) {
  const text = (t.text ?? "").trim();
  const type = t.type ?? "term";
  const key = `${type}\0${text.toLowerCase()}`;
  if (!seen.has(key)) seen.set(key, { term: text, type });
}

const entries = [...seen.values()]
  .sort((a, b) => a.type.localeCompare(b.type) || a.term.localeCompare(b.term))
  .map((base) => {
    const prevE = prevBy.get(`${base.type}\0${base.term.toLowerCase()}`) ?? {};
    let status = prevE.status;
    if (!status) status = base.type === "subtype" ? "card-text" : "unmodeled";
    return {
      term: base.term,
      type: base.type,
      status,
      code: prevE.code ?? [],
      aliasesBanned: prevE.aliasesBanned ?? [],
      notes: prevE.notes ?? "",
      cite: prevE.cite ?? "",
    };
  });

const out = {
  metadata: {
    crPin: "v26.03",
    source: termsPath,
    termCount: entries.length,
    notes:
      "Hand-maintain status/code/aliasesBanned. Re-run after CR pin bumps to pick up new terms.",
  },
  terms: entries,
};

writeFileSync(mapPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${entries.length} terms → data/cr-term-map.json`);
