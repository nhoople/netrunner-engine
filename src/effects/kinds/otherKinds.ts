/**
 * Primitive kinds whose procedure is other.
 * The effect switch in eval.ts dispatches here.
 */
import type {
  EffectCtx,
  EvalResult,
} from "../eval.js";
import type {
  Effect,
  Primitive,
} from "../ir.js";
import type { ServerId } from "../../state/types.js";
import {
  effectiveIceSubtypes,
  iceBreakExceptSubtype,
  serverIdForIce,
} from "../../cards/stubs.js";
import { applyRunAccessRestrictions } from "../../state/accessFilter.js";
import {
  corpInstallCost,
  creditsAvailableForInstall,
  stealthHostedCreditsAvailable,
  takeFromStealthHostedCredits,
  subtractRunnerCreditPool,
} from "../../state/costs.js";
import { log } from "../../state/createGame.js";
import { dealDamage } from "../../state/damage.js";
import {
  beginExpose,
  exposeLegalTargets,
  openExposeInterruptOrComplete,
  preventPendingExpose,
} from "../../state/expose.js";
import { applyIdentityFace } from "../../state/identityFace.js";
import {
  addBreakerStrengthBoostThisEncounter,
  addBreakerStrengthBoostThisRun,
  addBreakerStrengthBoostThisTurn,
  addBreakerStrengthBoostUntilCheckpoint,
  addIceStrengthBoostThisEncounter,
  addIceStrengthBoostThisTurn,
  addLingeringEffect,
  blankAbilitiesUntilCorpTurnEnd,
  LINGERING_KIND_GRANTED_SUBTYPES,
} from "../../state/lingeringEffects.js";
import {
  cannotBreakExceptIcebreakerActive,
  cardHasIcebreakerSubtype,
} from "../../state/lockdowns.js";
import { fireOnFlipToBackIfRunMatchesFace } from "../../state/miscConditionalHooks.js";
import {
  chargeableInstalledIds,
  chargeCard,
  currentMark,
  identifyMark,
  resolveSabotageAmount,
} from "../../state/msKeywords.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import {
  removeCardFromCurrentZone,
  canScoreAgenda,
  checkWinConditions,
  scoreAgenda,
  stealAgenda,
} from "../../state/scoring.js";
import { effectiveRunnerTags } from "../../state/tags.js";
import {
  recomputeRunnerLink,
  releaseHostedCardsOnTrash,
} from "../../state/trashHooks.js";
import { preventPendingInstalledTrash } from "../../state/trashPrevent.js";
import { enterSetAside } from "../../state/zones.js";
import { CR } from "../../timing/labels.js";
import {
  maybeTrashHostsAtStrengthLte,
  trashCorpCardToArchives,
  trashToHeap,
} from "../corpTrash.js";
import { drawCards } from "../draw.js";
import {
  fireAfterBreakSubroutineHooks,
  resolveSide,
  maybeFireFluxFirstBreakCharge,
  offerMayChargeCard,
  offerBurnerMoves,
  startExclusiveChoicesPerPassedIce,
  offerRdArrangeChoice,
  shuffleCorpRdAfterSearch,
  openExposeUpTo,
  finishExposeUpTo,
  resumeExposeUpTo,
  evalEffect,
  applyPrimitive,
} from "../eval.js";
import {
  breakerStrength,
  iceStrength,
} from "../iceStrength.js";
import { fx } from "../ir.js";
import {
  canInstallSetAsideIgnoringCosts,
  shuffleRunnerSetAsideIntoStack,
  shuffleRunnerStack,
} from "../runnerInstall.js";

import {
  fireOnFullyBreak,
  fireOnForfeit,
  fireOnAccess,
} from "../eval.js";

export function applyOtherKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "pump_strength": {
      if (!source.breaker) {
        return {
          ok: false,
          error: "Pump requires an icebreaker.",
          cites: [CR.programStrength],
        };
      }
      let amount = action.amount;
      if (source.breaker.pumpUsesIcebreakerCount) {
        amount = state.runner.installed.filter(
          (id) =>
            Boolean(state.cards[id].breaker) ||
            (state.cards[id].subtypes ?? []).includes("icebreaker"),
        ).length;
      }
      // Requested duration before 9.9.9 replacements (Gebrselassie / System
      // Seizure / hosted run-extend). Replacements apply inside the add helpers.
      let duration: import("../ir.js").PumpDuration = action.duration ?? "encounter";
      if (duration === "encounter" && !state.run?.encounter) {
        duration = "checkpoint";
      }
      if (duration === "run" && !state.run) {
        return {
          ok: false,
          error: "A run-duration pump requires an active run.",
          cites: [CR.icebreakerStrengthImplicit],
        };
      }
      const sumKind = (kind: string): number => {
        let n = 0;
        for (const e of state.lingeringEffects) {
          if (e.expired || e.kind !== kind) continue;
          const p = e.payload as
            | { breakerId?: string; amount?: number }
            | undefined;
          if (p?.breakerId !== sourceId) continue;
          n += p.amount ?? 0;
        }
        return n;
      };
      const beforeTurn = sumKind("breaker_strength_turn");
      const beforeRun = sumKind("breaker_strength_run");
      const beforeEnc = sumKind("breaker_strength_encounter");
      const beforeCp = sumKind("breaker_strength_checkpoint");
      if (duration === "turn") {
        addBreakerStrengthBoostThisTurn(state, {
          createdBy: sourceId,
          breakerId: sourceId,
          amount,
        });
      } else if (duration === "run") {
        addBreakerStrengthBoostThisRun(state, {
          createdBy: sourceId,
          breakerId: sourceId,
          amount,
        });
      } else if (duration === "encounter") {
        addBreakerStrengthBoostThisEncounter(state, {
          createdBy: sourceId,
          breakerId: sourceId,
          amount,
        });
      } else {
        addBreakerStrengthBoostUntilCheckpoint(state, {
          createdBy: sourceId,
          breakerId: sourceId,
          amount,
        });
      }
      const applied: import("../ir.js").PumpDuration =
        sumKind("breaker_strength_turn") > beforeTurn
          ? "turn"
          : sumKind("breaker_strength_run") > beforeRun
            ? "run"
            : sumKind("breaker_strength_encounter") > beforeEnc
              ? "encounter"
              : sumKind("breaker_strength_checkpoint") > beforeCp
                ? "checkpoint"
                : duration;
      const eff = breakerStrength(state, sourceId);
      log(
        state,
        `Pump ${source.title} +${amount} (${applied}) → strength ${eff} (CR ${
          applied === "checkpoint"
            ? CR.icebreakerStrengthOutsideEncounter.number
            : CR.icebreakerStrengthImplicit.number
        }, ${CR.paidAbility.number}).`,
      );
      return { ok: true };
    }

case "pump_blackat_strength": {
      const stealthPaid = (state.turn.stealthCreditsOnLastPaidAbility ?? 0) > 0;
      const amount = stealthPaid ? 2 : 1;
      return applyPrimitive(ctx, {
        kind: "pump_strength",
        amount,
      });
    }

case "fortify_ice": {
      if (!state.run || source.type !== "ice") {
        return {
          ok: false,
          error: "Fortify requires ice during a run.",
          cites: [CR.iceStrength],
        };
      }
      addIceStrengthBoostThisEncounter(state, {
        createdBy: sourceId,
        iceId: sourceId,
        amount: action.amount,
      });
      const eff = iceStrength(state, sourceId);
      log(
        state,
        `Fortify ${source.title} +${action.amount} → strength ${eff} (CR ${CR.iceStrength.number}, ${CR.paidAbility.number}).`,
      );
      return { ok: true };
    }

case "fortify_ice_spend_x_resolve": {
      const iceId = action.iceId;
      const x = action.amount;
      const ice = state.cards[iceId];
      if (!ice?.rezzed || state.corp.credits < x) return { ok: true };
      state.corp.credits -= x;
      addIceStrengthBoostThisTurn(state, {
        createdBy: sourceId,
        iceId,
        amount: x,
      });
      log(
        state,
        `Corporate Troubleshooter — spend ${x}¢, ${ice.title} +${x} strength this turn.`,
      );
      return { ok: true };
    }

case "fortify_all_ice": {
      if (!state.run) {
        log(state, `Fortify all ice — no run.`);
        return { ok: true };
      }
      let n = 0;
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          addIceStrengthBoostThisEncounter(state, {
            createdBy: sourceId,
            iceId: id,
            amount: action.amount,
          });
          n += 1;
        }
      }
      log(
        state,
        `Each ice gets +${action.amount} strength this run (${n} ice).`,
      );
      return { ok: true };
    }

case "weaken_ice": {
      if (!state.run) {
        return {
          ok: false,
          error: "Weaken ice requires an active run/encounter.",
          cites: [CR.iceStrength],
        };
      }
      const iceId = state.run.encounter?.iceId;
      if (!iceId) {
        return {
          ok: false,
          error: "Weaken ice requires an encounter.",
          cites: [CR.iceStrength],
        };
      }
      const ice = state.cards[iceId];
      if (ice.strengthCannotBeLowered) {
        log(
          state,
          `Weaken ${ice.title} prevented — strength cannot be lowered.`,
        );
        return { ok: true };
      }
      addIceStrengthBoostThisEncounter(state, {
        createdBy: sourceId,
        iceId,
        amount: -action.amount,
      });
      const eff = iceStrength(state, iceId);
      log(
        state,
        `Weaken ${ice.title} −${action.amount} → strength ${eff} (CR ${CR.iceStrength.number}).`,
      );
      maybeTrashHostsAtStrengthLte(state);
      return { ok: true };
    }

case "spend_stealth_credits": {
      const need = action.amount;
      if (need <= 0) return { ok: true };
      if (stealthHostedCreditsAvailable(state) < need) {
        return {
          ok: false,
          error: "Insufficient stealth credits.",
          cites: [CR.paidAbility],
        };
      }
      const left = takeFromStealthHostedCredits(state, need);
      if (left > 0) {
        return {
          ok: false,
          error: "Insufficient stealth credits.",
          cites: [CR.paidAbility],
        };
      }
      return { ok: true };
    }

case "spend_power_for_bonus_access": {
      const have = source.powerCounters ?? 0;
      const n = Math.min(action.amount, have);
      if (n <= 0 || !state.run) return { ok: true };
      source.powerCounters = have - n;
      state.run.bonusAccess = (state.run.bonusAccess ?? 0) + n;
      log(
        state,
        `${source.title} — spend ${n} power → +${n} bonus access.`,
      );
      return { ok: true };
    }

case "spend_enable_hosted_credits_for": {
      source.hostedCreditsSpendFor = [...action.purposes];
      log(
        state,
        `${source.title} — hosted credits spendable for ${action.purposes.join(", ")}.`,
      );
      return { ok: true };
    }

case "spend_lightning_counter_rez_up_to_protecting_attacked": {
      if ((source.agendaCounters ?? 0) < 1) {
        log(state, `${source.title} — no agenda counters.`);
        return { ok: true };
      }
      source.agendaCounters = (source.agendaCounters ?? 0) - 1;
      const maxIce = Math.max(0, action.maxIce);
      const serverId = state.run?.attackedServerId;
      if (serverId) {
        state.turn.lightningPendingDerez = { serverId, maxIce };
      }
      log(
        state,
        `${source.title} — remove 1 agenda counter → ${source.agendaCounters}; rez up to ${maxIce} ice.`,
      );
      return applyPrimitive(ctx, {
        kind: "rez_up_to_ice_protecting_attacked_ignore_costs",
        maxIce,
      });
    }

case "redirect_approach_to_server": {
      if (!state.run) {
        return {
          ok: false,
          error: "Redirect approach requires an active run.",
          cites: [CR.announceServer],
        };
      }
      const sid = action.serverId;
      const server = state.servers[sid];
      if (!server) {
        return {
          ok: false,
          error: `Unknown server ${sid}.`,
          cites: [CR.announceServer],
        };
      }
      state.run.attackedServerId = sid;
      state.run.position = server.ice.length > 0 ? 0 : null;
      log(
        state,
        `Baker — change attacked server to ${sid} and approach${
          server.ice.length > 0 ? ` ${sid} ice` : ` ${sid}`
        }.`,
      );
      return { ok: true };
    }

