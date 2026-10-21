/**
 * Every instruction leaf in the pinned timing appendix has a graph step.
 * Headings have children. "If yes, go to…" lines are redirects, not windows.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
  STEPS,
} from "../src/index.js";
import { startRun } from "../src/actions/run.js";
import { beginBreachAccess } from "../src/state/access.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.9");
});

type TimingNode = {
  id: string;
  kind: string;
  child_ids: string[];
  text_plain: string;
};

/**
 * These instructions run inside a neighboring step. They are not their own
 * parked window: run initiation sets the outermost position, and breach
 * turns Archives faceup and counts HQ or R&D accesses.
 */
const FOLDED_INTO_NEIGHBOR = [
  "sec_appendix_timing_structure_of_a_run_1_d",
  "sec_appendix_timing_structure_of_breaching_a_server_2",
  "sec_appendix_timing_structure_of_breaching_a_server_3",
];

function isRedirect(text: string): boolean {
  return /^(If (yes|no), go to |Return to |Go to )/.test(text);
}

describe("timing appendix", () => {
  it("gives every appendix instruction a graph step", () => {
    const nodes = JSON.parse(
      readFileSync(join(process.cwd(), "vendor/cr-data/timing-structures.json"), "utf8"),
    ) as TimingNode[];
    const stepIds = new Set(Object.values(STEPS).map((step) => step.stepId));
    const missing = nodes
      .filter((node) => node.kind === "timing_structure" && node.child_ids.length === 0)
      .filter((node) => !isRedirect(node.text_plain))
      .map((node) => node.id)
      .filter((id) => !stepIds.has(id))
      .sort();
    expect(missing).toEqual([...FOLDED_INTO_NEIGHBOR].sort());
  });

  it("cites the folded initiation and breach steps when they happen", () => {
    const positioned = createInitialState();
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    positioned.cards["ice-1"] = ice;
    positioned.servers.hq.ice = ["ice-1"];
    const started = startRun(positioned, "hq");
    expect(started.ok).toBe(true);
    expect(positioned.log.join("\n")).toMatch(/11\.4_1_d/);

    const archives = createInitialState();
    const facedown = instantiateCard("hedge-fund", "arch-1", "corp:archives");
    facedown.faceup = false;
    archives.cards["arch-1"] = facedown;
    archives.corp.discardPile = ["arch-1"];
    expect(startRun(archives, "archives").ok).toBe(true);
    beginBreachAccess(archives);
    expect(archives.cards["arch-1"]!.faceup).toBe(true);
    expect(archives.log.join("\n")).toMatch(/11\.5_2/);

    const hq = createInitialState();
    expect(startRun(hq, "hq").ok).toBe(true);
    beginBreachAccess(hq);
    expect(hq.log.join("\n")).toMatch(/11\.5_3/);
  });
});
