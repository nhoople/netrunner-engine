/**
 * The CR section owner table (CR audit tool 1.13, tests/cr-section-owners.json)
 * and who owns a given rule. Shared by tests/cr-section-owners.test.ts
 * (tool 1.13) and tests/cr-subrule-coverage.test.ts (tool 1.17). Not a test
 * file: vitest only runs `*.test.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./cr-citations.js";

export const OWNER_TABLE_PATH = join(ROOT, "tests/cr-section-owners.json");

export type Entry = {
  owner: string;
  subrules?: Record<string, string>;
  why: string;
};

export type OwnerTable = {
  crTag: string;
  sections: Record<string, Entry>;
};

export function loadOwnerTable(): OwnerTable {
  return JSON.parse(readFileSync(OWNER_TABLE_PATH, "utf8")) as OwnerTable;
}

export const OWNER =
  /^(?:area (?:[1-9]|1[0-6])|fidelity|standardization|reference|none)$/;

/** Owners in report order: areas 1–16, the earlier programs, reference, none. */
export function ownerRank(owner: string): number {
  const area = /^area (\d+)$/.exec(owner);
  if (area) return Number(area[1]);
  return (
    100 + ["fidelity", "standardization", "reference", "none"].indexOf(owner)
  );
}

/** The section (`n.n`) a rule number belongs to, or null for a chapter. */
export function sectionOf(number: string): string | null {
  return /^(\d+\.\d+)(?![\d])/.exec(number)?.[1] ?? null;
}

/**
 * Whether rule `number` is `parent` or under it: 8.5.10 is not under 8.5.1,
 * and 8.5.1b is.
 */
export function within(number: string, parent: string): boolean {
  return (
    number === parent ||
    number.startsWith(`${parent}.`) ||
    (/\d$/.test(parent) &&
      new RegExp(`^${parent.replace(/\./g, "\\.")}[a-z]`).test(number))
  );
}

/**
 * The owner of rule `number`: the owner of the split subrule it is or sits
 * under, else its section's owner, else `(missing)` (tool 1.13 fails on a
 * section missing from the table).
 */
export function ownerOf(table: OwnerTable, number: string): string {
  const section = sectionOf(number);
  const entry = section ? table.sections[section] : undefined;
  if (!entry) return "(missing)";
  for (const [sub, owner] of Object.entries(entry.subrules ?? {})) {
    if (within(number, sub)) return owner;
  }
  return entry.owner;
}