case "draw_n_then_bottom_one_of_drawn": {
      const amount = Math.max(0, action.amount ?? 0);
      const before = [...state.runner.hand];
      const drawR = applyPrimitive(ctx, {
        kind: "draw",
        side: "runner",
        amount,
      });
      if (!drawR.ok) return drawR;
      const drawn = state.runner.hand.filter((id) => !before.includes(id));
      if (drawn.length === 0) {
        log(state, `${source.title} — drew no cards to bottom.`);
        return { ok: true };
      }
      if (drawn.length === 1) {
        return applyPrimitive(ctx, {
          kind: "bottom_drawn_card",
          cardId: drawn[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: drawn.map((id) => ({
          id: `bottom:${id}`,
          label: `Put ${state.cards[id]!.title} on bottom of stack`,
          effect: {
            op: "do" as const,
            action: { kind: "bottom_drawn_card" as const, cardId: id },
          },
        })),
logLine: `${source.title} — choose 1 of ${drawn.length} drawn cards to bottom.`,
});
      return { ok: true };
    }

case "draw_class_act_bottom_one_then": {
      const looked = state.turn.rdLookedCards ?? [];
      const bottomId = action.cardId;
      const keep: string[] = [];
      for (const id of looked) {
        if (id === bottomId) continue;
        keep.push(id);
      }
      for (let i = keep.length - 1; i >= 0; i--) {
        const id = keep[i]!;
        state.cards[id]!.faceup = false;
        state.runner.deck.unshift(id);
      }
      if (looked.includes(bottomId)) {
        state.cards[bottomId]!.faceup = false;
        state.runner.deck.push(bottomId);
        log(
          state,
          `Class Act — ${state.cards[bottomId]!.title} to bottom of stack.`,
        );
      }
      state.turn.rdLookedCards = [];
      const amount = state.turn.pendingWouldDrawAmount ?? 0;
      state.turn.pendingWouldDrawAmount = null;
      if (amount > 0) {
        const n = drawCards(state, "runner", amount);
        log(state, `Class Act — draw ${n} (requested ${amount}).`);
      }
      return { ok: true };
    }

case "draw_until_hq_has": {
      const target = Math.max(0, action.amount);
      const n = Math.max(0, target - state.corp.hand.length);
      const drawn = drawCards(state, "corp", n);
      log(
        state,
        `Corp draws ${drawn} until HQ has ${target} card(s) (HQ now ${state.corp.hand.length}).`,
      );
      return { ok: true };
    }

case "draw_top_rd_to_hand": {
      if (state.corp.deck.length === 0) return { ok: true };
      const id = state.corp.deck.shift()!;
      state.corp.hand.push(id);
      const card = state.cards[id]!;
      card.zone = "corp:hq";
      card.faceup = false;
      log(state, `Corp draws ${card.title}.`);
      return { ok: true };
    }

case "bottom_drawn_card": {
      const cardId = action.cardId;
      if (!state.runner.hand.includes(cardId)) {
        log(state, `bottom_drawn_card — card not in grip.`);
        return { ok: true };
      }
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      state.runner.deck.push(cardId);
      state.cards[cardId]!.zone = "runner:stack";
      state.cards[cardId]!.faceup = false;
      log(
        state,
        `${source.title} — put ${state.cards[cardId]!.title} on bottom of stack.`,
      );
      return { ok: true };
    }

case "arrange_looked": {
      const order = action.order ?? [];
      for (let i = order.length - 1; i >= 0; i--) {
        const id = order[i]!;
        state.cards[id]!.faceup = false;
        state.runner.deck.unshift(id);
      }
      state.turn.rdLookedCards = [];
      log(
        state,
        `Arrange ${order.length} card(s) on top of stack.`,
      );
      return { ok: true };
    }

case "increase_hand_size": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      p.maxHandSize += action.amount;
      log(
        state,
        `${side} max hand size +${action.amount} → ${p.maxHandSize} (CR ${CR.maxHandSize.number}).`,
      );
      return { ok: true };
    }

case "skip_discard_this_turn": {
      state.turn.skipDiscardThisTurn = true;
      log(state, `Skip discard step this turn.`);
      return { ok: true };
    }

case "score_self_as_agenda": {
      const pts = action.agendaPoints ?? source.agendaPoints ?? 1;
      source.agendaPoints = pts;
      removeCardFromCurrentZone(state, sourceId);
      state.corp.scoreArea.push(sourceId);
      source.zone = "corp:score";
      source.faceup = true;
      source.rezzed = true;
      source.convertedInto = "agenda";
      state.turn.agendaPointsScoredThisTurn += pts;
      log(
        state,
        `Corp adds ${source.title} to the score area as a ${pts}-point agenda (CR ${CR.scoringAgenda.number}).`,
      );
      checkWinConditions(state);
      return { ok: true };
    }

case "score_agenda_card": {
      const card = state.cards[action.cardId];
      if (!card) {
        return {
          ok: false,
          error: "Unknown agenda to score.",
          cites: [CR.scoringAgenda],
        };
      }
      if (state.turn.cannotScoreAgendas) {
        log(
          state,
          `Cannot score agendas this turn — skip (CR ${CR.scoringAgenda.number}).`,
        );
        return { ok: true };
      }
      if (!canScoreAgenda(state, card)) {
        log(
          state,
          `${card.title} cannot be scored — skip (CR ${CR.scoringAgenda.number}).`,
        );
        return { ok: true };
      }
      scoreAgenda(state, action.cardId);
      state.turn.agendaPointsScoredThisTurn += card.agendaPoints ?? 0;
      return { ok: true };
    }

case "score_profiteering_on": {
      const options = [0, 1, 2, 3].map((n) => {
        const effects: Effect[] = [];
        if (n > 0) {
          effects.push({
            op: "do",
            action: { kind: "give_bad_publicity", amount: n },
          });
        }
        effects.push({
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: n * 5 },
        });
        return {
          id: `profiteering-${n}`,
          label:
            n === 0
              ? "Take no bad publicity"
              : `Take ${n} bad publicity — gain ${n * 5}¢`,
          effect: { op: "seq" as const, effects },
        };
      });
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — choose bad publicity for credits.`,
});
      return { ok: true };
    }

case "score_project_ares_on": {
      const adv = source.advancementCounters ?? 0;
      const n = Math.max(0, adv - (action.past ?? 4));
      state.turn.projectAresTrashRemaining = n;
      state.turn.projectAresTrashedCount = 0;
      if (n <= 0) {
        log(state, `Project Ares — no overadvance trash.`);
        return { ok: true };
      }
      return applyPrimitive(ctx, { kind: "trash_project_ares_next" });
    }

case "score_facedown_agenda_from_archives_if_clean": {
      if (state.turn.corpCardsAddedToArchivesThisTurn > 0) {
        log(
          state,
          `Regenesis — Corp cards were added to Archives this turn; skip.`,
        );
        return { ok: true };
      }
      const facedown = state.corp.discardPile.find((id) => {
        const c = state.cards[id];
        return c?.type === "agenda" && !c.faceup;
      });
      if (!facedown) {
        log(state, `Regenesis — no facedown agenda in Archives.`);
        return { ok: true };
      }
      const card = state.cards[facedown];
      state.corp.discardPile = state.corp.discardPile.filter((id) => id !== facedown);
      state.corp.scoreArea.push(facedown);
      card.zone = "corp:score";
      card.faceup = true;
      card.rezzed = true;
      state.turn.agendaPointsScoredThisTurn += card.agendaPoints ?? 0;
      log(
        state,
        `Regenesis — score facedown ${card.title} from Archives for ${card.agendaPoints ?? 0} points (CR ${CR.scoringAgenda.number}).`,
      );
      checkWinConditions(state);
      return { ok: true };
    }

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

case "grant_chosen_ice_subtypes_until_end_of_turn": {
      const iceIds: string[] = [];
      for (const server of Object.values(state.servers)) {
        iceIds.push(...server.ice);
      }
      if (iceIds.length === 0) {
        log(state, `${source.title} — no ice to grant subtypes.`);
        return { ok: true };
      }
      const subtypes = action.subtypes ?? [];
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: iceIds.map((id) => ({
          id: `tinker:${id}`,
          label: `${state.cards[id]!.title} gains ${subtypes.join(", ")} until end of turn`,
          effect: {
            op: "do" as const,
            action: {
              kind: "grant_ice_subtypes_until_end_of_turn" as const,
              cardId: id,
              subtypes,
            },
          },
        })),
logLine: `${source.title} — choose ice to gain ${subtypes.join(", ")} until end of turn.`,
});
      return { ok: true };
    }

case "grant_ice_subtypes_until_end_of_turn": {
      const ice = state.cards[action.cardId];
      if (!ice) {
        log(state, `Grant subtypes — unknown ice ${action.cardId}.`);
        return { ok: true };
      }
      const subtypes = [...new Set(action.subtypes ?? [])];
      addLingeringEffect(state, {
        createdBy: sourceId,
        duration: { kind: "turn" },
        kind: LINGERING_KIND_GRANTED_SUBTYPES,
        payload: { cardId: ice.id, subtypes },
      });
      log(
        state,
        `${ice.title} gains ${subtypes.join(", ")} until end of turn (CR ${CR.lingeringEffect.number}).`,
      );
      return { ok: true };
    }

case "grant_approached_rezzed_bioroid_etr_subroutine_this_run": {
      const run = state.run;
      if (!run || run.position === null) {
        log(state, `${source.title} — no approached ice.`);
        return { ok: true };
      }
      const iceId = state.servers[run.attackedServerId]?.ice[run.position];
      const ice = iceId ? state.cards[iceId] : undefined;
      if (!ice || !ice.rezzed || !(ice.subtypes ?? []).includes("bioroid")) {
        log(state, `${source.title} — approached ice is not a rezzed bioroid.`);
        return { ok: true };
      }
      if (!ice.baseSubroutines) {
        ice.baseSubroutines = ice.subroutines
          ? structuredClone(ice.subroutines)
          : [];
      }
      const granted = {
        id: `${ice.defId}-wotan-etr-${iceId}`,
        text: "End the run.",
        effect: { op: "do" as const, action: { kind: "end_the_run" as const } },
      };
      ice.subroutines = [...(ice.subroutines ?? []), granted];
      if (!run.thunderboltGrantedIceIds) run.thunderboltGrantedIceIds = [];
      if (!run.thunderboltGrantedIceIds.includes(iceId!)) {
        run.thunderboltGrantedIceIds.push(iceId!);
      }
      if (run.encounter?.iceId === iceId) {
        run.encounter.broken.push(false);
      }
      log(
        state,
        `${source.title} — ${ice.title} gains an ETR subroutine for the remainder of this run.`,
      );
      return { ok: true };
    }

case "grant_encounter_ice_subtype": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `${source.title} — grant subtype: no encounter.`);
        return { ok: true };
      }
      if (!enc.grantedSubtypes) enc.grantedSubtypes = [];
      if (!enc.grantedSubtypes.includes(action.subtype)) {
        enc.grantedSubtypes.push(action.subtype);
      }
      const ice = state.cards[enc.iceId];
      log(
        state,
        `${ice?.title ?? enc.iceId} gains ${action.subtype} this encounter.`,
      );
      return { ok: true };
    }

case "oversight_ai_host_on_ice": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice") {
        log(state, `Oversight AI — invalid ice.`);
        return { ok: true };
      }
      ice.rezzed = true;
      ice.faceup = true;
      // Move source onto ice as hosted condition.
      removeCardFromCurrentZone(state, sourceId);
      source.hostId = action.iceId;
      source.zone = `hosted:${action.iceId}`;
      source.faceup = true;
      source.rezzed = true;
      source.convertedInto = "counter";
      if (!ice.hostedCardIds) ice.hostedCardIds = [];
      if (!ice.hostedCardIds.includes(sourceId)) ice.hostedCardIds.push(sourceId);
      log(
        state,
        `Rez ${ice.title} ignoring costs; host ${source.title} as condition counter.`,
      );
      return { ok: true };
    }

case "turn_all_archives_facedown": {
      let n = 0;
      for (const id of state.corp.discardPile) {
        const c = state.cards[id];
        if (c && c.faceup) {
          c.faceup = false;
          n += 1;
        }
      }
      log(
        state,
        `${source.title} — turn all Archives cards facedown (${n} flipped).`,
      );
      return { ok: true };
    }

case "may_turn_facedown_archives_faceup_then": {
      const facedown = state.corp.discardPile.filter(
        (id) => state.cards[id] && !state.cards[id]!.faceup,
      );
      if (facedown.length === 0) {
        log(state, `${source.title} — no facedown Archives cards.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...facedown.map((id) => ({
            id: `faceup:${id}`,
            label: `Turn ${state.cards[id]!.title} faceup`,
            effect: {
              op: "do" as const,
              action: {
                kind: "turn_archives_card_faceup" as const,
                cardId: id,
                then: structuredClone(action.then),
              },
            },
          })),
        ],
logLine: `${source.title} — may turn a facedown Archives card faceup.`,
});
      return { ok: true };
    }

case "turn_archives_card_faceup": {
      const card = state.cards[action.cardId];
      if (!card || !state.corp.discardPile.includes(action.cardId)) {
        log(state, `Turn Archives faceup — card not in Archives.`);
        return { ok: true };
      }
      card.faceup = true;
      log(state, `Turn ${card.title} in Archives faceup.`);
      if (action.then) return evalEffect(ctx, action.then);
      return { ok: true };
    }

case "turn_hosted_cards_faceup": {
      let n = 0;
      for (const id of source.hostedCardIds ?? []) {
        const c = state.cards[id];
        if (!c) continue;
        if (!c.faceup) {
          c.faceup = true;
          n += 1;
        }
      }
      log(
        state,
        n > 0
          ? `${source.title} — turn ${n} hosted card(s) faceup.`
          : `${source.title} — no facedown hosted cards.`,
      );
      return { ok: true };
    }

case "turn_begin_continue": {
      if (action.remaining <= 0) return { ok: true };
      const used = new Set(action.used);
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      const afterPick = (optId: string, effect: Effect): Effect => ({
        op: "seq",
        effects: [
          effect,
          {
            op: "do",
            action: {
              kind: "turn_begin_continue",
              remaining: action.remaining - 1,
              used: [...action.used, optId],
              mustPick: false,
            },
          },
        ],
      });
      if (!used.has("draw")) {
        options.push({
          id: "w2w-draw",
          label: "Draw 1 card",
          effect: afterPick("draw", {
            op: "do",
            action: { kind: "draw", side: "corp", amount: 1 },
          }),
        });
      }
      if (!used.has("credits")) {
        options.push({
          id: "w2w-credits",
          label: "Gain 1¢",
          effect: afterPick("credits", {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 1 },
          }),
        });
      }
      if (!used.has("adv")) {
        const iceIds: string[] = [];
        for (const server of Object.values(state.servers)) {
          for (const id of server.ice) {
            if (state.cards[id]?.type === "ice") iceIds.push(id);
          }
        }
        for (const iceId of iceIds) {
          options.push({
            id: `w2w-adv:${iceId}`,
            label: `Place 1 advancement on ${state.cards[iceId]!.title}`,
            effect: {
              op: "do",
              action: {
                kind: "place_adv_on_ice",
                cardId: iceId,
                remaining: action.remaining - 1,
                used: [...action.used, "adv"],
                mustPick: false,
              },
            },
          });
        }
      }
      if (!used.has("hq")) {
        options.push({
          id: "w2w-hq",
          label: `Add ${source.title} to HQ`,
          effect: {
            op: "do",
            action: { kind: "return_source_to_hq" },
          },
        });
      }
      if (!action.mustPick) {
        options.push({
          id: "w2w-done",
          label: "Done",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        });
      }
      if (options.length === 0) return { ok: true };
      // Exactly-1 mandatory with only one live option: auto-resolve if single
      // non-ice choice; ice still needs a pick among ice ids.
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — resolve ${action.mustPick ? "1" : `up to ${action.remaining}`} option(s).`,
});
      return { ok: true };
    }

case "rfg_self": {
      removeCardFromCurrentZone(state, sourceId);
      source.zone = "removed-from-game";
      source.faceup = true;
      source.rezzed = false;
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(sourceId)) {
        state.removedFromGame.push(sourceId);
      }
      log(
        state,
        `${source.title} is removed from the game (CR ${CR.playOperation.number}).`,
      );
      return { ok: true };
    }

case "rfg_heap_card": {
      const heap = [...state.runner.discardPile];
      if (heap.length === 0) {
        log(state, `RFG heap card — heap empty.`);
        return { ok: true };
      }
      if (heap.length === 1) {
        return applyPrimitive(ctx, {
          kind: "rfg_specific_heap_card",
          cardId: heap[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: heap.map((id) => ({
          id: `rfg-heap:${id}`,
          label: `Remove ${state.cards[id]!.title} from the game`,
          effect: {
            op: "do" as const,
            action: {
              kind: "rfg_specific_heap_card" as const,
              cardId: id,
            },
          },
        })),
logLine: `${source.title} — choose a heap card to remove from the game.`,
});
      return { ok: true };
    }

case "rfg_specific_heap_card": {
      const cardId = action.cardId;
      if (!state.runner.discardPile.includes(cardId)) {
        log(state, `RFG heap card — ${cardId} not in heap.`);
        return { ok: true };
      }
      const card = state.cards[cardId]!;
      state.runner.discardPile = state.runner.discardPile.filter((id) => id !== cardId);
      card.zone = "removed-from-game";
      card.faceup = true;
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(cardId)) {
        state.removedFromGame.push(cardId);
      }
      log(
        state,
        `Remove ${card.title} in the heap from the game (CR ${CR.playOperation.number}).`,
      );
      return { ok: true };
    }

case "rfg_installed_card": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.installed.includes(cardId)) {
        log(state, `RFG installed — ${cardId} not in Runner installed.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, cardId);
      card.zone = "removed-from-game";
      card.faceup = true;
      card.rezzed = false;
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(cardId)) {
        state.removedFromGame.push(cardId);
      }
      log(
        state,
        `Remove ${card.title} from the game (CR ${CR.playOperation.number}).`,
      );
      return { ok: true };
    }

