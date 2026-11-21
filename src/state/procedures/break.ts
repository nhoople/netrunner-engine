/**
 * Breaking subroutines: the one place that decides whether a Runner card may
 * break a subroutine, and records the break. This is the start of area 11's
 * break helper; every break path calls it instead of keeping its own copy.
 *
 * - `interfaceBlock`: an icebreaker can use an interface ability only at
 *   strength greater than or equal to the encountered ice's (CR 3.9.5g,
 *   9.3.6c), and only with ice its own text lets it interface with
 *   (Umbrella, Alpha, Omega, Atman, Cyber-Cypher). An option carries a
 *   printed break's extra limit (Wyrm: ice with 0 or less strength).
 * - `paidAbilityBreakBlock`: the same check when a paid ability is used,
 *   before its costs are paid (CR 3.9.5g: "can only use"). It is keyed on
 *   what the ability does (a break, or another interface effect), never on
 *   the card data's `interface` flag, which 69 pump abilities carry although
 *   their printed text does not. It also applies a program's limit on all
 *   of its abilities (Cyber-Cypher's chosen server), pumps included.
 * - `runnerBreakBlock`: the ice's and the breaker's own limits on any Runner
 *   break (Trieste, "only by a fracter" (Semak-samun), AI programs, NEXT Activation
 *   Command, Hafrún).
 * - `subroutineBreakBlock` and `nextBreakableSubroutine`: per-subroutine
 *   limits for this encounter (Inazuma, Anvil, and the Hammer-class cap on
 *   printed subroutines, which counts only printed subroutines broken by a
 *   breaker the ice does not exempt).
 * - `markSubroutineBroken`: marks a subroutine broken and records who broke it.
 * - `breakActionCost`: what the basic break action costs a declared breaker.
 */
import { abilitiesSuppressed } from "../abilities.js";
import { facedownInstalledRunnerCard, isCardActive } from "../active.js";
import { effectHasKind } from "../costs.js";
import {
  cannotBreakExceptIcebreakerActive,
  cardHasIcebreakerSubtype,
} from "../lockdowns.js";
import { currentMark } from "../msKeywords.js";
import {
  effectiveBreakerStrength,
  effectiveIceStrength,
  effectiveIceSubtypes,
  iceBlocksAiBreak,
  iceBreakExceptSubtype,
  isAiBreaker,
  serverIdForIce,
} from "../../cards/stubs.js";
import { CR } from "../../timing/labels.js";
import type {
  CardInstance,
  GameState,
  PaidAbility,
  RuleCite,
} from "../types.js";

export type BreakBlock = { error: string; cites: RuleCite[] };

function block(error: string, cites: RuleCite[]): BreakBlock {
  return { error, cites };
}

/**
 * Effect kinds that break subroutines on the encountered ice for a Runner
 * card's paid ability. Bioroid click breaks and the Corp's own "break a
 * subroutine on this ice" abilities are Corp card abilities and are not here.
 */
const RUNNER_BREAK_KINDS = new Set([
  "break_encounter_subroutine",
  "break_host_subroutine",
  "break_barrier",
  "break_sentry_or_barrier",
  "break_code_gate_or_barrier",
  "break_sentry_or_code_gates",
  "break_etr_subroutine_trash_installed",
  "break_all_destroyer_subroutines_on_encounter",
  "break_all_but_n_subroutines_on_encounter",
  "break_matryoshka",
  "break_any_subroutine",
  "break_first_subroutine",
  "break_last_subroutine",
]);

/**
 * Interface abilities on icebreakers that do not break: Banner's "cannot end
 * the run" and Flashbang's derez (CR 3.9.5e).
 */
const INTERFACE_ONLY_KINDS = new Set([
  "forbid_end_the_run_this_encounter",
  "derez_encountered_ice",
]);

