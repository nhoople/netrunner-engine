/**
 * Kind and phrase check (CR audit tool 1.12).
 *
 * Card text wins over the model (CR 1.2.1), so a card's Effect IR should not
 * name an effect its printed text never mentions. This test pairs effect kinds
 * with the phrases their printed text should hold (`end_the_run` and "end the
 * run", a `net` kind and "net damage") and checks every card in the pinned
 * catalog against `vendor/cards-data/printed/<id>.json`. It generalizes the
 * stale-text audit (meta repo `docs/plans/done/stale-text-audit.md`), which
 * caught Shiro and Inazuma by hand.
 *
 * Which kinds a card has:
 *   - every `{ "kind": k }` in the card's JSON whose `k` is in
 *     `KNOWN_PRIMITIVE_KINDS`, except the `gain_credits` 0 placeholder that
 *     choice options use for "do nothing";
 *   - every kind a card flag's reader builds, for each boolean flag the loaded
 *     `CardDef` sets to `true`. The flag-to-kind map is
 *     tool 1.10's (`tests/baselines/card-flags.json`, `flagKinds`), so a flag
 *     can't hide a kind the way Tāo Salonga's did.
 *
 * Which phrase a kind needs (`PHRASE_RULES`): a rule matches a run of words in
 * the kind's snake_case name (`net`, `end_the_run`, `bad_publicity`), so a
 * one-off kind is checked by the words it is named with, the same as a general
 * kind. A few kinds are matched by their full name instead (`KIND_PHRASES`).
 * The printed text (every face of a flip identity) is lower-cased with HTML
 * tags removed; `[trash]`,
 * `[credit]` and `[click]` stay in it, so `[trash]` counts as "trash".
 *
 * Polarity (`POLARITY_RULES`): a kind named for the "not" branch (`unless`,
 * `else`) needs a printed "unless", "if … do not", "otherwise" or "instead"; a
 * kind named for the "do" branch (`if_do`) needs a printed "if you do" or "if
 * they do"; and an ability `text` that says "if you do" or "if you do not"
 * needs the same polarity in the printed text.
 *
 * Left out on purpose (no word in the name gives a phrase every printing uses):
 *   - structure and control: `seq`, `choose`, `choose_exactly_n`, `if`,
 *     `prevent` follow-ups, `_resolve`/`_pick`/`_continue` follow-ups the
 *     engine builds during a choice;
 *   - zone words alone (`hq`, `rd`, `grip`, `stack`, `heap`, `archives`,
 *     `server`, `root`): a printed ability often names the card or the action,
 *     not the zone it comes from ("install a program", "draw 1 card");
 *   - `may`: a "may" choice is often printed as a cost or a "choose"; polarity
 *     covers the yes/no branches that matter;
 *   - `lose_credits`: it also models paying a cost ("pay 2[credit]"), so any
 *     phrase that fits every use is "[credit]", which `credits` already checks;
 *   - pack-code and title words (`cotc`, `tdatd`, `dtwn`, card titles): CLAUDE.md
 *     retires them, and they name no procedure;
 *   - `n`, `x`, numbers, `one`, `two`, `all`, `any`, `other`, `self`, `source`,
 *     `this`, `then`, `per`, `up`, `to`, `from`, `on`, `of`, `with`, `for`, and
 *     the other joining words.
 *
 * Baseline: tests/baselines/printed-phrases.json, keyed by card id. It only
 * shrinks:
 *   - a new hit fails (fix the model, or the phrase rule if the rule is wrong);
 *   - a hit that is gone fails until the baseline is regenerated:
 *       UPDATE_PRINTED_PHRASES=1 npx vitest run tests/printed-phrases.test.ts
 *   - regeneration refuses growth unless ALLOW_PRINTED_PHRASE_GROWTH=1 is set
 *     too, so a new hit is a reviewed change.
 * The printed-text sweep removes each card it checks and finds matching, so
 * this check then guards that card against a regression.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  cardsDataPresent,
  CARD_STORAGE_DIRS,
  loadCardCatalog,
} from "../src/cards/load.js";
import { KNOWN_PRIMITIVE_KINDS } from "../src/effects/ir.js";

const CARDS_PIN = "v1.147.25";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARDS_DIR = join(ROOT, "vendor/cards-data");
const PRINTED_DIR = join(CARDS_DIR, "printed");
const FLAGS_PATH = join(ROOT, "tests/baselines/card-flags.json");
const BASELINE_PATH = join(ROOT, "tests/baselines/printed-phrases.json");
const UPDATE = process.env.UPDATE_PRINTED_PHRASES === "1";
const ALLOW_GROWTH = process.env.ALLOW_PRINTED_PHRASE_GROWTH === "1";

// ---------------------------------------------------------------------------
// The table

/** A phrase the printed text must hold: a label for reports and its pattern. */
interface Phrase {
  label: string;
  re: RegExp;
}