case "rfg_installed_with_any_subtype": {
      const wanted = new Set(action.subtypes);
      const candidates = state.runner.installed.filter((id) => {
        const subs = state.cards[id]?.subtypes ?? [];
        return subs.some((s) => wanted.has(s));
      });
      if (candidates.length === 0) {
        log(
          state,
          `${source.title} — RFG installed (${action.subtypes.join("/")}): none.`,
        );
        return { ok: true };
      }
      if (action.pick === "first" || candidates.length === 1) {
        return applyPrimitive(ctx, {
          kind: "rfg_installed_card",
          cardId: candidates[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: candidates.map((id) => ({
          id: `rfg-installed:${id}`,
          label: `Remove ${state.cards[id]!.title} from the game`,
          effect: {
            op: "do" as const,
            action: {
              kind: "rfg_installed_card" as const,
              cardId: id,
            },
          },
        })),
logLine: `${source.title} — choose an installed ${action.subtypes.join("/")} to remove from the game.`,
});
      return { ok: true };
    }

case "rfg_self_then_derez_bypassed_ice": {
      const bypassed = state.run?.bypassedIceIds ?? [];
      const targetId = bypassed[bypassed.length - 1];
      const rfg = applyPrimitive(ctx, { kind: "rfg_self" });
      if (!rfg.ok) return rfg;
      if (!targetId) {
        log(state, `${source.title} — RFG; no bypassed ice to derez.`);
        return { ok: true };
      }
      const ice = state.cards[targetId];
      if (!ice?.rezzed) {
        log(
          state,
          `${source.title} — RFG; ${ice?.title ?? targetId} already unrezzed.`,
        );
        return { ok: true };
      }
      ice.rezzed = false;
      ice.faceup = false;
      log(
        state,
        `${source.title} — RFG and derez ${ice.title} (CR ${CR.derez.number}).`,
      );
      return { ok: true };
    }

case "rfg_top_of_stack": {
      const n = Math.max(0, action.amount);
      const removed: string[] = [];
      for (let i = 0; i < n && state.runner.deck.length > 0; i++) {
        const id = state.runner.deck.shift()!;
        removed.push(id);
        state.cards[id].zone = "removed-from-game";
        state.cards[id].faceup = true;
        if (!state.removedFromGame) state.removedFromGame = [];
        if (!state.removedFromGame.includes(id)) {
          state.removedFromGame.push(id);
        }
      }
      log(
        state,
        `Remove top ${removed.length} of stack from the game.`,
      );
      return { ok: true };
    }

case "allotted_clicks_next_turn": {
      if (action.side === "runner") {
        state.runnerAllottedClicksDeltaNextTurn =
          (state.runnerAllottedClicksDeltaNextTurn ?? 0) + action.delta;
        log(
          state,
          `Runner allotted clicks next turn ${action.delta >= 0 ? "+" : ""}${action.delta} → pending ${state.runnerAllottedClicksDeltaNextTurn} (CR ${CR.runnerAllottedClicks.number}).`,
        );
        return { ok: true };
      }
      if (action.side === "corp") {
        state.corpAllottedClicksDeltaNextTurn =
          (state.corpAllottedClicksDeltaNextTurn ?? 0) + action.delta;
        log(
          state,
          `Corp allotted clicks next turn ${action.delta >= 0 ? "+" : ""}${action.delta} → pending ${state.corpAllottedClicksDeltaNextTurn} (CR ${CR.corpAllottedClicks.number}).`,
        );
        return { ok: true };
      }
      return {
        ok: false,
        error: "allotted_clicks_next_turn requires corp or runner side.",
        cites: [CR.runnerAllottedClicks],
      };
    }

case "forfeit_runner_scored_agenda": {
      const cardId = action.cardId;
      if (!state.runner.scoreArea.includes(cardId)) {
        return {
          ok: false,
          error: "Agenda not in Runner score area.",
          cites: [CR.scoringAgenda],
        };
      }
      state.runner.scoreArea = state.runner.scoreArea.filter((id) => id !== cardId);
      const card = state.cards[cardId]!;
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      state.runner.installed = state.runner.installed.filter((id) => id !== cardId);
      card.zone = "removed-from-game";
      card.faceup = true;
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(cardId)) {
        state.removedFromGame.push(cardId);
      }
      log(state, `Forfeit ${card.title} (RFG).`);
      return { ok: true };
    }

case "forfeit_scored_agenda": {
      const cardId = action.cardId;
      if (!state.corp.scoreArea.includes(cardId)) {
        return {
          ok: false,
          error: "Agenda not in Corp score area.",
          cites: [CR.scoringAgenda],
        };
      }
      if (state.cards[cardId]?.cannotForfeit) {
        return {
          ok: false,
          error: "This agenda cannot be forfeited.",
          cites: [CR.scoringAgenda],
        };
      }
      state.corp.scoreArea = state.corp.scoreArea.filter((id) => id !== cardId);
      const card = state.cards[cardId]!;
      fireOnForfeit(state, cardId);
      state.corp.discardPile.push(cardId);
      card.zone = "corp:archives";
      card.faceup = true;
      log(state, `Forfeit ${card.title} (Plutus rez cost).`);
      return { ok: true };
    }

case "forfeit_self": {
      const cardId = sourceId;
      if (!state.corp.scoreArea.includes(cardId)) {
        return {
          ok: false,
          error: "Source agenda not in Corp score area.",
          cites: [CR.scoringAgenda],
        };
      }
      if (state.cards[cardId]?.cannotForfeit) {
        return {
          ok: false,
          error: "This agenda cannot be forfeited.",
          cites: [CR.scoringAgenda],
        };
      }
      state.corp.scoreArea = state.corp.scoreArea.filter((id) => id !== cardId);
      const card = state.cards[cardId]!;
      fireOnForfeit(state, cardId);
      state.corp.discardPile.push(cardId);
      card.zone = "corp:archives";
      card.faceup = true;
      log(state, `Forfeit ${card.title}.`);
      return { ok: true };
    }

case "may_forfeit_return_stolen": {
      const stolenId = state.turn.lastStolenAgendaId;
      if (!stolenId || !state.runner.scoreArea.includes(stolenId)) {
        log(state, `${source.title} — no stolen agenda to return.`);
        return { ok: true };
      }
      if (!state.corp.scoreArea.includes(sourceId)) {
        log(state, `${source.title} — not in Corp score area.`);
        return { ok: true };
      }
      if (source.cannotForfeit) {
        log(state, `${source.title} — cannot be forfeited.`);
        return { ok: true };
      }
      const stolen = state.cards[stolenId]!;
      const gain = action.gainCredits;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "forfeit-return",
            label: `Forfeit ${source.title}: gain ${gain}¢ and return ${stolen.title} to HQ`,
            effect: {
              op: "seq",
              effects: [
                {
                  op: "do",
                  action: {
                    kind: "forfeit_scored_agenda",
                    cardId: sourceId,
                  },
                },
                {
                  op: "do",
                  action: {
                    kind: "gain_credits",
                    side: "corp",
                    amount: gain,
                  },
                },
                {
                  op: "do",
                  action: {
                    kind: "return_stolen_agenda_to_hq",
                    cardId: stolenId,
                  },
                },
              ],
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ],
logLine: `${source.title} — may forfeit to gain ${gain}¢ and return ${stolen.title} to HQ.`,
});
      return { ok: true };
    }

case "caissa_pawn_host_outermost_central": {
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.kind !== "central" || server.ice.length === 0) continue;
        const iceId = server.ice[0]!;
        options.push({
          id: `host:${iceId}`,
          label: `Host on ${state.cards[iceId]!.title} (${sid})`,
          effect: {
            op: "do",
            action: {
              kind: "host_program_on_ice",
              programId: sourceId,
              iceId,
            },
          },
        });
      }
      if (options.length === 0) {
        log(state, `${source.title} — no outermost ice on a central server.`);
        return { ok: true };
      }
      if (options.length === 1) return evalEffect(ctx, options[0]!.effect);
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

case "caissa_rook_host": {
      const isCaissa = (id: string) => {
        const subs = (state.cards[id]?.subtypes ?? []).map((s) => s.toLowerCase());
        return subs.includes("caïssa") || subs.includes("caissa");
      };
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const iceId of server.ice) {
          const taken = state.runner.installed.some(
            (rid) => state.cards[rid]?.hostId === iceId && isCaissa(rid),
          );
          if (!taken) candidates.push(iceId);
        }
      }
      if (candidates.length === 0) {
        log(state, `${source.title} — no valid host ice.`);
        return { ok: true };
      }
      const currentHost = source.hostId;
      const currentServer = currentHost ? serverIdForIce(state, currentHost) : null;
      const inwardFromInnermost = (serverIce: string[], iceId: string): number =>
        serverIce.length - 1 - serverIce.indexOf(iceId);
      const currentInward =
        currentHost && currentServer
          ? inwardFromInnermost(state.servers[currentServer].ice, currentHost)
          : -1;
      const filtered = candidates.filter((iceId) => {
        if (iceId === currentHost) return false;
        if (!currentHost) return true;
        const sid = serverIdForIce(state, iceId);
        if (!sid) return false;
        return (
          inwardFromInnermost(state.servers[sid].ice, iceId) === currentInward
        );
      });
      const pickFrom = currentHost ? filtered : candidates;
      if (pickFrom.length === 0) {
        log(
          state,
          `${source.title} — no ice in the same position, counted from the innermost (CR ${CR.countPositions.number}).`,
        );
        return { ok: true };
      }
      if (pickFrom.length === 1) {
        return applyPrimitive(ctx, {
          kind: "host_program_on_ice",
          programId: sourceId,
          iceId: pickFrom[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: pickFrom.map((iceId) => ({
          id: `host:${iceId}`,
          label: `Host on ${state.cards[iceId]!.title}`,
          effect: {
            op: "do",
            action: {
              kind: "host_program_on_ice",
              programId: sourceId,
              iceId,
            },
          },
        })),
      });
      return { ok: true };
    }

case "caissa_bishop_host": {
      const isCaissa = (id: string) => {
        const subs = (state.cards[id]?.subtypes ?? []).map((s) => s.toLowerCase());
        return subs.includes("caïssa") || subs.includes("caissa");
      };
      const hostId = source.hostId;
      let requireCentral: boolean | null = null;
      if (hostId) {
        const sid = serverIdForIce(state, hostId);
        if (sid) {
          requireCentral = state.servers[sid].kind === "central";
        }
      }
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        if (requireCentral !== null) {
          const isCentral = server.kind === "central";
          if (requireCentral && isCentral) continue;
          if (!requireCentral && !isCentral) continue;
        }
        for (const iceId of server.ice) {
          const taken = state.runner.installed.some(
            (rid) => state.cards[rid]?.hostId === iceId && isCaissa(rid),
          );
          if (!taken) candidates.push(iceId);
        }
      }
      if (candidates.length === 0) {
        log(state, `${source.title} — no valid host ice.`);
        return { ok: true };
      }
      if (candidates.length === 1) {
        return applyPrimitive(ctx, {
          kind: "host_program_on_ice",
          programId: sourceId,
          iceId: candidates[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((iceId) => ({
          id: `host:${iceId}`,
          label: `Host on ${state.cards[iceId]!.title}`,
          effect: {
            op: "do",
            action: {
              kind: "host_program_on_ice",
              programId: sourceId,
              iceId,
            },
          },
        })),
      });
      return { ok: true };
    }

case "copycat_jump_to_rezzed_copy": {
      if (!state.run?.lastPassedRezzedIceId) {
        log(state, `Copycat — no passed ice.`);
        return { ok: true };
      }
      const passed = state.cards[state.run.lastPassedRezzedIceId];
      if (!passed) return { ok: true };
      const defId = passed.defId;
      const matches: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const iceId of server.ice) {
          if (iceId === state.run.lastPassedRezzedIceId) continue;
          const ice = state.cards[iceId];
          if (ice?.type === "ice" && ice.rezzed && ice.defId === defId) {
            matches.push(iceId);
          }
        }
      }
      state.runner.installed = state.runner.installed.filter((id) => id !== sourceId);
      trashToHeap(state, sourceId);
      log(state, `Trash ${source.title}.`);
      if (matches.length === 0) {
        log(state, `Copycat — no other rezzed copy to jump to.`);
        return { ok: true };
      }
      if (matches.length === 1) {
        return applyPrimitive(ctx, {
          kind: "copycat_continue_from_ice",
          iceId: matches[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: matches.map((iceId) => ({
          id: `copycat:${iceId}`,
          label: `Continue from ${state.cards[iceId]!.title}`,
          effect: {
            op: "do",
            action: { kind: "copycat_continue_from_ice", iceId },
          },
        })),
      });
      return { ok: true };
    }

case "copycat_continue_from_ice": {
      if (!state.run) return { ok: true };
      const iceId = action.iceId;
      const ice = state.cards[iceId];
      if (!ice || ice.type !== "ice" || !ice.rezzed) {
        log(state, `Copycat — invalid ice.`);
        return { ok: true };
      }
      let hostServer: string | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.ice.includes(iceId)) {
          hostServer = sid;
          break;
        }
      }
      if (!hostServer) return { ok: true };
      const serverId = hostServer as import("../../state/types.js").ServerId;
      state.run.attackedServerId = serverId;
      const pos = state.servers[serverId].ice.indexOf(iceId);
      state.run.position = pos >= 0 ? pos : 0;
      state.run.passedIceIds = [...(state.run.passedIceIds ?? []), iceId];
      log(
        state,
        `Copycat — continue the run as if passing ${ice.title} on ${hostServer}.`,
      );
      return { ok: true };
    }