/**
 * Wyrm's "Interface → 1[credit]: The ice you are encountering gets -1
 * strength" shares `weaken_ice` with Corsair's ability, which is not an
 * interface ability, so it is named by ability id until the card data marks
 * interface abilities correctly (paired cut A).
 */
const INTERFACE_ABILITY_IDS = new Set(["wyrm-weaken"]);

/**
 * Can this icebreaker use an interface ability on this ice? CR 3.9.5g: only
 * if its strength is greater than or equal to the ice's (Atman: exactly
 * equal), plus the limits printed on the program itself. `maxIceStrength` is
 * a printed break's own limit (Wyrm's "a piece of ice with 0 or less
 * strength").
 */
export function interfaceBlock(
  state: GameState,
  breakerId: string,
  iceId: string,
  opts: { maxIceStrength?: number } = {},
): BreakBlock | null {
  const breaker = state.cards[breakerId];
  const ice = state.cards[iceId];
  if (!breaker || !ice) {
    return block("No encountered ice.", [CR.icebreakerInterface]);
  }
  if (breaker.interfaceRequiresTrojanHost) {
    const hasTrojan = Object.values(state.cards).some(
      (c) =>
        c.hostId === iceId &&
        (c.subtypes ?? []).includes("trojan") &&
        state.runner.installed.includes(c.id),
    );
    if (!hasTrojan) {
      return block(
        `${breaker.title} can only interface ice hosting a trojan.`,
        [CR.icebreakerInterface],
      );
    }
  }
  if (
    breaker.interfaceRequiresChosenServer &&
    state.run?.attackedServerId !== breaker.chosenServerId
  ) {
    return block(
      `${breaker.title} can only be used during runs on its chosen server.`,
      [CR.icebreakerInterface],
    );
  }
  if (breaker.breakerOnlyOutermostIce || breaker.breakerOnlyInnermostIce) {
    const sid = serverIdForIce(state, iceId);
    const ices = sid ? state.servers[sid].ice : [];
    const outermost = ices[0] === iceId;
    const innermost = ices[ices.length - 1] === iceId;
    if (breaker.breakerOnlyOutermostIce && !outermost) {
      return block(
        `${breaker.title} can only interface with the outermost ice protecting a server.`,
        [CR.icebreakerInterface],
      );
    }
    if (breaker.breakerOnlyInnermostIce && !innermost) {
      return block(
        `${breaker.title} can only interface with the innermost ice protecting a server.`,
        [CR.icebreakerInterface],
      );
    }
  }
  const iceStr = effectiveIceStrength(state, iceId);
  const brStr = effectiveBreakerStrength(state, breakerId);
  if (breaker.interfaceRequiresEqualStrength) {
    if (brStr !== iceStr) {
      return block(
        `${breaker.title} strength ${brStr} must equal ice strength ${iceStr}.`,
        [CR.icebreakerInterfaceStrength, CR.interfaceFlag],
      );
    }
  } else if (brStr < iceStr) {
    return block(
      `${breaker.title} strength ${brStr} is less than ${ice.title}'s strength ${iceStr} (CR ${CR.icebreakerInterfaceStrength.number}).`,
      [CR.icebreakerInterfaceStrength, CR.interfaceFlag],
    );
  }
  if (typeof opts.maxIceStrength === "number" && iceStr > opts.maxIceStrength) {
    return block(
      `${breaker.title} can only break ice with ${opts.maxIceStrength} or less strength (current ${iceStr}).`,
      [CR.encounterBreakPaw],
    );
  }
  return null;
}

/**
 * The Runner broke every subroutine on the encountered ice (CR 6.2.7, 1.2.1:
 * "fully break"). A subroutine that resolved, was prevented or was skipped
 * is marked in `broken` only so it does not fire again; it is not broken by
 * the Runner (Chum, The Gauntlet).
 */
export function encounterFullyBrokenByRunner(
  enc: Encounter | null | undefined,
): boolean {
  if (!enc) return false;
  if (enc.fullyBrokenByRunner) return true;
  return enc.broken.length > 0 && allSubroutinesBrokenByRunner(enc);
}

