/**
 * Cited-rule change check (CR audit tool 1.19).
 *
 * tests/baselines/cr-cited-text.json keeps the text, at the CR pin, of every
 * rule node that src/ or a test cites. On a CR pin bump, each cited rule
 * whose text changed fails here until someone re-reads the code and tests
 * that cite it and updates its entry with a note. This automates the
 * "skim changed examples" step of docs/cr-pin-bump-checklist.md for the
 * rules the engine cites. New sections at a bump are tool 1.13
 * (tests/cr-section-owners.test.ts); a citation of a number that does not
 * exist at the pin is tool 1.5a (tests/rule-cite-map.test.ts).
 *
 * Citations come from the 1.5 citation map (tests/cr-citations.ts): in
 * src/, every literal `CR n.n…` and `CR.<key>` label use; in tests, every
 * literal `CR n.n…` in the `*.test.ts` files CI runs. A cited node's own
 * text is kept, not its sub-rules or examples: a citation of a section
 * changes when the section's title does.
 *
 * An entry is either the node's text (recorded at the pin, or when the
 * rule was first cited), or, once re-read after its text changed,
 *   { "text": "<new text>", "reread": "<pin tag>: <what was checked and found>" }
 *
 * Add entries for newly cited rules and drop ones no longer cited with
 *   UPDATE_CR_CITED_TEXT=1 npx vitest run tests/cr-cited-text.test.ts
 * That never changes an existing entry's text: a changed rule is re-read by
 * hand.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assertPinnedTag, crDataPresent } from "../src/index.js";
import {
  compareNumbers,
  type CrNode,
  literalCitations,
  loadNodes,
  rel,
  ROOT,
  scanCitations,
  testFiles,
} from "./cr-citations.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
});

const BASELINE_PATH = join(ROOT, "tests/baselines/cr-cited-text.json");
const SELF = "tests/cr-cited-text.test.ts";
const UPDATE = "UPDATE_CR_CITED_TEXT=1 npx vitest run " + SELF;

type Reread = { text: string; reread: string };
type Entry = string | Reread;

type Baseline = {
  _comment: string;
  crTag: string;
  rules: Record<string, Entry>;
};

/** `v26.09: <note>`: the pin the rule was re-read at, and what was found. */
const REREAD = /^v\d+\.\d+: \S/;

function entryText(e: Entry): string {
  return typeof e === "string" ? e : e.text;
}

/**
 * Rule number → the files that cite it (src/ and tests), for every number
 * that is a node at the pin. Numbers not at the pin are tool 1.5a's.
 */
function citedRules(byNumber: Map<string, CrNode>): Map<string, string[]> {
  const cited = new Map<string, Set<string>>();
  const add = (number: string, file: string): void => {
    if (!byNumber.has(number)) return;
    let files = cited.get(number);
    if (!files) cited.set(number, (files = new Set()));
    files.add(file);
  };
  for (const c of scanCitations()) add(c.number, c.file);
  for (const file of testFiles(SELF)) {
    const text = readFileSync(file, "utf8");
    for (const c of literalCitations(text)) {
      // `CR 11.2_3_d` names an appendix timing step, as in scanCitations.
      if (text[c.numberIndex + c.number.length] === "_") continue;
      add(c.number, rel(file));
    }
  }
  return new Map(
    [...cited]
      .sort(([a], [b]) => compareNumbers(a, b))
      .map(([n, files]) => [n, [...files].sort()]),
  );
}

/**
 * Cited rules whose entry no longer matches the node's text at the pin, as
 * one message each: what it was, what it is now, and who cites it.
 */
function changedRules(
  baseline: Baseline,
  byNumber: Map<string, CrNode>,
  cited: Map<string, string[]>,
  pinTag: string,
): string[] {
  const out: string[] = [];
  for (const [number, files] of cited) {
    const entry = baseline.rules[number];
    if (entry === undefined) continue; // missingEntries reports it
    const now = byNumber.get(number)!.text_plain;
    if (entryText(entry) === now) continue;
    out.push(
      `CR ${number} changed at ${pinTag}\n` +
        `  was: ${entryText(entry)}\n` +
        `  now: ${now}\n` +
        `  cited by: ${files.join(", ")}`,
    );
  }
  return out;
}