case "advance_caissa_host_inward_or_install": {
      const hostId = source.hostId;
      if (!hostId) return { ok: true };
      const sid = serverIdForIce(state, hostId);
      if (!sid) return { ok: true };
      const iceList = state.servers[sid].ice;
      const pos = iceList.indexOf(hostId);
      const nextId = pos >= 0 && pos + 1 < iceList.length ? iceList[pos + 1]! : null;
      if (nextId) {
        return applyPrimitive(ctx, {
          kind: "host_program_on_ice",
          programId: sourceId,
          iceId: nextId,
        });
      }
      trashToHeap(state, sourceId);
      const isCaissa = (id: string) => {
        const c = state.cards[id];
        return (
          c?.type === "program" &&
          ((c.subtypes ?? []).some((s) => s.toLowerCase().includes("caissa")) ||
            (c.subtypes ?? []).some((s) => s.toLowerCase().includes("caïssa")))
        );
      };
      const caissaIds = [...state.runner.hand, ...state.runner.discardPile].filter(
        (id) => isCaissa(id) && id !== sourceId,
      );
      if (caissaIds.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: caissaIds.map((cardId) => ({
          id: `install:${cardId}`,
          label: `Install ${state.cards[cardId]!.title} ignoring all costs`,
          effect: {
            op: "do",
            action: {
              kind: "install_caissa_from_zone_ignore_costs",
              cardId,
            },
          },
        })),
      });
      return { ok: true };
    }

case "invasion_of_privacy": {
      return applyPrimitive(ctx, {
        kind: "trace",
        strength: action.traceStrength ?? 2,
        onSuccess: {
          op: "do",
          action: { kind: "invasion_of_privacy_success" },
        },
        onFailure: {
          op: "do",
          action: { kind: "give_bad_publicity", amount: 1 },
        },
      });
    }

case "invasion_of_privacy_success": {
      const max = Math.max(0, state.turn.lastTraceExcess ?? 0);
      for (const id of state.runner.hand) state.cards[id]!.faceup = true;
      state.turn.invasionPrivacyTrashRemaining = max;
      if (max <= 0) return { ok: true };
      return applyPrimitive(ctx, { kind: "trash_next" });
    }

case "invasion_of_privacy_finish": {
      state.turn.invasionPrivacyTrashRemaining = 0;
      return { ok: true };
    }

case "peeping_tom_apply_type": {
      const ice = state.cards[sourceId];
      const run = state.run;
      if (!ice || !run?.encounter || run.encounter.iceId !== sourceId) {
        log(state, `Peeping Tom apply — no encounter.`);
        return { ok: true };
      }
      const grip = [...state.runner.hand];
      const titles = grip.map((id) => state.cards[id]?.title ?? id);
      log(
        state,
        `${ice.title} — reveal grip (${titles.length}): ${titles.join(", ") || "empty"}.`,
      );
      const n = grip.filter((id) => state.cards[id]?.type === action.cardType)
        .length;
      if (!ice.baseSubroutines) {
        ice.baseSubroutines = ice.subroutines
          ? structuredClone(ice.subroutines)
          : [];
      }
      const subEffect = {
        op: "do" as const,
        action: {
          kind: "unless" as const,
          payer: "runner" as const,
          cost: {
            op: "do" as const,
            action: { kind: "give_tags" as const, amount: 1 },
          },
          instruction: {
            op: "do" as const,
            action: { kind: "end_the_run" as const },
          },
        },
      };
      const gained = Array.from({ length: n }, (_, i) => ({
        id: `${ice.defId}-peeping-${i}`,
        text: "End the run unless the Runner takes 1 tag.",
        effect: structuredClone(subEffect),
      }));
      ice.subroutines = [...gained];
      run.encounter.broken = ice.subroutines.map(() => false);
      if (!run.peepingTomIceIds) run.peepingTomIceIds = [];
      if (!run.peepingTomIceIds.includes(sourceId)) {
        run.peepingTomIceIds.push(sourceId);
      }
      log(
        state,
        `${ice.title} — gains ${n} ETR-unless-tag subroutine(s) for the remainder of this run (${action.cardType}).`,
      );
      return { ok: true };
    }

case "hangeki_runner_may_access": {
      const card = state.cards[action.cardId];
      if (!card) {
        log(state, `Hangeki — chosen card missing.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "hangeki-access",
            label: `Access ${card.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "access_installed" as const,
                cardId: action.cardId,
                onAccess: action.onAccess,
              },
            },
          },
          {
            id: "hangeki-decline",
            label: "Decline",
            effect: action.onDecline,
          },
        ],
logLine: `${source.title} — Runner may access ${card.title}.`,
});
      return { ok: true };
    }

case "access_installed": {
      const rfg = evalEffect({ state, sourceId }, action.onAccess);
      if (!rfg.ok) return rfg;
      const card = state.cards[action.cardId];
      if (!card) {
        log(state, `Hangeki access — card missing.`);
        return { ok: true };
      }
      let serverId: import("../../state/types.js").ServerId | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (
          server.root.includes(action.cardId) ||
          server.ice.includes(action.cardId)
        ) {
          serverId = sid as import("../../state/types.js").ServerId;
          break;
        }
      }
      if (!serverId) {
        log(state, `Hangeki access — card no longer installed.`);
        return { ok: true };
      }
      if (state.run && !state.run.isPostRunBreach) {
        return applyPrimitive(ctx, {
          kind: "access_installed_card",
          cardId: action.cardId,
        });
      }
      state.pendingStandaloneCardAccess = {
        sourceId,
        cardId: action.cardId,
        serverId,
      };
      log(
        state,
        `${source.title} — pending out-of-run access of ${card.title}.`,
      );
      return { ok: true };
    }

case "access_one_root_other_server": {
      if (!state.run) {
        return {
          ok: false,
          error: "access_one_root_other_server requires an active run.",
          cites: [CR.breach],
        };
      }
      const attacked = state.run.attackedServerId;
      const cands: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (sid === attacked) continue;
        for (const id of server.root) {
          cands.push(id);
        }
      }
      state.run.cannotStealOrTrash = true;
      state.run.accessCandidates = cands;
      state.run.randomAccessLimit = cands.length > 0 ? 1 : 0;
      state.run.accessCandidatesPreset = true;
      state.run.accessedCardIds = state.run.accessedCardIds ?? [];
      if (cands.length > 0) {
        // Enter breach instead of ending the run after skipBreach replace.
        state.run.skipBreach = false;
        log(
          state,
          `${source.title} — instead of breach, access 1 root card among ${cands.length} other-server candidate(s) (cannot steal/trash).`,
        );
      } else {
        log(
          state,
          `${source.title} — no other-server root cards to access.`,
        );
      }
      return { ok: true };
    }

case "access_set_aside": {
      const aside = [...(state.corp.corpSetAside ?? [])];
      const pick = action.cardId;
      if (!aside.includes(pick)) {
        log(state, `${source.title} — Khusyuk access: card not set aside.`);
        return { ok: true };
      }
      const card = state.cards[pick]!;
      log(state, `${source.title} — access ${card.title} from set-aside.`);
      if (card.type === "agenda") {
        stealAgenda(state, pick);
      }
      // Shuffle remaining set-aside (and unstolen pick if still set-aside) into R&D.
      const remaining = aside.filter(
        (id) => id !== pick || state.cards[id]?.zone === "corp:set-aside",
      );
      for (const id of remaining) {
        if (state.cards[id]?.zone !== "corp:set-aside") continue;
        state.corp.deck.push(id);
        state.cards[id]!.zone = "corp:rd";
        state.cards[id]!.faceup = false;
      }
      state.corp.corpSetAside = [];
      shuffleCorpRdAfterSearch(state);
      log(state, `${source.title} — shuffle set-aside into R&D.`);
      return { ok: true };
    }

case "access_random_hq": {
      const hq = state.corp.hand;
      if (hq.length === 0) {
        log(state, `Access random HQ — HQ empty.`);
        return { ok: true };
      }
      const cardId = hq[hq.length - 1]!;
      const card = state.cards[cardId]!;
      card.faceup = true;
      log(state, `Accessed ${card.title} in HQ at random (Detente).`);
      fireOnAccess(state, cardId);
      return { ok: true };
    }

case "access_installed_card": {
      if (!state.run) {
        log(state, `Access installed card — no active run.`);
        return { ok: true };
      }
      const card = state.cards[action.cardId];
      if (!card || !card.zone.includes(":root")) {
        log(state, `Access installed card — not in a server root.`);
        return { ok: true };
      }
      state.run.accessCandidates = [action.cardId];
      state.run.randomAccessLimit = 1;
      state.run.accessCandidatesPreset = true;
      state.run.skipBreach = false;
      log(
        state,
        `${source.title} — Runner accesses ${card.title}.`,
      );
      return { ok: true };
    }

case "etr_subroutines_per_runner_tags_on_encounter": {
      const ice = state.cards[sourceId];
      const run = state.run;
      if (!ice || !run?.encounter || run.encounter.iceId !== sourceId) {
        return { ok: true };
      }
      const n = Math.max(0, effectiveRunnerTags(state));
      if (n === 0) {
        log(state, `${ice.title} — 0 tags, no extra ETR subroutines.`);
        return { ok: true };
      }
      if (!ice.baseSubroutines) {
        ice.baseSubroutines = ice.subroutines
          ? structuredClone(ice.subroutines)
          : [];
      }
      const etrEffect = {
        op: "do" as const,
        action: { kind: "end_the_run" as const },
      };
      const printed = structuredClone(ice.baseSubroutines);
      const etrSubs = Array.from({ length: n }, (_, i) => ({
        id: `${ice.defId}-etr-tags-${i}`,
        text: "End the run.",
        effect: structuredClone(etrEffect),
      }));
      ice.subroutines = [...printed, ...etrSubs];
      for (let i = 0; i < n; i++) {
        run.encounter.broken.push(false);
      }
      log(
        state,
        `${ice.title} — gain ${n} ETR subroutine(s) after printed (${state.runner.tags} tag(s)).`,
      );
      return { ok: true };
    }

case "cultivate_hq_looked": {
      const cardId = action.cardId;
      const idx = state.turn.rdLookedCards.indexOf(cardId);
      if (idx < 0) {
        log(state, `Cultivate HQ — card not in look zone.`);
        return { ok: true };
      }
      state.turn.rdLookedCards.splice(idx, 1);
      const card = state.cards[cardId]!;
      card.zone = "corp:hq";
      card.faceup = false;
      state.corp.hand.push(cardId);
      log(state, `Cultivate — add a looked card to HQ.`);
      if (state.turn.rdLookedCards.length === 0) {
        return { ok: true };
      }
      return offerRdArrangeChoice(state, sourceId);
    }

case "pick_rd_arrange": {
      const cardId = action.cardId;
      const idx = state.turn.rdLookedCards.indexOf(cardId);
      if (idx < 0) {
        log(state, `Arrange R&D — card not in look zone.`);
        return { ok: true };
      }
      state.turn.rdLookedCards.splice(idx, 1);
      state.turn.rdArrangePlaced.push(cardId);
      return offerRdArrangeChoice(state, sourceId);
    }

case "pick_second": {
      const rezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (id === action.firstIceId) continue;
          if (state.cards[id]?.rezzed) rezzed.push(id);
        }
      }
      if (rezzed.length === 0) {
        return {
          ok: false,
          error: "realloc() — no second rezzed ice.",
          cites: [CR.playOperation],
        };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: rezzed.map((id) => ({
          id: `realloc-second:${id}`,
          label: `Choose ${state.cards[id]!.title} (2 of 2)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "resolve_realloc" as const,
              iceIds: [action.firstIceId, id] as [string, string],
            },
          },
        })),
logLine: `${source.title} — choose second rezzed ice.`,
});
      return { ok: true };
    }

case "pick_revealed": {
      const pick = action.cardId;
      const revealed = action.revealedIds ?? [];
      if (!revealed.includes(pick)) {
        log(state, `${source.title} — Loot Box pick not in revealed set.`);
        return { ok: true };
      }
      const card = state.cards[pick]!;
      const cost = card.playCost ?? card.installCost ?? 0;
      state.runner.hand.push(pick);
      card.zone = "runner:grip";
      card.faceup = true;
      state.corp.credits += cost;
      log(
        state,
        `Add ${card.title} to grip; Corp gains ${cost}¢ → ${state.corp.credits}.`,
      );
      const rest = revealed.filter((id) => id !== pick);
      for (const id of rest) {
        state.cards[id]!.faceup = false;
        state.runner.deck.push(id);
      }
      if (rest.length > 0) {
        shuffleRunnerStack(state);
        log(state, `Shuffle ${rest.length} remaining card(s) into stack.`);
      }
      return { ok: true };
    }

case "archives_to_hq": {
      const n = Math.min(action.amount, state.corp.discardPile.length);
      for (let i = 0; i < n; i++) {
        const id = state.corp.discardPile.pop()!;
        state.corp.hand.push(id);
        state.cards[id].zone = "corp:hq";
        state.cards[id].faceup = false;
      }
      log(
        state,
        `Add ${n} card(s) from Archives to HQ (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }

case "may_give_runner_credits_then": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "give-credits",
            label: `Runner gains ${action.amount}¢`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "gain_credits" as const,
                    side: "runner" as const,
                    amount: action.amount,
                  },
                },
                structuredClone(action.then),
              ],
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          },
        ],
logLine: `${source.title} — may have the Runner gain ${action.amount}¢.`,
});
      return { ok: true };
    }

