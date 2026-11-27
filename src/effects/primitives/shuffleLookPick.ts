import { log } from "../../state/setupAndEnd/createGame.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import { fireOnAgendaAddedToRunnerScore } from "../../state/hostingAndTrash/trashHooks.js";
import type { RuleCite, ServerId } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import type { Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { unhostCard } from "../../state/hostingAndTrash/host.js";

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
    case "an_offer_you_cant_refuse": {
      const centrals: ServerId[] = ["hq", "rd", "archives"];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: centrals.map((serverId) => ({
          id: `offer-central:${serverId}`,
          label: `Choose ${serverId.toUpperCase()}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "offer_central_chosen" as const,
              serverId,
            },
          },
        })),
      });
      return { ok: true };
    }

    case "offer_central_chosen": {
      const serverId = action.serverId as ServerId;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "offer-run",
            label: `Run ${serverId.toUpperCase()} (cannot jack out)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "offer_start_run" as const,
                serverId,
              },
            },
          },
          {
            id: "offer-decline",
            label: "Decline — Corp scores An Offer as 1-point agenda",
            effect: {
              op: "do" as const,
              action: {
                kind: "add_to_corp_score_as_agenda" as const,
                agendaPoints: 1,
              },
            },
          },
        ],
      });
      return { ok: true };
    }

    case "offer_start_run": {
      const serverId = action.serverId as ServerId;
      state.pendingStartRun = {
        sourceId,
        serverId,
      };
      state.turn.ohForcedRunCannotJackOut = true;
      log(state, `An Offer — Runner runs ${serverId} (cannot jack out).`);
      return { ok: true };
    }

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
