/**
 * A paid ability is started through the turn, not by calling its tree raw.
 * With no window open, the ability is refused. When using it opens a choice,
 * that choice stays on the step that allowed it while each option is taken.
 * An empty pool, a missing encounter, and a missing card each stop the ability
 * for that reason, and the encounter and card checks clear once the requirement is met.
 * Conditional abilities run from the turn step that fires them.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
  loadCardCatalog,
  STEPS,
} from "../src/index.js";
import type { CardDef } from "../src/cards/load.js";
import type { Effect } from "../src/effects/ir.js";
import { cursorFrom } from "../src/timing/graph.js";
import { agendaPointsFor } from "../src/state/scoring.js";
import {
  abilityNeedsEncounter,
  costBeginsWithClick,
} from "../src/state/costs.js";
import type {
  GameState,
  PaidAbility,
  PaidAbilityWindow,
  ServerId,
} from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

const WINDOW_STEP: Partial<Record<PaidAbilityWindow, string>> = {
  corp_action_paw: "corp.actionPaw",
  runner_action_paw: "runner.actionPaw",
  approach_paw: "run.approachPaw",
  approach_server_paw: "run.approachServerPaw",
  encounter_paw: "run.encounterPaw",
  run_initiate_paw: "run.initiatePaw",
  run_movement_paw: "run.passIcePaw",
  run_after_move_paw: "run.afterMovePaw",
  other_priority_window: "run.completeOtherPriorityWindows",
};

function atStep(state: GameState, key: string): void {
  const step = STEPS[key];
  if (!step) throw new Error(`Unknown step ${key}`);
  state.timingKey = key;
  state.timing = cursorFrom(step);
  state.turnPhase = step.turnPhase ?? state.turnPhase;
}

function openRun(state: GameState, serverId: ServerId, encounterIceId: string | null): void {
  const ice = encounterIceId ? state.cards[encounterIceId] : undefined;
  state.run = {
    attackedServerId: serverId,
    phase: encounterIceId ? "encounter" : "movement",
    position: encounterIceId ? 0 : null,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: encounterIceId
      ? { iceId: encounterIceId, broken: (ice?.subroutines ?? []).map(() => false) }
      : null,
    endedTheRun: false,
    cannotJackOut: false,
    strengthBoosts: {},
    encounterStrengthBoosts: {},
    iceStrengthBoosts: {},
    accessingCardId: null,
  };
}

function prepare(def: CardDef): { state: GameState; cardId: string } {
  const state = createInitialState();
  state.corp.credits = 99;
  state.runner.credits = 99;
  state.corp.clicks = 3;
  state.runner.clicks = 3;
  state.activeSide = def.side;
  if (state.corp.hand.length === 0) {
    const id = state.corp.deck.pop();
    if (id) {
      state.corp.hand.push(id);
      state.cards[id]!.zone = "corp:hq";
      state.cards[id]!.faceup = true;
    }
  }
  const archived = state.corp.deck.pop();
  if (archived) {
    state.corp.discardPile.push(archived);
    state.cards[archived]!.zone = "corp:archives";
    state.cards[archived]!.faceup = true;
  }
  const heaped = state.runner.deck.pop();
  if (heaped) {
    state.runner.discardPile.push(heaped);
    state.cards[heaped]!.zone = "runner:heap";
    state.cards[heaped]!.faceup = true;
  }

  if (def.type === "identity") {
    const cardId = def.side === "corp" ? state.corp.identityId : state.runner.identityId;
    const card = instantiateCard(def.id, cardId, def.side === "corp" ? "corp:hq" : "runner:grip");
    card.rezzed = true;
    card.faceup = true;
    state.cards[cardId] = card;
    return { state, cardId };
  }

  const cardId = "subject";
  const zone =
    def.type === "ice"
      ? "server:hq:ice"
      : def.type === "agenda"
        ? def.side === "corp"
          ? "corp:score"
          : "runner:score"
        : def.side === "corp"
          ? "server:remote-1:root"
          : "runner:installed";
  const card = instantiateCard(def.id, cardId, zone);
  card.rezzed = true;
  card.faceup = true;
  card.powerCounters = 2;
  card.virusCounters = 2;
  card.advancementCounters = 2;
  state.cards[cardId] = card;
  if (zone === "server:hq:ice") state.servers.hq.ice.unshift(cardId);
  else if (zone === "corp:score") state.corp.scoreArea.push(cardId);
  else if (zone === "runner:score") state.runner.scoreArea.push(cardId);
  else if (zone === "runner:installed") state.runner.installed.push(cardId);
  else {
    state.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [cardId],
    };
    state.nextRemoteNumber = 2;
  }
  return { state, cardId };
}

function legalStep(ability: PaidAbility, side: CardDef["side"]): string | null {
  if (costBeginsWithClick(ability)) {
    if (side === "corp" && ability.windows.includes("corp_action_paw")) return "corp.takeAction";
    if (side === "runner" && ability.windows.includes("runner_action_paw")) return "runner.takeAction";
  }
  for (const window of ability.windows) {
    const key = WINDOW_STEP[window];
    if (key) return key;
  }
  return null;
}

function situation(state: GameState, cardId: string, step: string, ability: PaidAbility): void {
  const card = state.cards[cardId]!;
  if (
    (step.startsWith("run.") || abilityNeedsEncounter(ability)) &&
    state.servers.hq.ice.length === 0 &&
    state.cards["corp-ice-1"]
  ) {
    state.corp.deck = state.corp.deck.filter((id) => id !== "corp-ice-1");
    state.servers.hq.ice = ["corp-ice-1"];
    state.cards["corp-ice-1"]!.zone = "server:hq:ice";
    state.cards["corp-ice-1"]!.rezzed = true;
    state.cards["corp-ice-1"]!.faceup = true;
  }
  const runStep = step.startsWith("run.") || abilityNeedsEncounter(ability);
  if (!runStep) return;
  const serverId: ServerId =
    step === "run.approachServerPaw" && state.servers["remote-1"]?.root.includes(cardId)
      ? "remote-1"
      : "hq";
  const iceId =
    card.type === "ice" && state.servers.hq.ice.includes(cardId)
      ? cardId
      : (state.servers.hq.ice[0] ?? null);
  openRun(state, serverId, step === "run.encounterPaw" || abilityNeedsEncounter(ability) ? iceId : null);
  if (step === "run.approachPaw" && card.type === "ice") {
    state.run!.phase = "approach_ice";
    state.run!.position = state.servers.hq.ice.indexOf(cardId);
    state.run!.encounter = null;
  }
}

function stepStillLegal(
  landed: string,
  step: string,
  ability: PaidAbility,
  side: CardDef["side"],
): boolean {
  const clickPaw = side === "corp" ? "corp.actionPaw" : "runner.actionPaw";
  const clickWindow = side === "corp" ? "corp_action_paw" : "runner_action_paw";
  return (
    landed === step ||
    (costBeginsWithClick(ability) &&
      step.endsWith(".takeAction") &&
      landed === clickPaw &&
      ability.windows.includes(clickWindow))
  );
}

/** Keys named by a step's `next`, including each return inside a branch function. */
function declaredNext(key: string): string[] {
  const step = STEPS[key];
  if (!step) return [];
  if (typeof step.next === "string") return STEPS[step.next] ? [step.next] : [];
  const names = new Set<string>();
  for (const match of step.next.toString().matchAll(/["']([a-z]+(?:\.[A-Za-z0-9]+)+)["']/g)) {
    const named = match[1];
    if (named && STEPS[named]) names.add(named);
  }
  return [...names];
}

/**
 * A choice may advance only along the step graph. Auto and branch steps are
 * passed through, and so are run and breach windows, because an empty window
 * closes on its own. A run ability may enter the run at its first step and
 * walk from there. When the run is over, the turn returns to a paid-ability
 * window (CR 5.2.1).
 */
function landedLegally(from: string, to: string, state: GameState): boolean {
  if (to === "corp.actionPaw" || to === "runner.actionPaw") return true;
  if (reachable(from, to)) return true;
  return Boolean(state.run) && reachable("run.announce", to);
}

function reachable(from: string, to: string): boolean {
  const seen = new Set<string>();
  const queue = [from];
  while (queue.length > 0) {
    const key = queue.shift();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    for (const next of declaredNext(key)) {
      if (next === to) return true;
      const step = STEPS[next];
      if (!step) continue;
      if (step.kind === "auto" || step.kind === "branch" || step.structure === "run" || step.structure === "breach") {
        queue.push(next);
      }
    }
  }
  return false;
}

function followChoices(
  state: GameState,
  legal: (timingKey: string) => boolean,
  failures: string[],
  label: string,
  pick: "first" | "last" = "first",
): GameState {
  let current = state;
  const seen = new Set<string>();
  for (let i = 0; i < 5 && current.pendingChoice; i++) {
    if (!legal(current.timingKey)) {
      failures.push(`${label} choice stayed open on ${current.timingKey}`);
      return current;
    }
    const options = current.pendingChoice.options;
    const option = pick === "last" ? options[options.length - 1] : options[0];
    if (!option || seen.has(option.id)) return current;
    if (/^(decl:|bribery-x:|install-x:|anson:|chronos:|diwan:)/.test(option.id)) return current;
    seen.add(option.id);
    let next: ReturnType<typeof applyAction>;
    try {
      next = applyAction(current, { type: "choose_option", optionId: option.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${label} choice threw: ${message}`);
      return current;
    }
    if (!next.ok) return current;
    if (next.state.timingKey !== current.timingKey) {
      if (!landedLegally(current.timingKey, next.state.timingKey, next.state)) {
        failures.push(
          `${label} choice landed on ${next.state.timingKey}, which does not follow ${current.timingKey}`,
        );
      }
      return next.state;
    }
    current = next.state;
  }
  return current;
}

/** A zero credit gain logs a line only when this effect is evaluated. */
function markHook(card: { side: string }, effect: Effect | undefined, assign: (effect: Effect) => void): void {
  if (!effect) return;
  const side = card.side === "runner" ? "runner" : "corp";
  assign({
    op: "seq",
    effects: [
      { op: "do", action: { kind: "gain_credits", side, amount: 0 } },
      effect,
    ],
  });
}

function zeroGainCount(log: readonly string[]): number {
  return log.filter((line) => line.includes("gains 0¢")).length;
}

function agendaPointContribution(
  card: {
    agendaPoints?: number;
    agendaPointsPerAgendaCounter?: number;
    agendaCounters?: number;
    agendaPointsModifierInRunnerScoreArea?: number;
    worthZeroAgendaPointsWhileHasAgendaCounters?: boolean;
  },
  side: "corp" | "runner",
): number {
  if (card.worthZeroAgendaPointsWhileHasAgendaCounters && (card.agendaCounters ?? 0) >= 1) return 0;
  const fromCounters = (card.agendaPointsPerAgendaCounter ?? 0) * (card.agendaCounters ?? 0);
  const runnerMod = side === "runner" ? (card.agendaPointsModifierInRunnerScoreArea ?? 0) : 0;
  return (card.agendaPoints ?? 0) + fromCounters + runnerMod;
}

function poolCost(ability: PaidAbility): boolean {
  const clicks = ability.cost ? (ability.cost.clicks ?? 0) : (ability.clickCost ?? 0);
  const credits = ability.cost ? (ability.cost.credits ?? 0) : (ability.creditCost ?? 0);
  return clicks > 0 || credits > 0;
}

function zeroPools(state: GameState): void {
  state.corp.credits = 0;
  state.corp.clicks = 0;
  state.runner.credits = 0;
  state.runner.clicks = 0;
  state.badPublicityFund = 0;
  if (state.run) state.run.eventCredits = 0;
  for (const card of Object.values(state.cards)) {
    card.recurringCredits = 0;
    card.hostedCredits = 0;
  }
}

function stripTargets(state: GameState, keep: Set<string>): void {
  const drop = (ids: string[]) => ids.filter((id) => keep.has(id));
  state.corp.hand = [];
  state.corp.deck = [];
  state.corp.discardPile = [];
  state.corp.scoreArea = drop(state.corp.scoreArea);
  state.runner.hand = [];
  state.runner.deck = [];
  state.runner.discardPile = [];
  state.runner.scoreArea = drop(state.runner.scoreArea);
  state.runner.installed = drop(state.runner.installed);
  for (const server of Object.values(state.servers)) {
    server.ice = drop(server.ice);
    server.root = drop(server.root);
  }
}

const NO_TARGET = /no valid target|no targets|nothing to|HQ empty|grip empty|R&D empty|no valid host|no valid ice/i;

function use(
  def: CardDef,
  ability: PaidAbility,
  adjust: (state: GameState, cardId: string) => void,
  stepOverride?: string,
):
  | { ok: true; state: GameState; from: number; cardId: string }
  | { ok: false; error: string; from: number; cardId: string }
  | { threw: string } {
  const step = stepOverride ?? legalStep(ability, def.side);
  if (!step) return { ok: false, error: "no legal step", from: 0, cardId: "" };
  const seated = prepare(def);
  atStep(seated.state, step);
  situation(seated.state, seated.cardId, step, ability);
  adjust(seated.state, seated.cardId);
  const action =
    def.type === "identity"
      ? ({ type: "use_identity_ability", abilityId: ability.id } as const)
      : ({
          type: "use_paid_ability",
          cardId: seated.cardId,
          abilityId: ability.id,
        } as const);
  const from = seated.state.log.length;
  try {
    const result = applyAction(seated.state, action);
    if (result.ok) return { ok: true, state: result.state, from, cardId: seated.cardId };
    return { ok: false, error: result.error, from, cardId: seated.cardId };
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error) };
  }
}

describe("paid-ability choices stay on the step that allowed them", () => {
  it(
    "refuses a paid ability with no window open, and keeps a choice on that step",
    () => {
      const failures: string[] = [];
      for (const def of loadCardCatalog(true).values()) {
        const abilities = def.paidAbilities ?? [];
        if (abilities.length === 0) continue;
        for (const ability of abilities) {
          const closed = prepare(def);
          atStep(closed.state, "corp.gainClicks");
          const closedAction =
            def.type === "identity"
              ? ({ type: "use_identity_ability", abilityId: ability.id } as const)
              : ({
                  type: "use_paid_ability",
                  cardId: closed.cardId,
                  abilityId: ability.id,
                } as const);
          let refused: ReturnType<typeof applyAction>;
          try {
            refused = applyAction(closed.state, closedAction);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push(`${def.id} ${ability.id} threw with no window: ${message}`);
            continue;
          }
          if (refused.ok) {
            failures.push(`${def.id} ${ability.id} resolved during Corp gain-clicks`);
            continue;
          }

          const step = legalStep(ability, def.side);
          if (!step) continue;
          const open = prepare(def);
          atStep(open.state, step);
          situation(open.state, open.cardId, step, ability);
          const openAction =
            def.type === "identity"
              ? ({ type: "use_identity_ability", abilityId: ability.id } as const)
              : ({
                  type: "use_paid_ability",
                  cardId: open.cardId,
                  abilityId: ability.id,
                } as const);
          let started: ReturnType<typeof applyAction>;
          try {
            started = applyAction(open.state, openAction);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push(`${def.id} ${ability.id} threw in ${step}: ${message}`);
            continue;
          }
          if (!started.ok || !started.state.pendingChoice) continue;
          if (!stepStillLegal(started.state.timingKey, step, ability, def.side)) {
            failures.push(
              `${def.id} ${ability.id} opened a choice on ${started.state.timingKey} after being used in ${step}`,
            );
          }
          if (started.state.pendingChoice.sourceId !== open.cardId) {
            failures.push(
              `${def.id} ${ability.id} choice source is ${started.state.pendingChoice.sourceId}`,
            );
          }
          followChoices(
            started.state,
            (landed) => stepStillLegal(landed, step, ability, def.side),
            failures,
            `${def.id} ${ability.id}`,
          );
        }
      }
      expect(failures).toEqual([]);
    },
    60_000,
  );
});

describe("a paid ability refuses when its requirement is missing", () => {
  it(
    "refuses a click or credit cost when the pool is empty",
    () => {
      const failures: string[] = [];
      let refused = 0;
      for (const def of loadCardCatalog(true).values()) {
        for (const ability of def.paidAbilities ?? []) {
          if (!poolCost(ability)) continue;
          const result = use(def, ability, (state) => {
            zeroPools(state);
          });
          if ("threw" in result) {
            failures.push(`${def.id} ${ability.id} threw: ${result.threw}`);
            continue;
          }
          if (result.ok) {
            failures.push(`${def.id} ${ability.id} resolved with an empty pool`);
            continue;
          }
          if (result.error === "Cannot pay ability cost.") refused += 1;
        }
      }
      expect(failures).toEqual([]);
      expect(refused).toBeGreaterThan(0);
    },
    60_000,
  );

  it(
    "refuses an encounter ability with no encounter, and passes that check once one is open",
    () => {
      const failures: string[] = [];
      let refused = 0;
      const encounterError = "This ability is used while encountering ice.";
      for (const def of loadCardCatalog(true).values()) {
        for (const ability of def.paidAbilities ?? []) {
          if (!abilityNeedsEncounter(ability)) continue;
          const bare = use(def, ability, (state) => {
            state.run = null;
          });
          if ("threw" in bare) {
            failures.push(`${def.id} ${ability.id} threw: ${bare.threw}`);
            continue;
          }
          if (bare.ok) {
            const broke =
              def.type === "identity" &&
              bare.state.log.some((entry) => entry.includes(" breaks "));
            if (broke || def.type !== "identity") {
              failures.push(`${def.id} ${ability.id} resolved with no encounter`);
            }
            continue;
          }
          if (bare.error !== encounterError) continue;
          refused += 1;
          const open = use(def, ability, () => {});
          if ("threw" in open) {
            failures.push(`${def.id} ${ability.id} threw during an encounter: ${open.threw}`);
            continue;
          }
          if (!open.ok && open.error === encounterError) {
            failures.push(`${def.id} ${ability.id} still requires an encounter while one is open`);
          }
        }
      }
      expect(failures).toEqual([]);
      expect(refused).toBeGreaterThan(0);
    },
    60_000,
  );

  it(
    "skips an instruction with no card to act on, and continues once a card is there",
    () => {
      const failures: string[] = [];
      let skipped = 0;
      for (const def of loadCardCatalog(true).values()) {
        for (const ability of def.paidAbilities ?? []) {
          const empty = use(def, ability, (state, cardId) => {
            const keep = new Set<string>([cardId]);
            if (state.run?.encounter?.iceId) keep.add(state.run.encounter.iceId);
            stripTargets(state, keep);
          });
          if ("threw" in empty || !empty.ok) continue;
          const added = empty.state.log.slice(empty.from);
          const line = added.find((entry) => NO_TARGET.test(entry));
          if (!line) continue;
          if (empty.state.pendingChoice) continue;
          const keep = new Set<string>([empty.cardId]);
          if (empty.state.run?.encounter?.iceId) keep.add(empty.state.run.encounter.iceId);
          const zones = [
            empty.state.corp.hand,
            empty.state.corp.deck,
            empty.state.corp.discardPile,
            empty.state.runner.hand,
            empty.state.runner.deck,
            empty.state.runner.discardPile,
          ];
          if (zones.some((zone) => zone.some((id) => !keep.has(id)))) {
            failures.push(`${def.id} ${ability.id} moved a card while skipping: ${line}`);
            continue;
          }
          const full = use(def, ability, () => {});
          if ("threw" in full) {
            failures.push(`${def.id} ${ability.id} threw with cards present: ${full.threw}`);
            continue;
          }
          if (!full.ok) continue;
          const fullLog = full.state.log.join("\n");
          if (fullLog.includes(line)) continue;
          skipped += 1;
        }
      }
      expect(failures).toEqual([]);
      expect(skipped).toBeGreaterThan(0);
    },
    60_000,
  );

  it("follows the last option when a choice has two ways to continue", () => {
    const failures: string[] = [];
    let branched = 0;
    for (const def of loadCardCatalog(true).values()) {
      for (const ability of def.paidAbilities ?? []) {
        const step = legalStep(ability, def.side);
        if (!step) continue;
        const result = use(def, ability, () => {});
        if ("threw" in result || !result.ok || !result.state.pendingChoice) continue;
        const options = result.state.pendingChoice.options;
        if (options.length < 2) continue;
        const last = options[options.length - 1]!;
        if (/^(decl:|bribery-x:|install-x:|anson:|chronos:|diwan:)/.test(last.id)) continue;
        branched += 1;
        followChoices(
          result.state,
          (timingKey) => stepStillLegal(timingKey, step, ability, def.side),
          failures,
          `${def.id} ${ability.id}`,
          "last",
        );
      }
    }
    expect(failures).toEqual([]);
    expect(branched).toBeGreaterThan(0);
  }, 60_000);
});

describe("conditional abilities resolve on their turn step", () => {
  it(
    "follows a choice opened when the turn, run, encounter, or success step resolves",
    () => {
      const failures: string[] = [];
      const specs: Array<{
        field: "onTurnBegin" | "onRunBegin" | "onEncounter" | "onFirstEncounterEachRun" | "onSuccessfulRun";
        step: string;
        run: boolean;
        success: boolean;
      }> = [
        { field: "onTurnBegin", step: "corp.turnBegins", run: false, success: false },
        { field: "onTurnBegin", step: "runner.turnBegins", run: false, success: false },
        { field: "onRunBegin", step: "run.begin", run: true, success: false },
        { field: "onEncounter", step: "run.encounter", run: true, success: false },
        { field: "onFirstEncounterEachRun", step: "run.encounter", run: true, success: false },
        { field: "onSuccessfulRun", step: "run.success", run: true, success: true },
      ];
      for (const def of loadCardCatalog(true).values()) {
        for (const spec of specs) {
          const hook = (def as Record<string, unknown>)[spec.field];
          if (!hook || typeof hook !== "object" || !("op" in hook)) continue;
          if (spec.field === "onTurnBegin" && spec.step === "corp.turnBegins" && def.side !== "corp") continue;
          if (spec.field === "onTurnBegin" && spec.step === "runner.turnBegins" && def.side !== "runner") continue;
          if (spec.field === "onEncounter" && def.type !== "ice") continue;
          if (
            (spec.field === "onRunBegin" || spec.field === "onFirstEncounterEachRun" || spec.field === "onSuccessfulRun") &&
            def.side === "runner" &&
            def.type !== "program" &&
            def.type !== "hardware" &&
            def.type !== "resource" &&
            def.type !== "identity"
          ) {
            continue;
          }
          const seated = prepare(def);
          if (
            (spec.field === "onRunBegin" || spec.field === "onFirstEncounterEachRun" || spec.field === "onSuccessfulRun") &&
            !seated.state.runner.installed.includes(seated.cardId) &&
            seated.cardId !== seated.state.runner.identityId
          ) {
            continue;
          }
          atStep(seated.state, spec.step);
          if (spec.run) {
            if (seated.state.servers.hq.ice.length === 0 && seated.state.cards["corp-ice-1"]) {
              seated.state.corp.deck = seated.state.corp.deck.filter((id) => id !== "corp-ice-1");
              seated.state.servers.hq.ice = ["corp-ice-1"];
              seated.state.cards["corp-ice-1"]!.rezzed = true;
              seated.state.cards["corp-ice-1"]!.faceup = true;
              seated.state.cards["corp-ice-1"]!.zone = "server:hq:ice";
            }
            const iceId = seated.state.servers.hq.ice[0] ?? null;
            openRun(seated.state, "hq", spec.step === "run.encounter" ? iceId : null);
            if (seated.state.run && spec.success) seated.state.run.successful = true;
          }
          try {
            STEPS[spec.step]?.onResolve?.(seated.state);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push(`${def.id} ${spec.field} threw in ${spec.step}: ${message}`);
            continue;
          }
          const added = seated.state.log.join("\n");
          if (added.includes("Unhandled primitive")) {
            failures.push(`${def.id} ${spec.field} hit an unhandled primitive in ${spec.step}`);
          }
          if (!seated.state.pendingChoice) continue;
          followChoices(
            seated.state,
            (timingKey) => timingKey === spec.step,
            failures,
            `${def.id} ${spec.field}`,
          );
        }
      }
      expect(failures).toEqual([]);
    },
    60_000,
  );
});

const INTERRUPT_WINDOWS = new Set<PaidAbilityWindow>([
  "damage_interrupt",
  "tag_interrupt",
  "expose_interrupt",
  "trash_interrupt",
  "trace_interrupt",
  "break_interrupt",
]);

function interruptOnly(ability: PaidAbility): boolean {
  return ability.windows.length > 0 && ability.windows.every((window) => INTERRUPT_WINDOWS.has(window));
}

function armInterrupt(state: GameState, ability: PaidAbility, cardId: string): void {
  if (ability.requireDuringRun && !state.run) {
    if (state.servers.hq.ice.length === 0 && state.cards["corp-ice-1"]) {
      state.corp.deck = state.corp.deck.filter((id) => id !== "corp-ice-1");
      state.servers.hq.ice = ["corp-ice-1"];
      state.cards["corp-ice-1"]!.rezzed = true;
      state.cards["corp-ice-1"]!.faceup = true;
      state.cards["corp-ice-1"]!.zone = "server:hq:ice";
    }
    openRun(state, "hq", state.servers.hq.ice[0] ?? null);
  }
  const noop = {
    op: "do" as const,
    action: { kind: "gain_credits" as const, side: "corp" as const, amount: 0 },
  };
  if (ability.windows.includes("damage_interrupt")) {
    if (ability.onlyFirstNetDamageWouldThisRun) {
      const serverId = state.servers["remote-1"]?.root.includes(cardId) ? "remote-1" : "hq";
      if (!state.servers[serverId].root.includes(cardId)) {
        state.servers.hq.root.push(cardId);
        state.cards[cardId]!.zone = "server:hq:root";
      }
      openRun(state, serverId, state.servers.hq.ice[0] ?? null);
      if (state.run) state.run.netDamageWould = 1;
    }
    state.pendingDamage = {
      type: ability.requirePendingDamageTypes?.[0] ?? "net",
      remaining: 2,
      sourceId: cardId,
    };
    return;
  }
  if (ability.windows.includes("tag_interrupt")) {
    state.pendingTags = {
      remaining: 1,
      sourceId: cardId,
      activeAtOpen: [cardId, ...state.runner.installed],
    };
    return;
  }
  if (ability.windows.includes("expose_interrupt")) {
    state.pendingExpose = { cardId, phase: "interrupt" };
    return;
  }
  if (ability.windows.includes("trash_interrupt")) {
    state.pendingTrashPrevent = { cardId, trashExpected: true, pendingInterruptIds: [cardId] };
    return;
  }
  if (ability.windows.includes("trace_interrupt")) {
    state.trace = {
      id: "trace",
      sourceId: cardId,
      baseStrength: 0,
      corpSpent: 0,
      runnerLinkSpent: 0,
      onSuccess: noop,
    };
    return;
  }
  const iceId = state.cards[cardId]?.type === "ice" ? cardId : (state.servers.hq.ice[0] ?? cardId);
  state.pendingSubroutineBreak = { iceId, subIndex: 0 };
}

describe("interrupt windows and subroutine resolution", () => {
  it(
    "uses an interrupt-only ability while that interrupt is open",
    () => {
      const failures: string[] = [];
      let used = 0;
      for (const def of loadCardCatalog(true).values()) {
        for (const ability of def.paidAbilities ?? []) {
          if (!interruptOnly(ability)) continue;
          const result = use(
            def,
            ability,
            (state, cardId) => armInterrupt(state, ability, cardId),
            "corp.gainClicks",
          );
          if ("threw" in result) {
            failures.push(`${def.id} ${ability.id} threw: ${result.threw}`);
            continue;
          }
          if (
            !result.ok &&
            /No paid-ability window|not usable now|Identity ability not usable/.test(result.error)
          ) {
            failures.push(`${def.id} ${ability.id} refused during its interrupt: ${result.error}`);
            continue;
          }
          if (!result.ok) continue;
          used += 1;
          if (!result.state.pendingChoice) continue;
          followChoices(
            result.state,
            (timingKey) => timingKey === "corp.gainClicks",
            failures,
            `${def.id} ${ability.id}`,
          );
        }
      }
      expect(failures).toEqual([]);
      expect(used).toBeGreaterThan(0);
    },
    60_000,
  );

  it(
    "resolves the next unbroken subroutine on its encounter step",
    () => {
      const failures: string[] = [];
      let resolved = 0;
      for (const def of loadCardCatalog(true).values()) {
        if (def.type !== "ice" || (def.subroutines ?? []).length === 0) continue;
        const seated = prepare(def);
        atStep(seated.state, "run.resolveSub");
        openRun(seated.state, "hq", seated.cardId);
        if (seated.state.run) seated.state.run.position = 0;
        try {
          STEPS["run.resolveSub"]?.onResolve?.(seated.state);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`${def.id} threw while resolving a subroutine: ${message}`);
          continue;
        }
        if (seated.state.log.some((entry) => entry.includes("Unhandled primitive"))) {
          failures.push(`${def.id} hit an unhandled primitive while resolving a subroutine`);
        }
        resolved += 1;
        if (!seated.state.pendingChoice) continue;
        followChoices(
          seated.state,
          (timingKey) => timingKey === "run.resolveSub",
          failures,
          def.id,
        );
      }
      expect(failures).toEqual([]);
      expect(resolved).toBeGreaterThan(0);
    },
    60_000,
  );
});

describe("later turn steps", () => {
  function ensureIce(state: GameState): void {
    if (state.servers.hq.ice.length > 0 || !state.cards["corp-ice-1"]) return;
    state.corp.deck = state.corp.deck.filter((id) => id !== "corp-ice-1");
    state.servers.hq.ice = ["corp-ice-1"];
    const ice = state.cards["corp-ice-1"]!;
    ice.rezzed = true;
    ice.faceup = true;
    ice.zone = "server:hq:ice";
  }

  function inHqRoot(state: GameState, cardId: string): void {
    const card = state.cards[cardId]!;
    for (const server of Object.values(state.servers)) {
      server.root = server.root.filter((id) => id !== cardId);
      server.ice = server.ice.filter((id) => id !== cardId);
    }
    state.corp.scoreArea = state.corp.scoreArea.filter((id) => id !== cardId);
    state.servers.hq.root.push(cardId);
    card.zone = "server:hq:root";
    card.rezzed = true;
    card.faceup = true;
  }

  function resolveStep(
    state: GameState,
    step: string,
    failures: string[],
    label: string,
  ): void {
    try {
      STEPS[step]?.onResolve?.(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${label} threw in ${step}: ${message}`);
      return;
    }
    if (state.log.some((entry) => entry.includes("Unhandled primitive"))) {
      failures.push(`${label} hit an unhandled primitive in ${step}`);
    }
    if (!state.pendingChoice) return;
    followChoices(state, (timingKey) => timingKey === step, failures, label);
  }

  function markStepHook(card: { side: string } & Record<string, unknown>, field: string): void {
    if (field === "onRunEnd" || field === "onAccess") return;
    const current = card[field];
    if (!current || typeof current !== "object" || !("op" in current)) return;
    markHook(card, current as Effect, (effect) => {
      card[field] = effect;
    });
  }

  it("resolves turn end, approach, pass, breach, run end, and access", () => {
    const failures: string[] = [];
    let resolved = 0;
    const hook = (def: CardDef, field: string): boolean => {
      const value = (def as Record<string, unknown>)[field];
      return Boolean(value && typeof value === "object" && "op" in value);
    };
    for (const def of loadCardCatalog(true).values()) {
      const specs: Array<{ field: string; step: string; server: ServerId }> = [];
      if (hook(def, "onCorpTurnEnd")) specs.push({ field: "onCorpTurnEnd", step: "corp.turnEnds", server: "hq" });
      if (hook(def, "onRunnerTurnEnd")) specs.push({ field: "onRunnerTurnEnd", step: "runner.turnEnds", server: "hq" });
      if (hook(def, "onApproachIce")) specs.push({ field: "onApproachIce", step: "run.approachIce", server: "hq" });
      if (hook(def, "onApproachServer")) specs.push({ field: "onApproachServer", step: "run.approachServer", server: "hq" });
      if (hook(def, "onEncounterEnd") && def.type === "ice") {
        specs.push({ field: "onEncounterEnd", step: "run.movement", server: "hq" });
      }
      if (hook(def, "onBreachRd")) specs.push({ field: "onBreachRd", step: "breach.begin", server: "rd" });
      if (hook(def, "onBreachHqIfHostingCorpCard")) {
        specs.push({ field: "onBreachHqIfHostingCorpCard", step: "breach.begin", server: "hq" });
      }
      if (hook(def, "onRunEnd")) specs.push({ field: "onRunEnd", step: "run.ends", server: "hq" });
      if (hook(def, "onAccess")) specs.push({ field: "onAccess", step: "breach.awaitAccess", server: "hq" });
      if (
        hook(def, "onAccessWhileInstalled") ||
        hook(def, "onAccessWhileUninstalled") ||
        hook(def, "onAccessNotFromRd")
      ) {
        specs.push({ field: "onAccess", step: "access.cardAccessed", server: "hq" });
      }
      for (const spec of specs) {
        const seated = prepare(def);
        const { state, cardId } = seated;
        atStep(state, spec.step);
        const card = state.cards[cardId]!;
        if (spec.field === "onCorpTurnEnd" && def.type !== "agenda") inHqRoot(state, cardId);
        if (spec.field === "onRunnerTurnEnd") {
          const seatedOnRunner =
            cardId === state.runner.identityId ||
            state.runner.installed.includes(cardId) ||
            state.runner.discardPile.includes(cardId);
          if (!seatedOnRunner) {
            state.runner.discardPile.push(cardId);
            card.zone = "runner:heap";
          }
        }
        if (spec.field === "onApproachIce" || spec.field === "onApproachServer") inHqRoot(state, cardId);
        if (spec.field === "onBreachRd" || spec.field === "onBreachHqIfHostingCorpCard") {
          if (cardId !== state.runner.identityId && !state.runner.installed.includes(cardId)) {
            state.runner.installed.push(cardId);
            card.zone = "runner:installed";
          }
        }
        if (spec.step.startsWith("run.") || spec.step.startsWith("breach.") || spec.step.startsWith("access.")) {
          ensureIce(state);
          const iceId =
            def.type === "ice" && state.servers.hq.ice.includes(cardId)
              ? cardId
              : (state.servers.hq.ice[0] ?? null);
          const onIce = spec.step === "run.movement" || spec.step === "run.approachIce";
          openRun(state, spec.server, onIce ? iceId : null);
          if (spec.step === "run.approachIce" && state.run && iceId) {
            state.run.position = state.servers.hq.ice.indexOf(iceId);
            state.run.phase = "approach_ice";
          }
          if (spec.step === "run.approachServer" && state.run) state.run.position = null;
          if (spec.field === "onRunEnd" && state.run) {
            markHook(card, card.onRunEnd, (effect) => {
              card.onRunEnd = effect;
            });
            state.run.runSourceId = cardId;
            state.run.onRunEndEffect = card.onRunEnd;
          }
          if (spec.field === "onBreachHqIfHostingCorpCard" && state.corp.hand[0]) {
            card.hostedCardIds = [state.corp.hand[0]];
          }
        }
        if (spec.step === "breach.awaitAccess" && state.run) {
          if (card.onAccessRequiresInstalled) inHqRoot(state, cardId);
          markHook(card, card.onAccess, (effect) => {
            card.onAccess = effect;
          });
          const before = zeroGainCount(state.log);
          state.run.accessCandidates = [cardId];
          state.run.randomAccessLimit = 1;
          state.activeSide = "runner";
          const accessed = applyAction(state, { type: "access_card", cardId });
          if (!accessed.ok) {
            failures.push(`${def.id} onAccess was refused: ${accessed.error}`);
            continue;
          }
          const done = accessed.state.pendingChoice
            ? followChoices(
                accessed.state,
                (timingKey) => timingKey === "breach.awaitAccess" || timingKey.startsWith("access."),
                failures,
                `${def.id} onAccess`,
              )
            : accessed.state;
          if (zeroGainCount(done.log) === before) {
            failures.push(`${def.id} onAccess did not run during the access`);
          }
          resolved += 1;
          continue;
        }
        if (spec.step === "access.cardAccessed" && state.run) {
          state.run.accessingCardId = cardId;
          if (hook(def, "onAccessWhileInstalled")) {
            inHqRoot(state, cardId);
            markHook(card, card.onAccessWhileInstalled, (effect) => {
              card.onAccessWhileInstalled = effect;
            });
          }
          if (hook(def, "onAccessWhileUninstalled")) {
            card.zone = "corp:hq";
            if (!state.corp.hand.includes(cardId)) state.corp.hand.push(cardId);
            markHook(card, card.onAccessWhileUninstalled, (effect) => {
              card.onAccessWhileUninstalled = effect;
            });
          }
          if (hook(def, "onAccessNotFromRd")) {
            markHook(card, card.onAccessNotFromRd, (effect) => {
              card.onAccessNotFromRd = effect;
            });
          }
        }
        markStepHook(card, spec.field);
        const beforeHook = zeroGainCount(state.log);
        resolveStep(state, spec.step, failures, `${def.id} ${spec.field}`);
        if (zeroGainCount(state.log) === beforeHook) {
          failures.push(`${def.id} ${spec.field} did not run in ${spec.step}`);
        }
        resolved += 1;
      }
    }
    expect(failures).toEqual([]);
    expect(resolved).toBeGreaterThan(0);
  }, 60_000);

  it("scores an agenda from its server and steals an accessed agenda", () => {
    const failures: string[] = [];
    let scored = 0;
    let stolen = 0;
    for (const def of loadCardCatalog(true).values()) {
      if (def.type !== "agenda" || def.side !== "corp") continue;
      const scoring = prepare(def);
      const agenda = scoring.state.cards[scoring.cardId]!;
      scoring.state.corp.scoreArea = scoring.state.corp.scoreArea.filter((id) => id !== scoring.cardId);
      if (!scoring.state.servers["remote-1"]) {
        scoring.state.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: [] };
      }
      scoring.state.servers["remote-1"].root.push(scoring.cardId);
      agenda.zone = "server:remote-1:root";
      agenda.rezzed = true;
      agenda.faceup = true;
      agenda.advancementCounters = Math.max(agenda.advancementRequirement ?? 0, 5);
      scoring.state.activeSide = "corp";
      atStep(scoring.state, "corp.actionPaw");
      const beforeScore = agendaPointsFor(scoring.state, "corp");
      let scoreResult: ReturnType<typeof applyAction>;
      try {
        scoreResult = applyAction(scoring.state, { type: "score_agenda", cardId: scoring.cardId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${def.id} score threw: ${message}`);
        continue;
      }
      if (scoreResult.ok) {
        if (scoreResult.state.log.some((entry) => entry.includes("Unhandled primitive"))) {
          failures.push(`${def.id} score hit an unhandled primitive`);
        }
        const done = scoreResult.state.pendingChoice
          ? followChoices(
              scoreResult.state,
              (timingKey) => timingKey === "corp.actionPaw",
              failures,
              `${def.id} score`,
            )
          : scoreResult.state;
        if (!done.pendingChoice) {
          const scoredCard = done.cards[scoring.cardId];
          const recorded = done.turn.scoredCardIdsThisTurn?.includes(scoring.cardId) === true;
          const inScore = Boolean(scoredCard && scoredCard.zone === "corp:score" && done.corp.scoreArea.includes(scoring.cardId));
          if (!recorded && !inScore) {
            failures.push(
              `${def.id} score left the agenda in ${scoredCard?.zone ?? "nowhere"} (CR 1.17.6)`,
            );
          } else if (inScore && scoredCard) {
            const expected = agendaPointContribution(scoredCard, "corp");
            if (agendaPointsFor(done, "corp") < beforeScore + expected) {
              failures.push(`${def.id} score did not add its agenda points (CR 1.17.6)`);
            } else {
              scored += 1;
            }
          } else {
            scored += 1;
          }
        }
      }

      const stealing = prepare(def);
      const stolenCard = stealing.state.cards[stealing.cardId]!;
      stealing.state.corp.scoreArea = stealing.state.corp.scoreArea.filter((id) => id !== stealing.cardId);
      stealing.state.corp.hand.push(stealing.cardId);
      stolenCard.zone = "corp:hq";
      stolenCard.faceup = true;
      ensureIce(stealing.state);
      openRun(stealing.state, "hq", null);
      stealing.state.run!.accessingCardId = stealing.cardId;
      stealing.state.activeSide = "runner";
      const beforeSteal = agendaPointsFor(stealing.state, "runner");
      atStep(stealing.state, "access.stealAgenda");
      let stealResult: ReturnType<typeof applyAction>;
      try {
        stealResult = applyAction(stealing.state, { type: "steal_agenda", cardId: stealing.cardId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${def.id} steal threw: ${message}`);
        continue;
      }
      if (!stealResult.ok) continue;
      if (stealResult.state.log.some((entry) => entry.includes("Unhandled primitive"))) {
        failures.push(`${def.id} steal hit an unhandled primitive`);
      }
      const stolenDone = stealResult.state.pendingChoice
        ? followChoices(
            stealResult.state,
            (timingKey) => timingKey === "access.stealAgenda",
            failures,
            `${def.id} steal`,
          )
        : stealResult.state;
      if (stolenDone.pendingChoice) continue;
      const taken = stolenDone.cards[stealing.cardId];
      if (!taken || taken.zone !== "runner:score" || !stolenDone.runner.scoreArea.includes(stealing.cardId)) {
        failures.push(`${def.id} steal left the agenda in ${taken?.zone ?? "nowhere"} (CR 1.17.7)`);
        continue;
      }
      const expected = agendaPointContribution(taken, "runner");
      if (agendaPointsFor(stolenDone, "runner") < beforeSteal + expected) {
        failures.push(`${def.id} steal did not add its agenda points (CR 1.17.7)`);
        continue;
      }
      stolen += 1;
    }
    expect(failures).toEqual([]);
    expect(scored).toBeGreaterThan(0);
    expect(stolen).toBeGreaterThan(0);
  }, 60_000);
});
