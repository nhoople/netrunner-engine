/**
 * Primitive kinds whose procedure is set.
 * The effect switch in eval.ts dispatches here.
 */
import type {
  EffectCtx,
  EvalResult,
} from "../eval.js";
import type { Primitive } from "../ir.js";
import { log } from "../../state/createGame.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import { enterSetAside } from "../../state/zones.js";
import { serverHostingCard } from "../eval.js";

export function applySetKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "set_rez_ice_forfeit_discount": {
      if (action.forfeit) {
        state.turn.rezIceForfeitDiscountCardId = action.cardId;
      } else {
        state.turn.rezIceForfeitDiscountCardId = null;
      }
      log(
        state,
        action.forfeit
          ? `Rez ${state.cards[action.cardId]?.title ?? action.cardId} — will forfeit an agenda for discount.`
          : `Rez ${state.cards[action.cardId]?.title ?? action.cardId} — pay full cost.`,
      );
      return { ok: true };
    }

case "set_aside_access_shuffle": {
      const cost = action.installCost;
      const matching = state.runner.installed.filter(
        (id) => (state.cards[id]?.installCost ?? 0) === cost,
      );
      const x = Math.min(6, matching.length);
      if (x === 0) {
        log(state, `${source.title} — X=0; no set-aside.`);
        return { ok: true };
      }
      const aside: string[] = [];
      for (let i = 0; i < x && state.corp.deck.length > 0; i++) {
        aside.push(state.corp.deck.shift()!);
      }
      enterSetAside(state, aside, {
        side: "corp",
        faceup: true,
        bag: "corpSetAside",
        replace: true,
      });
      if (aside.length === 0) {
        log(state, `${source.title} — R&D empty; nothing to access.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: aside.map((id) => ({
          id: `khusyuk-access:${id}`,
          label: `Access ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "access_set_aside" as const,
              cardId: id,
            },
          },
        })),
logLine: `${source.title} — set aside top ${aside.length} of R&D (cost ${cost}); access 1.`,
});
      return { ok: true };
    }

case "set_skip_breach": {
      if (state.run) state.run.skipBreach = true;
      return { ok: true };
    }

case "set_named_server": {
      source.namedServerId = action.serverId as import("../../state/types.js").ServerId;
      log(state, `${source.title} names ${action.serverId}.`);
      return { ok: true };
    }

case "set_chosen_server": {
      source.chosenServerId =
        action.serverId as import("../../state/types.js").ServerId;
      log(state, `${source.title} chooses ${action.serverId}.`);
      return { ok: true };
    }

case "set_encounter_chosen_card_type": {
      if (!state.run?.encounter) {
        log(state, `Set encounter card type — no encounter.`);
        return { ok: true };
      }
      state.run.encounter.chosenCardType = action.cardType;
      log(
        state,
        `${source.title} — encounter card type set to ${action.cardType}.`,
      );
      return { ok: true };
    }

case "set_run_skip_breach": {
      if (!state.run) {
        log(state, `set_run_skip_breach — no active run.`);
        return { ok: true };
      }
      state.run.skipBreach = true;
      log(state, `${source.title} — skip breach this run.`);
      return { ok: true };
    }

case "set_reencounter_ice": {
      if (!state.run) {
        log(state, `set_reencounter_ice — no run.`);
        return { ok: true };
      }
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice") {
        log(state, `set_reencounter_ice — not ice.`);
        return { ok: true };
      }
      const server = state.servers[state.run.attackedServerId];
      let pos = server?.ice.indexOf(action.iceId) ?? -1;
      // Ice may protect the access source server (same as attacked on central).
      if (pos < 0) {
        for (const s of Object.values(state.servers)) {
          const i = s.ice.indexOf(action.iceId);
          if (i >= 0) {
            pos = i;
            // Forced encounter uses attacked-server position bookkeeping.
            if (s.id === state.run.attackedServerId) break;
          }
        }
      }
      if (pos < 0 || !server?.ice.includes(action.iceId)) {
        // Ice protecting another server (upgrade's host) — still schedule by id.
        const hostServer = serverHostingCard(state, action.iceId);
        if (hostServer) {
          pos = hostServer.ice.indexOf(action.iceId);
        }
      }
      if (pos < 0) {
        log(state, `set_reencounter_ice — ice not installed.`);
        return { ok: true };
      }
      // Prefer attacked-server ice index when present.
      const attacked = state.servers[state.run.attackedServerId];
      const attackedPos = attacked?.ice.indexOf(action.iceId) ?? -1;
      state.run.position = attackedPos >= 0 ? attackedPos : pos;
      state.run.reencounterIceId = action.iceId;
      if (state.run.accessingCardId) {
        state.run.resumeAccessAfterReencounter = true;
      }
      log(
        state,
        `Runner will encounter ${ice.title} (Ganked!/reencounter).`,
      );
      return { ok: true };
    }

case "set_nested_encounter_then_resume_source": {
      if (!state.run) {
        log(state, `set_nested_encounter_then_resume_source — no run.`);
        return { ok: true };
      }
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice" || !ice.rezzed) {
        log(state, `set_nested_encounter_then_resume_source — invalid ice.`);
        return { ok: true };
      }
      if (state.run.encounter) {
        state.run.suspendedEncounter = structuredClone(state.run.encounter);
      }
      state.run.resumeEncounterIceId = sourceId;
      state.run.forceEncounterIceId = action.iceId;
      state.run.reencounterIceId = action.iceId;
      state.run.encounter = null;
      const host = Object.values(state.servers).find((s) =>
        s.ice.includes(action.iceId),
      );
      if (host && host.id === state.run.attackedServerId) {
        state.run.position = host.ice.indexOf(action.iceId);
      }
      log(
        state,
        `Runner will encounter ${ice.title}, then resume ${source.title}.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
