/**
 * The pinned chapter 11 timing charts (CR appendix: the Corp turn 11.2, the
 * Runner turn 11.3, a run 11.4, a breach 11.5, an access 11.6), read from
 * `vendor/cr-data/data/timing-structures.json`. Shared by
 * tests/timing-chart.test.ts, which checks the graph against them, and the
 * timing walk (tests/playout/timing-walk.ts, CR audit tool 1.15), which checks
 * the steps the engine really passes through. Not a test file: vitest only
 * runs `*.test.ts`.
 */
import { readFileSync } from "node:fs";
import { vendorPathForPinFile } from "../src/index.js";

export interface ChartNode {
  id: string;
  number: string;
  parent_id: string | null;
  child_ids: string[];
  text_plain: string;
}

export const CHARTS = ["11.2", "11.3", "11.4", "11.5", "11.6"] as const;
export type Chart = (typeof CHARTS)[number];

/** Every node of the pinned timing structures. */
export function loadChartNodes(): ChartNode[] {
  return JSON.parse(
    readFileSync(vendorPathForPinFile("data/timing-structures.json"), "utf8"),
  ) as ChartNode[];
}

/**
 * The lines of chart `prefix` in chart order: each phase's lines depth first.
 * A line with children (a question, or a phase heading) is listed only when
 * `keep` says so; a line with no children always is.
 */
export function chartNodes(
  nodes: readonly ChartNode[],
  prefix: Chart,
  keep: (node: ChartNode) => boolean,
): ChartNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const phases = nodes
    .filter((node) => new RegExp(`^${prefix}_\\d+$`).test(node.number))
    .sort((a, b) =>
      a.number.localeCompare(b.number, undefined, { numeric: true }),
    );
  const out: ChartNode[] = [];
  const visit = (node: ChartNode) => {
    if (node.child_ids.length === 0 || keep(node)) out.push(node);
    for (const childId of node.child_ids) {
      const child = byId.get(childId);
      if (!child) throw new Error(`Missing timing child ${childId}`);
      visit(child);
    }
  };
  for (const phase of phases) visit(phase);
  return out;
}