case "blank_installed_resource_until_corp_turn_end": {
      const resources = state.runner.installed.filter(
        (id) => state.cards[id]?.type === "resource",
      );
      if (resources.length === 0) {
        log(state, `${source.title} — no installed resource to blank.`);
        return { ok: true };
      }
      if (resources.length === 1) {
        const id = resources[0]!;
        const card = state.cards[id]!;
        blankAbilitiesUntilCorpTurnEnd(state, {
          createdBy: sourceId,
          cardId: id,
        });
        log(
          state,
          `${card.title} — abilities blanked until Corp turn ends (CR ${CR.lingeringEffect.number}).`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: resources.map((id) => ({
          id: `blank-res:${id}`,
          label: `Blank ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "blank_resource_until_corp_turn_end" as const,
              cardId: id,
            },
          },
        })),
logLine: `${source.title} — choose installed resource to blank.`,
});
      return { ok: true };
    }

case "blank_resource_until_corp_turn_end": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "resource" || !state.runner.installed.includes(action.cardId)) {
        log(state, `Blank resource — not an installed resource.`);
        return { ok: true };
      }
      blankAbilitiesUntilCorpTurnEnd(state, {
        createdBy: sourceId,
        cardId: action.cardId,
      });
      log(
        state,
        `${card.title} — abilities blanked until Corp turn ends (CR ${CR.lingeringEffect.number}).`,
      );
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

case "prevent_pending_subroutine_break": {
      const pending = state.pendingSubroutineBreak;
      if (!pending) {
        log(state, `${source.title} — no pending subroutine break to prevent.`);
        return { ok: true };
      }
      pending.prevented = true;
      log(
        state,
        `${source.title} — prevent 1 subroutine from being broken.`,
      );
      return { ok: true };
    }

case "prevent_pending_end_the_run_from_corp_card_ability": {
      const pending = state.pendingEndTheRun;
      if (!pending?.fromCorpCardAbility) {
        log(
          state,
          `${source.title} — no pending Corp-card-ability end the run to prevent.`,
        );
        return { ok: true };
      }
      state.pendingEndTheRun = null;
      log(
        state,
        `${source.title} — prevent Corp card ability from ending the run.`,
      );
      return { ok: true };
    }

case "prevent_pending_expose": {
      preventPendingExpose(state, action.amount);
      resumeExposeUpTo(state);
      return { ok: true };
    }

case "prevent_pending_installed_trash": {
      preventPendingInstalledTrash(state);
      return { ok: true };
    }

case "prevent_current_ice_on_encounter": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `prevent_current_ice_on_encounter — no encounter.`);
        return { ok: true };
      }
      enc.onEncounterPrevented = true;
      enc.onEncounterPending = false;
      log(state, `Prevent when encountered ability on current ice.`);
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
      const maxSubs = Math.max(1, action.maxSubs ?? 1);
      let broken = 0;
      for (let n = 0; n < maxSubs; n++) {
        const idx = enc.broken.findIndex((b) => !b);
        if (idx < 0) break;
        enc.broken[idx] = true;
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
      if (state.run?.encounter) {
        const ice = state.cards[state.run.encounter.iceId];
        if (ice?.cannotBreakWithRunnerCardAbilities) {
          return {
            ok: false,
            error: "Runner card abilities cannot break subroutines on this ice (Trieste).",
            cites: [CR.encounterBreakPaw],
          };
        }
        const exceptSubtype = ice
          ? iceBreakExceptSubtype(state, ice.id)
          : undefined;
        if (
          exceptSubtype &&
          !(source.subtypes ?? []).includes(exceptSubtype)
        ) {
          return {
            ok: false,
            error: `Subroutines on ${ice!.title} can only be broken by a ${exceptSubtype}.`,
            cites: [CR.encounterBreakPaw],
          };
        }
        if (
          cannotBreakExceptIcebreakerActive(state) &&
          !cardHasIcebreakerSubtype(source)
        ) {
          return {
            ok: false,
            error:
              "Cannot break subroutines with a non-icebreaker card while NEXT Activation Command is active.",
            cites: [CR.encounterBreakPaw, CR.lockdownOperation],
          };
        }
      }

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
      if (
        typeof action.requireMinStrength === "number" &&
        (ice?.strength ?? 0) < action.requireMinStrength
      ) {
        log(
          state,
          `Break encounter subroutine — ice strength ${ice?.strength ?? 0} < ${action.requireMinStrength}.`,
        );
        return { ok: true };
      }
      const maxSubs = Math.max(1, action.maxSubs ?? 1);
      let broken = 0;
      for (let n = 0; n < maxSubs; n++) {
        const idx = enc.broken.findIndex((b) => !b);
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
        enc.broken[idx] = true;
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
      // Tungsten Tailor: first break this turn on ice with strength ≤ N → +1¢.
      if (!state.turn.tungstenBreakCreditUsedThisTurn) {
        const iceStr = iceStrength(state, enc.iceId);
        for (const rid of state.runner.installed) {
          const rc = state.cards[rid];
          if (rc?.gainCreditOnBreakIceStrengthLteOncePerTurn === undefined) {
            continue;
          }
          if (iceStr <= rc.gainCreditOnBreakIceStrengthLteOncePerTurn) {
            state.turn.tungstenBreakCreditUsedThisTurn = true;
            state.runner.credits += 1;
            log(
              state,
              `${rc.title} — gain 1¢ (break on ice strength ${iceStr}).`,
            );
            break;
          }
        }
      }
      if (enc.broken.every(Boolean) && source.onFullyBreak) {
        fireOnFullyBreak(state, sourceId);
        if (state.pendingChoice) return { ok: true };
      }
      if (enc.broken.every(Boolean)) {
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
      if (state.cards[enc.iceId]?.cannotBreakWithRunnerCardAbilities) {
        return {
          ok: false,
          error:
            "Runner card abilities cannot break subroutines on this ice (Trieste).",
          cites: [CR.encounterBreakPaw],
        };
      }
      const brStr = breakerStrength(state, sourceId);
      const iceStr = iceStrength(state, enc.iceId);
      if (brStr < iceStr) {
        log(
          state,
          `${source.title} — strength ${brStr} < ice ${iceStr}; cannot interface.`,
        );
        return { ok: true };
      }
      const faceupHosted = (source.hostedCardIds ?? []).filter((id) => {
        const c = state.cards[id];
        return c && c.faceup && c.title === source.title;
      });
      if (faceupHosted.length === 0) {
        log(state, `${source.title} — no faceup hosted copy to turn facedown.`);
        return { ok: true };
      }
      const unbroken = enc.broken.filter((b) => !b).length;
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
        const idx = enc.broken.findIndex((b) => !b);
        if (idx < 0) break;
        enc.broken[idx] = true;
        const sub = state.cards[enc.iceId]?.subroutines?.[idx];
        log(
          state,
          `${source.title} breaks "${sub?.text ?? `sub ${idx}`}".`,
        );
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
      log(
        state,
        `${source.title} — gain ${x}¢ (X = Runner scored agendas).`,
      );
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

case "offer_jack_out": {
      if (state.run?.successful === true) {
        log(
          state,
          `Jack out has no effect — the run is already successful (CR ${CR.noPositionAfterApproach.number}).`,
        );
        return { ok: true };
      }
      if (state.run && !state.run.cannotJackOut) {
        if (openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: [
            {
              id: "jack_out",
              label: "Jack out",
              effect: { op: "do", action: { kind: "end_the_run" } },
            },
            {
              id: "continue",
              label: "Continue the run",
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "runner", amount: 0 },
              },
            },
          ],
        })) {
          state.run.pendingJackOutOffer = true;
          // end_the_run via jack out should mark unsuccessful — handle in choose
          log(state, `Runner may jack out (Karunā).`);
        }
      }
      return { ok: true };
    }

case "offer_forged_activation_orders_rez": {
      const iceId = action.cardId;
      const ice = iceId ? state.cards[iceId] : undefined;
      if (!ice || ice.rezzed) return { ok: true };
      const rezCost = ice.rezCost ?? 0;
      const options: { id: string; label: string; effect: Effect }[] = [];
      if (state.corp.credits >= rezCost) {
        options.push({
          id: "fao-rez",
          label: `Rez ${ice.title} for ${rezCost}¢`,
          effect: fx.do({ kind: "rez_ice_by_id", iceId }),
        });
      }
      options.push({
        id: "fao-trash",
        label: `Trash ${ice.title}`,
        effect: fx.do({ kind: "trash_installed_corp_card", cardId: iceId }),
      });
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

case "dividends": {
      // CR 10.13.1 / 10.13.2 — use score-begin snapshot when present.
      const adv =
        source.scoreBeginAdvancementCounters ??
        source.advancementCounters ??
        0;
      const req =
        source.scoreBeginAdvancementRequirement ??
        source.advancementRequirement ??
        0;
      const excess = Math.max(0, adv - req);
      const n = excess * action.n;
      source.agendaCounters = (source.agendaCounters ?? 0) + n;
      log(
        state,
        `Dividends ${action.n} — place ${n} agenda counter(s) (${adv}−${req}) → ${source.agendaCounters} (CR ${CR.dividends.number}).`,
      );
      return { ok: true };
    }

case "hq_to_top_rd": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `HQ to top of R&D — HQ empty.`);
        return { ok: true };
      }
      if (action.pick === "choose" && hq.length > 1) {
        openPendingChoose(state, {
          sourceId,
          chooser: "corp",
          options: hq.map((id) => ({
            id,
            label: `Top R&D: ${state.cards[id]?.title ?? id}`,
            effect: {
              op: "do",
              action: { kind: "hq_card_to_top_rd", cardId: id },
            },
          })),
logLine: `HQ to top of R&D — Corp chooses among ${hq.length}.`,
});
        return { ok: true };
      }
      const id = action.pick === "first" ? hq[0]! : hq[hq.length - 1]!;
      removeCardFromCurrentZone(state, id);
      state.corp.deck.push(id);
      state.cards[id].zone = "corp:rd";
      state.cards[id].faceup = false;
      log(
        state,
        `${state.cards[id].title} moved from HQ to top of R&D.`,
      );
      return { ok: true };
    }

case "hq_card_to_top_rd": {
      const id = action.cardId;
      if (!state.corp.hand.includes(id)) {
        return {
          ok: false,
          error: "Chosen card is not in HQ.",
          cites: [CR.gainCredits],
        };
      }
      removeCardFromCurrentZone(state, id);
      state.corp.deck.unshift(id);
      state.cards[id].zone = "corp:rd";
      state.cards[id].faceup = false;
      log(state, `${state.cards[id].title} moved from HQ to top of R&D.`);
      return { ok: true };
    }

case "climactic_register_bonus_access": {
      const amount = Math.max(0, action.amount ?? 2);
      state.turn.climacticBonusAccessOnFirstHqRdBreach = amount;
      log(
        state,
        `${source.title} — first HQ or R&D breach this turn: access +${amount}.`,
      );
      return { ok: true };
    }

case "name_agenda": {
      if (!state.run) {
        log(state, `Whistleblower name — no run.`);
        return { ok: true };
      }
      state.run.whistleblowerNamedTitle = action.title;
      log(
        state,
        `${source.title} — name ${action.title}; next access of that agenda this run is stolen ignoring costs.`,
      );
      return { ok: true };
    }

case "name_net_damage_loop": {
      const titles = new Set<string>();
      for (const id of state.runner.hand) {
        titles.add(state.cards[id]!.title);
      }
      for (const id of state.runner.deck) {
        titles.add(state.cards[id]!.title);
      }
      for (const id of state.runner.discardPile) {
        titles.add(state.cards[id]!.title);
      }
      for (const id of state.runner.installed) {
        titles.add(state.cards[id]!.title);
      }
      const titleList = [...titles].sort();
      if (titleList.length === 0) {
        // Still allow naming via empty — no loop possible.
        log(state, `${source.title} — no known Runner card titles to name.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: titleList.map((title) => ({
          id: `ci-name:${title}`,
          label: `Name ${title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "net_named" as const,
              title,
            },
          },
        })),
logLine: `${source.title} — choose a card name for net damage loop.`,
});
      return { ok: true };
    }

case "backup_plan_may_rerun_ignore_additional_costs_bypass_last_ice": {
      if (!state.run) {
        log(state, `${source.title} — no run for Backup Plan.`);
        return { ok: true };
      }
      const serverId = state.run.attackedServerId;
      const lastIce = state.run.lastEncounteredIceId;
      if (!openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline-backup",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          {
            id: "backup-rerun",
            label: `Run ${serverId} again (ignore additional costs; bypass last ice)`,
            effect: {
              op: "do" as const,
              action: { kind: "backup_plan_rerun" as const },
            },
          },
        ],
      })) return { ok: true };
      // Stash bypass target on the source for the rerun leaf.
      source.chosenIceId = lastIce;
      source.chosenServerId = serverId;
      log(
        state,
        `${source.title} — may rerun ${serverId} ignoring additional costs.`,
      );
      return { ok: true };
    }

case "backup_plan_rerun": {
      const serverId = source.chosenServerId;
      if (!serverId || !state.servers[serverId]) {
        log(state, `${source.title} — Backup Plan rerun: no server.`);
        return { ok: true };
      }
      // Immediate fail-closed leaf: create a new run with the bypass/ignore flags.
      if (state.run) {
        log(state, `${source.title} — cannot start Backup Plan rerun while a run is active.`);
        return { ok: true };
      }
      // If run already closed, start a fresh run skeleton with flags.
      state.run = {
        attackedServerId: serverId,
        phase: "initiation",
        position: null,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        endedTheRun: false,
        cannotJackOut: false,
        encounter: null,
        accessingCardId: null,
        runSourceId: sourceId,
        backupPlanIgnoreAdditionalCosts: true,
        backupPlanBypassIceId: source.chosenIceId,
      };
      log(
        state,
        `${source.title} — rerun ${serverId} (ignore additional costs` +
          (source.chosenIceId
            ? `; bypass ${state.cards[source.chosenIceId]?.title ?? source.chosenIceId}`
            : "") +
          `).`,
      );
      return { ok: true };
    }

case "net_named": {
      const title = action.title;
      const before = new Set(state.runner.hand);
      const namedInGrip = state.runner.hand.filter(
        (id) => state.cards[id]?.title === title,
      );
      dealDamage(state, "net", 1, sourceId);
      // If interrupt pending, stash continuation to resume loop.
      if (state.pendingDamage) {
        state.pendingEffectContinuation = {
          sourceId,
          effects: [
            {
              op: "do" as const,
              action: { kind: "net_named" as const, title },
            },
          ],
        };
        // Mark so after damage resolves we check trash — use a simpler immediate path:
        // clear continuation; instead check after non-interactive damage below.
        state.pendingEffectContinuation = null;
        log(
          state,
          `${source.title} — net damage pending; Complete Image loop pauses (fail-closed until accepted).`,
        );
        return { ok: true };
      }
      // Non-interactive: check whether a named card left grip into heap.
      const trashedNamed = [...before].some(
        (id) =>
          state.cards[id]?.title === title &&
          state.runner.discardPile.includes(id) &&
          !state.runner.hand.includes(id),
      );
      if (trashedNamed || namedInGrip.some((id) => state.runner.discardPile.includes(id))) {
        log(
          state,
          `${source.title} — trashed ${title}; repeat Complete Image.`,
        );
        return applyPrimitive(ctx, {
          kind: "net_named",
          title,
        });
      }
      log(state, `${source.title} — no ${title} trashed; Complete Image ends.`);
      return { ok: true };
    }

case "mirrormorph_take_different_action_click_discount": {
      state.turn.mirrormorphClickDiscountPending = true;
      log(
        state,
        `${source.title} — next different Corp action pays [click] less.`,
      );
      return { ok: true };
    }

case "realloc_two_rezzed_ice": {
      const rezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id]?.rezzed) rezzed.push(id);
        }
      }
      if (rezzed.length < 2) {
        return {
          ok: false,
          error: "realloc() requires 2 rezzed ice.",
          cites: [CR.playOperation],
        };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: rezzed.map((id) => ({
          id: `realloc-first:${id}`,
          label: `Choose ${state.cards[id]!.title} (1 of 2)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "pick_second" as const,
              firstIceId: id,
            },
          },
        })),
logLine: `${source.title} — choose first rezzed ice.`,
});
      return { ok: true };
    }

case "may_charge_card": {
      return offerMayChargeCard(state, action.cardId, sourceId);
    }

case "charge": {
      if (action.pick === "self") {
        return chargeCard(state, sourceId, sourceId);
      }
      if (action.pick === "card") {
        if (!action.cardId) {
          return {
            ok: false,
            error: "charge pick=card requires cardId.",
            cites: [CR.charge],
          };
        }
        return chargeCard(state, action.cardId, sourceId);
      }
      // choose among controller's installed chargeable cards
      const side = source.side;
      const cands = chargeableInstalledIds(state, side);
      if (cands.length === 0) {
        log(
          state,
          `Charge — no installed card with power counters (CR ${CR.chargeTargets.number}).`,
        );
        return { ok: true };
      }
      if (cands.length === 1) {
        return chargeCard(state, cands[0]!, sourceId);
      }
      openPendingChoose(state, {
        sourceId,
        chooser: side,
        options: cands.map((id) => ({
          id: `charge-${id}`,
          label: `Charge ${state.cards[id].title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "charge" as const,
              pick: "card" as const,
              cardId: id,
            },
          },
        })),
logLine: `Charge — ${side} chooses among ${cands.length} cards (CR ${CR.chargeTargets.number}).`,
});
      return { ok: true };
    }

case "flip_identity": {
      if (source.type !== "identity") {
        log(state, `flip_identity — source is not an identity.`);
        return { ok: true };
      }
      const becomingFlipped = !source.identityFlipped;
      source.identityFlipped = becomingFlipped;
      // The newly faceup face is the active one (CR 3.1.1a).
      applyIdentityFace(source);
      if (source.side === "runner") recomputeRunnerLink(state);
      log(
        state,
        `${source.title} flips to ${source.identityFlipped ? "back" : "front"} side` +
          (source.meliesChosenBackFace && becomingFlipped
            ? ` (${source.meliesChosenBackFace})`
            : "") +
          `.`,
      );
      if (becomingFlipped) {
        const face = source.meliesChosenBackFace;
        const attacked = state.run?.attackedServerId;
        if (
          source.identityFlippedHooks?.onFlipToBackIfRunMatchesFace &&
          face &&
          attacked === face
        ) {
          fireOnFlipToBackIfRunMatchesFace(state, sourceId);
          if (state.pendingChoice) return { ok: true };
        }
      }
      return { ok: true };
    }

case "may_flip_archives_ice_resolve_subroutine": {
      const facedownIce = state.corp.discardPile.filter((id) => {
        const c = state.cards[id];
        return c.type === "ice" && !c.faceup;
      });
      if (facedownIce.length === 0) {
        log(state, `${source.title} — no facedown ice in Archives.`);
        return { ok: true };
      }
      const options: Array<{
        id: string;
        label: string;
        effect: import("../ir.js").Effect;
      }> = [];
      for (const iceId of facedownIce) {
        const ice = state.cards[iceId]!;
        const subs = ice.subroutines ?? [];
        for (let i = 0; i < subs.length; i++) {
          const sub = subs[i]!;
          options.push({
            id: `flip:${iceId}:${i}`,
            label: `Turn ${ice.title} faceup, resolve "${sub.text}"`,
            effect: {
              op: "do",
              action: {
                kind: "flip_archives_ice_resolve_subroutine",
                iceId,
                subIndex: i,
              },
            },
          });
        }
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
logLine: `${source.title} — may turn 1 facedown Archives ice faceup and resolve a subroutine.`,
});
      return { ok: true };
    }

case "flip_archives_ice_resolve_subroutine": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice" || !state.corp.discardPile.includes(action.iceId)) {
        log(state, `Flip Archives ice — invalid target.`);
        return { ok: true };
      }
      ice.faceup = true;
      const sub = ice.subroutines?.[action.subIndex];
      if (!sub) {
        log(state, `Flip ${ice.title} faceup — no subroutine ${action.subIndex}.`);
        return { ok: true };
      }
      log(
        state,
        `Turn ${ice.title} faceup in Archives; resolve "${sub.text}".`,
      );
      return evalEffect({ state, sourceId: action.iceId }, sub.effect);
    }

case "melies_secretly_set_face": {
      if (source.type !== "identity") {
        log(state, `melies_secretly_set_face — source is not an identity.`);
        return { ok: true };
      }
      // Always re-set on front; if already flipped, still allow choose for next cycle.
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: (
          [
            ["hq", "HQ"],
            ["rd", "R&D"],
            ["archives", "Archives"],
          ] as const
        ).map(([id, label]) => ({
          id: `melies-face:${id}`,
          label: `Secretly set Méliès U face: ${label}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "melies_set_face" as const,
              face: id,
            },
          },
        })),
logLine: `${source.title} — secretly set identity face.`,
});
      return { ok: true };
    }

