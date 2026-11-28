/**
 * The timing walk (CR audit tool 1.15): during the seeded playouts (tool
 * 1.3), record each step of the timing graph the engine enters
 * (`src/debug/stepHook.ts`) and check each turn, run, breach and access
 * against the pinned chapter 11 charts (tests/timing/timing-chart.ts):
 *
 * - order: each step the engine enters is one the chart reaches from the
 *   step before, passing only through lines the graph folds into another
 *   step, go-to lines, and lines that apply only "if" something holds. A run
 *   may jump to its Run Ends Phase when the run ends or the Runner jacks out
 *   (CR 6.1.4, 6.1.5), and an ability may move the run to another phase
 *   (CR 6.1.3); those moves are counted, not failed.
 * - nesting: a run starts from the Runner's action (11.3_1_f_ii), a breach
 *   from 11.4_5_b, an access from the breach's 11.5_5; a nested structure
 *   finishes its chart before the one around it goes on, unless the run
 *   ended (CR 6.1.4a).
 * - windows: each line marked (P), (R) or (S) that the engine enters gives a
 *   player priority there (CR 9.2.7a) before the engine leaves it. At such a
 *   stop, the player with priority is offered what the line allows when they
 *   can use it: a rez of an asset or upgrade they can pay for at (R)
 *   (CR 9.2.7c), a score of an agenda with enough advancement counters at
 *   (S) (CR 9.2.7d), the approached ice's rez at 11.4_2_b (CR 9.2.7e), and
 *   at (P) each paid ability the engine offered them at another stop of the
 *   same run or turn segment, with the card unchanged and at least as many
 *   credits (CR 9.2.7b). Rez and score are not offered at stops whose line
 *   does not allow them.
 *
 * Failures are keyed without the format or seed, so the same failure in two
 * playouts is one entry. tests/playout/timing-walk.test.ts compares them with the
 * shrink-only baseline `tests/baselines/timing-walk.json`, grouped by the
 * area that owns each rule (tool 1.13) and by chart line.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setStepHook, stateToken } from "../../src/debug/stepHook.js";
import type { StepRecord } from "../../src/debug/stepHook.js";
import { currentPriorityWindow } from "../../src/legality/priority.js";
import { costBeginsWithClick } from "../../src/state/keywordsAndCredits/costs.js";
import type { Action } from "../../src/state/types/actions.js";
import type { GameState } from "../../src/state/types/game.js";
import { STEPS } from "../../src/timing/graph.js";
import { loadOwnerTable, ownerOf } from "../cr-citations/cr-owners.js";
import { ROOT } from "../cr-citations/cr-citations.js";
import {
  CHARTS,
  chartNodes,
  loadChartNodes,
  type Chart,
  type ChartNode,
} from "../timing/timing-chart.js";
import { PLAYOUT_STEPS, playout, type Format } from "./harness.js";

// ---------------------------------------------------------------- chart

const END = "END";
/** CR 6.9.6a: where ending the run or jacking out takes the run (CR 6.1.4). */
const RUN_ENDS = "11.4_6_a";

interface Line {
  number: string;
  chart: Chart;
  text: string;
  /** The chart lines (or END) that may come next, before passing through. */
  succ: string[];
  /** A go-to, a folded line, or an "if" line: the walk may pass through it. */
  through: boolean;
  /** Some graph step cites this line. */
  engine: boolean;
  paid: boolean;
  rez: boolean;
  score: boolean;
  iceRez: boolean;
}

export interface ChartModel {
  lines: Map<string, Line>;
  /** The engine lines (and END) the chart reaches after `number`. */
  reach(number: string): Set<string>;
  first(chart: Chart): string;
  /** A line's place in its chart's order. */
  order(number: string): number;
}

const isQuestion = (node: ChartNode) => node.text_plain.trim().endsWith("?");

/** A line that applies only when something holds ("If …", "…, if any."). */
function conditional(text: string): boolean {
  return /^If\b/.test(text) || /, if (any|possible)\.$/.test(text);
}

/** The phase a line sits in: 11.4_3_c_ii is in 11.4_3; 11.5_4_b is in 11.5. */
function phaseOf(number: string, chart: Chart): string {
  const parts = number.split("_");
  return chart === "11.5" || chart === "11.6"
    ? chart
    : parts.slice(0, 2).join("_");
}

