import { log } from "../../state/setupAndEnd/createGame.js";
import type { EffectCtx } from "../eval.js";
import type { Primitive } from "../ir.js";
import type { RuleCite, ServerId } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applySansanUotPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;

  switch (action.kind) {
    case "gain_arm_credits_on_first_agenda_access": {
      state.turn.uotFirstAgendaAccessCredits = action.amount;
      log(
        state,
        `${source.title} — first agenda access this turn gains ${action.amount}¢.`,
      );
      return { ok: true };
    }

    case "gain_if_rezzed_asset_in_root": {
      // Find server hosting this upgrade
      let serverId: ServerId | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.root.includes(sourceId)) {
          serverId = sid as ServerId;
          break;
        }
      }
      if (!serverId) return { ok: true };
      const root = state.servers[serverId]!.root;
      const hasRezzedAsset = root.some((id) => {
        const c = state.cards[id];
        return c?.rezzed && c.type === "asset";
      });
      if (!hasRezzedAsset) {
        log(state, `Expo Grid — no rezzed asset in this server root.`);
        return { ok: true };
      }
      state.corp.credits += 1;
      log(state, `Expo Grid — gain 1¢ → ${state.corp.credits}¢.`);
      return { ok: true };
    }

    default:
      return null;
  }
}