type Encounter = NonNullable<NonNullable<GameState["run"]>["encounter"]>;

/**
 * Subroutine `index` was broken by the Runner this encounter. A subroutine
 * that resolved, was prevented, was skipped or was bypassed is not broken
 * (CR 6.5.7a, 6.5.8b): it is marked in `broken` only so it does not fire.
 * Every reader that asks "did the Runner break it" reads this.
 */
export function subroutineBrokenByRunner(
  enc: Encounter | null | undefined,
  index: number,
): boolean {
  if (!enc || !enc.broken[index]) return false;
  return !(enc.notBrokenByRunner ?? []).includes(index);
}

/** How many subroutines the Runner broke this encounter. */
export function subroutinesBrokenByRunnerCount(
  enc: Encounter | null | undefined,
): number {
  if (!enc) return 0;
  let n = 0;
  for (let i = 0; i < enc.broken.length; i++) {
    if (subroutineBrokenByRunner(enc, i)) n += 1;
  }
  return n;
}

/**
 * Every subroutine on the ice is broken by the Runner (CR 6.5.7a). True for
 * ice with no subroutines (CR 9.12.2d); callers decide when that applies.
 */
export function allSubroutinesBrokenByRunner(enc: Encounter): boolean {
  return enc.broken.every((_, i) => subroutineBrokenByRunner(enc, i));
}

/** Mark subroutine `index` done without the Runner breaking it. */
export function markSubroutineNotBrokenByRunner(
  enc: Encounter,
  index: number,
): void {
  enc.broken[index] = true;
  if (!(enc.notBrokenByRunner ?? []).includes(index)) {
    enc.notBrokenByRunner = [...(enc.notBrokenByRunner ?? []), index];
  }
}

/**
 * The Runner broke subroutine `index`. A subroutine that Mass-Driver kept
 * from resolving is still unbroken, so the Runner may break it (CR 9.8.5,
 * 9.8.6); breaking it clears that mark.
 */
export function markSubroutineBrokenByRunner(
  enc: Encounter,
  index: number,
): void {
  enc.broken[index] = true;
  if (enc.notBrokenByRunner?.includes(index)) {
    enc.notBrokenByRunner = enc.notBrokenByRunner.filter((i) => i !== index);
  }
}

/**
 * Bypass, or another way the encounter ends with no more subroutines to
 * resolve: mark every subroutine not yet broken as done without the Runner
 * breaking it (CR 6.5.8b–c). Subroutines the Runner already broke stay
 * broken by the Runner.
 */
export function markRemainingSubroutinesNotBrokenByRunner(
  enc: Encounter,
  count: number = enc.broken.length,
): void {
  while (enc.broken.length < count) enc.broken.push(false);
  for (let i = 0; i < enc.broken.length; i++) {
    if (!enc.broken[i]) markSubroutineNotBrokenByRunner(enc, i);
  }
}

/** The encountered ice's subroutines were replaced: no marks carry over. */
export function resetEncounterBreaks(enc: Encounter, count: number): void {
  enc.broken = Array.from({ length: count }, () => false);
  enc.notBrokenByRunner = undefined;
}

/**
 * `delta` subroutines were inserted at `at` (delta > 0), or removed from `at`
 * (delta < 0): the not-broken-by-the-Runner marks move with their
 * subroutines, and a removed subroutine's mark goes with it.
 */
export function shiftEncounterBreaks(
  enc: Encounter,
  at: number,
  delta: number,
): void {
  if (!enc.notBrokenByRunner?.length) return;
  const removedEnd = delta < 0 ? at - delta : at;
  enc.notBrokenByRunner = enc.notBrokenByRunner
    .filter((i) => i < at || i >= removedEnd)
    .map((i) => (i >= at ? i + delta : i));
}

