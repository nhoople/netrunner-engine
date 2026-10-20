/**
 * Regenerate the Status section of docs/jnet-test-ports.md from
 * tests/jnet/manifest.json, the single source of truth for port status.
 *
 *   node scripts/jnet-status.mjs           print the section to stdout
 *   node scripts/jnet-status.mjs --write   splice it into the document
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "tests/jnet/manifest.json");
const docPath = join(root, "docs/jnet-test-ports.md");
const BEGIN = "<!-- BEGIN GENERATED STATUS";
const END = "<!-- END GENERATED STATUS -->";

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const entries = Object.entries(manifest).map(([key, value]) => ({
  key,
  ...value,
}));

const byStatus = (status) => entries.filter((e) => e.status === status);
const filesInOrder = [...new Set(entries.map((e) => e.upstreamFile))];

function countFor(file, status) {
  return entries.filter((e) => e.upstreamFile === file && e.status === status)
    .length;
}

function buildSection() {
  const lines = [];
  lines.push(
    `${filesInOrder.length} upstream files considered, ${entries.length} scenarios recorded: ` +
      `${byStatus("ported").length} ported, ${byStatus("adapted").length} adapted, ` +
      `${byStatus("promoted").length} promoted, ${byStatus("deferred").length} deferred. ` +
      "The ports run quarantined through `npm run test:jnet`; the native suite stays the required gate.",
  );
  lines.push("");
  lines.push("### Running in the quarantine");
  lines.push("");
  lines.push("| Upstream file | Ported | Adapted | Promoted |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const file of filesInOrder) {
    const ported = countFor(file, "ported");
    const adapted = countFor(file, "adapted");
    const promoted = countFor(file, "promoted");
    if (ported + adapted + promoted === 0) continue;
    lines.push(`| \`${file}\` | ${ported} | ${adapted} | ${promoted} |`);
  }
  lines.push("");
  lines.push("### Promoted into the native suite");
  lines.push("");
  lines.push(
    "Scenarios whose ports exposed engine defects, each fixed in its own change with a native regression test:",
  );
  lines.push("");
  for (const e of entries.filter((x) => x.nativeFile)) {
    lines.push(
      `- "${e.nativeTitle}" in \`${e.nativeFile}\` (upstream \`${e.key}\`)`,
    );
  }
  lines.push("");
  lines.push("### Waiting on the cards data");
  lines.push("");
  const waiting = entries.filter((e) => e.blockedBy === "cards-data");
  if (waiting.length === 0) {
    lines.push("Nothing is waiting on the cards data.");
  } else {
    for (const e of waiting) {
      lines.push(`- \`${e.key}\` — ${e.blockedNote}`);
    }
  }
  lines.push("");
  lines.push("### Deferred");
  lines.push("");
  lines.push(
    "No equivalent board here: jnet-internal helpers, registry invariants, the chat-command system, and jnet's own source-code analysis. Full reasons are in `tests/jnet/manifest.json`.",
  );
  lines.push("");
  lines.push("| Upstream file | Deferred |");
  lines.push("| --- | ---: |");
  for (const file of filesInOrder) {
    const deferred = countFor(file, "deferred");
    if (deferred === 0) continue;
    lines.push(`| \`${file}\` | ${deferred} |`);
  }
  return lines.join("\n");
}

const section = buildSection();

if (!process.argv.includes("--write")) {
  console.log(section);
  process.exit(0);
}

const doc = readFileSync(docPath, "utf8");
const beginAt = doc.indexOf(BEGIN);
const endAt = doc.indexOf(END);
if (beginAt === -1 || endAt === -1 || endAt < beginAt) {
  throw new Error(`Generated-status markers not found in ${docPath}`);
}
const beginLineEnd = doc.indexOf("\n", beginAt);
const next =
  doc.slice(0, beginLineEnd + 1) + section + "\n" + doc.slice(endAt);
writeFileSync(docPath, next);
console.log(`Status section regenerated in ${docPath}`);
