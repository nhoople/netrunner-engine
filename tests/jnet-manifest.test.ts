/**
 * Shape of tests/jnet/manifest.json (CR audit tool 1.8). The jnet ports
 * themselves run quarantined (`npm run test:jnet`); this native test only
 * keeps the classification of deferred scenarios well formed, and the
 * generated status in docs/jnet-test-ports.md in step with it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Entry {
  status: string;
  reason?: string;
  classification?: string;
  classificationBasis?: string;
  classificationNote?: string;
  crCite?: string;
  engineBugArea?: string;
  disagreementNote?: string;
}

const manifest = JSON.parse(
  readFileSync(new URL("./jnet/manifest.json", import.meta.url), "utf8"),
) as Record<string, Entry>;

const STATUSES = new Set(["ported", "adapted", "promoted", "deferred", "disagreement"]);
const CLASSES = new Set(["no-board", "agrees", "engine-bug"]);
const CITE = /^\d+\.\d+/;

describe("jnet manifest classification", () => {
  it("uses only the known statuses", () => {
    const bad = Object.entries(manifest).filter(([, e]) => !STATUSES.has(e.status));
    expect(bad.map(([k]) => k)).toEqual([]);
  });

  it("gives every disagreement a CR cite and a note on the two readings", () => {
    const bad = Object.entries(manifest)
      .filter(([, e]) => e.status === "disagreement")
      .filter(([, e]) => !CITE.test(e.crCite ?? "") || !(e.disagreementNote ?? "").trim());
    expect(bad.map(([k]) => k)).toEqual([]);
  });

  it("classifies deferred scenarios only with the known classes", () => {
    const bad = Object.entries(manifest).filter(
      ([, e]) =>
        e.classification !== undefined &&
        (e.status !== "deferred" || !CLASSES.has(e.classification)),
    );
    expect(bad.map(([k]) => k)).toEqual([]);
  });

  it("backs every agrees and engine-bug entry with a CR cite, a basis, and a note", () => {
    const bad = Object.entries(manifest)
      .filter(([, e]) => e.classification === "agrees" || e.classification === "engine-bug")
      .filter(
        ([, e]) =>
          !CITE.test(e.crCite ?? "") ||
          !["probe", "code"].includes(e.classificationBasis ?? "") ||
          !(e.classificationNote ?? "").trim() ||
          (e.classification === "engine-bug" && !(e.engineBugArea ?? "").trim()),
      );
    expect(bad.map(([k]) => k)).toEqual([]);
  });

  it("keeps the generated status in docs/jnet-test-ports.md current", () => {
    const generated = execFileSync(process.execPath, ["scripts/jnet-status.mjs"], {
      encoding: "utf8",
    }).trimEnd();
    const doc = readFileSync("docs/jnet-test-ports.md", "utf8");
    expect(doc).toContain(generated);
  });
});
