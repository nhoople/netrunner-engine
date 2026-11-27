/**
 * Primitive kinds whose procedure is forbid.
 * The effect switch in eval.ts dispatches here.
 */
import type { EffectCtx, EvalResult } from "../eval.js";
import type { Primitive } from "../ir.js";
import { log } from "../../state/createGame.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { CR } from "../../timing/labels.js";

export function applyForbidKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "forbid_scoring_agendas_this_turn": {
      state.turn.cannotScoreAgendas = true;
      log(state, `Cannot score agendas for the remainder of this turn.`);
      return { ok: true };
    }

    case "forbid_advance_this_turn": {
      state.turn.cannotAdvanceCards = true;
      log(state, `Cannot advance cards for the remainder of this turn.`);
      return { ok: true };
    }

    case "forbid_steal_trash_this_run": {
      if (state.run) {
        state.run.cannotStealOrTrash = true;
        log(
          state,
          `Runner cannot steal or trash Corp cards for the remainder of this run.`,
        );
      }
      return { ok: true };
    }

    case "forbid_steal_accessed_agenda": {
      // "The Runner cannot steal this agenda during this access": it lasts
      // until the next card is accessed (CR 1.2.1).
      const run = state.run;
      if (run?.accessingCardId) {
        run.stealForbiddenAccessCardId = run.accessingCardId;
        log(
          state,
          `${source?.title ?? sourceId} — the Runner cannot steal it during this access.`,
        );
      }
      return { ok: true };
    }

    case "forbid_runner_break_on_source": {
      // Anvil: "the Runner cannot break this ice's printed subroutines for
      // the remainder of this encounter". It lives on the encounter, so it
      // ends with it however the encounter ends (CR 9.10.1).
      if (state.run?.encounter?.iceId === sourceId) {
        state.run.encounter.forbidRunnerBreakPrintedThisEncounter = true;
      }
      log(
        state,
        `${source.title} — Runner cannot break its printed subroutines this encounter.`,
      );
      return { ok: true };
    }

    case "forbid_installed_runner_break_for_run": {
      const cands = [...state.runner.installed];
      if (cands.length === 0) {
        log(state, `${source.title} — no installed Runner cards to forbid.`);
        return { ok: true };
      }
      if (cands.length === 1) {
        const id = cands[0]!;
        state.cards[id]!.cannotBreakSubsThisRun = true;
        log(
          state,
          `${state.cards[id]!.title} — abilities cannot break subs this run.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `forbid-break:${id}`,
          label: `Forbid break with ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "forbid_runner_card_break_for_run" as const,
              cardId: id,
            },
          },
        })),
        logLine: `${source.title} — choose installed Runner card to forbid break.`,
      });
      return { ok: true };
    }

    case "forbid_runner_card_break_for_run": {
      const card = state.cards[action.cardId];
      if (!card || !state.runner.installed.includes(action.cardId)) {
        log(state, `Forbid break — card not installed.`);
        return { ok: true };
      }
      card.cannotBreakSubsThisRun = true;
      log(
        state,
        `${card.title} — abilities cannot break subroutines for the remainder of the run.`,
      );
      return { ok: true };
    }

    case "forbid_steal_trash_title_this_run": {
      if (!state.run) return { ok: true };
      const titles = state.run.forbidStealTrashTitles ?? [];
      if (!titles.includes(action.title)) titles.push(action.title);
      state.run.forbidStealTrashTitles = titles;
      log(
        state,
        `Runner cannot steal or trash copies of ${action.title} for the remainder of this run.`,
      );
      return { ok: true };
    }

    case "forbid_bioroid_ice_paid_abilities_this_turn": {
      state.turn.bioroidIcePaidAbilitiesForbidden = true;
      log(
        state,
        `Runner cannot use paid abilities printed on bioroid ice for the remainder of this turn (CR ${CR.paidAbility.number}).`,
      );
      return { ok: true };
    }

    case "forbid_runner_runs_this_turn": {
      state.turn.cannotMakeAnotherRunThisTurn = true;
      log(state, `${source.title} — Runner cannot make another run this turn.`);
      return { ok: true };
    }
    default:
      return null;
  }
}