export function buildChartModel(): ChartModel {
  const nodes = loadChartNodes();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const cited = new Set(Object.values(STEPS).map((step) => step.stepNumber));
  const lines = new Map<string, Line>();
  const firsts = new Map<Chart, string>();
  const places = new Map<string, number>();
  for (const chart of CHARTS) {
    const order = chartNodes(nodes, chart, isQuestion);
    firsts.set(chart, order[0]!.number);
    const index = new Map(order.map((node, i) => [node.number, i]));
    for (const [number, i] of index) places.set(number, i);
    const after = (i: number) => order[i + 1]?.number ?? END;
    /** The first line at or under chart number `target`. */
    const resolve = (target: string): string => {
      const hit = order.find(
        (node) =>
          node.number === target || node.number.startsWith(`${target}_`),
      );
      if (!hit) throw new Error(`timing walk: no chart line ${target}`);
      return hit.number;
    };
    order.forEach((node, i) => {
      const text = node.text_plain.trim();
      const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
      const questionChild = Boolean(parent && isQuestion(parent));
      const goTo = /(?:go|return) to \((\w+)\)/i.exec(text);
      let succ: string[];
      if (isQuestion(node)) {
        succ = node.child_ids.map((id) => byId.get(id)!.number);
      } else if (goTo) {
        const target = goTo[1]!;
        succ = [
          resolve(
            /^\d+$/.test(target)
              ? `${chart}_${target}`
              : `${phaseOf(node.number, chart)}_${target}`,
          ),
        ];
      } else if (questionChild) {
        // "If yes, the Corp takes an action": then the line after the question.
        const last = Math.max(
          ...order
            .filter((other) => other.number.startsWith(`${parent!.number}_`))
            .map((other) => index.get(other.number)!),
        );
        succ = [after(last)];
      } else {
        succ = [after(i)];
      }
      const engine = cited.has(node.number);
      lines.set(node.number, {
        number: node.number,
        chart,
        text,
        succ,
        through:
          !engine ||
          Boolean(goTo) ||
          (!questionChild && !isQuestion(node) && conditional(text)),
        engine,
        paid: text.includes("(P)"),
        rez: text.includes("(R)"),
        score: text.includes("(S)"),
        iceRez: text.includes("ice can be rezzed"),
      });
    });
  }
  const cache = new Map<string, Set<string>>();
  const reach = (number: string): Set<string> => {
    const hit = cache.get(number);
    if (hit) return hit;
    const out = new Set<string>();
    const seen = new Set<string>();
    const queue = [...(lines.get(number)?.succ ?? [])];
    while (queue.length) {
      const next = queue.shift()!;
      if (seen.has(next)) continue;
      seen.add(next);
      if (next === END) {
        out.add(END);
        continue;
      }
      const line = lines.get(next)!;
      if (line.engine) out.add(next);
      if (line.through) queue.push(...line.succ);
    }
    cache.set(number, out);
    return out;
  };
  return {
    lines,
    reach,
    first: (chart) => firsts.get(chart)!,
    order: (number) => places.get(number) ?? -1,
  };
}

/** The chart a line belongs to. */
function chartOf(number: string): Chart | null {
  return (
    ((CHARTS as readonly string[]).find((c) => number.startsWith(`${c}_`)) as
      Chart | undefined) ?? null
  );
}

/**
 * Where a nested structure starts: a run is an action the Runner takes
 * (11.3_1_f_ii), a breach is 11.4_5_b, an access is the breach's 11.5_5.
 */
const NESTED_IN: Partial<Record<Chart, string>> = {
  "11.4": "11.3_1_f_ii",
  "11.5": "11.4_5_b",
  "11.6": "11.5_5",
};

/** The rule in chapters 5–7 that a chart line restates. */
export function bodyRule(number: string): string {
  const [chart, phase, letter] = number.split("_");
  if (chart === "11.2") return `5.6.${phase}${letter ?? ""}`;
  if (chart === "11.3") return `5.7.${phase}${letter ?? ""}`;
  if (chart === "11.4") return `6.9.${phase}${letter ?? ""}`;
  if (chart === "11.5") {
    return (
      ({ "1": "7.3.1", "2": "7.3.2", "3": "7.3.5" } as Record<string, string>)[
        phase!
      ] ?? "7.3.4"
    );
  }
  if (chart === "11.6") return `7.2.${phase}`;
  return number;
}