/** The encountered ice now has `length` subroutines: drop marks past the end. */
export function trimEncounterBreaks(enc: Encounter, length: number): void {
  if (!enc.notBrokenByRunner?.length) return;
  enc.notBrokenByRunner = enc.notBrokenByRunner.filter((i) => i < length);
}

/**
 * Trieste Model Bioroids: "Runner card abilities cannot break subroutines on
 * the chosen ice." A static ability of Trieste, so it applies only while
 * Trieste is active and not blanked (CR 9.4.1, 1.8.3a).
 */
export function triesteForbidsRunnerBreak(
  state: GameState,
  iceId: string,
): boolean {
  return Object.values(state.cards).some(
    (card) =>
      card.triesteChosenIceId === iceId &&
      isCardActive(state, card.id) &&
      !abilitiesSuppressed(state, card.id),
  );
}

/**
 * The ice's and the breaker's own limits on any Runner break, whoever's
 * ability it is: Trieste (Runner card abilities), "only by a fracter"
 * (Semak-samun class), no AI programs, NEXT Activation Command (icebreakers
 * only), and Hafrún (this program cannot break this run).
 */
export function runnerBreakBlock(
  state: GameState,
  sourceId: string,
  iceId: string,
): BreakBlock | null {
  const source = state.cards[sourceId];
  const ice = state.cards[iceId];
  if (!source || !ice) return block("No encountered ice.", [CR.encounterIce]);
  // A facedown installed Runner card's abilities are not active (CR 8.1.4a).
  if (facedownInstalledRunnerCard(state, sourceId)) {
    return block(`A facedown card's abilities are not active.`, [
      CR.abilityActive,
    ]);
  }
  if (
    source.side === "runner" &&
    (ice.cannotBreakWithRunnerCardAbilities ||
      triesteForbidsRunnerBreak(state, iceId))
  ) {
    return block(
      `Runner card abilities cannot break subroutines on ${ice.title}.`,
      [CR.encounterBreakPaw],
    );
  }
  const exceptSubtype = iceBreakExceptSubtype(state, iceId);
  if (exceptSubtype && !(source.subtypes ?? []).includes(exceptSubtype)) {
    return block(
      `Subroutines on ${ice.title} can only be broken by a ${exceptSubtype}.`,
      [CR.encounterBreakPaw],
    );
  }
  if (iceBlocksAiBreak(state, iceId) && isAiBreaker(source)) {
    return block("This ice cannot be broken by AI programs.", [
      CR.encounterBreakPaw,
    ]);
  }
  if (
    cannotBreakExceptIcebreakerActive(state) &&
    !cardHasIcebreakerSubtype(source)
  ) {
    return block(
      "Cannot break subroutines with a non-icebreaker card while NEXT Activation Command is active.",
      [CR.encounterBreakPaw, CR.lockdownOperation],
    );
  }
  if (source.cannotBreakSubsThisRun) {
    return block(
      `${source.title}'s abilities cannot break subroutines this run.`,
      [CR.encounterBreakPaw],
    );
  }
  return null;
}

/**
 * Which of the ice's subroutines are printed on it, not gained (CR 9.3.7e
 * records), as a test on an index. An ice with no records counts all.
 */
function printedTest(ice: CardInstance): (index: number) => boolean {
  const ids = new Set(
    (ice.abilities ?? [])
      .filter((a) => a.class === "subroutine")
      .map((a) => (a as { id?: string }).id),
  );
  return (index) => {
    const sub = ice.subroutines?.[index];
    if (!sub) return false;
    return ids.size === 0 || ids.has(sub.id);
  };
}

/**
 * The Runner broke a printed subroutine of the encountered ice this encounter
 * (Mirāju: "if the Runner broke its printed subroutine"; CR 6.5.7a, 9.8.3).
 */
