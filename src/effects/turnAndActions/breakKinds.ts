/**
 * Primitive kinds for breaking subroutines. The kind registry
 * (`applyCoreKinds`) dispatches here.
 */
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { effectiveIceSubtypes } from "../../cards/stubs.js";
import {
  runnerBreakBlock,
  nextBreakableSubroutine,
  markSubroutineBroken,
  allSubroutinesBrokenByRunner,
  breakableCount,
  breakNextSubroutines,
  subroutineBreakBlock,
  interfaceBlock,
} from "../../state/turnAndActions/break.js";
import {
  maybeFireFluxFirstBreakCharge,
  fireOnFullyBreak,
  evalEffect,
  applyPrimitive,
  type EffectCtx,
  type EvalResult,
} from "../eval.js";
import { fireAfterBreakSubroutineHooks } from "./breakAndPlayHooks.js";
import { iceStrength } from "../continuous/iceStrength.js";
import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/runnerCredits.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { noteInlineConditional } from "../../state/triggers/inlineConditionalHooks.js";
import { installedRunnerIds } from "../visibility/visibilityKinds.js";
import { fx } from "../ir/fx.js";
import { type Effect } from "../ir/effect.js";
import { type Primitive } from "../ir/primitive.js";
import { addBreakerStrengthBoostThisEncounter } from "../../state/continuous/lingeringEffects.js";
import type { RuleCite } from "../../state/types/restrictions.js";
import { CR } from "../../timing/labels.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function breakOneSub(
  state: EffectCtx["state"],
  sourceId: string,
  label: string,
): PrimResult {
  const enc = state.run?.encounter;
  if (!enc) {
    log(state, `${label} — no encounter.`);
    return { ok: true };
  }
  const ice = state.cards[enc.iceId];
  // Strength was checked when the ability was used (CR 3.9.5g, 9.5.4).
  const [idx] = breakNextSubroutines(state, sourceId, 1);
  if (idx === undefined) {
    log(state, `${label} — no unbroken subroutines.`);
    return { ok: true };
  }
  log(
    state,
    `${label} — break "${ice?.subroutines?.[idx]?.text ?? `sub ${idx}`}" on ${ice?.title}.`,
  );
  if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
  if (!state.run!.breakersThatBroke.includes(sourceId)) {
    state.run!.breakersThatBroke.push(sourceId);
  }
  return { ok: true };
}

function offerSparedSubroutineChoice(
  state: EffectCtx["state"],
  sourceId: string,
  leave: number,
): PrimResult {
  const enc = state.run?.encounter;
  const ice = enc ? state.cards[enc.iceId] : undefined;
  const subs = ice?.subroutines ?? [];
  if (!state.run || !enc || !ice || subs.length === 0) {
    log(
      state,
      `No encountered subroutine to leave (CR ${CR.breakAllButChosenSubroutine.number}).`,
    );
    return { ok: true };
  }
  while (enc.broken.length < subs.length) enc.broken.push(false);
  const pick = Math.max(0, Math.min(leave, subs.length));
  if (pick === 0) {
    breakUnbrokenExcept(state, sourceId, new Set());
    return { ok: true };
  }
  state.run.pendingSpareSubroutines = { remaining: pick, spared: [] };
  openSpareSubroutineChoice(state, sourceId);
  return { ok: true };
}

function openSpareSubroutineChoice(
  state: EffectCtx["state"],
  sourceId: string,
): void {
  const enc = state.run?.encounter;
  const ice = enc ? state.cards[enc.iceId] : undefined;
  const spared = new Set(state.run?.pendingSpareSubroutines?.spared ?? []);
  const subs = ice?.subroutines ?? [];
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: subs.flatMap((sub, index) =>
      spared.has(index)
        ? []
        : [
            {
              id: `spare-sub:${index}`,
              label: sub.text,
              effect: {
                op: "do" as const,
                action: {
                  kind: "gain_credits" as const,
                  side: "runner" as const,
                  amount: 0,
                },
              },
            },
          ],
    ),
  });
}