// ---------------------------------------------------------------- failures

export interface WalkFailure {
  /** The chart line the failure is on. */
  line: string;
  /** What kind of failure, and its stable details. */
  key: string;
  /** The rules it breaks: the line's body rule first. */
  cr: string[];
  /** Where it was first seen. */
  example: string;
}

export interface WalkCounts {
  turns: number;
  runs: number;
  breaches: number;
  accesses: number;
  steps: number;
  /** How many times the walk entered each chart line. */
  entered: Record<string, number>;
  /** Moves an ability or the end of the run made, by "from → to". */
  jumps: Record<string, number>;
  /** Window stops checked, and the offers checked at them. */
  checked: {
    stops: number;
    rez: number;
    score: number;
    iceRez: number;
    paidAbilities: number;
  };
}

function emptyCounts(): WalkCounts {
  return {
    turns: 0,
    runs: 0,
    breaches: 0,
    accesses: 0,
    steps: 0,
    entered: {},
    jumps: {},
    checked: { stops: 0, rez: 0, score: 0, iceRez: 0, paidAbilities: 0 },
  };
}

interface Frame {
  chart: Chart;
  line: string;
}

/** The text a card prints, for the paid ability window check. */
const printed = new Map<string, string>();
const PRINTED_DIR = join(ROOT, "vendor/cards-data/print/printed");
function printedText(defId: string | undefined): string {
  if (!defId) return "";
  let text = printed.get(defId);
  if (text === undefined) {
    // A wrong folder would read every card as printing nothing.
    if (!existsSync(PRINTED_DIR)) throw new Error(`No ${PRINTED_DIR}`);
    try {
      text =
        (
          JSON.parse(
            readFileSync(join(PRINTED_DIR, `${defId}.json`), "utf8"),
          ) as { strippedText?: string }
        ).strippedText ?? "";
    } catch {
      text = "";
    }
    printed.set(defId, text);
  }
  return text;
}

/**
 * Printed words that tie a paid ability to one part of a run, so it may be
 * offered in one paid ability window of a run and not another.
 */
const RUN_PART =
  /encounter|approach|\bpass|break|strength|current ice|jack out|successful/i;

/** What about a card can change whether its paid ability may be used. */
const CARD_STATE =
  /Counters$|^hostedCredits$|^zone$|^rezzed$|^faceup$|^hostId$/;

