/** Fear the Masses (ftm) Mumbad pack primitives — v1.121.0. */
import { openCardName } from "../../state/visibility/seatVisibility.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { startPsiGame } from "../../state/turnAndActions/psi.js";
import type { RuleCite, ServerId } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyMumbadFtmPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "spend_rigged_results_secret_guess": {
      // Psi-style: Runner bid 0–2; Corp guesses. Differ → choose ice + run + bypass.
      startPsiGame(
        state,
        sourceId,
        2,
        fx.do({ kind: "rigged_results_corp_guessed_wrong" }),
        fx.do({ kind: "rigged_results_corp_guessed_right" }),
        { corpGuess: "amount" }, // Corp guesses the amount; spends nothing
      );
      return { ok: true };
    }

    case "rigged_results_corp_guessed_right": {
      log(state, `Rigged Results — Corp guessed correctly; no run.`);
      return { ok: true };
    }

    case "rigged_results_corp_guessed_wrong": {
      const iceIds: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) iceIds.push(id);
      }
      if (iceIds.length === 0) {
        log(state, `Rigged Results — no ice to choose.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: iceIds.map((id) => {
          const serverId =
            (Object.entries(state.servers).find(([, s]) =>
              s.ice.includes(id),
            )?.[0] as ServerId | undefined) ?? "hq";
          return {
            id: `rr-ice:${id}`,
            label: `Run past ${openCardName(state, id, "runner")}`,
            effect: fx.do({
              kind: "bypass_rigged_results_run_ice",
              iceId: id,
              serverId,
            }),
          };
        }),
      });
      return { ok: true };
    }

    case "bypass_rigged_results_run_ice": {
      state.turn.ftmRiggedResultsBypassIceId = action.iceId;
      state.pendingRunEventStart = {
        sourceId,
        serverId: action.serverId as ServerId,
      };
      log(
        state,
        `Rigged Results — run ${action.serverId}; first encounter of chosen ice bypasses.`,
      );
      return { ok: true };
    }

    case "play_ops_from_hq": {
      const max = action.max ?? 2;
      const ops = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "operation",
      );
      if (ops.length === 0) {
        log(state, `Subcontract — no operations in HQ.`);
        return { ok: true };
      }
      state.turn.ftmSubcontractRemaining = max;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...ops.map((id) => ({
            id: `subcontract-play:${id}`,
            label: `Play ${state.cards[id]!.title}`,
            effect: fx.do({
              kind: "play_op_resolve",
              cardId: id,
            }),
          })),
          {
            id: "subcontract-done",
            label: "Done playing operations",
            effect: fx.gainCredits("corp", 0),
          },
        ],
      });
      return { ok: true };
    }

    case "play_op_resolve":
      return { ok: true };

    default:
      return null;
  }
}
