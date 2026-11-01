/** Upstalk (up) Lunar pack primitives. */
import { occurCheckpoint } from "../../legality/checkpoints.js";
import { emptyRunnerCreditPool } from "../../state/costs.js";
import { log } from "../../state/createGame.js";
import {
  addLingeringEffect,
  LINGERING_KIND_RUNNER_MU,
} from "../../state/lingeringEffects.js";
import { autoResolveTrace } from "../../state/trace.js";
import { removeCardFromCurrentZone } from "../../state/scoring.js";
import { moveRunnerCardToHeap } from "../../state/trashHooks.js";
import type { GameState, RuleCite, ServerId } from "../../state/types.js";
import { CR } from "../../timing/labels.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/pendingChoice.js";


type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function runnerHardwareIds(state: EffectCtx["state"]): string[] {
  return state.runner.installed.filter((id) => state.cards[id]?.type === "hardware");
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
  openPendingChoose(state, {
    sourceId,
    chooser: "corp",
    options: hw.map((id) => ({
      id: `trash-hw:${id}`,
      label: `Trash ${state.cards[id]!.title}`,
      effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
    })),
  });
  return { ok: true };
}

/** Ask the Corp where the next granted subroutine goes (CR 9.8.2c). */
export function offerSubroutineInsertChoice(state: GameState): void {
  const run = state.run;
  const next = run?.pendingSubroutineInserts?.[0];
  const iceId = run?.encounter?.iceId;
  const ice = iceId ? state.cards[iceId] : undefined;
  if (!run || !next || !ice) {
    if (run) run.pendingSubroutineInserts = undefined;
    return;
  }
  const subs = ice.subroutines ?? [];
  openPendingChoose(state, {
    sourceId: ice.id,
    chooser: "corp",
    options: Array.from({ length: subs.length + 1 }, (_, index) => {
      const place =
        index === 0
          ? "before the other subroutines"
          : index === subs.length
            ? "after the other subroutines"
            : `after "${subs[index - 1]!.text}"`;
      return {
        id: `grail-at:${index}`,
        label: `Place "${next.text}" ${place}`,
        effect: fx.do({
          kind: "gain_credits",
          side: "corp",
          amount: 0,
        }),
      };
    }),
  });
  log(
    state,
    `${ice.title} — choose where "${next.text}" is placed (CR ${CR.subroutineOrderChoice.number}).`,
  );
}

/** Insert the next granted subroutine at the chosen index (CR 9.8.2c). */
export function chooseSubroutinePosition(
  state: GameState,
  index: number,
): void {
  const run = state.run;
  const queue = run?.pendingSubroutineInserts ?? [];
  const sub = queue[0];
  const iceId = run?.encounter?.iceId;
  const ice = iceId ? state.cards[iceId] : undefined;
  if (!run?.encounter || !sub || !ice) {
    if (run) run.pendingSubroutineInserts = undefined;
    return;
  }
  const subs = [...(ice.subroutines ?? [])];
  const at = Math.max(0, Math.min(index, subs.length));
  subs.splice(at, 0, sub);
  ice.subroutines = subs;
  const broken = [...run.encounter.broken];
  broken.splice(at, 0, false);
  run.encounter.broken = broken;
  const rest = queue.slice(1);
  run.pendingSubroutineInserts = rest.length > 0 ? rest : undefined;
  log(
    state,
    `${ice.title} gains "${sub.text}" at position ${at + 1} (CR ${CR.subroutineOrderChoice.number}).`,
  );
  if (rest.length > 0) offerSubroutineInsertChoice(state);
}

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
        return { ok: false, error: "No rezzed ice to trash for Mutate.", cites: [] };
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
      removeCardFromCurrentZone(state, iceId);
      state.servers[serverId].ice = state.servers[serverId].ice.filter(
        (x) => x !== iceId,
      );
      state.cards[iceId]!.rezzed = false;
      state.cards[iceId]!.zone = "corp:archives";
      state.corp.discardPile.push(iceId);
      log(state, `Mutate — trashed ${state.cards[iceId]!.title} as additional cost.`);
      return { ok: true };
    }
    case "resolve_mutate_operation": {
      const slot = state.turn.mutateTrashedIce;
      if (!slot) {
        return { ok: false, error: "Mutate additional cost not paid.", cites: [] };
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
      const shuffleRd = () => {
        for (const id of state.corp.deck) {
          state.cards[id]!.faceup = false;
        }
        for (let i = state.corp.deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
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
      const r = autoResolveTrace(
        state,
        sourceId,
        2,
        fx.do({ kind: "trace_taurus_success" }),
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "trace_taurus_success": {
      trashRunnerHardwareChoose(ctx, "Taurus");
      if ((state.turn.lastResolvedTraceStrength ?? 0) >= 5) {
        trashRunnerHardwareChoose(ctx, "Taurus (strength ≥5)");
      }
      return { ok: true };
    }
    case "reveal_grail_gain_subroutines": {
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
      log(
        state,
        `Grail — ${ice.title} gains subroutines from ${pick.map((id) => state.cards[id]!.title).join(", ")}.`,
      );
      if (extra.length === 0) return { ok: true };
      state.run.pendingSubroutineInserts = extra;
      offerSubroutineInsertChoice(state);
      return { ok: true };
    }
    case "runner_mu_modifier_until_turn_end": {
      const delta = (action as { delta: number }).delta;
      addLingeringEffect(state, {
        createdBy: sourceId,
        duration: { kind: "turn", side: "runner" },
        kind: LINGERING_KIND_RUNNER_MU,
        payload: { delta },
      });
      log(
        state,
        `Runner memory limit ${delta >= 0 ? "+" : ""}${delta} until turn end (CR ${CR.lingeringEffect.number}).`,
      );
      occurCheckpoint(
        state,
        "instruction",
        "Memory limit changed",
        [CR.checkpointCardRestrictions],
        sourceId,
      );
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
    case "corp_rez": {
      const iceId = (action as { iceId: string }).iceId;
      const card = state.cards[iceId]!;
      const cost = card.rezCost ?? 0;
      if (state.corp.credits < cost) {
        log(state, `Cyber Threat — Corp cannot pay ${cost}¢ to rez ${card.title}.`);
        return { ok: true };
      }
      state.corp.credits -= cost;
      card.rezzed = true;
      log(state, `Cyber Threat — Corp rezzed ${card.title} for ${cost}¢.`);
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
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: unrezzed.map((id) => ({
          id: `soc:${id}`,
          label: `Choose ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "social_engineering_mark", iceId: id }),
        })),
      });
      return { ok: true };
    }
    case "social_engineering_mark": {
      const iceId = (action as { iceId: string }).iceId;
      state.turn.socialEngineeringMarkedIce = iceId;
      log(state, `Social Engineering — marked ${state.cards[iceId]!.title}.`);
      return { ok: true };
    }
    case "may_breach_instead_eden_shard": {
      if (!state.run || state.run.attackedServerId !== "rd") return { ok: true };
      const inGrip = state.runner.hand.includes(sourceId);
      if (!inGrip) {
        log(state, `Eden Shard — not in grip; breach R&D.`);
        return { ok: true };
      }
      if (!openPendingChoose(state, {
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
            effect: fx.do({ kind: "install_instead" }),
          },
        ],
      })) return { ok: true };
      state.run.skipBreach = true;
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
