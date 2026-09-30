/** Upstalk (up) Lunar pack primitives. */
import { log } from "../state/createGame.js";
import { autoResolveTrace } from "../state/trace.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function runnerHardwareIds(state: EffectCtx["state"]): string[] {
  return state.runner.rig.filter((id) => state.cards[id]?.type === "hardware");
}

function trashRunnerHardwareChoose(
  ctx: EffectCtx,
  label: string,
): PrimResult {
  const { state, sourceId } = ctx;
  const hw = runnerHardwareIds(state);
  if (hw.length === 0) {
    log(state, `${label} — no Runner hardware to trash.`);
    return { ok: true };
  }
  if (hw.length === 1) {
    moveRunnerCardToHeap(state, hw[0]!);
    log(state, `${label} — trash ${state.cards[hw[0]!]!.title}.`);
    return { ok: true };
  }
  state.pendingChoice = {
    sourceId,
    chooser: "corp",
    options: hw.map((id) => ({
      id: `trash-hw:${id}`,
      label: `Trash ${state.cards[id]!.title}`,
      effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
    })),
  };
  return { ok: true };
}

export function applyLunarUpPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "mutate_trash_rezzed_ice_additional_cost": {
      const rezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (c?.rezzed) rezzed.push(id);
        }
      }
      if (rezzed.length === 0) {
        return { ok: false, error: "No rezzed ice to trash for Mutate.", cites: [] };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: rezzed.map((id) => ({
          id: `mutate-trash:${id}`,
          label: `Trash ${state.cards[id]!.title} (additional cost)`,
          effect: fx.do({ kind: "mutate_record_trashed_ice", iceId: id }),
        })),
      };
      return { ok: true };
    }
    case "mutate_record_trashed_ice": {
      const iceId = (action as { iceId: string }).iceId;
      const serverId = Object.entries(state.servers).find(([, s]) =>
        s.ice.includes(iceId),
      )?.[0] as ServerId;
      const index = state.servers[serverId].ice.indexOf(iceId);
      state.turn.mutateTrashedIce = { iceId, serverId, index };
      removeCardFromCurrentZone(state, iceId);
      state.servers[serverId].ice = state.servers[serverId].ice.filter(
        (x) => x !== iceId,
      );
      state.cards[iceId]!.rezzed = false;
      state.cards[iceId]!.zone = "corp:archives";
      state.corp.discard.push(iceId);
      log(state, `Mutate — trashed ${state.cards[iceId]!.title} as additional cost.`);
      return { ok: true };
    }
    case "mutate_operation_resolve": {
      const slot = state.turn.mutateTrashedIce;
      if (!slot) {
        return { ok: false, error: "Mutate additional cost not paid.", cites: [] };
      }
      const revealed: string[] = [];
      let found: string | null = null;
      while (state.corp.deck.length > 0) {
        const id = state.corp.deck.pop()!;
        revealed.push(id);
        state.cards[id]!.faceup = true;
        if (state.cards[id]!.type === "ice") {
          found = id;
          break;
        }
      }
      if (!found) {
        for (const id of revealed) state.corp.deck.unshift(id);
        log(state, `Mutate — no ice revealed; shuffle R&D.`);
        return { ok: true };
      }
      const rest = revealed.filter((x) => x !== found);
      for (const id of rest) state.corp.deck.unshift(id);
      const server = state.servers[slot.serverId];
      server.ice.splice(slot.index, 0, found);
      state.cards[found]!.zone = `server:${slot.serverId}:ice`;
      state.cards[found]!.rezzed = true;
      log(
        state,
        `Mutate — install and rez ${state.cards[found]!.title} in trashed ice's position.`,
      );
      state.turn.mutateTrashedIce = undefined;
      return { ok: true };
    }
    case "taurus_trace_subroutine": {
      return autoResolveTrace(
        state,
        sourceId,
        2,
        fx.do({ kind: "taurus_trace_success" }),
      );
    }
    case "taurus_trace_success": {
      trashRunnerHardwareChoose(ctx, "Taurus");
      if ((state.turn.lastResolvedTraceStrength ?? 0) >= 5) {
        trashRunnerHardwareChoose(ctx, "Taurus (strength ≥5)");
      }
      return { ok: true };
    }
    case "grail_reveal_gain_subroutines": {
      const max = (action as { maxReveal?: number }).maxReveal ?? 2;
      const hq = state.corp.hand.filter(
        (id) =>
          (state.cards[id]?.subtypes ?? []).some((s) =>
            s.toLowerCase().includes("grail"),
          ) && state.cards[id]?.type === "ice",
      );
      if (hq.length === 0 || !state.run?.encounter) {
        log(state, `Grail reveal — no grail ice in HQ to reveal.`);
        return { ok: true };
      }
      const pick = hq.slice(0, max);
      for (const id of pick) state.cards[id]!.faceup = true;
      const ice = state.cards[state.run.encounter.iceId];
      if (!ice) return { ok: true };
      const extra = pick.flatMap((id) => {
        const def = state.cards[id]!;
        return (def.subroutines ?? []).map((sub, i) => ({
          id: `${ice.defId}-grail-${id}-${i}`,
          text: sub.text,
          effect: structuredClone(sub.effect!),
        }));
      });
      ice.subroutines = [...(ice.subroutines ?? []), ...extra];
      state.run.encounter.broken.push(...extra.map(() => false));
      log(
        state,
        `Grail — ${ice.title} gains subroutines from ${pick.map((id) => state.cards[id]!.title).join(", ")}.`,
      );
      return { ok: true };
    }
    case "runner_mu_modifier_until_turn_end": {
      const delta = (action as { delta: number }).delta;
      state.turn.runnerMuModifierUntilTurnEnd =
        (state.turn.runnerMuModifierUntilTurnEnd ?? 0) + delta;
      log(state, `Runner memory limit ${delta >= 0 ? "+" : ""}${delta} until turn end.`);
      return { ok: true };
    }
    case "cyber_threat": {
      const servers = Object.keys(state.servers).filter((s) => s !== "hq") as ServerId[];
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: servers.map((sid) => ({
          id: `cyber:${sid}`,
          label: `Cyber Threat — ${sid}`,
          effect: fx.do({ kind: "cyber_threat_server", serverId: sid }),
        })),
      };
      return { ok: true };
    }
    case "cyber_threat_server": {
      const serverId = (action as { serverId: ServerId }).serverId;
      state.turn.cyberThreatServer = serverId;
      const ice = state.servers[serverId].ice.filter((id) => !state.cards[id]?.rezzed);
      if (ice.length === 0) {
        state.runner.credits += 2;
        log(state, `Cyber Threat — no unrezzed ice; Runner gains 2¢.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...ice.map((id) => ({
            id: `rez:${id}`,
            label: `Rez ${state.cards[id]!.title}`,
            effect: fx.do({ kind: "cyber_threat_corp_rez", iceId: id }),
          })),
          {
            id: "decline",
            label: "Do not rez — Runner gains 2¢ and runs",
            effect: fx.do({ kind: "cyber_threat_runner_reward" }),
          },
        ],
      };
      return { ok: true };
    }
    case "cyber_threat_corp_rez": {
      const iceId = (action as { iceId: string }).iceId;
      state.cards[iceId]!.rezzed = true;
      log(state, `Cyber Threat — Corp rezzed ${state.cards[iceId]!.title}.`);
      return { ok: true };
    }
    case "cyber_threat_runner_reward": {
      state.runner.credits += 2;
      log(state, `Cyber Threat — Runner gains 2¢.`);
      return { ok: true };
    }
    case "nasir_lose_all_credits": {
      state.runner.credits = 0;
      log(state, `Nasir Meidan — Runner loses all credits in pool.`);
      return { ok: true };
    }
    case "social_engineering": {
      const unrezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (!state.cards[id]?.rezzed) unrezzed.push(id);
        }
      }
      if (unrezzed.length === 0) {
        log(state, `Social Engineering — no unrezzed ice.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: unrezzed.map((id) => ({
          id: `soc:${id}`,
          label: `Choose ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "social_engineering_mark", iceId: id }),
        })),
      };
      return { ok: true };
    }
    case "social_engineering_mark": {
      const iceId = (action as { iceId: string }).iceId;
      state.turn.socialEngineeringMarkedIce = iceId;
      log(state, `Social Engineering — marked ${state.cards[iceId]!.title}.`);
      return { ok: true };
    }
    case "eden_shard_may_instead_of_breach": {
      if (!state.run || state.run.attackedServerId !== "rd") return { ok: true };
      const inGrip = state.runner.hand.includes(sourceId);
      if (!inGrip) {
        log(state, `Eden Shard — not in grip; breach R&D.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "breach",
            label: "Breach R&D",
            effect: fx.gainCredits("runner", 0),
          },
          {
            id: "eden",
            label: "Install Eden Shard from grip ignoring all costs",
            effect: fx.do({ kind: "eden_shard_install_instead" }),
          },
        ],
      };
      state.run.skipBreach = true;
      return { ok: true };
    }
    case "eden_shard_install_instead": {
      if (state.run) state.run.skipBreach = true;
      removeCardFromCurrentZone(state, sourceId);
      state.runner.rig.push(sourceId);
      state.cards[sourceId]!.zone = "runner:rig";
      log(state, `Eden Shard — installed from grip instead of breaching R&D.`);
      return { ok: true };
    }
    default:
      return null;
  }
}
