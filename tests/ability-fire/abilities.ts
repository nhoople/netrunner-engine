/**
 * The abilities that ability fire coverage (CR audit tool 1.18) counts, and
 * the area each one is filed under. Not a test file.
 *
 * An ability is one CR 9.3 ability record with instructions on a supported
 * card: paid (9.3.7b), conditional (9.3.7c), play (9.3.7d) or subroutine
 * (9.3.7e). Static abilities (9.3.7a) carry a declaration, not
 * instructions, so nothing resolves them. Its key is `card-id#n`, where n is
 * its index in the card's `abilities`.
 *
 * Its area is the owner, in the CR section owner table (tool 1.13,
 * tests/cr-section-owners.json), of a CR rule chosen from what the ability
 * does: the first effect kind in its instructions whose name has a word in
 * `WORD_RULES` (kind names are verb first, so the verb usually decides),
 * else its trigger, else its class (9.5 paid, 9.6 conditional, 9.7 play,
 * 9.8 subroutines). It is a filing aid for each area's evidence step, not a
 * ruling on which procedure the ability uses.
 */
import { getCardDef, supportedCardIds } from "../../src/index.js";
import type { Effect } from "../../src/effects/ir.js";
import { loadOwnerTable, ownerOf } from "../cr-owners.js";

type AbilityClass = "paid" | "conditional" | "play" | "subroutine";

export interface Ability {
  /** `card-id#n`. */
  key: string;
  cardId: string;
  index: number;
  class: AbilityClass;
  /** The record's id, label or text, whichever it has first. */
  name?: string;
  trigger?: string;
  /** The CR rule the area comes from. */
  rule: string;
  /** Owner of `rule` in tests/cr-section-owners.json. */
  area: string;
  instructions: Effect;
  condition?: unknown;
}

const CLASS_RULE: Record<AbilityClass, string> = {
  paid: "9.5",
  conditional: "9.6",
  play: "9.7",
  subroutine: "9.8",
};

/**
 * Phrases checked before single words, so `end_the_run` is not read as
 * `run` and `bad_publicity` is not read as anything else.
 */
const PHRASE_RULES: [string, string][] = [
  ["end_the_run", "6.1"],
  ["jack_out", "6.1"],
  ["bad_publicity", "10.6"],
  ["remove_from_game", "4.9"],
  ["set_aside", "4.8"],
];

/**
 * One word of a kind or trigger name → the CR rule whose owner the ability
 * is filed under. Install by the Runner (a grip, heap or stack card, or a
 * program, hardware or resource) is 8.5.4 (area 6); other installs are
 * 8.5 (area 5).
 */
const WORD_RULES: Record<string, string> = {
  trace: "10.8",
  psi: "10.14",
  bid: "10.14",
  damage: "10.4",
  tag: "10.5",
  tags: "10.5",
  link: "10.7",
  charge: "10.10",
  mark: "10.11",
  sabotage: "10.12",
  dividends: "10.13",
  swap: "8.8",
  search: "8.7",
  rez: "8.1.1",
  derez: "8.1.1",
  uninstall: "8.5.10",
  install: "8.5",
  host: "1.13",
  hosted: "1.13",
  rehost: "1.13",
  trash: "1.19",
  rfg: "4.9",
  access: "7.1",
  breach: "7.3",
  expose: "1.21",
  reveal: "1.21",
  look: "1.21",
  draw: "8.4",
  shuffle: "4.2",
  arrange: "8.3",
  rearrange: "8.3",
  score: "1.17",
  steal: "1.17",
  stolen: "1.17",
  forfeit: "1.17",
  advance: "1.18",
  advancement: "1.18",
  advancements: "1.18",
  counter: "1.9",
  counters: "1.9",
  purge: "1.9",
  credit: "1.10",
  credits: "1.10",
  click: "1.11",
  clicks: "1.11",
  memory: "1.20",
  run: "6.1",
  bypass: "6.1",
  approach: "6.4",
  pass: "6.6",
  encounter: "6.5",
  break: "6.5",
  subroutine: "9.8",
  pump: "3.9.5",
  strength: "3.9.5",
  turn: "5.1",
};

const RUNNER_INSTALL =
  /(?:^|_)(?:grip|heap|stack|program|programs|hardware|resource)(?:_|$)/;

/** Leading words that name who acts or whether they may, not the procedure. */
const PREFIXES = new Set(["may", "corp", "runner"]);

/** The CR rule a kind or trigger name points at, or null. */
export function ruleForName(name: string): string | null {
  for (const [phrase, rule] of PHRASE_RULES) {
    if (name.includes(phrase)) return rule;
  }
  const words = name.split("_");
  while (words.length > 1 && PREFIXES.has(words[0]!)) words.shift();
  for (const word of words) {
    const rule = WORD_RULES[word];
    if (!rule) continue;
    if (rule === "8.5" && RUNNER_INSTALL.test(name)) return "8.5.4";
    return rule;
  }
  return null;
}

/** Every `do` kind in an effect tree, depth first, in tree order. */
function kindsIn(tree: unknown, out: string[] = []): string[] {
  if (!tree || typeof tree !== "object") return out;
  if (Array.isArray(tree)) {
    for (const item of tree) kindsIn(item, out);
    return out;
  }
  const node = tree as Record<string, unknown>;
  const action = node.action as { kind?: unknown } | undefined;
  if (node.op === "do" && typeof action?.kind === "string") {
    out.push(action.kind);
  }
  for (const value of Object.values(node)) kindsIn(value, out);
  return out;
}

function ruleFor(
  cls: AbilityClass,
  instructions: Effect,
  trigger?: string,
): string {
  for (const kind of kindsIn(instructions)) {
    const rule = ruleForName(kind);
    if (rule) return rule;
  }
  if (trigger) {
    const rule = ruleForName(trigger);
    if (rule) return rule;
  }
  return CLASS_RULE[cls];
}

const CLASSES = new Set<string>(Object.keys(CLASS_RULE));

let cache: Ability[] | undefined;

/** Every counted ability on every supported card, in card then index order. */
export function supportedAbilities(): Ability[] {
  if (cache) return cache;
  const table = loadOwnerTable();
  const list: Ability[] = [];
  for (const cardId of [...supportedCardIds()].sort()) {
    const records = getCardDef(cardId).abilities ?? [];
    records.forEach((record, index) => {
      if (!CLASSES.has(record.class) || !record.instructions) return;
      const cls = record.class as AbilityClass;
      const rule = ruleFor(cls, record.instructions, record.trigger);
      list.push({
        key: `${cardId}#${index}`,
        cardId,
        index,
        class: cls,
        name: record.id ?? record.label ?? record.text,
        trigger: record.trigger,
        rule,
        area: ownerOf(table, rule),
        instructions: record.instructions,
        condition: record.condition,
      });
    });
  }
  cache = list;
  return list;
}

/** JSON with object keys sorted, so two equal trees give the same string. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return v;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort())
      sorted[k] = (v as Record<string, unknown>)[k];
    return sorted;
  });
}