export function printedSubroutineBrokenByRunner(
  ice: CardInstance,
  enc: Encounter,
): boolean {
  const isPrinted = printedTest(ice);
  return enc.broken.some(
    (_, i) => isPrinted(i) && subroutineBrokenByRunner(enc, i),
  );
}

/**
 * Hammer class: how many printed subroutines this source may break on this
 * ice in one encounter, or undefined when there is no cap for it.
 */
function printedBreakCap(
  ice: CardInstance,
  source: CardInstance | undefined,
): number | undefined {
  let max = ice.maxPrintedSubsBreakablePerEncounter;
  const atAdv = ice.maxPrintedSubsBreakablePerEncounterAtAdvancements;
  if (atAdv && (ice.advancementCounters ?? 0) >= atAdv.threshold) {
    max = atAdv.max;
  }
  if (typeof max !== "number") return undefined;
  if (breakerExemptFromCap(ice, source)) return undefined;
  return max;
}

function breakerExemptFromCap(
  ice: CardInstance,
  source: CardInstance | undefined,
): boolean {
  const except = ice.maxPrintedSubsBreakExceptSubtype;
  return Boolean(except && (source?.subtypes ?? []).includes(except));
}

/**
 * Per-subroutine limits for this encounter: already broken, Inazuma (no
 * breaks), Anvil (no printed breaks), and the Hammer-class cap. The cap
 * counts printed subroutines broken this encounter, less those broken by a
 * breaker the ice exempts (killers, for Hammer).
 */
export function subroutineBreakBlock(
  state: GameState,
  sourceId: string,
  index: number,
): BreakBlock | null {
  const enc = state.run?.encounter;
  if (!enc) return block("No encounter in progress.", [CR.encounterIce]);
  const ice = state.cards[enc.iceId];
  if (!ice || index < 0 || index >= enc.broken.length) {
    return block("Invalid subroutine index.", [CR.encounterSubResolve]);
  }
  if (subroutineBrokenByRunner(enc, index)) {
    return block("Subroutine already broken.", [CR.fullyBreak]);
  }
  if (enc.forbidRunnerBreakThisEncounter) {
    return block(
      `The Runner cannot break subroutines on ${ice.title} this encounter.`,
      [CR.encounterBreakPaw],
    );
  }
  const isPrinted = printedTest(ice);
  if (!isPrinted(index)) return null;
  if (enc.forbidRunnerBreakPrintedThisEncounter) {
    return block(
      `The Runner cannot break ${ice.title}'s printed subroutines this encounter.`,
      [CR.encounterBreakPaw],
    );
  }
  const source = state.cards[sourceId];
  const cap = printedBreakCap(ice, source);
  if (cap !== undefined) {
    let counted = -(enc.exemptPrintedBreaks ?? 0);
    for (let i = 0; i < enc.broken.length; i++) {
      if (subroutineBrokenByRunner(enc, i) && isPrinted(i)) counted += 1;
    }
    if (counted >= cap) {
      return block(
        `Cannot break more than ${cap} printed subroutine(s) on ${ice.title} this encounter.`,
        [CR.encounterBreakPaw],
      );
    }
  }
  return null;
}

/** The first unbroken subroutine this source may break, or -1. */
export function nextBreakableSubroutine(
  state: GameState,
  sourceId: string,
): number {
  const enc = state.run?.encounter;
  if (!enc) return -1;
  for (let i = 0; i < enc.broken.length; i++) {
    if (!subroutineBreakBlock(state, sourceId, i)) return i;
  }
  return -1;
}

/**
 * Mark a subroutine broken this encounter. A printed subroutine broken by a
 * breaker the ice exempts from its cap (Hammer: killers) is counted, so the
 * cap leaves it out.
 */
