import { log } from "../../state/setupAndEnd/createGame.js";
import { autoResolveTrace } from "../../state/turnAndActions/trace.js";
import { memoryLimit, usedMemory } from "../../state/turnAndActions/turn.js";
import { CR } from "../../timing/labels.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { noteCorpSpentAgendaCounters } from "../../state/keywordsAndCredits/costs.js";
import type { RuleCite } from "../../state/types.js";
import { grantAbilityCredits, type EffectCtx } from "../eval.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyOacPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "gain_credits_equal_to_runner_credits": {
      const n = state.runner.credits;
      return grantAbilityCredits(ctx, "corp", n);
    }

    case "mark_yale_spend_any_agenda_counter_gain_2": {
      const cands = [
        ...state.corp.scoreArea,
        ...Object.values(state.cards)
          .filter(
            (c) =>
              c.side === "corp" &&
              (c.agendaCounters ?? 0) > 0 &&
              c.zone.startsWith("server:"),
          )
          .map((c) => c.id),
      ].filter((id) => (state.cards[id]?.agendaCounters ?? 0) > 0);
      if (cands.length === 0) {
        log(state, `Mark Yale — no agenda counters.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `yale:${id}`,
          label: `Spend agenda counter on ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "mark_yale_spend_counter_on", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "mark_yale_spend_counter_on": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || (card.agendaCounters ?? 0) < 1) {
        return { ok: false, error: "No agenda counter to spend.", cites: [] };
      }
      card.agendaCounters = (card.agendaCounters ?? 0) - 1;
      state.corp.credits += 2;
      noteCorpSpentAgendaCounters(state, 1);
      log(state, `Mark Yale — spend agenda counter on ${card.title}; gain 2¢.`);
      return { ok: true };
    }

    case "trace_strength_equal_source_advancements": {
      const strength = source?.advancementCounters ?? 0;
      const onSuccess =
        (action as { onSuccess?: Effect }).onSuccess ??
        fx.gainCredits("corp", 0);
      const r = autoResolveTrace(state, sourceId, strength, onSuccess);
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }

    case "twins_apply_reencounter": {
      const trashId = (action as { trashId: string }).trashId;
      const iceId = (action as { iceId: string }).iceId;
      // Trash HQ copy to Archives (reveal implied).
      const card = state.cards[trashId];
      if (card) {
        // "Reveal and trash": revealed, so faceup (CR 1.21.6, 4.4.6b).
        trashCard(state, trashId, { by: "corp", faceup: true });
        log(state, `The Twins — trash ${card.title} from HQ.`);
      }
      if (state.run) {
        state.run.reencounterIceId = iceId;
        log(
          state,
          `The Twins — force re-encounter of ${state.cards[iceId]?.title} (CR ${CR.forcedEncounterDuringRun.number}).`,
        );
      }
      return { ok: true };
    }

    case "gain_credits_equal_to_agenda_points_of_trigger": {
      const agendaId = (state.turn as { lastScoredOrStolenAgendaId?: string })
        .lastScoredOrStolenAgendaId;
      const pts = agendaId ? (state.cards[agendaId]?.agendaPoints ?? 0) : 0;
      return grantAbilityCredits(ctx, "runner", pts);
    }

    case "lose_qianju_click_prevent_tag_until_next_turn": {
      if (state.runner.clicks < 1) {
        log(state, `Qianju PT — no click to lose.`);
        return { ok: true };
      }
      state.runner.clicks -= 1;
      (
        state.runner as { qianjuPreventTagUntilNextTurn?: boolean }
      ).qianjuPreventTagUntilNextTurn = true;
      log(state, `Qianju PT — lose [click]; prevent 1 tag until next turn.`);
      return { ok: true };
    }

    case "gain_if_unused_mu_gte": {
      const threshold = (action as { threshold: number }).threshold;
      const amount = (action as { amount: number }).amount;
      const unused = memoryLimit(state) - usedMemory(state);
      if (unused >= threshold) {
        state.runner.credits += amount;
        log(state, `Data Folding — gain ${amount}¢ (${unused} unused MU).`);
      }
      return { ok: true };
    }

    default:
      return null;
  }
}
