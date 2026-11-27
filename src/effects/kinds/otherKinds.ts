import { lookAtCards, revealCards } from "../../state/visibility/reveal.js";
import type { EffectCtx, EvalResult } from "../eval.js";
import type { Effect, Primitive } from "../ir.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { noteInlineConditional } from "../../state/triggers/inlineConditionalHooks.js";
import {
  breakableCount,
  markSubroutineBroken,
  nextBreakableSubroutine,
  runnerBreakBlock,
} from "../../state/turnAndActions/break.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { beginExtraDifferentAction } from "../../state/turnAndActions/corpActionHooks.js";
import { applyIdentityFace } from "../../state/setupAndEnd/identityFace.js";
import { fireOnFlipToBackIfRunMatchesFace } from "../../state/triggers/miscConditionalHooks.js";
import {
  chargeableInstalledIds,
  chargeCard,
  currentMark,
  identifyMark,
  offerSabotagePick,
  resolveSabotageAmount,
} from "../../state/keywordsAndCredits/keywords.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { effectiveRunnerTags } from "../../state/keywordsAndCredits/tags.js";
import { recomputeRunnerLink } from "../../state/hostingAndTrash/trashHooks.js";
import { CR } from "../../timing/labels.js";
import { fx } from "../ir.js";
import { iceStrength } from "../continuous/iceStrength.js";
import {
  moveForfeitedAgendaOutOfGame,
  removeCardFromCurrentZone,
  canScoreAgenda,
  checkWinConditions,
  scoreAgenda,
} from "../../state/turnAndActions/scoring.js";
import {
  stealthHostedCreditsAvailable,
  takeFromStealthHostedCredits,
  subtractRunnerCreditPool,
} from "../../state/keywordsAndCredits/costs.js";
import { allSubroutinesBrokenByRunner } from "../../state/turnAndActions/break.js";
import { effectiveIceSubtypes } from "../../cards/stubs.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import {
  fireOnFullyBreak,
  fireOnForfeit,
  fireAfterBreakSubroutineHooks,
  maybeFireFluxFirstBreakCharge,
  offerMayChargeCard,
  startExclusiveChoicesPerPassedIce,
  evalEffect,
  applyPrimitive,
} from "../eval.js";

