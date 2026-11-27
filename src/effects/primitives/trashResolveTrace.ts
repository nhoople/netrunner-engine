import { emptyRunnerCreditPool } from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { autoResolveTrace } from "../../state/turnAndActions/trace.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { RuleCite, ServerId } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyLunarUpPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "trash_rezzed_ice_additional_cost": {
      const rezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (c?.rezzed) rezzed.push(id);
        }
      }
      if (rezzed.length === 0) {
        return {
          ok: false,
          error: "No rezzed ice to trash for Mutate.",
          cites: [],
        };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: rezzed.map((id) => ({
          id: `mutate-trash:${id}`,
          label: `Trash ${state.cards[id]!.title} (additional cost)`,
          effect: fx.do({ kind: "mutate_record_trashed_ice", iceId: id }),
        })),
      });
      return { ok: true };
    }
    case "trace_taurus_subroutine": {
      // "If successful, trash 1 piece of hardware. If your trace strength is
      // 5 or greater, trash 1 piece of hardware": the second part does not
      // need a successful trace (CR 10.8.5), and waits for the first.
      const trash = fx.do({ kind: "trash_hardware", pick: "choose" });
      const kick = fx.do({
        kind: "resolve_if_trace_strength_at_least",
        min: 5,
        then: trash,
      });
      const r = autoResolveTrace(state, sourceId, 2, fx.seq(trash, kick), kick);
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "cyber_threat": {
      // Printed: "Choose a server." — centrals, including HQ, are legal.
      const servers = Object.keys(state.servers) as ServerId[];
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: servers.map((sid) => ({
          id: `cyber:${sid}`,
          label: `Cyber Threat — ${sid}`,
          effect: fx.do({ kind: "cyber_threat_server", serverId: sid }),
        })),
      });
      return { ok: true };
    }
    case "cyber_threat_server": {
      const serverId = (action as { serverId: ServerId }).serverId;
      // Printed: "The Corp may rez 1 piece of ice protecting that server.
      // If they do not, run that server. The Corp cannot rez ice during
      // that run." Rezzing costs the printed rez cost as usual.
      const ice = state.servers[serverId].ice.filter(
        (id) =>
          !state.cards[id]?.rezzed &&
          state.corp.credits >= (state.cards[id]?.rezCost ?? 0),
      );
      if (ice.length === 0) {
        return applyLunarUpPrimitive(ctx, {
          kind: "run_cyber_threat_server",
          serverId,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...ice.map((id) => ({
            id: `rez:${id}`,
            label: `Rez ${state.cards[id]!.title} (${state.cards[id]!.rezCost ?? 0}¢)`,
            effect: fx.do({ kind: "corp_rez", iceId: id }),
          })),
          {
            id: "decline",
            label: "Do not rez — Runner runs this server",
            effect: fx.do({ kind: "run_cyber_threat_server", serverId }),
          },
        ],
      });
      return { ok: true };
    }
    case "run_cyber_threat_server": {
      const serverId = (action as { serverId: ServerId }).serverId;
      state.pendingStartRun = {
        sourceId,
        serverId,
        forbidCorpRezIceDuringRun: true,
      };
      log(
        state,
        `Cyber Threat — Runner runs ${serverId}; the Corp cannot rez ice during this run.`,
      );
      return { ok: true };
    }
    case "lose_nasir_all_credits": {
      emptyRunnerCreditPool(state);
      log(state, `Nasir Meidan — Runner loses all credits in pool.`);
      // "Gain credits equal to the rez cost of that ice": the ice being
      // encountered. Its printed rez cost: the rez procedure's modified
      // value is not exposed outside a rez yet (area 7).
      const iceId = state.run?.encounter?.iceId;
      const gain = iceId ? (state.cards[iceId]?.rezCost ?? 0) : 0;
      if (gain > 0) {
        state.runner.credits += gain;
        log(state, `Nasir Meidan — Runner gains ${gain}¢.`);
      }
      return { ok: true };
    }
    default:
      return null;
  }
}