const p = (label: string, re: RegExp): Phrase => ({ label, re });

const NET = p("net damage", /net damage/);
const MEAT = p("meat damage", /meat damage/);
const CORE = p("core damage", /core damage|brain damage/);
const ETR = p("end the run", /end(s|ing)? (the|that|this) run/);
const TRASH = p("trash", /trash/);
const TAG = p("tag", /\btag/);
const BAD_PUB = p("bad publicity", /bad publicity/);
const ADVANCE = p("advance", /advanc/);
const STRENGTH = p("strength", /strength/);
const RFG = p("remove from the game", /from the game|remove .* game/);
const ACCESS = p("access or breach", /access|breach/);

/**
 * Word runs in a kind's name and the phrase each needs. Words are matched
 * whole: `net` matches `deal_net_damage` and `may_corp_pay_net`, not
 * `netchip`. Every rule whose words appear applies.
 */
const PHRASE_RULES: Array<[string, Phrase]> = [
  // Damage and the run
  ["net", NET],
  ["meat", MEAT],
  ["core", CORE],
  ["brain", CORE],
  ["end_the_run", ETR],
  ["etr", ETR],
  ["jack_out", p("jack out", /jack out/)],
  ["bypass", p("bypass", /bypass/)],
  ["breach", ACCESS],
  ["access", ACCESS],
  ["steal", p("steal", /steal/)],
  ["score", p("score", /scor/)],
  ["forfeit", p("forfeit", /forfeit/)],
  // Tags, bad publicity, traces, psi
  ["tag", TAG],
  ["tags", TAG],
  ["bad_publicity", BAD_PUB],
  ["trace", p("trace", /trace/)],
  ["psi", p("psi game", /psi|secretly/)],
  // Card movement
  ["trash", TRASH],
  ["rfg", RFG],
  ["install", p("install", /install/)],
  ["draw", p("draw", /draw/)],
  ["shuffle", p("shuffle", /shuffl/)],
  ["search", p("search", /search/)],
  ["reveal", p("reveal", /reveal/)],
  ["look", p("look at", /look at|reveal/)],
  ["swap", p("swap", /swap/)],
  ["host", p("host", /host/)],
  ["discard", p("discard", /discard/)],
  ["expose", p("expose", /expose/)],
  ["sabotage", p("sabotage", /sabotage/)],
  ["purge", p("purge", /purge/)],
  // Rezzing
  ["rez", p("rez", /\brez/)],
  ["derez", p("derez", /derez/)],
  ["flip", p("flip", /flip|face ?up|face ?down/)],
  // Counters and stats
  ["virus", p("virus", /virus/)],
  ["power", p("power counter", /power/)],
  ["agenda_counter", p("agenda counter", /agenda counter/)],
  ["agenda_counters", p("agenda counter", /agenda counter/)],
  ["advancement", ADVANCE],
  ["advancements", ADVANCE],
  ["advance", ADVANCE],
  ["strength", STRENGTH],
  ["pump", STRENGTH],
  ["weaken", STRENGTH],
  ["charge", p("charge", /charge/)],
  // Credits and clicks
  ["credits", p("[credit]", /\[credit\]|credit/)],
  ["gain_credits", p("gain or take", /gain|take/)],
  ["clicks", p("[click]", /\[click\]|click/)],
  ["click", p("[click]", /\[click\]|click/)],
  // Card types and subroutines
  ["program", p("program", /program|icebreaker|breaker/)],
  ["programs", p("program", /program|icebreaker|breaker/)],
  ["hardware", p("hardware", /hardware|console/)],
  ["resource", p("resource", /resource/)],
  ["operation", p("operation", /operation/)],
  ["subroutine", p("subroutine", /subroutine/)],
  ["subroutines", p("subroutine", /subroutine/)],
  ["break", p("break", /break|broken/)],
];