function breakUnbrokenExcept(
  state: EffectCtx["state"],
  sourceId: string,
  spared: Set<number>,
): number {
  const enc = state.run?.encounter;
  const ice = enc ? state.cards[enc.iceId] : undefined;
  const subs = ice?.subroutines ?? [];
  if (!enc || !ice) return 0;
  while (enc.broken.length < subs.length) enc.broken.push(false);
  let brokenNow = 0;
  for (let i = 0; i < subs.length; i++) {
    if (spared.has(i) || subroutineBreakBlock(state, sourceId, i)) continue;
    markSubroutineBroken(state, sourceId, i);
    brokenNow += 1;
  }
  const left = [...spared]
    .filter((index) => subs[index])
    .map((index) => `"${subs[index]!.text}"`)
    .join(", ");
  log(
    state,
    `${ice.title} leaves ${left || "no subroutine"} and breaks ${brokenNow} unbroken subroutine(s) (CR ${CR.breakAllButChosenSubroutine.number}).`,
  );
  return brokenNow;
}

/** The Runner chose the subroutine Grappling Hook will not break (CR 9.8.6b). */
export function chooseSparedSubroutine(
  state: EffectCtx["state"],
  index: number,
  sourceId: string,
): PrimResult {
  const pending = state.run?.pendingSpareSubroutines;
  const enc = state.run?.encounter;
  const subs = enc ? (state.cards[enc.iceId]?.subroutines ?? []) : [];
  if (!state.run || !pending || !enc) {
    return {
      ok: false,
      error: "No subroutine choice is waiting.",
      cites: [CR.breakAllButChosenSubroutine],
    };
  }
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= subs.length ||
    pending.spared.includes(index)
  ) {
    return {
      ok: false,
      error: "Choose a subroutine to leave.",
      cites: [CR.breakAllButChosenSubroutine],
    };
  }
  pending.spared.push(index);
  pending.remaining -= 1;
  if (pending.remaining > 0) {
    openSpareSubroutineChoice(state, sourceId);
    return { ok: true };
  }
  const spared = new Set(pending.spared);
  state.run.pendingSpareSubroutines = undefined;
  breakUnbrokenExcept(state, sourceId, spared);
  return { ok: true };
}

