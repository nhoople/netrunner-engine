import {
  breakNextSubroutines,
  interfaceBlock,
  runnerBreakBlock,
} from "../../state/turnAndActions/break.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { addBreakerStrengthBoostThisEncounter } from "../../state/continuous/lingeringEffects.js";
import type { EffectCtx } from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { RuleCite } from "../../state/types.js";
import { fx, type Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyFlashpointMlPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
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

    case "psi_differ_redirect": {
      const current = state.run?.attackedServerId;
      const servers = Object.values(state.servers).filter(
        (s) => s.id !== current,
      );
      if (servers.length === 0 || !state.run) {
        log(state, `Mind Game — no other server.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: servers.map((s) => ({
          id: `mind:${s.id}`,
          label: `Move run to ${s.id}`,
          effect: fx.do({
            kind: "redirect_resolve",
            serverId: s.id,
          }),
        })),
      });
      return { ok: true };
    }

    default:
      return null;
  }
}
