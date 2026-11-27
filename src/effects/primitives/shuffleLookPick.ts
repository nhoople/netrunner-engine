import { log } from "../../state/setupAndEnd/createGame.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import { fireOnAgendaAddedToRunnerScore } from "../../state/hostingAndTrash/trashHooks.js";
import type { EffectCtx } from "../eval.js";
import type { Primitive } from "../ir.js";
import { unhostCard } from "../../state/hostingAndTrash/host.js";
import type { RuleCite } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applySansanOhPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;

  switch (action.kind) {
    case "add_hosted_agenda_to_runner_score": {
      const hosted = (source.hostedCardIds ?? []).filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted agenda.`);
        return { ok: true };
      }
      const agendaId = hosted[0]!;
      const agenda = state.cards[agendaId]!;
      unhostCard(state, agenda.id);
      removeCardFromCurrentZone(state, agendaId);
      state.runner.scoreArea.push(agendaId);
      agenda.zone = "runner:score";
      agenda.faceup = true;
      agenda.rezzed = true;
      log(
        state,
        `${source.title} — add hosted ${agenda.title} to Runner score.`,
      );
      fireOnAgendaAddedToRunnerScore(state);
      return { ok: true };
    }

    default:
      return null;
  }
}