/** Entries that are neither plain text nor a re-read with a note. */
function malformedEntries(baseline: Baseline): string[] {
  const out: string[] = [];
  for (const [number, entry] of Object.entries(baseline.rules)) {
    if (typeof entry === "string") continue;
    const keys = Object.keys(entry ?? {}).sort();
    if (
      typeof entry?.text !== "string" ||
      typeof entry.reread !== "string" ||
      keys.join(",") !== "reread,text"
    ) {
      out.push(`${number}: an entry is a string or { "text", "reread" }`);
    } else if (!REREAD.test(entry.reread)) {
      out.push(
        `${number}: "reread" is "<pin tag>: <note>", such as ` +
          `"v26.09: re-read src/foo.ts; still follows the new text"`,
      );
    }
  }
  return out;
}

function sortedRules(rules: Record<string, Entry>): Record<string, Entry> {
  return Object.fromEntries(
    Object.entries(rules).sort(([a], [b]) => compareNumbers(a, b)),
  );
}

function writeBaseline(b: Baseline): void {
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ ...b, rules: sortedRules(b.rules) }, null, 2) + "\n",
  );
}

describe("cited CR rule text (CR audit 1.19)", () => {
  const nodes = loadNodes();
  const byNumber = new Map(nodes.map((n) => [n.number, n]));
  const pin = JSON.parse(
    readFileSync(join(ROOT, "vendor/cr-data/PIN.json"), "utf8"),
  ) as { tag: string };
  const cited = citedRules(byNumber);
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;

  if (process.env.UPDATE_CR_CITED_TEXT) {
    const rules: Record<string, Entry> = {};
    for (const number of cited.keys()) {
      rules[number] =
        baseline.rules[number] ?? byNumber.get(number)!.text_plain;
    }
    baseline.rules = rules;
    writeBaseline(baseline);
  }

  it("reads the cited rules at the pin", () => {
    expect(pin.tag).toBe("v26.03");
    expect(cited.size).toBeGreaterThan(500);
  });

  it("the baseline was last read at the CR pin", () => {
    expect(
      baseline.crTag,
      `the CR pin is ${pin.tag}: re-read every changed rule this test ` +
        `reports, then set "crTag" in tests/baselines/cr-cited-text.json`,
    ).toBe(pin.tag);
  });

  it("every cited rule has an entry, and every entry is cited", () => {
    const keys = Object.keys(baseline.rules);
    expect(
      [...cited.keys()].filter((n) => !(n in baseline.rules)),
      `newly cited rule(s) with no entry: run ${UPDATE}`,
    ).toEqual([]);
    expect(
      keys.filter((n) => !cited.has(n)),
      `rule(s) no longer cited: run ${UPDATE}`,
    ).toEqual([]);
    expect(keys, "entries are in rule order: run " + UPDATE).toEqual(
      Object.keys(sortedRules(baseline.rules)),
    );
  });

  it("every entry is the rule's text, or a re-read with a note", () => {
    expect(malformedEntries(baseline)).toEqual([]);
  });

  it("every cited rule's text matches the pin, or its entry is re-read", () => {
    expect(
      changedRules(baseline, byNumber, cited, pin.tag),
      "cited CR rule(s) whose text changed: re-read the code and tests that " +
        "cite each one against its new text, then set its entry in " +
        'tests/baselines/cr-cited-text.json to { "text": "<new text>", ' +
        `"reread": "${pin.tag}: <what you checked and found>" }. File a ` +
        "finding for any rule the engine no longer follows",
    ).toEqual([]);
  });

  it("a cited rule whose text changed at a CR pin bump fails until its entry is re-read", () => {
    // A copy of the pin with one cited rule's text edited, as a pin bump
    // that rewords CR 8.5.11 would bring.
    const number = "8.5.11";
    const node = byNumber.get(number)!;
    const edited = `${node.text_plain} (reworded at the next pin)`;
    const bumped = new Map(byNumber);
    bumped.set(number, { ...node, text_plain: edited });
    expect(cited.get(number)).toContain("src/timing/labels.ts");

    const changed = changedRules(baseline, bumped, cited, "v99.01");
    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain(`CR ${number} changed at v99.01`);
    expect(changed[0]).toContain(`now: ${edited}`);
    expect(changed[0]).toContain("cited by: ");
    expect(changed[0]).toContain("src/timing/labels.ts");

    // Only an entry re-read with a note clears it.
    const reread: Baseline = {
      ...baseline,
      rules: {
        ...baseline.rules,
        [number]: {
          text: edited,
          reread: "v99.01: re-read src/ and tests citing it; still follows",
        },
      },
    };
    expect(changedRules(reread, bumped, cited, "v99.01")).toEqual([]);
    expect(malformedEntries(reread)).toEqual([]);

    // A re-read with no note is not accepted.
    const noNote = {
      ...reread,
      rules: { ...reread.rules, [number]: { text: edited, reread: "" } },
    };
    expect(malformedEntries(noNote)).toHaveLength(1);
  });
});