/** Kinds matched by their whole name. These add to the word rules. */
const KIND_PHRASES: Record<string, Phrase[]> = {
  end_the_run: [ETR],
  deal_net_damage: [NET],
  give_tags: [TAG],
  remove_tags: [TAG],
  give_bad_publicity: [BAD_PUB],
  remove_bad_publicity: [BAD_PUB],
  add_power_counter: [p("power counter", /power counter/)],
  add_virus_counter: [p("virus counter", /virus counter/)],
  add_agenda_counter: [p("agenda counter", /agenda counter/)],
  place_advancements: [ADVANCE],
  place_hosted_credits: [p("place or load [credit]", /\[credit\]/)],
  take_hosted_credits: [p("take [credit]", /\[credit\]/)],
  trash_self: [TRASH],
  rfg_self: [RFG],
  identify_mark: [p("mark", /\bmark\b/)],
  play_psi_game: [p("psi game", /psi|secretly/)],
  bonus_access: [ACCESS],
  dividends: [p("dividends", /dividends|agenda counter/)],
};

const NOT_BRANCH = p(
  'unless / "if … do not" / otherwise / instead',
  /unless|if (you|they|the runner|the corp|he|she|it)( does| do|'s)? ?(not|n't)\b|if not\b|otherwise|instead|must [^.]* or /,
);
const DO_BRANCH = p(
  '"if you do" / "if they do"',
  /if (you|they|the runner|the corp|so)\b(?! (do|does) not)/,
);

/** Word runs that name a polarity branch, and the phrase each needs. */
const POLARITY_RULES: Array<[string, Phrase]> = [
  ["unless", NOT_BRANCH],
  ["else", NOT_BRANCH],
  ["if_do", DO_BRANCH],
];

// ---------------------------------------------------------------------------
// Matching

/**
 * Word runs that ask for nothing, matched before the rules: they name a
 * filter or a stat, not the procedure. `trace_strength` is the trace's base
 * strength ("trace[X]"), a subtype filter names the subtype ("a
 * connection"), not "resource", and `source_strength` reads the card's own
 * strength, which its printed text may give as X.
 */
const NEUTRAL_RUNS: Array<[string, string]> = [
  ["trace_strength", "trace"],
  ["resource_with_subtype", "with_subtype"],
  ["source_strength", "source"],
];

/**
 * Every phrase the printed text of a card with `kind` must hold. Words from
 * the card's own title (`titleWords`, from its id) ask for nothing: a kind
 * named after its card (`brain_rewiring_…`, `power_shutdown`) breaks the
 * naming rule in CLAUDE.md but names no effect.
 */
export function phrasesFor(
  kind: string,
  titleWords: ReadonlySet<string> = new Set(),
): Phrase[] {
  const out = new Map<string, Phrase>();
  for (const ph of KIND_PHRASES[kind] ?? []) out.set(ph.label, ph);
  let name = `_${kind}_`;
  for (const [run, keep] of NEUTRAL_RUNS) {
    name = name.split(`_${run}_`).join(`_${keep}_`);
  }
  const rules = [...PHRASE_RULES, ...POLARITY_RULES];
  for (const [words, ph] of rules) {
    if (words.split("_").every((w) => titleWords.has(w))) continue;
    if (name.includes(`_${words}_`)) out.set(ph.label, ph);
  }
  return [...out.values()];
}

