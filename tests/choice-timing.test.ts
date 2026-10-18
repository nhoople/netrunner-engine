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
import { cursorFrom } from "../src/timing/graph.js";
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
  assertCardsPinnedTag("v1.147.6");
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

function followChoices(
  state: GameState,
  legal: (timingKey: string) => boolean,
  failures: string[],
  label: string,
): void {
  let current = state;
  const seen = new Set<string>();
  for (let i = 0; i < 5 && current.pendingChoice; i++) {
    if (!legal(current.timingKey)) {
      failures.push(`${label} choice stayed open on ${current.timingKey}`);
      return;
    }
    const option = current.pendingChoice.options[0];
    if (!option || seen.has(option.id)) return;
    if (/^(decl:|bribery-x:|install-x:|anson:|chronos:|diwan:)/.test(option.id)) return;
    seen.add(option.id);
    let next: ReturnType<typeof applyAction>;
    try {
      next = applyAction(current, { type: "choose_option", optionId: option.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${label} choice threw: ${message}`);
      return;
    }
    if (!next.ok) return;
    current = next.state;
  }
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
):
  | { ok: true; state: GameState; from: number; cardId: string }
  | { ok: false; error: string; from: number; cardId: string }
  | { threw: string } {
  const step = legalStep(ability, def.side);
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