case "melies_set_face": {
      if (source.type !== "identity") {
        log(state, `melies_set_face — source is not an identity.`);
        return { ok: true };
      }
      source.meliesChosenBackFace = action.face;
      // Secret set always leaves Only the Brightest faceup.
      source.identityFlipped = false;
      applyIdentityFace(source);
      log(
        state,
        `${source.title} secretly sets face to ${action.face} (front faceup).`,
      );
      return { ok: true };
    }

case "peer_review": {
      const hqLen = state.corp.hand.length;
      const revealN = Math.max(0, hqLen - 1);
      if (revealN > 0) {
        // Reveal all but 1: leave the last HQ card hidden for bookkeeping.
        for (const id of state.corp.hand.slice(0, revealN)) {
          state.cards[id]!.faceup = true;
        }
      }
      state.corp.credits += 7;
      log(
        state,
        `Peer Review — reveal ${revealN} HQ card(s); gain 7¢ → ${state.corp.credits}¢.`,
      );
      const hqCards = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "agenda" || t === "asset" || t === "upgrade";
      });
      const affordable = hqCards.filter(
        (id) =>
          creditsAvailableForInstall(state, "corp") >=
          corpInstallCost(state.cards[id]!, 0),
      );
      if (affordable.length === 0) {
        log(state, `Peer Review — no affordable root install from HQ.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline install",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...affordable.map((id) => ({
            id: `peer-install:${id}`,
            label: `Install ${state.cards[id]!.title} in a new remote root for ${corpInstallCost(state.cards[id]!, 0)}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_hq_card_paying_costs" as const,
                cardId: id,
              },
            },
          })),
        ],
logLine: `Peer Review — may install 1 card from HQ in a remote root.`,
});
      return { ok: true };
    }

case "mitra_aman_approach_ice": {
      releaseHostedCardsOnTrash(state, sourceId);
      removeCardFromCurrentZone(state, sourceId);
      state.corp.discardPile.push(sourceId);
      source.zone = "corp:archives";
      source.faceup = true;
      state.corp.credits += 3;
      log(
        state,
        `Mitra Aman trashed → gain 3¢ (${state.corp.credits}¢).`,
      );
      const run = state.run;
      if (!run || run.position === null) {
        log(state, `Mitra Aman — no approached ice.`);
        return { ok: true };
      }
      const approachedId =
        state.servers[run.attackedServerId]?.ice[run.position];
      if (!approachedId) {
        log(state, `Mitra Aman — no approached ice.`);
        return { ok: true };
      }
      const candidates: string[] = [];
      for (const id of state.corp.hand) {
        if (state.cards[id]?.type === "ice") candidates.push(id);
      }
      for (const id of state.corp.discardPile) {
        if (state.cards[id]?.type === "ice") candidates.push(id);
      }
      if (candidates.length === 0) {
        log(state, `Mitra Aman — no ice in HQ or Archives to swap.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Decline swap",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
        ...candidates.map((iceId) => ({
          id: `mitra-swap:${iceId}`,
          label: `Swap with ${state.cards[iceId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "swap_approached_ice_with_hq_or_archives" as const,
              replacementIceId: iceId,
            },
          },
        })),
      ];
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `Mitra Aman — may swap approached ice.`,
});
      return { ok: true };
    }

case "store_ip_enforcement_tags_removed": {
      state.turn.ipEnforcementTagsRemoved = action.amount;
      return { ok: true };
    }