export function normalizePrinted(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/[’‘]/g, "'")
    .toLowerCase();
}

/** "if you do" (positive) and "if you do not" (negative) in a piece of text. */
function polarities(text: string): { pos: boolean; neg: boolean } {
  const t = normalizePrinted(text);
  const neg = /if (you|they) (do not|don't)\b/.test(t);
  const pos = /if (you|they) do\b(?! not)/.test(t);
  return { pos, neg };
}

// ---------------------------------------------------------------------------
// Corpus

interface CardKinds {
  id: string;
  kinds: Map<string, string>; // kind -> where: "ir" or "flag <name>"
  abilityTexts: string[];
}

function isPlaceholder(rec: Record<string, unknown>): boolean {
  if (rec.kind !== "gain_credits" || rec.amount !== 0) return false;
  return Object.keys(rec).every(
    (k) => k === "kind" || k === "amount" || k === "side",
  );
}

function collect(
  node: unknown,
  kinds: Map<string, string>,
  texts: string[],
): void {
  if (Array.isArray(node)) {
    for (const v of node) collect(v, kinds, texts);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  if (
    typeof rec.kind === "string" &&
    KNOWN_PRIMITIVE_KINDS.has(rec.kind) &&
    !isPlaceholder(rec) &&
    !kinds.has(rec.kind)
  ) {
    kinds.set(rec.kind, "ir");
  }
  if (typeof rec.text === "string") texts.push(rec.text);
  for (const v of Object.values(rec)) collect(v, kinds, texts);
}

function cardFiles(): string[] {
  return CARD_STORAGE_DIRS.flatMap((dir) =>
    readdirSync(join(CARDS_DIR, dir))
      .filter((f) => f.endsWith(".json"))
      .map((f) => join(CARDS_DIR, dir, f)),
  ).sort();
}

/**
 * Boolean flag -> the kinds its readers build, from tool 1.10. Number fields
 * (`rezCost`, `trashCost`, `strengthPerAdvancement`) are printed values, not
 * flags that hide a procedure, so they are left out, as in tool 1.2(c).
 * `gain_credits` is left out of a flag's kinds: a flag reader that builds it
 * builds the `gain_credits` 0 "decline" option of a choice, and the map does
 * not keep the amount.
 */
function flagKinds(): Record<string, string[]> {
  const inv = JSON.parse(readFileSync(FLAGS_PATH, "utf8")) as {
    flagKinds: Record<string, string[]>;
    entries: Record<string, { cardDef: string | null; schema: string | null }>;
  };
  const out: Record<string, string[]> = {};
  for (const [flag, kinds] of Object.entries(inv.flagKinds)) {
    const e = inv.entries[flag];
    const boolean =
      e?.cardDef === "boolean" ||
      (e?.cardDef === null && e?.schema === "boolean");
    const built = kinds.filter((k) => k !== "gain_credits");
    if (boolean && built.length > 0) out[flag] = built;
  }
  return out;
}

function loadCorpus(): CardKinds[] {
  const catalog = loadCardCatalog() as unknown as Map<
    string,
    Record<string, unknown>
  >;
  const fk = flagKinds();
  const out: CardKinds[] = [];
  for (const file of cardFiles()) {
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      id: string;
      abilities?: unknown;
    };
    const kinds = new Map<string, string>();
    const abilityTexts: string[] = [];
    collect(raw.abilities ?? [], kinds, abilityTexts);
    const def = catalog.get(raw.id);
    for (const [flag, built] of Object.entries(fk)) {
      const v = def?.[flag];
      if (v === true) {
        for (const k of built) if (!kinds.has(k)) kinds.set(k, `flag ${flag}`);
      }
    }
    out.push({ id: raw.id, kinds, abilityTexts });
  }
  return out;
}

function printedText(id: string): string | undefined {
  const path = join(PRINTED_DIR, `${id}.json`);
  if (!existsSync(path)) return undefined;
  const j = JSON.parse(readFileSync(path, "utf8")) as {
    text?: string;
    faces?: Array<{ text?: string }>;
  };
  // A flip identity prints its other faces under `faces`.
  const faces = (j.faces ?? []).map((f) => f.text ?? "");
  return normalizePrinted([j.text ?? "", ...faces].join("\n"));
}

// ---------------------------------------------------------------------------
// Report

interface Report {
  cardsPin: string;
  counts: {
    cards: number;
    cardsWithHits: number;
    hits: number;
    kindsInCorpus: number;
    kindsCovered: number;
    phraseRules: number;
    kindPhrases: number;
  };
  /** card id -> sorted hits, each `<kind> [flag <name>]: no "<phrase>"`. */
  entries: Record<string, string[]>;
}

export function checkCard(
  card: CardKinds,
  printed: string | undefined,
): string[] {
  if (printed === undefined) return ["no printed text"];
  const titleWords = new Set(card.id.split("-"));
  const hits = new Set<string>();
  for (const [kind, where] of card.kinds) {
    const via = where === "ir" ? "" : ` [${where}]`;
    for (const ph of phrasesFor(kind, titleWords)) {
      if (!ph.re.test(printed)) hits.add(`${kind}${via}: no "${ph.label}"`);
    }
  }
  const printedPol = polarities(printed);
  for (const text of card.abilityTexts) {
    const pol = polarities(text);
    if (pol.neg && !printedPol.neg) {
      hits.add('ability text: "if you do not", printed has no "do not" branch');
    }
    if (pol.pos && !printedPol.pos) {
      hits.add('ability text: "if you do", printed has no "do" branch');
    }
  }
  return [...hits].sort();
}

function buildReport(): Report {
  const corpus = loadCorpus();
  const entries: Record<string, string[]> = {};
  const kindsInCorpus = new Set<string>();
  for (const card of corpus) {
    for (const k of card.kinds.keys()) kindsInCorpus.add(k);
    const hits = checkCard(card, printedText(card.id));
    if (hits.length > 0) entries[card.id] = hits;
  }
  const covered = [...kindsInCorpus].filter((k) => phrasesFor(k).length > 0);
  const sortedEntries = Object.fromEntries(
    Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  return {
    cardsPin: CARDS_PIN,
    counts: {
      cards: corpus.length,
      cardsWithHits: Object.keys(entries).length,
      hits: Object.values(entries).reduce((n, xs) => n + xs.length, 0),
      kindsInCorpus: kindsInCorpus.size,
      kindsCovered: covered.length,
      phraseRules: PHRASE_RULES.length + POLARITY_RULES.length,
      kindPhrases: Object.keys(KIND_PHRASES).length,
    },
    entries: sortedEntries,
  };
}

const serialize = (r: Report): string => `${JSON.stringify(r, null, 2)}\n`;

function readBaseline(): Report | undefined {
  if (!existsSync(BASELINE_PATH)) return undefined;
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Report;
}

/** `card: hit` strings in `now` that `before` lacks. */
function added(now: Report, before: Report): string[] {
  const out: string[] = [];
  for (const [id, hits] of Object.entries(now.entries)) {
    const had = new Set(before.entries[id] ?? []);
    for (const h of hits) if (!had.has(h)) out.push(`${id}: ${h}`);
  }
  return out;
}

// ---------------------------------------------------------------------------

describe("kind and phrase check (CR audit tool 1.12)", () => {
  let report: Report;
  let baseline: Report | undefined;

  beforeAll(() => {
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertCardsPinnedTag(CARDS_PIN);
    report = buildReport();
    baseline = readBaseline();
  }, 300_000);

  it("reads word runs in kind names", () => {
    expect(phrasesFor("end_the_run").map((x) => x.label)).toEqual([
      "end the run",
    ]);
    expect(phrasesFor("may_corp_pay_net").map((x) => x.label)).toContain(
      "net damage",
    );
    expect(phrasesFor("seq")).toEqual([]);
    expect(phrasesFor("give_tags").map((x) => x.label)).toEqual(["tag"]);
    // whole words only
    expect(phrasesFor("netchip_host").map((x) => x.label)).toEqual(["host"]);
    // a card's own title words ask for nothing
    expect(
      phrasesFor("power_shutdown", new Set(["power", "shutdown"])),
    ).toEqual([]);
    // neutral runs: a trace's base strength is "trace[X]"
    expect(
      phrasesFor("trace_strength_equal_source_advancements").map(
        (x) => x.label,
      ),
    ).toEqual(["trace", "advance"]);
  });

  it("flags a kind its printed text never names", () => {
    const card: CardKinds = {
      id: "test",
      kinds: new Map([
        ["end_the_run", "ir"],
        ["deal_net_damage", "flag someFlag"],
      ]),
      abilityTexts: [],
    };
    expect(
      checkCard(card, normalizePrinted("[subroutine] End the run.")),
    ).toEqual(['deal_net_damage [flag someFlag]: no "net damage"']);
  });

  it("flags polarity: Shiro's old model against its printed text", () => {
    // Before cards v1.147.12 Shiro's second subroutine said "If you do, do 1
    // net damage" (stale-text audit). Printed: "If you do not, the Runner
    // breaches R&D."
    const printed = normalizePrinted(
      "[subroutine] You may pay 1[credit]. If you do not, the Runner breaches R&D.",
    );
    const card: CardKinds = {
      id: "shiro",
      kinds: new Map([["may_corp_pay_net", "ir"]]),
      abilityTexts: ["You may pay 1[credit]. If you do, do 1 net damage."],
    };
    expect(checkCard(card, printed)).toEqual([
      'ability text: "if you do", printed has no "do" branch',
      'may_corp_pay_net: no "net damage"',
    ]);
    const unlessCard: CardKinds = {
      id: "x",
      kinds: new Map([["unless", "ir"]]),
      abilityTexts: [],
    };
    expect(checkCard(unlessCard, printed)).toEqual([]);
    expect(checkCard(unlessCard, normalizePrinted("Do 1 net damage."))).toEqual(
      [`unless: no "${NOT_BRANCH.label}"`],
    );
  });

  it("reads kinds that card flags build (1.10 map)", () => {
    const corpus = loadCorpus();
    const viaFlag = corpus.filter((c) =>
      [...c.kinds.values()].some((w) => w.startsWith("flag ")),
    );
    expect(viaFlag.length).toBeGreaterThan(0);
  });

  it("checks every card that has a printed file", () => {
    expect(report.counts.cards).toBeGreaterThan(2000);
    expect(report.counts.kindsCovered).toBeGreaterThan(0);
  });

  const expectNoGrowth = (): void => {
    if (!baseline || ALLOW_GROWTH) return;
    expect(
      added(report, baseline),
      "new kind/phrase hits. Fix the model (CR 1.2.1: card text wins) or the " +
        "phrase rule; or rerun with UPDATE_PRINTED_PHRASES=1 " +
        "ALLOW_PRINTED_PHRASE_GROWTH=1 and explain why in the PR",
    ).toEqual([]);
  };

  it("only shrinks: no new hit", () => {
    if (!baseline && !UPDATE) {
      throw new Error(
        `Missing ${relative(ROOT, BASELINE_PATH)}; run with UPDATE_PRINTED_PHRASES=1`,
      );
    }
    expectNoGrowth();
  });

  it("matches tests/baselines/printed-phrases.json", () => {
    const text = serialize(report);
    if (UPDATE) {
      expectNoGrowth();
      writeFileSync(BASELINE_PATH, text);
      return;
    }
    expect(
      baseline,
      "missing baseline; run with UPDATE_PRINTED_PHRASES=1",
    ).toBeDefined();
    expect(
      added(baseline!, report),
      "hits left the report; regenerate with UPDATE_PRINTED_PHRASES=1 npx vitest run tests/printed-phrases.test.ts",
    ).toEqual([]);
    expect(
      text,
      "report drifted from the baseline; regenerate with UPDATE_PRINTED_PHRASES=1 npx vitest run tests/printed-phrases.test.ts",
    ).toBe(serialize(baseline!));
  });
});
