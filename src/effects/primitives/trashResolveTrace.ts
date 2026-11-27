import { revealCards } from "../../state/visibility/reveal.js";
import { emptyRunnerCreditPool } from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { autoResolveTrace } from "../../state/turnAndActions/trace.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { random } from "../../state/rng.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
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
    case "mutate_record_trashed_ice": {
      const iceId = (action as { iceId: string }).iceId;
      const serverId = Object.entries(state.servers).find(([, s]) =>
        s.ice.includes(iceId),
      )?.[0] as ServerId;
      const index = state.servers[serverId].ice.indexOf(iceId);
      state.turn.mutateTrashedIce = { iceId, serverId, index };
      trashCard(state, iceId, { by: "corp", cause: "cost" });
      log(
        state,
        `Mutate — trashed ${state.cards[iceId]!.title} as additional cost.`,
      );
      return { ok: true };
    }
    case "resolve_mutate_operation": {
      const slot = state.turn.mutateTrashedIce;
      if (!slot) {
        return {
          ok: false,
          error: "Mutate additional cost not paid.",
          cites: [],
        };
      }
      const revealed: string[] = [];
      let found: string | null = null;
      while (state.corp.deck.length > 0) {
        const id = state.corp.deck.shift()!; // reveal from the top (index 0)
        revealed.push(id);
        state.cards[id]!.faceup = true;
        if (state.cards[id]!.type === "ice") {
          found = id;
          break;
        }
      }
      revealCards(state, revealed, sourceId);
      const shuffleRd = () => {
        for (const id of state.corp.deck) {
          state.cards[id]!.faceup = false;
        }
        for (let i = state.corp.deck.length - 1; i > 0; i--) {
          const j = Math.floor(random(state) * (i + 1));
          [state.corp.deck[i], state.corp.deck[j]] = [
            state.corp.deck[j]!,
            state.corp.deck[i]!,
          ];
        }
      };
      if (!found) {
        // Printed: shuffle R&D after revealing (CR 1.2.1).
        state.corp.deck.unshift(...revealed);
        shuffleRd();
        log(state, `Mutate — no ice revealed; shuffle R&D.`);
        return { ok: true };
      }
      const rest = revealed.filter((x) => x !== found);
      state.corp.deck.unshift(...rest);
      const server = state.servers[slot.serverId];
      server.ice.splice(slot.index, 0, found);
      state.cards[found]!.zone = `server:${slot.serverId}:ice`;
      state.cards[found]!.rezzed = true;
      state.cards[found]!.faceup = true;
      // Printed: shuffle R&D after install/rez (CR 1.2.1).
      shuffleRd();
      log(
        state,
        `Mutate — install and rez ${state.cards[found]!.title} in trashed ice's position; shuffle R&D.`,
      );
      state.turn.mutateTrashedIce = undefined;
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
    case "install_instead": {
      if (state.run) state.run.skipBreach = true;
      removeCardFromCurrentZone(state, sourceId);
      state.runner.installed.push(sourceId);
      state.cards[sourceId]!.zone = "runner:installed";
      log(state, `Eden Shard — installed from grip instead of breaching R&D.`);
      return { ok: true };
    }
    default:
      return null;
  }
}