export function markSubroutineBroken(
  state: GameState,
  sourceId: string | null,
  index: number,
): void {
  const enc = state.run?.encounter;
  if (!enc) return;
  const ice = state.cards[enc.iceId];
  if (
    !subroutineBrokenByRunner(enc, index) &&
    ice &&
    sourceId &&
    breakerExemptFromCap(ice, state.cards[sourceId]) &&
    printedTest(ice)(index)
  ) {
    enc.exemptPrintedBreaks = (enc.exemptPrintedBreaks ?? 0) + 1;
  }
  markSubroutineBrokenByRunner(enc, index);
}

/**
 * How many subroutines this source could break now, one after another, under
 * the encounter's limits. For a cost chosen before breaking (Matryoshka's X).
 */
export function breakableCount(state: GameState, sourceId: string): number {
  const enc = state.run?.encounter;
  if (!enc) return 0;
  const broken = [...enc.broken];
  const notByRunner = enc.notBrokenByRunner;
  const exempt = enc.exemptPrintedBreaks;
  const n = breakNextSubroutines(state, sourceId, Infinity).length;
  enc.broken = broken;
  enc.notBrokenByRunner = notByRunner;
  enc.exemptPrintedBreaks = exempt;
  return n;
}

/**
 * Break up to `max` subroutines this source may break, first to last, and
 * return their indexes. `max` of Infinity breaks every one it may.
 */
export function breakNextSubroutines(
  state: GameState,
  sourceId: string,
  max: number,
): number[] {
  const out: number[] = [];
  while (out.length < max) {
    const idx = nextBreakableSubroutine(state, sourceId);
    if (idx < 0) break;
    markSubroutineBroken(state, sourceId, idx);
    out.push(idx);
  }
  return out;
}

/**
 * CR 3.9.5g at the moment a paid ability is used, before its costs: an
 * icebreaker's interface ability (a break, or Banner's and Flashbang's
 * effects) needs the strength check; any Runner card's break needs the ice's
 * own limits. Abilities that do neither (pumps, bypasses, hosting) pass.
 */
export function paidAbilityBreakBlock(
  state: GameState,
  cardId: string,
  ability: PaidAbility,
): BreakBlock | null {
  const card = state.cards[cardId];
  if (!card) return null;
  // Cyber-Cypher: "Use this program only during runs on the chosen server"
  // limits every ability on it, its pump as well as its break, in or out of
  // an encounter: using an ability is using its card (CR 9.1.6), and a
  // paid ability observes the restrictions of other abilities (CR 9.5.2f).
  if (
    card.interfaceRequiresChosenServer &&
    (!state.run || state.run.attackedServerId !== card.chosenServerId)
  ) {
    return block(
      `${card.title} can only be used during runs on its chosen server.`,
      [CR.paidAbilityTextRestriction],
    );
  }
  const enc = state.run?.encounter;
  if (!enc) return null;
  const breaks = effectHasKind(ability.effect, RUNNER_BREAK_KINDS);
  const interfaces =
    cardHasIcebreakerSubtype(card) &&
    (breaks ||
      effectHasKind(ability.effect, INTERFACE_ONLY_KINDS) ||
      INTERFACE_ABILITY_IDS.has(ability.id));
  if (interfaces) {
    const b = interfaceBlock(state, cardId, enc.iceId);
    if (b) return b;
  }
  if (breaks) {
    const b = runnerBreakBlock(state, cardId, enc.iceId);
    if (b) return b;
  }
  return null;
}

/**
 * The printed limits of a declared breaker's own break ability, used by the
 * basic break action: the ice subtype it breaks (CR 3.9.5h), and the other
 * conditions a breaker prints on its break (Tunnel Vision's mark).
 */