case "gamedragon_may_host_on_icebreaker": {
      const allowAi = Boolean(action.allowAi);
      const requireHost = Boolean(action.requireHost);
      const breakers = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        if (!c?.breaker && !(c?.subtypes ?? []).includes("icebreaker")) {
          return false;
        }
        if (!allowAi && (c.subtypes ?? []).includes("ai")) return false;
        return true;
      });
      if (breakers.length === 0) {
        log(
          state,
          allowAi
            ? `${source.title} — no icebreaker to host on.`
            : `${source.title} — no non-AI icebreaker to host on.`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        breakers.map((icebreakerId) => ({
          id: icebreakerId,
          label: `Host on ${state.cards[icebreakerId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "host_hardware_on_icebreaker" as const,
              icebreakerId,
            },
          },
        }));
      if (!requireHost) {
        options.push({
          id: "decline",
          label: "Decline",
          effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options,
logLine: requireHost
          ? `${source.title} — host on an icebreaker.`
          : `${source.title} — may host on a${allowAi ? "" : " non-AI"} icebreaker.`,
});
      return { ok: true };
    }

case "deja_vu_from_heap": {
      const heap = [...state.runner.discardPile];
      if (heap.length === 0) {
        log(state, `${source.title} — heap empty.`);
        return { ok: true };
      }
      const viruses = heap.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes("virus"),
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const id of heap) {
        options.push({
          id: `deja1:${id}`,
          label: `Add ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "deja_vu_add_heap_cards" as const,
              cardIds: [id],
            },
          },
        });
      }
      for (let i = 0; i < viruses.length; i++) {
        for (let j = i + 1; j < viruses.length; j++) {
          const a = viruses[i]!;
          const b = viruses[j]!;
          options.push({
            id: `deja2:${a}:${b}`,
            label: `Add ${state.cards[a]!.title} and ${state.cards[b]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "deja_vu_add_heap_cards" as const,
                cardIds: [a, b],
              },
            },
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options,
logLine: `${source.title} — add 1 card (or up to 2 virus cards) from heap to grip.`,
});
      return { ok: true };
    }

case "deja_vu_add_heap_cards": {
      for (const id of action.cardIds) {
        const idx = state.runner.discardPile.indexOf(id);
        if (idx < 0) continue;
        state.runner.discardPile.splice(idx, 1);
        state.runner.hand.push(id);
        state.cards[id]!.zone = "runner:grip";
        state.cards[id]!.faceup = false;
        log(state, `Add ${state.cards[id]!.title} from heap to grip.`);
      }
      return { ok: true };
    }

case "expose": {
      if (action.cardId) {
        beginExpose(state, action.cardId);
        return { ok: true };
      }
      const targets = exposeLegalTargets(state);
      if (targets.length === 0) {
        log(state, `${source.title} — no installed unrezzed Corp cards to expose.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        beginExpose(state, targets[0]!);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: targets.map((id) => ({
          id: `expose:${id}`,
          label: `Expose ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "expose" as const,
              pick: "choose" as const,
              cardId: id,
            },
          },
        })),
logLine: `${source.title} — choose a card to expose.`,
});
      return { ok: true };
    }

case "expose_up_to": {
      const remaining =
        typeof action.remaining === "number" ? action.remaining : action.max;
      openExposeUpTo(state, sourceId, action.max, remaining);
      return { ok: true };
    }

case "expose_one_of_up_to": {
      state.turn.exposeUpToAfter = {
        sourceId,
        max: action.max,
        remaining: action.remaining,
      };
      const status = beginExpose(state, action.cardId);
      if (status === "done") resumeExposeUpTo(state);
      return { ok: true };
    }

case "may_expose_after_rez_continue": {
      const pending = state.pendingExpose;
      if (!pending) return { ok: true };
      openExposeInterruptOrComplete(state, pending.cardId);
      resumeExposeUpTo(state);
      return { ok: true };
    }

case "end_expose_up_to": {
      finishExposeUpTo(state, sourceId);
      return { ok: true };
    }

case "accelerated_beta_test": {
      const n = action.n ?? 3;
      if (state.turn.rdLookedCards.length > 0) {
        return {
          ok: false,
          error: "R&D look already in progress.",
          cites: [],
        };
      }
      const taken = state.corp.deck.splice(
        0,
        Math.min(n, state.corp.deck.length),
      );
      state.turn.rdLookedCards = taken;
      for (const id of taken) {
        state.cards[id]!.faceup = true;
        log(state, `ABT look R&D — ${state.cards[id]!.title}.`);
      }
      return applyPrimitive(ctx, { kind: "accelerated_beta_test_continue" });
    }

case "accelerated_beta_test_continue": {
      const iceLeft = state.turn.rdLookedCards.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (iceLeft.length === 0) {
        for (const id of [...state.turn.rdLookedCards]) {
          state.turn.rdLookedCards = state.turn.rdLookedCards.filter(
            (x) => x !== id,
          );
          trashCorpCardToArchives(state, id);
          log(state, `ABT — trash ${state.cards[id]!.title}.`);
        }
        state.turn.rdLookedCards = [];
        return { ok: true };
      }
      const iceId = iceLeft[0]!;
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: `abt-skip:${iceId}`,
          label: `Decline ${state.cards[iceId]!.title} (will trash)`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "trash_looked",
                  cardId: iceId,
                },
              },
              {
                op: "do",
                action: { kind: "accelerated_beta_test_continue" },
              },
            ],
          },
        },
      ];
      for (const server of Object.values(state.servers)) {
        options.push({
          id: `abt-ice:${iceId}:${server.id}`,
          label: `Install and rez ${state.cards[iceId]!.title} protecting ${server.id}`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "install_ice" as const,
                  cardId: iceId,
                  serverId: server.id,
                },
              },
              {
                op: "do" as const,
                action: { kind: "accelerated_beta_test_continue" as const },
              },
            ],
          },
        });
      }
      options.push({
        id: `abt-ice:${iceId}:new`,
        label: `Install and rez ${state.cards[iceId]!.title} protecting a new remote`,
        effect: {
          op: "seq",
          effects: [
            {
              op: "do" as const,
              action: {
                kind: "install_ice" as const,
                cardId: iceId,
                serverId: "__new_remote__",
              },
            },
            {
              op: "do" as const,
              action: { kind: "accelerated_beta_test_continue" as const },
            },
          ],
        },
      });
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `ABT — may install and rez ${state.cards[iceId]!.title}.`,
});
      return { ok: true };
    }

case "accelerated_diagnostics": {
      const n = 3;
      // Deck top is index 0 (commitDraw shifts).
      const looked: string[] = state.corp.deck.splice(0, n);
      for (const id of looked) {
        state.cards[id]!.faceup = true;
      }
      log(
        state,
        `Accelerated Diagnostics — look top ${looked.length}: ${looked.map((id) => state.cards[id]!.title).join(", ") || "none"}.`,
      );
      for (const id of [...looked]) {
        const card = state.cards[id]!;
        if (card.type === "operation") {
          log(state, `Play ${card.title} from looked cards (ignore additional costs).`);
          state.corp.hand.push(id);
          card.zone = "corp:hq";
          card.faceup = false;
          const r = applyPrimitive(ctx, {
            kind: "play_hq_operation_paying_costs",
            cardId: id,
          });
          if (!r.ok) return r;
          looked.splice(looked.indexOf(id), 1);
        }
      }
      for (const id of looked) {
        if (state.corp.deck.includes(id)) {
          state.corp.deck = state.corp.deck.filter((x) => x !== id);
        }
        trashCorpCardToArchives(state, id);
        log(state, `Trash looked ${state.cards[id]?.title ?? id}.`);
      }
      return { ok: true };
    }

case "escher_rearrange_pick_server": {
      if (state.run) state.run.skipBreach = true;
      const servers = Object.values(state.servers).filter(
        (s) => s.ice.length >= 2,
      );
      if (servers.length === 0) {
        log(state, `${source.title} — no server with 2+ ice to rearrange.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...servers.map((s) => ({
            id: `escher:${s.id}`,
            label: `Rearrange ice protecting ${s.id}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "escher_rearrange_server_ice" as const,
                serverId: s.id,
                order: [],
              },
            },
          })),
          {
            id: "escher:done",
            label: "Done rearranging",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits" as const, side: "runner" as const, amount: 0 },
            },
          },
        ],
logLine: `${source.title} — choose a server to rearrange ice, or finish.`,
});
      return { ok: true };
    }

case "escher_rearrange_server_ice": {
      const serverId = action.serverId;
      const server = state.servers[serverId];
      if (!server) {
        log(state, `escher_rearrange_server_ice — unknown server.`);
        return applyPrimitive(ctx, { kind: "escher_rearrange_pick_server" });
      }
      const placed: string[] = [...(action.order ?? [])];
      const remaining: string[] = server.ice.filter(
        (id: string) => !placed.includes(id),
      );
      if (remaining.length === 0) {
        server.ice = placed;
        for (let i = 0; i < placed.length; i++) {
          const c = state.cards[placed[i]!];
          if (c) c.zone = `server:${serverId}:ice`;
        }
        log(
          state,
          `${source.title} — rearranged ice on ${serverId}: ${placed
            .map((id: string) => state.cards[id]?.title ?? id)
            .join(" → ")}.`,
        );
        return applyPrimitive(ctx, { kind: "escher_rearrange_pick_server" });
      }
      if (remaining.length === 1) {
        return applyPrimitive(ctx, {
          kind: "escher_rearrange_server_ice",
          serverId,
          order: [...placed, remaining[0]!],
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: remaining.map((iceId: string) => ({
          id: `escher-ice-order:${iceId}`,
          label: `Next (outer→inner): ${state.cards[iceId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "escher_rearrange_server_ice" as const,
              serverId,
              order: [...placed, iceId],
            },
          },
        })),
logLine: `${source.title} — choose next ice position (${placed.length + 1}/${server.ice.length}).`,
});
      return { ok: true };
    }

case "chum_register_next_ice": {
      if (!state.run) {
        log(state, `Chum — no run.`);
        return { ok: true };
      }
      state.run.chumNextIce = {
        strengthBonus: action.strengthBonus,
        netDamageIfNotFullyBroken: action.netDamageIfNotFullyBroken,
        chumSourceId: sourceId,
      };
      log(
        state,
        `${source.title} — next ice +${action.strengthBonus} strength; ${action.netDamageIfNotFullyBroken} net if not fully broken.`,
      );
      return { ok: true };
    }

case "sensei_register_etr_on_other_ice_for_run": {
      if (!state.run) {
        log(state, `Sensei — no run.`);
        return { ok: true };
      }
      if (!state.run.senseiEtrSourceIds) state.run.senseiEtrSourceIds = [];
      if (!state.run.senseiEtrSourceIds.includes(sourceId)) {
        state.run.senseiEtrSourceIds.push(sourceId);
      }
      log(
        state,
        `${source.title} — other ice gains End the run after printed for remainder of run.`,
      );
      return { ok: true };
    }

case "ryo_phoenix_on_successful_run": {
      if (!state.run?.subroutineResolvedThisRun) {
        return { ok: true };
      }
      if (state.turn.ryoPhoenixFiredThisTurn) {
        return { ok: true };
      }
      state.turn.ryoPhoenixFiredThisTurn = true;
      state.runner.credits += 1;
      log(state, `${source.title} — gain 1¢ (successful run after sub).`);
      return applyPrimitive(ctx, {
        kind: "trash_hq",
        pick: "random",
        amount: 1,
      });
    }

case "forged_activation_orders": {
      // Printed: "Choose 1 unrezzed piece of ice. The Corp may rez that
      // ice. If they do not, they trash it." The Runner chooses the ice;
      // the Corp chooses rez-or-trash.
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (!state.cards[id].rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Forged Activation Orders — no unrezzed ice.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        return applyPrimitive(ctx, {
          kind: "offer_forged_activation_orders_rez",
          cardId: targets[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: targets.map((id) => ({
          id: `fao:${id}`,
          label: `Choose ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "offer_forged_activation_orders_rez",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

case "troubleshooter_fortify": {
      // Printed: X¢, trash — choose 1 rezzed ice protecting this server;
      // that ice gets +X strength for the remainder of the turn (CR 1.2.1).
      const maxX = state.corp.credits;
      if (maxX <= 0) {
        log(state, `Corporate Troubleshooter — no credits to spend.`);
        return { ok: true };
      }
      const zone = source.zone ?? "";
      const serverId = zone.startsWith("server:")
        ? (zone.split(":")[1] as ServerId | undefined)
        : undefined;
      const server = serverId ? state.servers[serverId] : undefined;
      const iceTargets = (server?.ice ?? []).filter((id: string) => {
        const c = state.cards[id];
        return c?.type === "ice" && c.rezzed;
      });
      if (iceTargets.length === 0) {
        log(
          state,
          `Corporate Troubleshooter — no rezzed ice protecting this server.`,
        );
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const id of iceTargets) {
        for (let x = 1; x <= maxX; x++) {
          options.push({
            id: `ct:${id}:${x}`,
            label: `Spend ${x}¢: ${state.cards[id]!.title} +${x} strength this turn`,
            effect: fx.do({
              kind: "fortify_ice_spend_x_resolve",
              iceId: id,
              amount: x,
            }),
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

case "rehost_on_other_ice": {
      const currentHost = source.hostId;
      const others: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const iceId of server.ice) {
          if (iceId !== currentHost) others.push(iceId);
        }
      }
      if (others.length === 0) {
        log(state, `${source.title} — no other installed ice to host on.`);
        return { ok: true };
      }
      if (others.length === 1) {
        const iceId = others[0]!;
        source.hostId = iceId;
        log(
          state,
          `${source.title} hosts on ${state.cards[iceId]!.title}.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: others.map((iceId) => ({
          id: `rehost:${iceId}`,
          label: `Host on ${state.cards[iceId]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "rehost_to_ice" as const, iceId },
          },
        })),
logLine: `${source.title} — choose another installed ice to host on.`,
});
      return { ok: true };
    }

case "rehost_to_ice": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice") {
        log(state, `Rehost — ${action.iceId} is not ice.`);
        return { ok: true };
      }
      let installed = false;
      for (const server of Object.values(state.servers)) {
        if (server.ice.includes(action.iceId)) {
          installed = true;
          break;
        }
      }
      if (!installed) {
        log(state, `Rehost — ${ice.title} is not installed.`);
        return { ok: true };
      }
      source.hostId = action.iceId;
      log(state, `${source.title} hosts on ${ice.title}.`);
      return { ok: true };
    }

case "ayla_set_aside_to_grip": {
      const setAside = state.runner.setAside ?? [];
      if (setAside.length === 0) {
        log(state, `Ayla — set-aside empty.`);
        return { ok: true };
      }
      // Printed: "Add 1 card set aside with this identity to your grip" —
      // the Runner chooses which set-aside card.
      const picked = action.cardId;
      if (!picked) {
        if (setAside.length === 1) {
          return applyPrimitive(ctx, {
            kind: "ayla_set_aside_to_grip",
            cardId: setAside[0]!,
          });
        }
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: setAside.map((id) => ({
            id: `ayla:${id}`,
            label: `Add ${state.cards[id]!.title} to grip`,
            effect: fx.do({ kind: "ayla_set_aside_to_grip", cardId: id }),
          })),
        });
        return { ok: true };
      }
      if (!setAside.includes(picked)) return { ok: true };
      state.runner.setAside = setAside.filter((x) => x !== picked);
      state.runner.hand.push(picked);
      state.cards[picked].zone = "runner:grip";
      state.cards[picked].faceup = true;
      log(state, `Ayla — add ${state.cards[picked].title} from set-aside to grip.`);
      return { ok: true };
    }

case "sabotage": {
      if (action.interactive) {
        state.pendingSabotage = { sourceId, amount: action.amount };
        log(
          state,
          `Sabotage ${action.amount} pending — Corp chooses HQ cards (CR ${CR.sabotageResolution.number}).`,
        );
        return { ok: true };
      }
      return resolveSabotageAmount(state, sourceId, action.amount);
    }

case "identify_mark": {
      identifyMark(state, sourceId);
      return { ok: true };
    }

case "start_run_on_mark": {
      const mark = currentMark(state);
      if (mark === null) {
        log(
          state,
          `Start run on mark — no mark designated (CR ${CR.mark.number}).`,
        );
        return { ok: true };
      }
      state.pendingStartRunOnMark = { sourceId };
      log(
        state,
        `Pending run on mark ${mark} (from ${source.title}; CR ${CR.mark.number}).`,
      );
      return { ok: true };
    }

case "may_start_run": {
      const servers: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (action.servers === "remote" && server.kind !== "remote") continue;
        if (action.servers === "central" && server.kind !== "central") continue;
        if (action.servers === "hq" && sid !== "hq") continue;
        if (action.servers === "rd" && sid !== "rd") continue;
        if (action.servers === "archives" && sid !== "archives") continue;
        if (
          action.servers === "hq_rd" &&
          sid !== "hq" &&
          sid !== "rd"
        ) {
          continue;
        }
        servers.push(sid);
      }
      if (servers.length === 0) {
        log(state, `may_start_run — no matching servers.`);
        return { ok: true };
      }
      const bypassClicks = action.bypassFirstEncounterForClicks;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...servers.map((sid) => ({
            id: `run:${sid}`,
            label: `Run ${sid}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "queue_start_run" as const,
                serverId: sid,
                ...(bypassClicks !== undefined
                  ? { bypassFirstEncounterForClicks: bypassClicks }
                  : {}),
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
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
logLine: `${source.title} — may start a run (${action.servers}).`,
});
      return { ok: true };
    }

case "queue_start_run": {
      state.pendingStartRun = {
        sourceId,
        serverId: action.serverId as import("../../state/types.js").ServerId,
        ...(action.bypassFirstEncounterForClicks !== undefined
          ? {
              bypassFirstEncounterForClicks:
                action.bypassFirstEncounterForClicks,
            }
          : {}),
      };
      log(
        state,
        `Pending run on ${action.serverId} (from ${source.title}).`,
      );
      return { ok: true };
    }

case "queue_breaches_after_current": {
      if (!state.run) {
        log(state, `queue_breaches_after_current — no active run.`);
        return { ok: true };
      }
      if (!state.run.queuedBreachesAfterCurrent) {
        state.run.queuedBreachesAfterCurrent = [];
      }
      for (const server of action.servers) {
        state.run.queuedBreachesAfterCurrent.push({
          server: server as import("../../state/types.js").ServerId,
          ...(action.cannotAccessRoot ? { cannotAccessRoot: true } : {}),
        });
      }
      log(
        state,
        `${source.title} — queue breaches after current: ${action.servers.join(
          ", ",
        )}${action.cannotAccessRoot ? " (cannot access root)" : ""}.`,
      );
      return { ok: true };
    }

case "haas_pet_project_setup": {
      const remaining = Math.max(0, action.remaining);
      if (remaining <= 0) return { ok: true };
      const remoteNum = state.nextRemoteNumber++;
      const sid = `remote-${remoteNum}` as import("../../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      log(state, `${source.title} — create ${sid} for Pet Project installs.`);
      return applyPrimitive(ctx, {
        kind: "install_haas_pet_project_continue",
        remaining,
        serverId: sid,
      });
    }

case "bonus_access": {
      if (!state.run) {
        return {
          ok: false,
          error: "bonus_access requires an active run.",
          cites: [CR.breach],
        };
      }
      const n = action.amount;
      if (n <= 0) return { ok: true };
      state.run.bonusAccess = (state.run.bonusAccess ?? 0) + n;
      log(
        state,
        `${source.title} — +${n} bonus access (CR ${CR.breach.number}).`,
      );
      return { ok: true };
    }

case "fully_operational_step": {
      const remaining = Math.max(0, action.remaining ?? 0);
      if (remaining <= 0) return { ok: true };
      const nextRemaining = remaining - 1;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: `fo-gain:${remaining}`,
            label: "Gain 2¢",
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "gain_credits" as const,
                    side: "corp" as const,
                    amount: 2,
                  },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "fully_operational_step" as const,
                    remaining: nextRemaining,
                  },
                },
              ],
            },
          },
          {
            id: `fo-draw:${remaining}`,
            label: "Draw 2 cards",
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "draw" as const,
                    side: "corp" as const,
                    amount: 2,
                  },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "fully_operational_step" as const,
                    remaining: nextRemaining,
                  },
                },
              ],
            },
          },
        ],
logLine: `${source.title} — choose gain 2¢ or draw 2 (${remaining} remaining).`,
});
      return { ok: true };
    }

case "exclusive_choices_per_passed_ice": {
      return startExclusiveChoicesPerPassedIce(
        state,
        sourceId,
        action.options,
      );
    }