export function applyOtherKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
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

    case "spend_enable_hosted_credits_for": {
      source.hostedCreditsSpendFor = [...action.purposes];
      log(
        state,
        `${source.title} — hosted credits spendable for ${action.purposes.join(", ")}.`,
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
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
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
      // Regenesis: "you may reveal 1 facedown agenda in Archives and add it
      // to your score area".
      // The Corp makes the choice of which one, or none (CR 1.15.2, 9.6.9).
      // The agenda is revealed to both players first (CR 1.21.3).
      const facedownIds = state.corp.discardPile.filter((id) => {
        const c = state.cards[id];
        return c?.type === "agenda" && !c.faceup;
      });
      if (facedownIds.length === 0) {
        log(state, `Regenesis — no facedown agenda in Archives.`);
        return { ok: true };
      }
      if (!action.cardId) {
        openPendingChoose(state, {
          sourceId,
          chooser: "corp",
          options: [
            ...facedownIds.map((id) => ({
              id: `regenesis:${id}`,
              label: `Reveal ${state.cards[id]!.title} and add it to your score area`,
              effect: fx.do({
                kind: "score_facedown_agenda_from_archives_if_clean",
                cardId: id,
              }),
            })),
            {
              id: "decline",
              label: "Decline",
              effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
            },
          ],
          logLine: `${source.title} — may reveal a facedown agenda in Archives.`,
        });
        return { ok: true };
      }
      const facedown = action.cardId;
      if (!facedownIds.includes(facedown)) {
        log(state, `Regenesis — that agenda is not facedown in Archives.`);
        return { ok: true };
      }
      revealCards(state, [facedown], sourceId);
      const card = state.cards[facedown];
      state.corp.discardPile = state.corp.discardPile.filter(
        (id) => id !== facedown,
      );
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
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `${source.title} — resolve ${action.mustPick ? "1" : `up to ${action.remaining}`} option(s).`,
      });
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
      state.runner.scoreArea = state.runner.scoreArea.filter(
        (id) => id !== cardId,
      );
      const card = state.cards[cardId]!;
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      state.runner.installed = state.runner.installed.filter(
        (id) => id !== cardId,
      );
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
      const card = state.cards[cardId]!;
      fireOnForfeit(state, cardId);
      moveForfeitedAgendaOutOfGame(state, cardId);
      log(
        state,
        `Forfeit ${card.title}: it is removed from the game (CR ${CR.forfeit.number}).`,
      );
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
      const card = state.cards[cardId]!;
      fireOnForfeit(state, cardId);
      moveForfeitedAgendaOutOfGame(state, cardId);
      log(
        state,
        `Forfeit ${card.title}: it is removed from the game (CR ${CR.forfeit.number}).`,
      );
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

    case "offer_jack_out": {
      if (state.run?.successful === true) {
        log(
          state,
          `Jack out has no effect — the run is already successful (CR ${CR.noPositionAfterApproach.number}).`,
        );
        return { ok: true };
      }
      if (state.run && !state.run.cannotJackOut) {
        if (
          openPendingChoose(state, {
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
          })
        ) {
          state.run.pendingJackOutOffer = true;
          // end_the_run via jack out should mark unsuccessful — handle in choose
          log(state, `Runner may jack out (Karunā).`);
        }
      }
      return { ok: true };
    }

    case "dividends": {
      // CR 10.13.1 / 10.13.2 — use score-begin snapshot when present.
      const adv =
        source.scoreBeginAdvancementCounters ?? source.advancementCounters ?? 0;
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

    case "backup_plan_may_rerun_ignore_additional_costs_bypass_last_ice": {
      if (!state.run) {
        log(state, `${source.title} — no run for Backup Plan.`);
        return { ok: true };
      }
      const serverId = state.run.attackedServerId;
      const lastIce = state.run.lastEncounteredIceId;
      if (
        !openPendingChoose(state, {
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
        })
      )
        return { ok: true };
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
        log(
          state,
          `${source.title} — cannot start Backup Plan rerun while a run is active.`,
        );
        return { ok: true };
      }
      // The run is over: start the new run once this choice resolves,
      // through the same path as other follow-up runs (startRun).
      state.pendingStartRun = {
        sourceId,
        serverId,
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

    case "take_different_action_paying_click_less": {
      beginExtraDifferentAction(state, sourceId);
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
      if (
        !ice ||
        ice.type !== "ice" ||
        !state.corp.discardPile.includes(action.iceId)
      ) {
        log(state, `Flip Archives ice — invalid target.`);
        return { ok: true };
      }
      ice.faceup = true;
      const sub = ice.subroutines?.[action.subIndex];
      if (!sub) {
        log(
          state,
          `Flip ${ice.title} faceup — no subroutine ${action.subIndex}.`,
        );
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

    case "store_ip_enforcement_tags_removed": {
      state.turn.ipEnforcementTagsRemoved = action.amount;
      return { ok: true };
    }

    case "accelerated_diagnostics": {
      // "Look at the top 3 cards of R&D. If any of those cards are
      // operations, you may play them (paying their play cost), ignoring any
      // additional costs. Trash the rest of the unplayed cards you looked at."
      let looked: string[];
      if (!action.cardIds) {
        // Deck top is index 0 (commitDraw shifts).
        looked = state.corp.deck.splice(0, 3);
        // Only the Corp looks (CR 1.21.2).
        lookAtCards(state, looked, sourceId, "corp");
      } else {
        looked = action.cardIds.filter(
          (id) =>
            state.cards[id]?.zone === "corp:rd" &&
            !state.corp.deck.includes(id),
        );
        // Still being looked at while the card resolves (CR 1.21.6).
        for (const id of looked) state.cards[id]!.lookedBy = "corp";
      }
      if (action.playId && looked.includes(action.playId)) {
        const id = action.playId;
        const card = state.cards[id]!;
        log(
          state,
          `Accelerated Diagnostics — play ${card.title}, ignoring additional costs.`,
        );
        state.corp.hand.push(id);
        card.zone = "corp:hq";
        card.faceup = false;
        delete card.lookedBy;
        return applyPrimitive(ctx, {
          kind: "play_hq_operation_paying_costs",
          cardId: id,
        });
      }
      // The Corp plays the operations one at a time, choosing each and
      // whether to play any more (CR 8.6.3, CR 1.14.5).
      const playable = looked.filter((id) => {
        const card = state.cards[id]!;
        return (
          card.type === "operation" &&
          state.corp.credits >= (card.playCost ?? 0)
        );
      });
      if (playable.length === 0 || action.done) {
        // A card the Corp did not play was never seen by the Runner, so it
        // goes to Archives facedown (CR 4.4.6b).
        for (const id of looked) trashCard(state, id, { by: "corp" });
        if (looked.length > 0) {
          log(
            state,
            `Accelerated Diagnostics — trash ${looked.length} looked-at card(s).`,
          );
        }
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...playable.map((id) => {
            const rest = looked.filter((other) => other !== id);
            return {
              id: `play-looked:${id}`,
              label: `Play ${state.cards[id]!.title} (${state.cards[id]!.playCost ?? 0}¢)`,
              effect: fx.seq(
                fx.do({
                  kind: "accelerated_diagnostics",
                  cardIds: looked,
                  playId: id,
                }),
                fx.do({ kind: "accelerated_diagnostics", cardIds: rest }),
              ),
            };
          }),
          {
            id: "play-looked:none",
            label: "Play no more of them",
            effect: fx.do({
              kind: "accelerated_diagnostics",
              cardIds: looked,
              done: true,
            }),
          },
        ],
        logLine: `Accelerated Diagnostics — the Corp may play an operation it looked at.`,
      });
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
      // "The Corp trashes 1 card from HQ": the Corp chooses (CR 1.15.2).
      return applyPrimitive(ctx, {
        kind: "trash_hq",
        pick: "choose",
        amount: 1,
      });
    }

    case "sabotage": {
      // The Corp chooses which HQ cards go (CR 10.12.2). With nothing in
      // HQ, or fewer than N cards in HQ and R&D together (CR 10.12.3b),
      // there is nothing to choose.
      const total = state.corp.hand.length + state.corp.deck.length;
      const forced =
        action.amount <= 0 ||
        state.corp.hand.length === 0 ||
        total < action.amount;
      if (action.interactive || !forced) {
        state.pendingSabotage = { sourceId, amount: action.amount, picked: [] };
        log(
          state,
          `Sabotage ${action.amount} pending — Corp chooses HQ cards (CR ${CR.sabotageResolution.number}).`,
        );
        offerSabotagePick(state);
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
        if (action.servers === "hq_rd" && sid !== "hq" && sid !== "rd") {
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
                ...(action.preventAllTagsThisRun
                  ? { preventAllTagsThisRun: true }
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
      // Doppelgänger's once per turn is used when the Runner runs, not when
      // the ability becomes pending (CR 9.6.9d, 9.3.6g).
      if (
        source.onSuccessfulRunEndOncePerTurn &&
        !state.turn.onSuccessfulRunEndFiredIds.includes(sourceId)
      ) {
        state.turn.onSuccessfulRunEndFiredIds.push(sourceId);
      }
      state.pendingStartRun = {
        sourceId,
        serverId: action.serverId as import("../../state/types.js").ServerId,
        ...(action.bypassFirstEncounterForClicks !== undefined
          ? {
              bypassFirstEncounterForClicks:
                action.bypassFirstEncounterForClicks,
            }
          : {}),
        ...(action.preventAllTagsThisRun
          ? { preventAllTagsThisRun: true }
          : {}),
      };
      log(state, `Pending run on ${action.serverId} (from ${source.title}).`);
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
      return startExclusiveChoicesPerPassedIce(state, sourceId, action.options);
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

    case "unorthodox_predictions_lock_subtype": {
      state.turn.forbidBreakIceSubtypesUntilCorpTurnEnd = [action.subtype];
      log(
        state,
        `Unorthodox Predictions — cannot break ${action.subtype} subroutines until start of Corp next turn.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