function fingerprint(state: GameState, cardId: string): string {
  const card = state.cards[cardId];
  if (!card) return "gone";
  return JSON.stringify(
    Object.entries(card)
      .filter(([field]) => CARD_STATE.test(field))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

interface Offer {
  credits: number;
  fp: string;
  /** The run the stop was in, or 0 outside a run. */
  run: number;
}
interface Missing extends Offer {
  ability: string;
  cardId: string;
  defId: string | undefined;
  line: string;
  example: string;
}

/** Printed text that may limit a paid ability to some windows. */
const LIMITED = /\bonly\b|\bduring\b|\brun\b/i;

/** Printed text that limits when the Corp may rez the card (Daily Quest). */
const REZ_LIMIT = /\brez\b[^.]*\bonly\b|\bcannot\b[^.]*\brez/i;

/** One playout's walk. */
export class Walker {
  readonly failures = new Map<string, WalkFailure>();
  readonly counts: WalkCounts;
  private stack: Frame[] = [];
  private openWindow: { line: string; key: string; stopped: boolean } | null =
    null;
  private group = "";
  private inRun = 0;
  private turnId = 0;
  private runId = 0;
  private offers = new Map<string, Map<string, Offer[]>>();
  private missing = new Map<string, Missing[]>();
  /** Paid abilities used so far in each run or turn segment. */
  private used = new Map<string, Set<string>>();
  private where = "";

  constructor(
    private readonly model: ChartModel,
    counts: WalkCounts = emptyCounts(),
  ) {
    this.counts = counts;
  }

  /** Starts the walk part way through a turn, at graph step `key`. */
  resumeAt(key: string): void {
    const line = STEPS[key]!.stepNumber;
    this.stack = [{ chart: chartOf(line)!, line }];
  }

  setWhere(where: string): void {
    this.where = where;
  }

  fail(line: string, key: string, extra: string[] = []): void {
    const full = `${line} ${key}`;
    if (this.failures.has(full)) return;
    this.failures.set(full, {
      line,
      key: full,
      cr: [bodyRule(line), ...extra],
      example: this.where,
    });
  }

  private top(): Frame | undefined {
    return this.stack[this.stack.length - 1];
  }

  /** The engine entered `record.key`; `action` is the move that led here. */
  enter(record: StepRecord, action: Action | null): void {
    const step = STEPS[record.key];
    if (!step) return;
    const line = step.stepNumber;
    const chart = chartOf(line);
    if (!chart) return; // the opening (CR 1.6) is not a chart
    this.counts.steps += 1;
    this.counts.entered[line] = (this.counts.entered[line] ?? 0) + 1;
    this.leaveWindow(line, record, action);
    if (chart === "11.2" || chart === "11.3") {
      if (line === this.model.first(chart)) {
        this.turnId += 1;
        this.counts.turns += 1;
      }
    }
    if (line === this.model.first("11.4")) {
      this.runId += 1;
      this.counts.runs += 1;
    }
    if (line === this.model.first("11.5")) this.counts.breaches += 1;
    if (line === this.model.first("11.6")) this.counts.accesses += 1;
    this.walk(line, chart, record, action);
    this.group = `turn ${this.turnId}`;
    this.inRun = record.inRun ? this.runId : 0;
    const info = this.model.lines.get(line)!;
    if (info.paid || info.rez || info.score) {
      if (!this.openWindow || this.openWindow.line !== line) {
        this.openWindow = { line, key: record.key, stopped: false };
      }
    }
  }

  private ended(record: StepRecord, action: Action | null): boolean {
    return record.endedTheRun || action?.type === "jack_out";
  }

  private walk(
    line: string,
    chart: Chart,
    record: StepRecord,
    action: Action | null,
  ): void {
    const top = this.top();
    if (!top) {
      if (line !== this.model.first("11.2")) {
        this.fail(line, `first step is ${line}, not the Corp's turn`, [
          "5.1.1",
        ]);
      }
      this.stack.push({ chart, line });
      return;
    }
    if (top.chart === chart) {
      this.move(top, line, record, action);
      return;
    }
    // A nested structure begins.
    const parent = NESTED_IN[chart];
    if (parent && line === this.model.first(chart)) {
      if (!parent.startsWith(`${top.chart}_`)) {
        this.fail(line, `${chart} began inside ${top.chart} at ${top.line}`);
      } else if (
        top.line !== parent &&
        !this.model.reach(top.line).has(parent)
      ) {
        this.fail(line, `${chart} began at ${top.line}, not at ${parent}`, [
          bodyRule(parent),
        ]);
      }
      top.line = parent.startsWith(`${top.chart}_`) ? parent : top.line;
      this.stack.push({ chart, line });
      return;
    }
    // Back to a structure further out: the nested ones end.
    const depth = this.stack.findIndex((frame) => frame.chart === chart);
    if (depth >= 0) {
      while (this.stack.length > depth + 1) {
        const inner = this.stack.pop()!;
        if (
          !this.model.reach(inner.line).has(END) &&
          !this.ended(record, action)
        ) {
          this.fail(
            inner.line,
            `${inner.chart} left at ${inner.line} for ${line}`,
          );
        }
      }
      this.move(this.top()!, line, record, action);
      return;
    }
    // One turn to the other.
    if ((chart === "11.2" || chart === "11.3") && this.stack.length >= 1) {
      const outer = this.stack[0]!;
      const unfinished = this.stack.filter(
        (frame) => !this.model.reach(frame.line).has(END),
      );
      for (const frame of unfinished) {
        this.fail(
          frame.line,
          `${frame.chart} left at ${frame.line} for ${line}`,
        );
      }
      if (line !== this.model.first(chart)) {
        this.fail(line, `${chart} began at ${line} after ${outer.chart}`);
      }
      this.stack = [{ chart, line }];
      return;
    }
    this.fail(line, `entered ${chart} from ${top.chart} at ${top.line}`);
    this.stack.push({ chart, line });
  }

  private move(
    frame: Frame,
    line: string,
    record: StepRecord,
    action: Action | null,
  ): void {
    const from = frame.line;
    frame.line = line;
    if (from === line || this.model.reach(from).has(line)) return;
    const jump = `${from} → ${line}`;
    // From any step of the run before its Run Ends Phase; once that phase
    // has begun, the run does not start it again.
    if (line === RUN_ENDS && !from.startsWith("11.4_6_")) {
      if (this.ended(record, action)) {
        this.tally(`${jump} (run ended)`);
        return;
      }
    }
    // CR 6.1.3: an ability moved the run. A subroutine resolving, or a move
    // that resolves a card ability, may do that; a pass may not.
    // It moves forward to a later phase of the run, never back, and never
    // out of the Run Ends Phase.
    const forward =
      this.model.order(line) > this.model.order(from) &&
      line.split("_")[1] !== from.split("_")[1];
    const byAbility =
      forward &&
      !from.startsWith("11.4_6_") &&
      (from === "11.4_3_c_i" ||
        (action !== null &&
          action.type !== "pass_window" &&
          action.type !== "continue_run"));
    if (frame.chart === "11.4" && byAbility) {
      this.tally(`${jump} (${action?.type ?? "subroutine"})`);
      return;
    }
    this.fail(
      line,
      `entered from ${from} by ${action?.type ?? "start"}; the chart goes to ${
        [...this.model.reach(from)].join(", ") || "nothing"
      }`,
      // CR 6.9.6d: once the Run Ends Phase is complete, so is the run.
      from.startsWith("11.4_6_")
        ? [bodyRule(from)]
        : frame.chart === "11.4"
          ? ["6.1.3"]
          : [],
    );
  }

  /** The recorder lost steps between `from` and `record` (or the stop). */
  gap(from: string, record: StepRecord | null): void {
    const to = record ? record.previousKey : "the stop";
    const line = STEPS[from]?.stepNumber ?? from;
    this.fail(line, `recorder gap: no step recorded from ${from} to ${to}`);
  }

  private tally(jump: string): void {
    this.counts.jumps[jump] = (this.counts.jumps[jump] ?? 0) + 1;
  }

  /** A window line is left: it must have been a stop, unless the run ended. */
  private leaveWindow(
    next: string,
    record: StepRecord,
    action: Action | null,
  ): void {
    const open = this.openWindow;
    if (!open || open.line === next) return;
    this.openWindow = null;
    if (open.stopped || this.ended(record, action)) return;
    this.fail(open.line, `left ${open.key} with no player given priority`, [
      "9.2.7a",
    ]);
  }

  /** A move was applied (before the steps it entered are walked). */
  applied(state: GameState, action: Action): void {
    if (action.type !== "use_paid_ability") return;
    const card = state.cards[action.cardId];
    if (!card) return;
    const group = `${this.group} ${card.side}`;
    const used = this.used.get(group) ?? new Set<string>();
    used.add(`${action.cardId} ${action.abilityId}`);
    this.used.set(group, used);
  }

  /** The engine stopped here after a move (or at the deal). */
  stop(state: GameState): void {
    // A stop gives a player priority in that window, not a pending choice.
    if (
      this.openWindow &&
      this.openWindow.key === state.timingKey &&
      !state.pendingChoice &&
      currentPriorityWindow(state)?.stepKey === state.timingKey
    ) {
      this.openWindow.stopped = true;
    }
  }

  /** A position the playout picks a move at, with the moves it lists. */
  observe(state: GameState, legal: { action: Action }[]): void {
    const step = STEPS[state.timingKey];
    if (!step || state.pendingChoice) return;
    const info = this.model.lines.get(step.stepNumber);
    if (!info) return;
    const frame = currentPriorityWindow(state);
    if (!frame || frame.stepKey !== state.timingKey) return;
    const holder = frame.priorityHolder;
    this.counts.checked.stops += 1;
    const actions = legal.map((entry) => entry.action);
    const of = <T extends Action["type"]>(type: T) =>
      actions.filter((a): a is Extract<Action, { type: T }> => a.type === type);
    const line = info.number;
    if (holder === "corp") {
      const rezzes = new Set(of("rez_asset").map((a) => a.cardId));
      if (info.rez) {
        for (const id of corpInstalled(state)) {
          const card = state.cards[id]!;
          if (card.rezzed || (card.type !== "asset" && card.type !== "upgrade"))
            continue;
          if (card.rezCost === undefined || card.rezCost > state.corp.credits)
            continue;
          if (REZ_LIMIT.test(printedText(card.defId))) continue;
          // An additional rez cost may not be payable (CR 1.16.10).
          if (
            card.rezAdditionalCost ||
            card.rezNonIceAdditionalCostRandomTrashHq
          )
            continue;
          this.counts.checked.rez += 1;
          if (!rezzes.has(id))
            this.fail(line, `rez of ${card.defId} not offered`, ["9.2.7c"]);
        }
      } else if (rezzes.size > 0) {
        this.fail(line, "rez of an asset or upgrade offered", ["9.2.7c"]);
      }
      const scores = new Set(of("score_agenda").map((a) => a.cardId));
      if (info.score) {
        for (const id of corpInstalled(state)) {
          const card = state.cards[id]!;
          if (card.type !== "agenda") continue;
          const need = card.advancementRequirement;
          if (need === undefined || (card.advancementCounters ?? 0) < need)
            continue;
          this.counts.checked.score += 1;
          if (!scores.has(id))
            this.fail(line, `score of ${card.defId} not offered`, ["9.2.7d"]);
        }
      } else if (scores.size > 0) {
        this.fail(line, "score offered", ["9.2.7d"]);
      }
      const iceRezzes = of("rez_ice");
      if (info.iceRez) {
        const run = state.run;
        const ice =
          run && run.position !== null
            ? state.servers[run.attackedServerId]?.ice[run.position]
            : undefined;
        const card = ice ? state.cards[ice] : undefined;
        const payable =
          card &&
          !card.rezzed &&
          card.rezCost !== undefined &&
          card.rezCost <= state.corp.credits;
        if (payable) this.counts.checked.iceRez += 1;
        if (card && payable && iceRezzes.length === 0) {
          this.fail(line, `rez of approached ${card.defId} not offered`, [
            "9.2.7e",
          ]);
        }
      } else if (iceRezzes.length > 0) {
        this.fail(line, "rez of ice offered", ["9.2.7e"]);
      }
    }
    if (!info.paid) return;
    const credits =
      holder === "corp" ? state.corp.credits : state.runner.credits;
    const group = `${this.group} ${holder}`;
    const offers = this.offers.get(group) ?? new Map<string, Offer[]>();
    this.offers.set(group, offers);
    const offered = new Set<string>();
    for (const a of of("use_paid_ability")) {
      const ability = `${a.cardId} ${a.abilityId}`;
      offered.add(ability);
      this.counts.checked.paidAbilities += 1;
      const list = offers.get(ability) ?? [];
      list.push({ credits, fp: fingerprint(state, a.cardId), run: this.inRun });
      offers.set(ability, list);
    }
    const missing = this.missing.get(group) ?? [];
    this.missing.set(group, missing);
    for (const card of activeCards(state, holder)) {
      for (const ability of card.paidAbilities ?? []) {
        if (costBeginsWithClick(ability)) continue;
        const name = `${card.id} ${ability.id}`;
        if (offered.has(name)) continue;
        // A limited ability ("once per turn") may be gone once used.
        if (this.used.get(group)?.has(name)) continue;
        this.counts.checked.paidAbilities += 1;
        missing.push({
          ability: name,
          cardId: card.id,
          defId: card.defId,
          credits,
          fp: fingerprint(state, card.id),
          run: this.inRun,
          line,
          example: this.where,
        });
      }
    }
  }

  /**
   * Paid abilities offered at one stop and not at another of the same turn,
   * with the card unchanged and at least as many credits. A card whose text
   * names a part of a run is skipped; one whose text limits it ("only",
   * "during", "run") is compared only within the same run, or outside runs.
   */
  finish(): void {
    for (const [group, missing] of this.missing) {
      const offers = this.offers.get(group);
      if (!offers) continue;
      for (const m of missing) {
        const text = printedText(m.defId);
        if (RUN_PART.test(text)) continue;
        const limited = LIMITED.test(text);
        const offer = (offers.get(m.ability) ?? []).find(
          (o) =>
            o.credits <= m.credits &&
            o.fp === m.fp &&
            (o.run === m.run || !limited),
        );
        if (!offer) continue;
        const ability = m.ability.split(" ")[1];
        const key = `${m.line} paid ability ${m.defId} ${ability} not offered`;
        if (this.failures.has(key)) continue;
        this.failures.set(key, {
          line: m.line,
          key,
          cr: [bodyRule(m.line), "9.2.7b"],
          example: m.example,
        });
      }
    }
  }
}

/**
 * The cards whose paid abilities `side` may use: its identity, the Runner's
 * installed cards, and the Corp's rezzed installed cards (CR 9.1.5).
 */
function activeCards(state: GameState, side: "corp" | "runner") {
  const identity = state.cards[state[side].identityId];
  return Object.values(state.cards).filter(
    (card) =>
      card.side === side &&
      (card === identity ||
        (side === "runner"
          ? card.zone === "runner:installed"
          : card.rezzed && card.zone.startsWith("server:"))),
  );
}

/** The Corp's cards in server roots, and the cards hosted on them. */
function corpInstalled(state: GameState): string[] {
  const out: string[] = [];
  const add = (id: string) => {
    out.push(id);
    for (const hosted of state.cards[id]?.hostedCardIds ?? []) add(hosted);
  };
  for (const server of Object.values(state.servers)) server.root.forEach(add);
  return out;
}

// ---------------------------------------------------------------- playouts

export interface WalkResult {
  failures: Map<string, WalkFailure & { owner: string }>;
  counts: WalkCounts;
}

/**
 * Feeds a walker from the engine: the step hook's records, the moves applied
 * and the positions where a move is picked. Only the steps entered on the
 * state a top-level `applyAction` returns are walked; legality's trials enter
 * steps on copies of the state.
 */
export class WalkRecorder {
  private buffer: StepRecord[] = [];
  private previous: ReturnType<typeof setStepHook> = null;
  private started = false;
  /** Where the engine last stopped. */
  private parked = "";

  constructor(readonly walker: Walker) {}

  /** Starts recording, with the game at `state`. */
  start(state: GameState): void {
    this.previous = setStepHook((record) => this.buffer.push(record));
    this.walker.enter(
      {
        token: stateToken(state),
        key: state.timingKey,
        previousKey: state.timingKey,
        inRun: state.run !== null,
        endedTheRun: Boolean(state.run?.endedTheRun),
      },
      null,
    );
    this.walker.stop(state);
    this.parked = state.timingKey;
    this.started = true;
  }

  /** A position where a move is picked, with the moves listed there. */
  observe(state: GameState, legal: { action: Action }[]): void {
    this.buffer = [];
    this.walker.observe(state, legal);
  }

  /** `applyAction` returned `state` for `action`. */
  applied(state: GameState, action: Action): void {
    const token = stateToken(state);
    const mine = this.buffer.filter((record) => record.token === token);
    this.buffer = [];
    this.walker.applied(state, action);
    // The kept records follow on from the last stop, or some were lost.
    let previous = this.parked;
    for (const record of mine) {
      if (record.previousKey !== previous) this.walker.gap(previous, record);
      this.walker.enter(record, action);
      previous = record.key;
    }
    if (previous !== state.timingKey) this.walker.gap(previous, null);
    this.walker.stop(state);
    this.parked = state.timingKey;
  }

  /** Stops recording and finishes the walk. */
  finish(): void {
    if (this.started) setStepHook(this.previous);
    this.started = false;
    this.walker.finish();
  }
}

/** Walks each `(format, seed)` playout and gathers its failures. */
export function timingWalk(
  playouts: readonly { format: Format; seed: number }[],
  steps = PLAYOUT_STEPS,
): WalkResult {
  const model = buildChartModel();
  const owners = loadOwnerTable();
  const counts = emptyCounts();
  const failures = new Map<string, WalkFailure & { owner: string }>();
  for (const { format, seed } of playouts) {
    const walker = new Walker(model, counts);
    const recorder = new WalkRecorder(walker);
    let pick = 0;
    try {
      playout(
        format,
        seed,
        steps,
        (state, step, legal) => {
          pick = step;
          walker.setWhere(`${format} seed ${seed} step ${step}`);
          if (step === 0) recorder.start(state);
          recorder.observe(state, legal);
        },
        (state, action) => {
          walker.setWhere(`${format} seed ${seed} step ${pick}`);
          recorder.applied(state, action);
        },
      );
    } finally {
      recorder.finish();
    }
    for (const [key, failure] of walker.failures) {
      if (failures.has(key)) continue;
      failures.set(key, {
        ...failure,
        owner: ownerOf(owners, failure.cr[0]!),
      });
    }
  }
  return { failures, counts };
}