case "restrict_run_access": {
      if (!state.run) {
        log(state, `restrict_run_access — no active run.`);
        return { ok: true };
      }
      const ids = action.cardIdsFromSource
        ? [sourceId]
        : action.cardIds ?? [];
      if (action.mode === "only_source") {
        state.run.accessOnlyCardIds = [
          ...(state.run.accessOnlyCardIds ?? []),
          ...ids,
        ];
      } else {
        state.run.forbiddenAccessCardIds = [
          ...(state.run.forbiddenAccessCardIds ?? []),
          ...ids,
        ];
      }
      applyRunAccessRestrictions(state);
      log(
        state,
        `Run access restricted (${action.mode}) for ${ids.join(", ")}.`,
      );
      return { ok: true };
    }

case "wall_to_wall_turn_begin": {
      let otherRezzedAsset = false;
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          if (id === sourceId) continue;
          const c = state.cards[id];
          if (c?.type === "asset" && c.rezzed) {
            otherRezzedAsset = true;
            break;
          }
        }
        if (otherRezzedAsset) break;
      }
      return applyPrimitive(ctx, {
        kind: "turn_begin_continue",
        remaining: otherRezzedAsset ? 1 : 3,
        used: [],
        mustPick: otherRezzedAsset,
      });
    }

case "focus_group_after_type": {
      const grip = [...state.runner.hand];
      const titles = grip.map((id) => state.cards[id]?.title ?? id);
      log(
        state,
        `${source.title} — reveal grip (${titles.length}): ${titles.join(", ") || "empty"}.`,
      );
      const count = grip.filter(
        (id) => state.cards[id]?.type === action.cardType,
      ).length;
      if (count <= 0) {
        log(
          state,
          `${source.title} — 0 revealed ${action.cardType} cards; X=0.`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (let x = 0; x <= count; x++) {
        options.push({
          id: `fg-x:${x}`,
          label: `X=${x}`,
          effect: {
            op: "do",
            action: { kind: "may_pay_place", amount: x },
          },
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — choose X ≤ ${count} revealed ${action.cardType}.`,
});
      return { ok: true };
    }

case "nihilist_may_remove_2_virus_draw_unless_corp_trash_top_rd": {
      const withVirus = state.runner.installed.filter(
        (id) => (state.cards[id]?.virusCounters ?? 0) > 0,
      );
      const total = withVirus.reduce(
        (sum, id) => sum + (state.cards[id]?.virusCounters ?? 0),
        0,
      );
      if (total < 2) {
        log(
          state,
          `${source.title} — fewer than 2 virus counters on installed cards; decline.`,
        );
        return { ok: true };
      }
      const removeOptions: Array<{
        id: string;
        label: string;
        effect: Effect;
      }> = [];
      for (const id of withVirus) {
        const card = state.cards[id]!;
        const have = card.virusCounters ?? 0;
        const maxTake = Math.min(2, have);
        for (let take = 1; take <= maxTake; take++) {
          removeOptions.push({
            id: `nihilist-rm:${id}:${take}`,
            label: `Remove ${take} virus from ${card.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "remove_nihilist_virus_from" as const,
                cardId: id,
                amount: take,
                remaining: 2 - take,
              },
            },
          });
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          ...removeOptions,
        ],
logLine: `${source.title} — may remove any 2 virus counters from installed cards.`,
});
      return { ok: true };
    }

case "nihilist_corp_trash_top_rd_or_runner_draws_2": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "trash-top-rd",
            label: "Trash the top card of R&D",
            effect: {
              op: "do" as const,
              action: { kind: "trash_top_of_rd" as const },
            },
          },
          {
            id: "allow-draw",
            label: "Allow Runner to draw 2",
            effect: {
              op: "do" as const,
              action: {
                kind: "draw" as const,
                side: "runner" as const,
                amount: 2,
              },
            },
          },
        ],
logLine: `${source.title} — Corp may trash top of R&D or Runner draws 2.`,
});
      return { ok: true };
    }

case "game_over_after_type": {
      const targets = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== action.cardType) return false;
        if (c.breaker) return false;
        if ((c.subtypes ?? []).includes("icebreaker")) return false;
        return true;
      });
      if (targets.length === 0) {
        log(
          state,
          `${source.title} — no installed non-icebreaker ${action.cardType} cards.`,
        );
        return { ok: true };
      }
      return applyPrimitive(ctx, {
        kind: "game_over_continue",
        remaining: targets,
      });
    }

case "game_over_continue": {
      const remaining = [...action.remaining];
      const next = remaining.shift();
      if (!next) {
        log(state, `${source.title} — Game Over trash queue complete.`);
        return { ok: true };
      }
      return applyPrimitive(ctx, {
        kind: "game_over_process_card",
        cardId: next,
        remaining,
      });
    }

case "game_over_process_card": {
      const card = state.cards[action.cardId];
      if (!card || !state.runner.installed.includes(action.cardId)) {
        return applyPrimitive(ctx, {
          kind: "game_over_continue",
          remaining: action.remaining,
        });
      }
      const canPay = state.runner.credits >= 3;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...(canPay
            ? [
                {
                  id: `go-prevent:${action.cardId}`,
                  label: `Pay 3¢ to prevent trashing ${card.title}`,
                  effect: {
                    op: "seq" as const,
                    effects: [
                      {
                        op: "do" as const,
                        action: {
                          kind: "lose_credits" as const,
                          side: "runner" as const,
                          amount: 3,
                        },
                      },
                      {
                        op: "do" as const,
                        action: {
                          kind: "game_over_continue" as const,
                          remaining: action.remaining,
                        },
                      },
                    ],
                  },
                },
              ]
            : []),
          {
            id: `go-trash:${action.cardId}`,
            label: `Trash ${card.title}`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "trash_runner_rig_card" as const,
                    cardId: action.cardId,
                  },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "game_over_continue" as const,
                    remaining: action.remaining,
                  },
                },
              ],
            },
          },
        ],
logLine: `${source.title} — Runner may pay 3¢ to prevent trashing ${card.title}.`,
});
      return { ok: true };
    }

case "meeting_of_minds_fetch": {
      const card = state.cards[action.cardId];
      if (!card || !state.runner.deck.includes(action.cardId)) {
        shuffleRunnerStack(state);
        return applyPrimitive(ctx, {
          kind: "reveal_gain",
          subtype: action.subtype,
        });
      }
      state.runner.deck = state.runner.deck.filter((id) => id !== action.cardId);
      state.runner.hand.push(action.cardId);
      card.zone = "runner:grip";
      card.faceup = true;
      shuffleRunnerStack(state);
      log(
        state,
        `Meeting of Minds — reveal ${card.title} and add to grip.`,
      );
      return applyPrimitive(ctx, {
        kind: "reveal_gain",
        subtype: action.subtype,
      });
    }

case "rd_top_to_bottom": {
      if (state.corp.deck.length === 0) {
        log(state, `R&D top to bottom — empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck.shift()!;
      state.corp.deck.push(topId);
      log(
        state,
        `Add ${state.cards[topId]?.title ?? topId} to the bottom of R&D.`,
      );
      return { ok: true };
    }

case "may_take_bad_publicity_then_add_agenda_counters_equal_to_bad_publicity": {
      const amount = Math.max(0, action.amount);
      const continueFx: Effect = {
        op: "do",
        action: { kind: "add_agenda_counters_equal_to_bad_publicity" },
      };
      if (amount <= 0) return evalEffect(ctx, continueFx);
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "take-bp",
            label: `Take ${amount} bad publicity`,
            effect: {
              op: "seq",
              effects: [
                {
                  op: "do",
                  action: { kind: "give_bad_publicity", amount },
                },
                continueFx,
              ],
            },
          },
          {
            id: "decline-bp",
            label: "Decline",
            effect: continueFx,
          },
        ],
logLine: `${source.title} — may take ${amount} bad publicity, then place agenda counters equal to bad publicity.`,
});
      return { ok: true };
    }

case "rearrange_server_ice": {
      const serverId = action.serverId;
      const server = state.servers[serverId];
      if (!server) {
        log(state, `rearrange_server_ice — unknown server.`);
        return { ok: true };
      }
      const placed: string[] = [...(action.order ?? [])];
      const remaining: string[] = server.ice.filter(
        (id: string) => !placed.includes(id),
      );
      if (remaining.length === 0) {
        server.ice = placed;
        for (let i = 0; i < placed.length; i++) {
          const c = state.cards[placed[i]!];
          if (c) c.zone = `server:${serverId}:ice`;
        }
        log(
          state,
          `${source.title} — rearranged ice on ${serverId}: ${placed
            .map((id: string) => state.cards[id]?.title ?? id)
            .join(" → ")}.`,
        );
        return { ok: true };
      }
      if (remaining.length === 1) {
        return applyPrimitive(ctx, {
          kind: "rearrange_server_ice",
          serverId,
          order: [...placed, remaining[0]!],
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: remaining.map((iceId: string) => ({
          id: `ice-order:${iceId}`,
          label: `Next (outer→inner): ${state.cards[iceId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "rearrange_server_ice" as const,
              serverId,
              order: [...placed, iceId],
            },
          },
        })),
logLine: `${source.title} — choose next ice position (${placed.length + 1}/${server.ice.length}).`,
});
      return { ok: true };
    }

case "burner_place": {
      const id = action.cardId;
      if (!state.corp.hand.includes(id)) {
        log(state, `Burner place — card not in HQ.`);
        return offerBurnerMoves(
          state,
          sourceId,
          action.revealed,
          action.movesLeft,
        );
      }
      removeCardFromCurrentZone(state, id);
      state.cards[id]!.faceup = false;
      if (action.position === "top") {
        state.corp.deck.unshift(id);
      } else {
        state.corp.deck.push(id);
      }
      state.cards[id]!.zone = "corp:rd";
      log(
        state,
        `${state.cards[id]!.title} moved from HQ to ${action.position} of R&D.`,
      );
      return offerBurnerMoves(
        state,
        sourceId,
        action.revealed,
        action.movesLeft,
      );
    }

case "wizard_chest_for_type": {
      const aside: string[] = [];
      const matches: string[] = [];
      while (
        state.runner.deck.length > 0 &&
        matches.length < action.untilCount
      ) {
        const id = state.runner.deck.shift()!;
        aside.push(id);
        if (state.cards[id]!.type === action.cardType) {
          matches.push(id);
        }
      }
      enterSetAside(state, aside, {
        side: "runner",
        faceup: true,
        replace: true,
      });
      log(
        state,
        `${source.title} — set aside ${aside.length} card(s); ${matches.length} ${action.cardType}(s).`,
      );
      if (matches.length === 0) {
        shuffleRunnerSetAsideIntoStack(state);
        return { ok: true };
      }
      const installable = matches.filter((id) =>
        canInstallSetAsideIgnoringCosts(state, id),
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        ...installable.map((id) => ({
          id: `wizard-install:${id}`,
          label: `Install ${state.cards[id]!.title} ignoring all costs`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_wizard_chest" as const,
              cardId: id,
            },
          },
        })),
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do" as const,
            action: { kind: "shuffle_runner_set_aside_into_stack" as const },
          },
        },
      ];
      openPendingChoose(state, { sourceId, chooser: "runner", options,
logLine: `${source.title} — may install 1 of ${matches.length} ${action.cardType}(s) ignoring costs.`,
});
      return { ok: true };
    }

case "check_assassination_win": {
      const n = state.runner.scoreArea.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes("assassination"),
      ).length;
      if (n >= action.amount) {
        state.winner = "runner";
        state.winReason = "runner_alternate";
        state.done = true;
        log(
          state,
          `Runner wins — ${n} assassination agendas (need ${action.amount}).`,
        );
      } else {
        log(
          state,
          `Assassination win check — ${n}/${action.amount} assassination agendas.`,
        );
      }
      checkWinConditions(state);
      return { ok: true };
    }

case "begin_replace_breach_hq_hand_only": {
      if (!state.run) {
        log(
          state,
          `${source.title} — breach HQ (hand only) deferred until a run begins.`,
        );
        state.turn.pendingRaymondFlintHandOnlyHqBreach = true;
        return { ok: true };
      }
      if (state.run.phase === "breach" || state.run.breached) {
        state.run.queuedBreachesAfterCurrent = [
          ...(state.run.queuedBreachesAfterCurrent ?? []),
          { server: "hq", cannotAccessRoot: true },
        ];
        log(
          state,
          `${source.title} — HQ breach waits until the current breach ends (CR ${CR.consecutiveBreaches.number}).`,
        );
        return { ok: true };
      }
      state.run.attackedServerId = "hq";
      state.run.skipBreach = false;
      state.run.accessCandidates = [...state.corp.hand];
      state.run.randomAccessLimit =
        state.run.accessCandidates.length > 0 ? 1 : 0;
      state.run.accessCandidatesPreset = true;
      state.run.forbiddenAccessCardIds = [
        ...(state.servers.hq?.root ?? []),
      ];
      log(
        state,
        `${source.title} — breach HQ (hand only; root inaccessible).`,
      );
      return { ok: true };
    }

case "cap_run_access_remaining": {
      if (!state.run) return { ok: true };
      const max = action.max;
      const room = Math.max(0, max - state.run.accessedCardIds.length);
      if (state.run.randomAccessLimit === null) {
        state.run.randomAccessLimit = room;
      } else {
        state.run.randomAccessLimit = Math.min(state.run.randomAccessLimit, room);
      }
      log(
        state,
        `${source.title} — access capped at ${state.run.randomAccessLimit} card(s) this run.`,
      );
      return { ok: true };
    }

case "unorthodox_predictions_lock_subtype": {
      state.turn.forbidBreakIceSubtypesUntilCorpTurnEnd = [
        action.subtype,
      ];
      log(
        state,
        `Unorthodox Predictions — cannot break ${action.subtype} subroutines until start of Corp next turn.`,
      );
      return { ok: true };
    }

case "runner_lose_credits_equal_corp_bad_publicity": {
      const n = state.corp.badPublicity ?? 0;
      if (n <= 0) return { ok: true };
      const lose = Math.min(n, state.runner.credits);
      subtractRunnerCreditPool(state, lose);
      log(
        state,
        `Runner loses ${lose}¢ (${n} bad publicity) → ${state.runner.credits}¢.`,
      );
      return { ok: true };
    }

case "power_shutdown": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "trash-0",
            label: "Trash 0 from top of R&D",
            effect: {
              op: "do" as const,
              action: { kind: "trash_rd", amount: 0 },
            },
          },
          // Printed: "Trash any number of cards from the top of R&D" —
          // any number up to the whole deck, not a capped range.
          ...Array.from({ length: state.corp.deck.length }, (_, i) => {
            const amount = i + 1;
            return {
              id: `trash-${amount}`,
              label: `Trash ${amount} from top of R&D`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "trash_rd" as const,
                  amount,
                },
              },
            };
          }),
        ],
logLine: `${source.title} — choose how many cards to trash from top of R&D.`,
});
      return { ok: true };
    }
    default:
      return null;
  }
}
