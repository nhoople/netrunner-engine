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
      `${byStatus("promoted").length} promoted, ${byStatus("deferred").length} deferred, ` +
      `${byStatus("disagreement").length} disagreement. ` +
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
    "Not ported. Each deferred scenario is being classified against the pinned CR (CR audit tool 1.8): " +
      "`no-board` asserts jnet internals, UI, chat commands, log wording, or jnet's own source, so there is no rules reading to compare; " +
      "`agrees` means this engine already matches jnet and the CR; " +
      "`engine-bug` means the CR settles the point and this engine is wrong. " +
      "Full reasons and notes are in `tests/jnet/manifest.json`.",
  );
  lines.push("");
  lines.push("| Upstream file | Deferred | No board | Agrees | Engine bug | Not yet classified |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  const deferred = byStatus("deferred");
  const cls = (file, c) =>
    deferred.filter((e) => e.upstreamFile === file && (e.classification ?? null) === c).length;
  for (const file of filesInOrder) {
    const total = countFor(file, "deferred");
    if (total === 0) continue;
    lines.push(
      `| \`${file}\` | ${total} | ${cls(file, "no-board")} | ${cls(file, "agrees")} | ${cls(file, "engine-bug")} | ${cls(file, null)} |`,
    );
  }
  lines.push("");
  lines.push("### Disagreements (for a human decision)");
  lines.push("");
  lines.push(
    "jnet and this engine differ on a point the CR leaves silent or unclear. The engine is not changed to match jnet; each entry waits for a decision.",
  );
  lines.push("");
  const disagreements = byStatus("disagreement");
  if (disagreements.length === 0) {
    lines.push("None found among the classified scenarios so far.");
  } else {
    for (const e of disagreements) {
      lines.push(`- \`${e.key}\` (CR ${e.crCite}) — ${e.disagreementNote}`);
    }
  }
  lines.push("");
  lines.push("### Engine bugs found by classification");
  lines.push("");
  lines.push("The CR settles these and the engine is wrong. Each is listed under the Phase 3 area that owns the fix.");
  lines.push("");
  const bugs = deferred.filter((e) => e.classification === "engine-bug");
  for (const area of [...new Set(bugs.map((e) => e.engineBugArea))].sort((a, b) => a.localeCompare(b, "en", { numeric: true }))) {
    lines.push(`- **${area}**`);
    for (const e of bugs.filter((x) => x.engineBugArea === area)) {
      lines.push(`  - \`${e.key}\` (CR ${e.crCite}; ${e.classificationBasis}) — ${e.classificationNote}`);
    }
  }
  lines.push("");
  lines.push("### Not yet classified");
  lines.push("");
  const left = deferred.filter((e) => !e.classification);
  if (left.length === 0) {
    lines.push("Every deferred scenario is classified.");
  } else {
    lines.push(left.map((e) => `\`${e.key}\``).join(", "));
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