export function applyBreakKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "score_unorthodox_predictions_on": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: ["sentry", "code gate", "barrier"].map((subtype) => ({
          id: `unorthodox:${subtype}`,
          label: subtype,
          effect: {
            op: "do" as const,
            action: {
              kind: "unorthodox_predictions_lock_subtype" as const,
              subtype,
            },
          },
        })),
        logLine: `${source.title} — choose ice subtype to lock breaks until your next turn.`,
      });
      return { ok: true };
    }

    case "limit_printed_breaks_on_source_for_run": {
      source.maxPrintedSubsBreakablePerEncounter = action.max;
      log(
        state,
        `${source.title} — Runner cannot break more than ${action.max} printed subroutine(s) per encounter this run.`,
      );
      return { ok: true };
    }

    case "break_host_subroutine": {
      const hostId = source.hostId;
      const enc = state.run?.encounter;
      if (!hostId || !enc || enc.iceId !== hostId) {
        log(state, `Break host subroutine — not encountering host.`);
        return { ok: true };
      }
      if (
        action.requireSubtype &&
        !effectiveIceSubtypes(state, hostId).includes(action.requireSubtype)
      ) {
        log(
          state,
          `Break host subroutine — host is not ${action.requireSubtype}.`,
        );
        return { ok: true };
      }
      {
        const blocked = runnerBreakBlock(state, sourceId, hostId);
        if (blocked) return { ok: false, ...blocked };
      }
      const maxSubs = Math.max(1, action.maxSubs ?? 1);
      let broken = 0;
      for (let n = 0; n < maxSubs; n++) {
        const idx = nextBreakableSubroutine(state, sourceId);
        if (idx < 0) break;
        markSubroutineBroken(state, sourceId, idx);
        broken += 1;
        const sub = state.cards[hostId].subroutines?.[idx];
        log(
          state,
          `${source.title} breaks "${sub?.text ?? `sub ${idx}`}" on host.`,
        );
      }
      if (broken === 0) {
        log(state, `Break host subroutine — no unbroken subs.`);
        return { ok: true };
      }
      if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
      if (!state.run!.breakersThatBroke.includes(sourceId)) {
        state.run!.breakersThatBroke.push(sourceId);
      }
      maybeFireFluxFirstBreakCharge(state);
      return { ok: true };
    }

    case "break_encounter_subroutine": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `Break encounter subroutine — no encounter.`);
        return { ok: true };
      }
      const ice = state.cards[enc.iceId];
      if (
        action.requireSubtype &&
        !effectiveIceSubtypes(state, enc.iceId).includes(action.requireSubtype)
      ) {
        log(
          state,
          `Break encounter subroutine — ice is not ${action.requireSubtype}.`,
        );
        return { ok: true };
      }
      if (typeof action.requireMinStrength === "number") {
        const iceStr = iceStrength(state, enc.iceId);
        if (iceStr < action.requireMinStrength) {
          log(
            state,
            `Break encounter subroutine — ice strength ${iceStr} < ${action.requireMinStrength}.`,
          );
          return { ok: true };
        }
      }
      // The ice's own limits (Trieste, "only by a killer", AI, NEXT
      // Activation Command); the interface strength check (CR 3.9.5g) runs
      // when the ability is used, before costs such as trashing the breaker.
      {
        const blocked = runnerBreakBlock(state, sourceId, enc.iceId);
        if (blocked) return { ok: false, ...blocked };
      }
      const maxSubs = Math.max(1, action.maxSubs ?? 1);
      let broken = 0;
      for (let n = 0; n < maxSubs; n++) {
        const idx = nextBreakableSubroutine(state, sourceId);
        if (idx < 0) break;
        if (
          typeof action.payCreditsPerBrokenSub === "number" &&
          action.payCreditsPerBrokenSub > 0
        ) {
          const need = action.payCreditsPerBrokenSub;
          if (state.runner.credits < need) break;
          subtractRunnerCreditPool(state, need);
          log(
            state,
            `${source.title} pays ${need}¢ to break a subroutine → ${state.runner.credits}¢.`,
          );
        }
        markSubroutineBroken(state, sourceId, idx);
        broken += 1;
        const sub = ice.subroutines?.[idx];
        log(
          state,
          `${source.title} breaks "${sub?.text ?? `sub ${idx}`}" on ${ice.title}.`,
        );
      }
      if (broken === 0) {
        log(state, `Break encounter subroutine — no unbroken subs.`);
        return { ok: true };
      }
      if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
      if (!state.run!.breakersThatBroke.includes(sourceId)) {
        state.run!.breakersThatBroke.push(sourceId);
      }
      if ((source.subtypes ?? []).includes("decoder")) {
        enc.brokePrintedSubWithDecoder = true;
      }
      maybeFireFluxFirstBreakCharge(state);
      // The Tungsten Tailor: "The first time each turn you break a
      // subroutine on a piece of ice with 0 or less strength, gain 1¢." A
      // conditional ability: it becomes pending at the next checkpoint
      // (CR 9.3.2b) and a blank Tailor does nothing (CR 9.6.2).
      if (!state.turn.tungstenBreakCreditUsedThisTurn) {
        const iceStr = iceStrength(state, enc.iceId);
        for (const rid of state.runner.installed) {
          const rc = state.cards[rid];
          if (rc?.gainCreditOnBreakIceStrengthLteOncePerTurn === undefined) {
            continue;
          }
          if (abilitiesSuppressed(state, rid)) continue;
          if (iceStr <= rc.gainCreditOnBreakIceStrengthLteOncePerTurn) {
            state.turn.tungstenBreakCreditUsedThisTurn = true;
            noteInlineConditional(state, {
              cardId: rid,
              abilityKey: "gain-credit-on-break-ice-strength-lte",
              controller: "runner",
              mandatory: true,
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "runner", amount: 1 },
              },
              logLine: `${rc.title} becomes pending — broke a subroutine on ice with strength ${iceStr}.`,
            });
            break;
          }
        }
      }
      if (allSubroutinesBrokenByRunner(enc) && source.onFullyBreak) {
        fireOnFullyBreak(state, sourceId);
        if (state.pendingChoice) return { ok: true };
      }
      if (allSubroutinesBrokenByRunner(enc)) {
        fireOnFullyBreak(state, enc.iceId);
        if (state.pendingChoice) return { ok: true };
      }
      if (action.thenIfBroke) {
        const thenR = evalEffect({ state, sourceId }, action.thenIfBroke);
        if (!thenR.ok) return thenR;
        if (state.pendingChoice) return { ok: true };
      }
      fireAfterBreakSubroutineHooks(state, sourceId);
      return { ok: true };
    }

    case "break_matryoshka": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `Matryoshka break — no encounter.`);
        return { ok: true };
      }
      {
        const blocked = runnerBreakBlock(state, sourceId, enc.iceId);
        if (blocked) return { ok: false, ...blocked };
      }
      // Strength was checked when the ability was used (CR 3.9.5g, 9.5.4).
      const faceupHosted = (source.hostedCardIds ?? []).filter((id) => {
        const c = state.cards[id];
        return c && c.faceup && c.title === source.title;
      });
      if (faceupHosted.length === 0) {
        log(state, `${source.title} — no faceup hosted copy to turn facedown.`);
        return { ok: true };
      }
      // Only as many as the encounter's limits let it break (Hammer, Anvil).
      const unbroken = breakableCount(state, sourceId);
      if (unbroken === 0) {
        log(state, `${source.title} — no unbroken subroutines.`);
        return { ok: true };
      }
      const hostedId = faceupHosted[0]!;
      const maxX = Math.min(unbroken, state.runner.credits);
      if (maxX < 1) {
        log(state, `${source.title} — insufficient credits to break.`);
        return { ok: true };
      }
      if (maxX === 1) {
        return evalEffect(
          { state, sourceId },
          {
            op: "do",
            action: {
              kind: "break_resolve",
              amount: 1,
              hostedId,
            },
          },
        );
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: Array.from({ length: maxX }, (_, i) => {
          const amount = i + 1;
          return {
            id: `break:${amount}`,
            label: `Pay ${amount}¢, turn hosted facedown, break ${amount}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "break_resolve" as const,
                amount,
                hostedId,
              },
            },
          };
        }),
        logLine: `${source.title} — choose how many subroutines to break (1–${maxX}).`,
      });
      return { ok: true };
    }

    case "break_resolve": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `Matryoshka break resolve — no encounter.`);
        return { ok: true };
      }
      const hosted = state.cards[action.hostedId];
      if (
        !hosted ||
        !(source.hostedCardIds ?? []).includes(action.hostedId) ||
        !hosted.faceup
      ) {
        log(state, `Matryoshka break resolve — invalid hosted copy.`);
        return { ok: true };
      }
      if (state.runner.credits < action.amount) {
        log(state, `Matryoshka break resolve — insufficient credits.`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, action.amount);
      hosted.faceup = false;
      log(
        state,
        `${source.title} spends ${action.amount}¢; turn hosted ${hosted.title} facedown.`,
      );
      for (let n = 0; n < action.amount; n++) {
        const idx = nextBreakableSubroutine(state, sourceId);
        if (idx < 0) break;
        markSubroutineBroken(state, sourceId, idx);
        const sub = state.cards[enc.iceId]?.subroutines?.[idx];
        log(state, `${source.title} breaks "${sub?.text ?? `sub ${idx}`}".`);
      }
      if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
      if (!state.run!.breakersThatBroke.includes(sourceId)) {
        state.run!.breakersThatBroke.push(sourceId);
      }
      return { ok: true };
    }

    case "runner_break_fast_equal_to_scored_agendas": {
      const x = state.runner.scoreArea.length;
      state.corp.credits += x;
      log(state, `${source.title} — gain ${x}¢ (X = Runner scored agendas).`);
      const drew = applyPrimitive(ctx, {
        kind: "draw_up_to",
        side: "corp",
        amount: x,
      });
      if (!drew.ok) return drew;
      if (x <= 0) {
        log(state, `${source.title} — X is 0; no installs.`);
        return { ok: true };
      }
      return applyPrimitive(ctx, {
        kind: "choose_remote",
        remaining: x,
      });
    }

    case "break_subroutine_on_self": {
      if (!state.run?.encounter) {
        return { ok: false, error: "No ice encounter.", cites: [] };
      }
      const iceId = state.run.encounter.iceId;
      if (sourceId !== iceId) {
        return {
          ok: false,
          error: "Can only break subroutines on this ice.",
          cites: [],
        };
      }
      const broken = state.run.encounter.broken ?? [];
      const idx = broken.findIndex((b) => !b);
      if (idx < 0) {
        log(state, `${source.title} — no unbroken subroutines.`);
        return { ok: true };
      }
      broken[idx] = true;
      state.run.encounter.broken = broken;
      log(state, `${source.title} — Runner breaks 1 subroutine.`);
      return { ok: true };
    }

    case "break_barrier": {
      const stealthPaid = (state.turn.stealthCreditsOnLastPaidAbility ?? 0) > 0;
      const maxSubs = stealthPaid ? 3 : 1;
      return applyPrimitive(ctx, {
        kind: "break_encounter_subroutine",
        maxSubs,
        requireSubtype: "barrier",
      });
    }

    case "unorthodox_predictions_lock_subtype": {
      state.turn.forbidBreakIceSubtypesUntilCorpTurnEnd = [action.subtype];
      log(
        state,
        `Unorthodox Predictions — cannot break ${action.subtype} subroutines until start of Corp next turn.`,
      );
      return { ok: true };
    }
    case "break_code_gate_or_barrier": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `Sage — no encounter.`);
        return { ok: true };
      }
      const ice = state.cards[enc.iceId];
      const subs = ice?.subtypes ?? [];
      if (!subs.includes("code gate") && !subs.includes("barrier")) {
        return {
          ok: false,
          error: "Sage can only break code gate or barrier subroutines.",
          cites: [],
        };
      }
      // Strength was checked when the ability was used (CR 3.9.5g, 9.5.4).
      const [idx] = breakNextSubroutines(state, sourceId, 1);
      if (idx === undefined) {
        log(state, `Sage — no unbroken subroutines.`);
        return { ok: true };
      }
      log(
        state,
        `Sage — break "${ice?.subroutines?.[idx]?.text ?? `sub ${idx}`}" on ${ice?.title}.`,
      );
      if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
      if (!state.run!.breakersThatBroke.includes(sourceId)) {
        state.run!.breakersThatBroke.push(sourceId);
      }
      return { ok: true };
    }
    case "break_all_destroyer_subroutines_on_encounter": {
      const enc = state.run?.encounter;
      if (!enc) return { ok: true };
      const ice = state.cards[enc.iceId];
      if (!ice?.subtypes?.includes("destroyer")) {
        log(state, `Sharpshooter — host ice is not destroyer.`);
        return { ok: true };
      }
      const broken = breakNextSubroutines(state, sourceId, Infinity);
      log(
        state,
        `Sharpshooter — break ${broken.length} subroutine(s) on ${ice.title}.`,
      );
      return { ok: true };
    }
    case "break_sentry_or_barrier": {
      const enc = state.run?.encounter;
      if (!enc) return { ok: true };
      const ice = state.cards[enc.iceId];
      const subs = ice?.subtypes ?? [];
      if (!subs.includes("sentry") && !subs.includes("barrier")) {
        return {
          ok: false,
          error: "Adept can only break sentry or barrier subroutines.",
          cites: [],
        };
      }
      return breakOneSub(state, sourceId, "Adept");
    }

    case "break_sentry_or_code_gates": {
      const enc = state.run?.encounter;
      if (!enc) return { ok: true };
      const ice = state.cards[enc.iceId];
      const subs = ice?.subtypes ?? [];
      const isSentry = subs.includes("sentry");
      const isCodeGate = subs.includes("code gate");
      if (!isSentry && !isCodeGate) {
        return {
          ok: false,
          error: "Savant can only break sentry or code gate subroutines.",
          cites: [],
        };
      }
      if (isSentry && !isCodeGate) {
        return breakOneSub(state, sourceId, "Savant");
      }
      if (isCodeGate && !isSentry) {
        // Break up to 2 code gate subs
        for (const i of breakNextSubroutines(state, sourceId, 2)) {
          log(
            state,
            `Savant — break "${ice?.subroutines?.[i]?.text ?? `sub ${i}`}" on ${ice?.title}.`,
          );
        }
        if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
        if (!state.run!.breakersThatBroke.includes(sourceId)) {
          state.run!.breakersThatBroke.push(sourceId);
        }
        return { ok: true };
      }
      // Both subtypes: choose 1 sentry or up to 2 code gate — treat as 1 break for simplicity
      return breakOneSub(state, sourceId, "Savant");
    }
    case "break_first_subroutine": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `${source?.title ?? "Kongamato"} — no encounter.`);
        return { ok: true };
      }
      const idx = enc.broken.findIndex((b) => !b);
      if (idx < 0) {
        log(state, `${source?.title ?? "Kongamato"} — no unbroken subroutine.`);
        return { ok: true };
      }
      const blocked = subroutineBreakBlock(state, sourceId, idx);
      if (blocked) {
        log(state, `${source?.title ?? "Kongamato"} — ${blocked.error}`);
        return { ok: true };
      }
      markSubroutineBroken(state, sourceId, idx);
      log(
        state,
        `${source?.title ?? "Kongamato"} — break first subroutine (index ${idx}).`,
      );
      return { ok: true };
    }
    case "break_last_subroutine": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `${source?.title ?? "Gbahali"} — no encounter.`);
        return { ok: true };
      }
      // Printed: "Break the last subroutine" — the last one in order. If
      // it is already broken, there is nothing to break; do not fall back
      // to an earlier subroutine.
      const ice = state.cards[enc.iceId];
      const idx = (ice?.subroutines?.length ?? enc.broken.length) - 1;
      if (idx < 0 || enc.broken[idx]) {
        log(
          state,
          `${source?.title ?? "Gbahali"} — last subroutine already broken.`,
        );
        return { ok: true };
      }
      const blocked = subroutineBreakBlock(state, sourceId, idx);
      if (blocked) {
        log(state, `${source?.title ?? "Gbahali"} — ${blocked.error}`);
        return { ok: true };
      }
      markSubroutineBroken(state, sourceId, idx);
      log(
        state,
        `${source?.title ?? "Gbahali"} — break last subroutine (index ${idx}).`,
      );
      return { ok: true };
    }

    case "break_etr_subroutine_trash_installed": {
      const cands = installedRunnerIds(state).filter((id) => id !== sourceId);
      if (cands.length === 0) {
        log(state, `Endless Hunger — nothing to trash.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `eh:${id}`,
          label: `Trash ${state.cards[id]!.title}: break ETR`,
          effect: fx.seq(
            fx.do({ kind: "trash_own_installed", cardId: id }),
            fx.do({ kind: "break_encounter_etr_subroutine" }),
          ),
        })),
      });
      return { ok: true };
    }

    case "break_encounter_etr_subroutine": {
      const enc = state.run?.encounter;
      const ice = enc ? state.cards[enc.iceId] : undefined;
      if (!enc || !ice?.subroutines) return { ok: true };
      const idx = ice.subroutines.findIndex((s, i) => {
        if (subroutineBreakBlock(state, sourceId, i)) return false;
        const text = (s.text ?? "").toLowerCase();
        return text.includes("end the run");
      });
      if (idx >= 0) {
        markSubroutineBroken(state, sourceId, idx);
        log(state, `Break ETR subroutine on ${ice.title}.`);
      }
      return { ok: true };
    }

    case "break_any_subroutine": {
      const enc = state.run?.encounter;
      const ice = enc ? state.cards[enc.iceId] : undefined;
      if (!enc || !ice?.subroutines) return { ok: true };
      const unbroken = ice.subroutines
        .map((s, i) => ({ s, i }))
        .filter(({ i }) => !subroutineBreakBlock(state, sourceId, i));
      if (unbroken.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: unbroken.map(({ s, i }) => ({
          id: `abr-break:${i}`,
          label: `Break: ${s.text ?? `subroutine ${i + 1}`}`,
          effect: fx.do({
            kind: "break_sub_index",
            iceId: enc.iceId,
            index: i,
          }),
        })),
      });
      return { ok: true };
    }

    case "break_sub_index": {
      const enc = state.run?.encounter;
      if (
        enc &&
        enc.iceId === action.iceId &&
        enc.broken[action.index] !== undefined
      ) {
        const blocked = subroutineBreakBlock(state, sourceId, action.index);
        if (blocked) {
          log(state, `Cannot break that subroutine: ${blocked.error}`);
          return { ok: true };
        }
        markSubroutineBroken(state, sourceId, action.index);
        log(state, `Break subroutine on ${state.cards[action.iceId]?.title}.`);
      }
      return { ok: true };
    }
    case "break_arm_icebreaker_additional_cost_this_run": {
      if (state.run) {
        state.run.kgIcebreakerBreakAdditionalCost =
          (state.run.kgIcebreakerBreakAdditionalCost ?? 0) + action.amount;
      }
      log(
        state,
        `${source?.title ?? "Interrupt 0"} — icebreaker break +${action.amount}¢ this run.`,
      );
      return { ok: true };
    }
    case "spend_pump_and_break": {
      if (!state.run?.encounter) {
        log(state, `Black Orchestra — no encounter.`);
        return { ok: true };
      }
      addBreakerStrengthBoostThisEncounter(state, {
        createdBy: sourceId,
        breakerId: sourceId,
        amount: 2,
      });
      log(state, `Black Orchestra — +2 strength this encounter.`);
      const enc = state.run.encounter;
      const ice = state.cards[enc.iceId];
      if (!ice || !(ice.subtypes ?? []).includes("code gate")) {
        return { ok: true };
      }
      // "Then, if this program can interface with the code gate" (CR 3.9.5g).
      const blocked =
        interfaceBlock(state, sourceId, enc.iceId) ??
        runnerBreakBlock(state, sourceId, enc.iceId);
      if (blocked) {
        log(state, `Black Orchestra — cannot interface: ${blocked.error}`);
        return { ok: true };
      }
      const toBreak = breakNextSubroutines(state, sourceId, 2);
      if (toBreak.length > 0) {
        log(
          state,
          `Black Orchestra — break ${toBreak.length} code gate subroutine(s).`,
        );
      }
      return { ok: true };
    }
    case "spend_mkultra_pump_and_break": {
      if (!state.run?.encounter) {
        log(state, `MKUltra — no encounter.`);
        return { ok: true };
      }
      addBreakerStrengthBoostThisEncounter(state, {
        createdBy: sourceId,
        breakerId: sourceId,
        amount: 2,
      });
      log(state, `MKUltra — +2 strength this encounter.`);
      const enc = state.run.encounter;
      const ice = state.cards[enc.iceId];
      if (!ice || !(ice.subtypes ?? []).includes("sentry")) {
        return { ok: true };
      }
      // "Then, if this program can interface with the sentry" (CR 3.9.5g).
      const blocked =
        interfaceBlock(state, sourceId, enc.iceId) ??
        runnerBreakBlock(state, sourceId, enc.iceId);
      if (blocked) {
        log(state, `MKUltra — cannot interface: ${blocked.error}`);
        return { ok: true };
      }
      const toBreak = breakNextSubroutines(state, sourceId, 2);
      if (toBreak.length > 0) {
        log(state, `MKUltra — break ${toBreak.length} sentry subroutine(s).`);
      }
      return { ok: true };
    }
    case "inazuma_lock_breaking_next_encounter": {
      if (state.run) state.run.inazumaLockNextEncounter = true;
      log(
        state,
        `Inazuma — next encounter cannot break subroutines on encountered ice.`,
      );
      return { ok: true };
    }
    case "break_all_but_n_subroutines_on_encounter": {
      return offerSparedSubroutineChoice(state, sourceId, action.leave ?? 1);
    }
    case "spend_x_pump_and_break": {
      const credits = state.runner.credits;
      if (credits <= 0) {
        log(state, `Paperclip — no credits to spend.`);
        return { ok: true };
      }
      const maxX = Math.min(credits, 20);
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let x = 1; x <= maxX; x++) {
        options.push({
          id: `paperclip-x:${x}`,
          label: `Spend ${x}¢: +${x} strength, break up to ${x}`,
          effect: fx.do({
            kind: "spend_x_pump_and_break_resolve",
            amount: x,
          }),
        });
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      });
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "spend_x_pump_and_break_resolve": {
      const x = action.amount ?? 1;
      if (state.runner.credits < x) {
        log(state, `Paperclip — cannot afford ${x}¢.`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, x);
      if (!state.run) return { ok: true };
      addBreakerStrengthBoostThisEncounter(state, {
        createdBy: sourceId,
        breakerId: sourceId,
        amount: x,
      });
      log(state, `Paperclip — spend ${x}¢ → +${x} strength this encounter.`);
      const enc = state.run.encounter;
      if (!enc) return { ok: true };
      const ice = state.cards[enc.iceId];
      if (!ice || !(ice.subtypes ?? []).includes("barrier"))
        return { ok: true };
      // Printed: then, if this can interface with the barrier, break up to X
      // (CR 1.2.1). Strength via shared CR 9.12.1a calculator (lingerings).
      const blocked =
        interfaceBlock(state, sourceId, enc.iceId) ??
        runnerBreakBlock(state, sourceId, enc.iceId);
      if (blocked) {
        log(state, `Paperclip — cannot interface: ${blocked.error}`);
        return { ok: true };
      }
      const toBreak = breakNextSubroutines(state, sourceId, x);
      if (toBreak.length > 0) {
        log(
          state,
          `Paperclip — break ${toBreak.length} barrier subroutine(s).`,
        );
      }
      return { ok: true };
    }
    default:
      return null;
  }
}