export function declaredBreakBlock(
  state: GameState,
  breakerId: string,
  iceId: string,
): BreakBlock | null {
  const breaker = state.cards[breakerId];
  const br = breaker?.breaker;
  const ice = state.cards[iceId];
  if (!br || !ice)
    return block("Card is not an icebreaker.", [CR.encounterBreakPaw]);
  if (br.breakRequiresAttackingMark) {
    if (!state.run || state.run.attackedServerId !== currentMark(state)) {
      return block(`${breaker.title} can only break ice protecting the mark.`, [
        CR.encounterBreakPaw,
      ]);
    }
  }
  const iceSubs = effectiveIceSubtypes(state, iceId);
  if (typeof br.breakRequiresIceSubtypeCountGte === "number") {
    const need = br.breakRequiresIceSubtypeCountGte;
    if (iceSubs.length < need) {
      return block(
        `${breaker.title} can only break ice with ${need}+ subtypes (this ice has ${iceSubs.length}).`,
        [CR.encounterBreakPaw],
      );
    }
  }
  if (typeof br.breakRequiresIceExactSubroutineCount === "number") {
    const need = br.breakRequiresIceExactSubroutineCount;
    const count = (ice.subroutines ?? []).length;
    if (count !== need) {
      return block(
        `${breaker.title} can only break ice with exactly ${need} subroutine(s) (this ice has ${count}).`,
        [CR.encounterBreakPaw],
      );
    }
  }
  if (typeof br.breakRequiresIceRezCostGte === "number") {
    const need = br.breakRequiresIceRezCostGte;
    const rez = ice.rezCost ?? 0;
    if (rez < need) {
      return block(
        `${breaker.title} can only break ice with rez cost ≥ ${need} (this ice is ${rez}).`,
        [CR.encounterBreakPaw],
      );
    }
  }
  if (br.breaksSubtype !== "*" && !iceSubs.includes(br.breaksSubtype)) {
    return block(`Breaker cannot break ${br.breaksSubtype} on this ice.`, [
      CR.encounterBreakPaw,
      CR.icebreakerInterfaceSubtype,
    ]);
  }
  return null;
}

/** Midway Station Grid class: +¢ to icebreaker abilities on this server. */
export function midwayStationBreakTax(state: GameState): number {
  const attacked = state.run?.attackedServerId;
  if (!attacked) return 0;
  const server = state.servers[attacked];
  if (!server) return 0;
  let tax = 0;
  for (const rid of server.root) {
    if (abilitiesSuppressed(state, rid)) continue;
    const up = state.cards[rid];
    if (up?.rezzed && up.runnerIcebreakerAbilityAdditionalCostOnThisServer) {
      tax += up.runnerIcebreakerAbilityAdditionalCostOnThisServer;
    }
  }
  return tax;
}

/**
 * What the basic break action costs a declared breaker: its break credits,
 * Interrupt 0's additional cost, its discounts (Boi-tatá: "paid abilities on
 * this program cost 1 less" after trashing an installed card this turn), and
 * Midway Station Grid's tax.
 */
export function breakActionCost(state: GameState, breakerId: string): number {
  const card = state.cards[breakerId];
  const br = card.breaker!;
  let cost =
    br.breakCredits + (state.run?.kgIcebreakerBreakAdditionalCost ?? 0);
  if (
    br.breakCreditsDiscountIfSuccessfulRunThisTurn &&
    state.turn.successfulRunThisTurn
  ) {
    cost = Math.max(0, cost - br.breakCreditsDiscountIfSuccessfulRunThisTurn);
  }
  if (br.breakCreditsDiscountPerInstalledSubtype) {
    const { subtype, amount } = br.breakCreditsDiscountPerInstalledSubtype;
    const n = state.runner.installed.filter((id) =>
      (state.cards[id].subtypes ?? []).includes(subtype),
    ).length;
    cost = Math.max(0, cost - amount * n);
  }
  const trashedDiscount =
    card.paidAbilityCreditDiscountIfOwnInstalledTrashedThisTurn ?? 0;
  if (
    trashedDiscount > 0 &&
    state.turn.runnerTrashedOwnInstalledThisTurn &&
    !abilitiesSuppressed(state, breakerId)
  ) {
    cost = Math.max(0, cost - trashedDiscount);
  }
  return cost + midwayStationBreakTax(state);
}
