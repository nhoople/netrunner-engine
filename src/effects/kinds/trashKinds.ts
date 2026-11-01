/**
 * Primitive kinds whose procedure is trash.
 * The effect switch in eval.ts dispatches here.
 */
import type {
  EffectCtx,
  EvalResult,
} from "../eval.js";
import type {
  Effect,
  Primitive,
} from "../ir.js";
import { abilitiesSuppressed } from "../../state/abilities.js";
import { log } from "../../state/createGame.js";
import { dealDamage } from "../../state/damage.js";
import { trashCorpCardFacedownToArchives } from "../../state/msKeywords.js";
import {
  cancelPendingIfSourceInactive,
  closeReactionWindow,
  completePendingAbility,
  createPendingAbilityInstance,
  findPendingAbility,
  markPendingAbilityResolving,
  openReactionWindow,
  pruneSettledPendingAbilities,
} from "../../state/pendingAbilities.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import { pickRandomSubset } from "../../state/rng.js";
import { removeCardFromCurrentZone } from "../../state/scoring.js";
import {
  moveRunnerCardToHeap,
  noteCorpCardAddedToArchives,
  releaseHostedCardsOnTrash,
} from "../../state/trashHooks.js";
import { CR } from "../../timing/labels.js";
import {
  trashCorpCardToArchives,
  trashToHeap,
} from "../corpTrash.js";
import { drawCards } from "../draw.js";
import {
  maybeFireNuvemFirstRdTrash,
  serverHostingCard,
  offerCultivateHqChoice,
  trashInstalledLegalTargets,
  pendingTrashAmong,
  trashingKeepsScoreRestriction,
  evalEffect,
  applyPrimitive,
} from "../eval.js";
import { iceStrength } from "../iceStrength.js";
import { fx } from "../ir.js";
import {
  canInstallHeapCard,
  gripInstallCostAfterDiscount,
} from "../runnerInstall.js";

import {
  fireHostRezStateTriggers,
} from "../eval.js";

export function applyTrashKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "trash_program": {
      const encIce = state.run?.encounter?.iceId;
      if (
        encIce === sourceId &&
        source.maxInstalledRunnerTrashesPerEncounter &&
        (state.run!.encounter!.installedRunnerTrashesThisEncounter ?? 0) >=
          source.maxInstalledRunnerTrashesPerEncounter
      ) {
        log(
          state,
          `${source.title} — already trashed max installed Runner cards this encounter.`,
        );
        return { ok: true };
      }
      let programs = state.runner.installed.filter(
        (id) => state.cards[id].type === "program",
      );
      if (action.aiOnly) {
        programs = programs.filter((id) => {
          const c = state.cards[id];
          return (
            (c.subtypes ?? []).includes("ai") ||
            c.breaker?.breaksSubtype === "*"
          );
        });
      }
      if (action.excludeSubtypes?.length) {
        programs = programs.filter((id) => {
          const subs = state.cards[id].subtypes ?? [];
          return !action.excludeSubtypes!.some((s) => subs.includes(s));
        });
      }
      if (action.includeSubtypes?.length) {
        programs = programs.filter((id) => {
          const subs = state.cards[id].subtypes ?? [];
          return action.includeSubtypes!.some((s) => subs.includes(s));
        });
      }
      if (programs.length === 0) {
        log(
          state,
          `Trash program — no installed ${action.aiOnly ? "AI " : ""}program (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && programs.length > 1) {
        const runnerTrashes = (source.subroutines ?? []).some((sub) =>
          /runner trashes/i.test(sub.text ?? ""),
        );
        const chooser = runnerTrashes ? "runner" : "corp";
        state.pendingTrashProgram = {
          sourceId,
          candidates: [...programs],
          chooser,
        };
        log(
          state,
          `Trash program — ${chooser === "runner" ? "Runner" : "Corp"} chooses among ${programs.length} (CR ${CR.controllerChoices.number}).`,
        );
        return { ok: true };
      }
      const progId = programs[0]!;
      const title = state.cards[progId].title;
      trashToHeap(state, progId);
      if (state.pendingTrashPrevent) {
        log(
          state,
          `Pending trash of installed program ${title} — interrupt PAW.`,
        );
        return { ok: true };
      }
      log(
        state,
        `Trash installed program ${title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

case "trash_installed_resources_with_any_subtype": {
      const want = new Set(action.subtypes.map((s) => s.toLowerCase()));
      const targets = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "resource") return false;
        return (c.subtypes ?? []).some((s) => want.has(s.toLowerCase()));
      });
      if (targets.length === 0) {
        log(
          state,
          `Trash connection/job resources — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      for (const id of [...targets]) {
        const title = state.cards[id]!.title;
        trashToHeap(state, id);
        log(
          state,
          `Trash installed resource ${title} (CR ${CR.trashing.number}).`,
        );
      }
      return { ok: true };
    }

case "trash_installed_resource_with_subtype": {
      const want = action.subtype.toLowerCase();
      const targets = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "resource") return false;
        return (c.subtypes ?? []).some((s) => s.toLowerCase() === want);
      });
      if (targets.length === 0) {
        log(
          state,
          `Trash ${action.subtype} resource — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && targets.length > 1) {
        state.pendingTrashProgram = {
          sourceId,
          candidates: [...targets],
        };
        log(
          state,
          `Trash ${action.subtype} resource — Corp must choose among ${targets.length} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const resId = targets[0]!;
      const title = state.cards[resId]!.title;
      trashToHeap(state, resId);
      log(
        state,
        `Trash installed ${action.subtype} resource ${title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

case "trash_ice_rezzed_this_run": {
      const ids = state.run?.iceRezzedThisRunIds ?? [];
      const targets = ids.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "ice") return false;
        // Still installed protecting a server.
        for (const server of Object.values(state.servers)) {
          if (server.ice.includes(id)) return true;
        }
        return false;
      });
      if (targets.length === 0) {
        log(
          state,
          `Trash ice rezzed this run — none available (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && targets.length > 1) {
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: targets.map((id) => ({
            id: `trash-ice-rezzed:${id}`,
            label: `Trash ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: { kind: "trash_corp_card" as const, cardId: id },
            },
          })),
logLine: `Trash ice rezzed this run — Runner chooses among ${targets.length}.`,
});
        return { ok: true };
      }
      const iceId = targets[0]!;
      const title = state.cards[iceId]!.title;
      const r = applyPrimitive(ctx, {
        kind: "trash_corp_card",
        cardId: iceId,
      });
      if (!r.ok) return r;
      log(state, `Trash ice ${title} rezzed this run (CR ${CR.trashing.number}).`);
      return { ok: true };
    }

case "trash_resource": {
      const encIce = state.run?.encounter?.iceId;
      if (
        encIce === sourceId &&
        source.maxInstalledRunnerTrashesPerEncounter &&
        (state.run!.encounter!.installedRunnerTrashesThisEncounter ?? 0) >=
          source.maxInstalledRunnerTrashesPerEncounter
      ) {
        log(
          state,
          `${source.title} — already trashed max installed Runner cards this encounter.`,
        );
        return { ok: true };
      }
      const resources = state.runner.installed.filter(
        (id) => state.cards[id].type === "resource",
      );
      if (resources.length === 0) {
        log(
          state,
          `Trash resource — no installed resource (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && resources.length > 1) {
        state.pendingTrashProgram = {
          sourceId,
          candidates: [...resources],
        };
        log(
          state,
          `Trash resource — Corp must choose among ${resources.length} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const resId = resources[0]!;
      const title = state.cards[resId].title;
      if (action.cannotPrevent) {
        trashToHeap(state, resId);
      } else {
        trashToHeap(state, resId);
      }
      log(
        state,
        `Trash installed resource ${title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

case "trash_own_resource": {
      const resources = state.runner.installed.filter(
        (id) => state.cards[id].type === "resource",
      );
      if (resources.length === 0) {
        return {
          ok: false,
          error: "Must trash an installed resource — none available.",
          cites: [CR.trashing],
        };
      }
      if (resources.length === 1) {
        const resId = resources[0]!;
        const title = state.cards[resId].title;
        trashToHeap(state, resId);
        log(
          state,
          `Trash own resource ${title} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: resources.map((id) => ({
          id: `trash-own:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "trash_runner_rig_card" as const, cardId: id },
          },
        })),
logLine: `${source.title} — Runner must trash an installed resource (CR ${CR.trashing.number}).`,
});
      return { ok: true };
    }

case "trash_own_program": {
      const programs = state.runner.installed.filter(
        (id) => state.cards[id].type === "program",
      );
      if (programs.length === 0) {
        return {
          ok: false,
          error: "Must trash an installed program — none available.",
          cites: [CR.trashing],
        };
      }
      if (programs.length === 1) {
        const progId = programs[0]!;
        const title = state.cards[progId].title;
        const cost = state.cards[progId].installCost;
        trashToHeap(state, progId);
        state.turn.lastTrashedOwnProgramInstallCost = cost;
        log(
          state,
          `Trash own program ${title} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `trash-own-program:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "trash_runner_rig_card_record_program_cost" as const,
              cardId: id,
            },
          },
        })),
logLine: `${source.title} — Runner must trash an installed program (CR ${CR.trashing.number}).`,
});
      return { ok: true };
    }

case "trash_data_hound_looked": {
      const looked = state.turn.rdLookedCards ?? [];
      const idx = looked.indexOf(action.cardId);
      if (idx < 0) {
        log(state, `Data Hound trash — card not in look zone.`);
        return { ok: true };
      }
      looked.splice(idx, 1);
      trashToHeap(state, action.cardId);
      log(
        state,
        `Trash ${state.cards[action.cardId]!.title} from stack look.`,
      );
      state.turn.rdLookedCards = looked;
      if (looked.length === 0) {
        return { ok: true };
      }
      // Arrange remaining in any order on top of stack (Corp chooses order).
      // Simple path: present permutation via sequential top-placement.
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "arrange-as-is",
            label: "Arrange remaining (current order on top)",
            effect: {
              op: "do" as const,
              action: {
                kind: "arrange_looked" as const,
                order: [...looked],
              },
            },
          },
          ...looked.map((id) => ({
            id: `arrange-first:${id}`,
            label: `Put ${state.cards[id]!.title} on top first`,
            effect: {
              op: "do" as const,
              action: {
                kind: "arrange_looked" as const,
                order: [id, ...looked.filter((x) => x !== id)],
              },
            },
          })),
        ],
logLine: `${source.title} — arrange remaining looked cards.`,
});
      return { ok: true };
    }

case "corp_trash_ice_protecting_server": {
      const sid = action.serverId as import("../../state/types.js").ServerId;
      const ice = [...(state.servers[sid]?.ice ?? [])];
      if (ice.length === 0) {
        log(state, `${source.title} — no ice protecting ${action.serverId}.`);
        return { ok: true };
      }
      if (ice.length === 1) {
        return applyPrimitive(ctx, {
          kind: "corp_trash_ice_card",
          cardId: ice[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: ice.map((id) => ({
          id: `kraken-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "corp_trash_ice_card" as const, cardId: id },
          },
        })),
logLine: `${source.title} — Corp trashes 1 ice protecting ${action.serverId}.`,
});
      return { ok: true };
    }

case "corp_trash_ice_card": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "ice") {
        log(state, `Corp trash ice — invalid target.`);
        return { ok: true };
      }
      const r = applyPrimitive(ctx, {
        kind: "trash_corp_card",
        cardId: action.cardId,
      });
      if (!r.ok) return r;
      log(state, `Corp trashes ice ${card.title}.`);
      return { ok: true };
    }

case "trash_virtual_resource_or_link_card": {
      const targets = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        if (!c) return false;
        const subs = (c.subtypes ?? []).map((s) => s.toLowerCase());
        if (c.type === "resource" && subs.includes("virtual")) return true;
        if (subs.includes("link")) return true;
        return false;
      });
      if (targets.length === 0) {
        log(
          state,
          `Trash virtual resource or link — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && targets.length > 1) {
        state.pendingTrashProgram = {
          sourceId,
          candidates: [...targets],
        };
        log(
          state,
          `Trash virtual/link — Corp must choose among ${targets.length} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const id = targets[0]!;
      const title = state.cards[id]!.title;
      trashToHeap(state, id);
      log(
        state,
        `Trash ${title} (virtual resource or link) (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

case "trash_hq": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Trash from HQ — HQ empty (CR ${CR.trashing.number}).`);
        return { ok: true };
      }
      const amount = Math.max(1, action.amount ?? 1);
      if (action.pick === "random") {
        const n = Math.min(amount, hq.length);
        // Deterministic "random": trash from the end of HQ.
        const picks = hq.slice(hq.length - n);
        for (const id of picks) {
          trashCorpCardToArchives(state, id, "corp");
          log(
            state,
            `Trash ${state.cards[id].title} from HQ at random (CR ${CR.trashing.number}).`,
          );
        }
        if (action.then) {
          return evalEffect(ctx, action.then);
        }
        return { ok: true };
      }
      if (action.pick === "choose" && hq.length > 1) {
        // Multi-card HQ choose leaves pending; `then` deferred until host
        // resolves the trash (Anemone uses pick:"first" for auto).
        state.pendingTrashProgram = { sourceId, candidates: hq };
        log(
          state,
          `Trash from HQ — Corp must choose among ${hq.length} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const n = Math.min(amount, hq.length);
      const picks = hq.slice(hq.length - n);
      for (const id of picks) {
        trashCorpCardToArchives(state, id, "corp");
        log(
          state,
          `Trash ${state.cards[id].title} from HQ (CR ${CR.trashing.number}).`,
        );
      }
      if (action.then) {
        return evalEffect(ctx, action.then);
      }
      return { ok: true };
    }

case "trash_hq_card": {
      if (!state.corp.hand.includes(action.cardId)) {
        log(state, `Trash HQ card — not in HQ.`);
        return { ok: true };
      }
      const title = state.cards[action.cardId]!.title;
      trashCorpCardToArchives(state, action.cardId);
      log(
        state,
        `Trash ${title} from HQ (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

case "trash_hardware": {
      const encIce = state.run?.encounter?.iceId;
      if (
        encIce === sourceId &&
        source.maxInstalledRunnerTrashesPerEncounter &&
        (state.run!.encounter!.installedRunnerTrashesThisEncounter ?? 0) >=
          source.maxInstalledRunnerTrashesPerEncounter
      ) {
        log(
          state,
          `${source.title} — already trashed max installed Runner cards this encounter.`,
        );
        return { ok: true };
      }
      const hw = state.runner.installed.filter(
        (id) => state.cards[id].type === "hardware",
      );
      if (action.pick === "choose") {
        return pendingTrashAmong(state, sourceId, hw, "hardware");
      }
      if (hw.length === 0) {
        log(state, `Trash hardware — none installed (CR ${CR.trashing.number}).`);
        return { ok: true };
      }
      const id = hw[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed hardware ${state.cards[id].title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

case "trash_hardware_install_cost_lte_last_trace_excess": {
      const maxCost = state.turn.lastTraceExcess;
      if (maxCost === null || maxCost === undefined) {
        log(
          state,
          `${source.title} — no last trace excess; cannot trash hardware.`,
        );
        return { ok: true };
      }
      const hw = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "hardware" && (c.installCost ?? 0) <= maxCost
        );
      });
      if (hw.length === 0) {
        log(
          state,
          `Trash hardware ≤${maxCost} install — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" || hw.length > 1) {
        return pendingTrashAmong(
          state,
          sourceId,
          hw,
          `hardware (install ≤${maxCost})`,
        );
      }
      const id = hw[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed hardware ${state.cards[id].title} (install ≤${maxCost}) (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

case "trash_up_to_n_resources": {
      const remaining =
        typeof action.remaining === "number" ? action.remaining : action.n;
      if (remaining <= 0) return { ok: true };
      const resources = state.runner.installed.filter(
        (id) => state.cards[id]?.type === "resource",
      );
      if (resources.length === 0) {
        log(
          state,
          `Trash up to ${remaining} resources — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        resources.map((id) => ({
          id: `trash-res-up:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "trash_runner_rig_card" as const,
                  cardId: id,
                },
              },
              {
                op: "do" as const,
                action: {
                  kind: "trash_up_to_n_resources" as const,
                  n: action.n,
                  remaining: remaining - 1,
                },
              },
            ],
          },
        }));
      options.push({
        id: "decline",
        label: "Decline further trashes",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — may trash up to ${remaining} more resource(s).`,
});
      return { ok: true };
    }

case "trash_program_or_hardware": {
      const cands = state.runner.installed.filter((id) => {
        const t = state.cards[id].type;
        return t === "program" || t === "hardware";
      });
      if (action.pick === "choose" || cands.length > 1) {
        return pendingTrashAmong(
          state,
          sourceId,
          cands,
          "program or hardware",
        );
      }
      if (cands.length === 0) {
        log(
          state,
          `Trash program/hardware — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const id = cands[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed ${state.cards[id].title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

case "trash_resource_or_hardware": {
      const cands = state.runner.installed.filter((id) => {
        const typ = state.cards[id].type;
        return typ === "resource" || typ === "hardware";
      });
      if (action.pick === "choose" || cands.length > 1) {
        return pendingTrashAmong(
          state,
          sourceId,
          cands,
          "resource or hardware",
        );
      }
      if (cands.length === 0) {
        log(
          state,
          `Trash resource/hardware — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const id = cands[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed ${state.cards[id].title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

case "trash_n_programs_remaining": {
      const remaining = Math.max(0, action.remaining ?? 0);
      if (remaining <= 0) return { ok: true };
      const programs = state.runner.installed.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(
          state,
          `Trash programs — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (programs.length === 1) {
        const pick = programs[0]!;
        const title = state.cards[pick]!.title;
        trashToHeap(state, pick);
        log(
          state,
          `Trash installed program ${title} (CR ${CR.trashing.number}).`,
        );
        if (remaining > 1) {
          return applyPrimitive(ctx, {
            kind: "trash_n_programs_remaining",
            remaining: remaining - 1,
          });
        }
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: programs.map((id) => ({
          id: `trash-prog:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "trash_runner_rig_card" as const,
                  cardId: id,
                },
              },
              {
                op: "do" as const,
                action: {
                  kind: "trash_n_programs_remaining" as const,
                  remaining: remaining - 1,
                },
              },
            ],
          },
        })),
logLine: `Trash programs — choose among ${programs.length} (${remaining} remaining; CR ${CR.trashing.number}).`,
});
      return { ok: true };
    }

case "trash_any_rezzed_give_tags": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (!c || c.side !== "corp" || !c.rezzed) continue;
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(
          state,
          `Trash any rezzed — no rezzed Corp cards (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => {
          const title = state.cards[id]!.title;
          return {
            id: `trash-tag:${id}`,
            label: `Trash ${title} (give 1 tag)`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: { kind: "trash_corp_card" as const, cardId: id },
                },
                {
                  op: "do" as const,
                  action: { kind: "give_tags" as const, amount: 1 },
                },
                {
                  op: "do" as const,
                  action: { kind: "trash_any_rezzed_give_tags" as const },
                },
              ],
            },
          };
        });
      options.push({
        id: "done",
        label: "Done",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
logLine: `${source.title} — trash any number of rezzed cards, 1 tag each (CR ${CR.trashing.number}, ${CR.tags.number}).`,
});
      return { ok: true };
    }

case "trash_any_number_from_hq": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `${source.title} — trash any from HQ: HQ empty.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        hq.map((id) => {
          const title = state.cards[id]!.title;
          return {
            id: `trash-hq:${id}`,
            label: `Trash ${title}`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: { kind: "trash_hq_card" as const, cardId: id },
                },
                {
                  op: "do" as const,
                  action: { kind: "trash_any_number_from_hq" as const },
                },
              ],
            },
          };
        });
      options.push({
        id: "done",
        label: "Done",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — trash any number of cards from HQ (CR ${CR.trashing.number}).`,
});
      return { ok: true };
    }

case "trash_then_corp_rez_or_hq": {
      const iceId =
        state.run?.lastPassedUnrezzedIceId ??
        state.turn.currentRunPassedUnrezzedIceIds?.at(-1);
      if (!iceId) {
        log(state, `False Echo — no passed ice.`);
        return { ok: true };
      }
      trashToHeap(state, sourceId);
      const ice = state.cards[iceId];
      if (!ice || ice.type !== "ice") return { ok: true };
      const cost = ice.rezCost ?? 0;
      const agendaId = state.corp.scoreArea.find(
        (id) => !state.cards[id]?.cannotForfeit,
      );
      const canRez =
        state.corp.credits >= cost &&
        (!ice.rezAdditionalCostForfeitAgenda || Boolean(agendaId));
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (canRez) {
        options.push({
          id: "rez",
          label: ice.rezAdditionalCostForfeitAgenda
            ? `Pay ${cost}¢ and forfeit an agenda to rez ${ice.title}`
            : `Rez ${ice.title}`,
          effect: {
            op: "do",
            action: { kind: "rez_ice_by_id", iceId },
          },
        });
      }
      options.push({
        id: "hq",
        label: `Add ${ice.title} to HQ`,
        effect: {
          op: "do",
          action: { kind: "move_unrezzed_ice_to_hq", iceId },
        },
      });
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `False Echo — Corp must rez ${ice.title} by paying its costs, or add it to HQ (CR ${CR.mustNotForceAdditionalCost.number}).`,
});
      return { ok: true };
    }

case "trash_project_ares_next": {
      const remaining = state.turn.projectAresTrashRemaining ?? 0;
      if (remaining <= 0) {
        if ((state.turn.projectAresTrashedCount ?? 0) > 0) {
          return applyPrimitive(ctx, { kind: "give_bad_publicity", amount: 1 });
        }
        return { ok: true };
      }
      const cands = [...state.runner.installed];
      if (cands.length === 0) {
        state.turn.projectAresTrashRemaining = 0;
        if ((state.turn.projectAresTrashedCount ?? 0) > 0) {
          return applyPrimitive(ctx, { kind: "give_bad_publicity", amount: 1 });
        }
        return { ok: true };
      }
      if (cands.length === 1) {
        const r1 = applyPrimitive(ctx, {
          kind: "trash_installed_runner_card",
          cardId: cands[0]!,
        });
        if (!r1.ok) return r1;
        return applyPrimitive(ctx, { kind: "trash_project_ares_next" });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((cardId) => ({
          id: `trash:${cardId}`,
          label: `Trash ${state.cards[cardId]!.title}`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "trash_installed_runner_card",
                  cardId,
                },
              },
              {
                op: "do" as const,
                action: { kind: "trash_project_ares_next" },
              },
            ],
          },
        })),
      });
      return { ok: true };
    }

case "trash_next": {
      const remaining = state.turn.invasionPrivacyTrashRemaining ?? 0;
      if (remaining <= 0) return { ok: true };
      const targets = state.runner.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "resource" || t === "event";
      });
      if (targets.length === 0) {
        state.turn.invasionPrivacyTrashRemaining = 0;
        return { ok: true };
      }
      const invasionOpts: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((cardId) => ({
          id: `trash:${cardId}`,
          label: `Trash ${state.cards[cardId]!.title}`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "trash_from_grip" as const,
                  cardId,
                },
              },
              {
                op: "do",
                action: { kind: "trash_next" as const },
              },
            ],
          },
        }));
      invasionOpts.push({
        id: "done",
        label: "Done",
        effect: {
          op: "do",
          action: { kind: "invasion_of_privacy_finish" as const },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: invasionOpts,
      });
      return { ok: true };
    }

case "trash_from_grip": {
      const cardId = action.cardId;
      if (!state.runner.hand.includes(cardId)) return { ok: true };
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      trashToHeap(state, cardId);
      // Invasion of Privacy's chain counts down via trash_next; other
      // callers (e.g. Snoop) trash directly without that loop.
      const rem = state.turn.invasionPrivacyTrashRemaining ?? 0;
      if (rem > 0) state.turn.invasionPrivacyTrashRemaining = rem - 1;
      return { ok: true };
    }

case "trash_installed_runner_card": {
      const cardId = action.cardId;
      if (!state.runner.installed.includes(cardId)) return { ok: true };
      trashToHeap(state, cardId);
      state.turn.projectAresTrashedCount =
        (state.turn.projectAresTrashedCount ?? 0) + 1;
      state.turn.projectAresTrashRemaining = Math.max(
        0,
        (state.turn.projectAresTrashRemaining ?? 1) - 1,
      );
      log(state, `Trash installed ${state.cards[cardId]!.title}.`);
      return { ok: true };
    }

case "trash_cultivate_looked": {
      const cardId = action.cardId;
      const idx = state.turn.rdLookedCards.indexOf(cardId);
      if (idx < 0) {
        log(state, `Cultivate trash — card not in look zone.`);
        return { ok: true };
      }
      state.turn.rdLookedCards.splice(idx, 1);
      trashCorpCardToArchives(state, cardId);
      log(state, `Cultivate — trash a looked card.`);
      if (state.turn.rdLookedCards.length === 0) {
        return { ok: true };
      }
      return offerCultivateHqChoice(state, sourceId);
    }

case "trash_self": {
      releaseHostedCardsOnTrash(state, sourceId);
      if (source.side === "corp") {
        trashCorpCardToArchives(state, sourceId, "corp");
        log(state, `${source.title} trashed (CR ${CR.trashing.number}).`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, sourceId);
      state.runner.discardPile.push(sourceId);
      source.zone = "runner:heap";
      source.faceup = true;
      log(state, `${source.title} trashed (CR ${CR.trashing.number}).`);
      return { ok: true };
    }

case "trash_self_and_derez_host": {
      const hostId = source.hostId;
      const trashed = applyPrimitive(ctx, { kind: "trash_self" });
      if (!trashed.ok) return trashed;
      if (!hostId) {
        log(state, `${source.title} — trashed; no host ice to derez.`);
        return { ok: true };
      }
      const host = state.cards[hostId];
      if (!host || host.type !== "ice" || !host.rezzed) {
        log(
          state,
          `${source.title} — trashed; ${host?.title ?? hostId} not rezzed ice.`,
        );
        return { ok: true };
      }
      host.rezzed = false;
      host.faceup = false;
      log(
        state,
        `${source.title} — trashed and derez ${host.title} (CR ${CR.derez.number}).`,
      );
      if (state.run) state.run.iceDerezzedThisRun = true;
      fireHostRezStateTriggers(state, hostId, "derez");
      return { ok: true };
    }

case "trash_attacked_server_root": {
      const sid = state.run?.attackedServerId;
      if (!sid) {
        log(state, `Trash attacked-server root — no run.`);
        return { ok: true };
      }
      const server = state.servers[sid];
      const rootIds = [...server.root];
      const infrastructure = rootIds.filter((id) => {
        const card = state.cards[id];
        return (
          Boolean(card?.rezzed) &&
          (card?.netDamageWheneverRunnerTrashesCorpCard ?? 0) > 0 &&
          !abilitiesSuppressed(state, id)
        );
      });
      const atLeastOne = rootIds.filter((id) => {
        const card = state.cards[id];
        return (
          Boolean(card?.rezzed) &&
          Boolean(card?.onRunnerTrashFromThisServerRootOrProtecting) &&
          !abilitiesSuppressed(state, id)
        );
      });
      for (const id of rootIds) {
        const card = state.cards[id];
        removeCardFromCurrentZone(state, id);
        state.corp.discardPile.push(id);
        card.zone = "corp:archives";
        card.faceup = true;
        card.rezzed = false;
        log(
          state,
          `Trash ${card.title} from ${sid} root (CR ${CR.trashing.number}).`,
        );
      }
      if (rootIds.length === 0) {
        log(state, `Trash ${sid} root — empty.`);
      }
      // Simultaneous root trash: per-card triggers (Hostile Infrastructure)
      // mark one pending instance each; "at least 1" triggers (Warroid) mark
      // once for the whole set (CR 9.12.2a / 9.1.8g).
      const createdIds: string[] = [];
      for (const id of infrastructure) {
        const card = state.cards[id];
        const per = card?.netDamageWheneverRunnerTrashesCorpCard ?? 0;
        const instances = rootIds.length;
        log(
          state,
          `${card?.title ?? id} remains active — ${instances} instances become pending (CR ${CR.abilityRemainsActive.number}).`,
        );
        for (let n = 0; n < instances; n++) {
          // CR 9.1.8g — trigger met by the move into Archives stays active
          // until these instances resolve.
          const inst = createPendingAbilityInstance(state, {
            abilityKey: "hostile-infrastructure:net-on-trash",
            sourceId: id,
            controller: "corp",
            mandatory: true,
            independentOfSource: true,
            payload: { kind: "net_damage_on_corp_trash", amount: per },
          });
          createdIds.push(inst.id);
        }
      }
      if (rootIds.length > 0) {
        for (const id of atLeastOne) {
          const card = state.cards[id];
          log(
            state,
            `${card?.title ?? id} — one instance becomes pending for this trash (CR ${CR.actOnSet.number}).`,
          );
          const inst = createPendingAbilityInstance(state, {
            abilityKey: "warroid-tracker:on-trash-set",
            sourceId: id,
            controller: "corp",
            mandatory: true,
            independentOfSource: true,
            payload: {
              kind: "stored_conditional",
              effectKey: "onRunnerTrashFromThisServerRootOrProtecting",
            },
          });
          createdIds.push(inst.id);
        }
      }
      if (createdIds.length === 0) return { ok: true };
      // Blanked sources still drop (CR 9.6.10); 9.1.8g independents keep.
      cancelPendingIfSourceInactive(state);
      const frame = openReactionWindow(state, createdIds, null);
      for (const pendingId of createdIds) {
        const inst = findPendingAbility(state, pendingId);
        if (!inst || inst.status !== "pending") continue;
        markPendingAbilityResolving(state, pendingId);
        if (inst.payload?.kind === "net_damage_on_corp_trash") {
          const result = dealDamage(
            state,
            "net",
            inst.payload.amount,
            inst.sourceId,
          );
          completePendingAbility(state, pendingId, "done");
          if (
            result !== "applied" ||
            state.done ||
            state.pendingChoice ||
            state.pendingDamage
          ) {
            closeReactionWindow(state, frame.id);
            pruneSettledPendingAbilities(state);
            return { ok: true };
          }
          continue;
        }
        if (inst.payload?.kind === "stored_conditional") {
          const card = state.cards[inst.sourceId];
          const effect =
            card?.[
              inst.payload.effectKey as keyof typeof card
            ] as import("../ir.js").Effect | undefined;
          if (effect) {
            const tracked = evalEffect(
              { state, sourceId: inst.sourceId },
              effect,
            );
            if (!tracked.ok) {
              log(
                state,
                `${card?.title ?? inst.sourceId} failed: ${tracked.error}`,
              );
            }
          }
          completePendingAbility(state, pendingId, "done");
          if (state.pendingChoice || state.trace) {
            closeReactionWindow(state, frame.id);
            pruneSettledPendingAbilities(state);
            return { ok: true };
          }
          continue;
        }
        completePendingAbility(state, pendingId, "done");
      }
      closeReactionWindow(state, frame.id);
      pruneSettledPendingAbilities(state);
      return { ok: true };
    }

case "trash_installed_runner": {
      const cands = [...state.runner.installed];
      if (action.pick === "choose" || cands.length > 1) {
        return pendingTrashAmong(state, sourceId, cands, "installed Runner card");
      }
      if (cands.length === 0) {
        log(state, `Trash installed Runner card — none installed.`);
        return { ok: true };
      }
      const id = cands[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed ${state.cards[id].title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

case "trash_installed_runner_lte_last_trashed_rez": {
      const maxCost = state.turn.lastTrashedRezzedPrintedRezCost;
      if (maxCost === null || maxCost === undefined) {
        log(state, `Trash Runner ≤ rez — no last trashed rez cost.`);
        return { ok: true };
      }
      const cands = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        const cost = c.installCost ?? 0;
        return cost <= maxCost;
      });
      if (cands.length === 0) {
        log(
          state,
          `Trash Runner ≤ ${maxCost}¢ install — none eligible.`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && cands.length > 1) {
        return pendingTrashAmong(
          state,
          sourceId,
          cands,
          `installed Runner card (≤${maxCost}¢)`,
        );
      }
      const id = cands[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed ${state.cards[id].title} (≤${maxCost}¢) (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

case "may_trash_from_grip_to_draw": {
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `May trash from grip to draw — grip empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...grip.map((id) => ({
            id: `trash-draw:${id}`,
            label: `Trash ${state.cards[id]!.title} to draw 1`,
            effect: {
              op: "do" as const,
              action: {
                kind: "trash_grip_card_draw" as const,
                cardId: id,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
logLine: `May trash 1 from grip to draw 1.`,
});
      return { ok: true };
    }

case "trash_grip_card_draw": {
      const id = action.cardId;
      if (!state.runner.hand.includes(id)) {
        log(state, `Trash grip to draw — card not in grip.`);
        return { ok: true };
      }
      moveRunnerCardToHeap(state, id);
      const drawn = drawCards(state, "runner", 1);
      log(
        state,
        `Trash ${state.cards[id]!.title} from grip; draw ${drawn}.`,
      );
      return { ok: true };
    }

case "trash_n_from_grip": {
      const n = Math.max(0, action.amount ?? 0);
      for (let i = 0; i < n; i++) {
        const id = state.runner.hand[state.runner.hand.length - 1];
        if (!id) {
          return {
            ok: false,
            error: `Cannot trash ${n} from grip — only ${i} available.`,
            cites: [CR.playEvent],
          };
        }
        moveRunnerCardToHeap(state, id);
        log(state, `Trash ${state.cards[id]!.title} from grip as cost.`);
      }
      return { ok: true };
    }

case "trash_up_to_grip_cards_gain_credits_each": {
      const remaining = Math.max(0, action.remaining);
      const typeFilter = action.types?.length ? new Set(action.types) : null;
      const candidates = state.runner.hand.filter((id) => {
        if (remaining <= 0) return false;
        const c = state.cards[id];
        if (!c) return false;
        if (!typeFilter) return true;
        return typeFilter.has(c.type as "program" | "hardware" | "resource");
      });
      if (candidates.length === 0) {
        log(
          state,
          `${source.title} — trash up to grip cards: none matching/remaining.`,
        );
        return { ok: true };
      }
      const side = source.side;
      const options: Array<{ id: string; label: string; effect: Effect }> =
        candidates.map((id) => {
          const title = state.cards[id]!.title;
          return {
            id: `trash-grip:${id}`,
            label: `Trash ${title} (+${action.per}¢)`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: { kind: "trash_grip_card" as const, cardId: id },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "gain_credits" as const,
                    side,
                    amount: action.per,
                  },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "trash_up_to_grip_cards_gain_credits_each" as const,
                    remaining: remaining - 1,
                    per: action.per,
                    ...(action.types ? { types: action.types } : {}),
                  },
                },
              ],
            },
          };
        });
      options.push({
        id: "done",
        label: "Done",
        effect: { op: "do", action: { kind: "gain_credits", side, amount: 0 } },
      });
      openPendingChoose(state, { sourceId, chooser: side, options,
logLine: `${source.title} — trash up to ${remaining} matching grip card(s) for ${action.per}¢ each (CR ${CR.trashing.number}).`,
});
      return { ok: true };
    }

case "may_trash_one_from_grip": {
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `May trash from grip — grip empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...grip.map((id) => ({
            id: `trash-grip:${id}`,
            label: `Trash ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: { kind: "trash_grip_card" as const, cardId: id },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          },
        ],
logLine: `May trash 1 card from the grip.`,
});
      return { ok: true };
    }

case "trash_grip_card": {
      const id = action.cardId;
      if (!state.runner.hand.includes(id)) {
        log(state, `Trash grip — card not in grip.`);
        return { ok: true };
      }
      moveRunnerCardToHeap(state, id);
      log(state, `Trash ${state.cards[id]!.title} from grip.`);
      return { ok: true };
    }

case "may_trash_hardware_from_grip_place_hosted_credits": {
      const hardware = state.runner.hand.filter(
        (id) => state.cards[id]?.type === "hardware",
      );
      if (hardware.length === 0) {
        log(
          state,
          `${source.title} — may trash hardware from grip (none in grip).`,
        );
        return { ok: true };
      }
      const amount = action.amount;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...hardware.map((id) => ({
            id: `trash-hw-grip:${id}`,
            label: `Trash ${state.cards[id]!.title}; place ${amount}¢ on ${source.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "trash_grip_hardware_place_hosted_credits" as const,
                cardId: id,
                amount,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
logLine: `${source.title} — may trash 1 hardware from grip to place ${amount}¢.`,
});
      return { ok: true };
    }

case "trash_grip_hardware_place_hosted_credits": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!state.runner.hand.includes(id) || card?.type !== "hardware") {
        log(state, `Trash grip hardware — not hardware in grip.`);
        return { ok: true };
      }
      moveRunnerCardToHeap(state, id);
      source.hostedCredits = (source.hostedCredits ?? 0) + action.amount;
      log(
        state,
        `Trash ${card.title} from grip; place ${action.amount}¢ on ${source.title} → ${source.hostedCredits}¢.`,
      );
      return { ok: true };
    }

case "may_trash_hq_then": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `${source.title} — may trash HQ: HQ empty.`);
        return { ok: true };
      }
      const chooseOpts: Array<{ id: string; label: string; effect: Effect }> =
        hq.map((id) => ({
          id: `trash-hq:${id}`,
          label: `Trash ${state.cards[id]!.title} from HQ`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: { kind: "trash_hq_card" as const, cardId: id },
              },
              structuredClone(action.then),
            ],
          },
        }));
      chooseOpts.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "corp" as const,
            amount: 0,
          },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: chooseOpts,
logLine: `${source.title} — may trash 1 card from HQ.`,
});
      return { ok: true };
    }

case "may_corp_trash_climactic_ice": {
      const sid = action.serverId as import("../../state/types.js").ServerId;
      const server = state.servers[sid];
      const iceIds = server?.ice ?? [];
      if (iceIds.length === 0) {
        return applyPrimitive(ctx, {
          kind: "climactic_register_bonus_access",
          amount: 2,
        });
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        iceIds.map((id) => ({
          id: `climactic-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "trash_climactic_ice" as const,
              cardId: id,
            },
          },
        }));
      options.push({
        id: "climactic-decline",
        label: "Decline — Runner gets +2 access on first HQ/R&D breach",
        effect: {
          op: "do" as const,
          action: {
            kind: "climactic_register_bonus_access" as const,
            amount: 2,
          },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
logLine: `${source.title} — Corp may trash 1 ice protecting ${sid}.`,
});
      return { ok: true };
    }

case "trash_climactic_ice": {
      const ice = state.cards[action.cardId];
      if (!ice || ice.type !== "ice") {
        log(state, `Climactic trash ice — not ice.`);
        return { ok: true };
      }
      trashCorpCardToArchives(state, action.cardId);
      log(state, `Climactic Showdown — trash ${ice.title}.`);
      return { ok: true };
    }

case "may_trash_name_agenda_steal_ignore_costs": {
      if (!state.run) {
        log(state, `${source.title} — no run for Whistleblower.`);
        return { ok: true };
      }
      // Collect unique agenda titles in play / R&D / HQ / Archives / score
      // as name candidates; also allow free-text via any catalog title present
      // on corp cards in the game. Fail-closed: offer titles from known cards.
      const titles = new Set<string>();
      for (const c of Object.values(state.cards)) {
        if (c.side === "corp") titles.add(c.title);
      }
      const titleList = [...titles].sort();
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline-wb",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          ...titleList.map((title) => ({
            id: `wb-name:${title}`,
            label: `Trash Whistleblower — name ${title}`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: { kind: "trash_self" as const },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "name_agenda" as const,
                    title,
                  },
                },
              ],
            },
          })),
        ],
logLine: `${source.title} — may trash to name an agenda for steal-ignore-costs.`,
});
      return { ok: true };
    }

case "trash_corp_card": {
      const card = state.cards[action.cardId];
      if (!card || card.side !== "corp") {
        log(
          state,
          `Trash corp card — ${card?.title ?? action.cardId} not a Corp card (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const installed =
        card.zone.endsWith(":ice") || card.zone.endsWith(":root");
      if (!installed) {
        log(
          state,
          `Trash corp card — ${card.title} not installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      trashCorpCardToArchives(state, action.cardId);
      log(
        state,
        `Trash ${card.title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

case "trash_installed": {
      const targets = trashInstalledLegalTargets(state, sourceId, action);
      if (targets.length === 0) {
        return {
          ok: false,
          error: "Must trash an installed Corp card — none available.",
          cites: [CR.trashing],
        };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => {
          const title = state.cards[id]!.title;
          const effects: Effect[] = [
            { op: "do", action: { kind: "trash_corp_card", cardId: id } },
          ];
          if (action.then) {
            effects.push(structuredClone(action.then));
          }
          return {
            id: `trash:${id}`,
            label: `Trash ${title}`,
            effect:
              effects.length === 1
                ? effects[0]!
                : { op: "seq" as const, effects },
          };
        });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
logLine: `${source.title} — must trash an installed Corp card (CR ${CR.trashing.number}).`,
});
      return { ok: true };
    }

case "trash_n_installed_corp": {
      const count = Math.max(1, action.count);
      const targets = trashInstalledLegalTargets(state, sourceId, {});
      if (targets.length < count) {
        return {
          ok: false,
          error: `Must trash ${count} installed Corp cards — only ${targets.length} available.`,
          cites: [CR.trashing],
        };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: action.chooser,
        options: targets.map((id) => ({
          id: `trash-n:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "trash_corp_card_then_trash_n" as const,
              cardId: id,
              remaining: count - 1,
              chooser: action.chooser,
            },
          },
        })),
logLine: `${source.title} — trash ${count} installed Corp card(s) (${action.chooser} chooses).`,
});
      return { ok: true };
    }

case "trash_corp_card_then_trash_n": {
      const trash = applyPrimitive(ctx, {
        kind: "trash_corp_card",
        cardId: action.cardId,
      });
      if (!trash.ok) return trash;
      if (action.remaining <= 0) return { ok: true };
      return applyPrimitive(ctx, {
        kind: "trash_n_installed_corp",
        count: action.remaining,
        chooser: action.chooser,
      });
    }

case "may_trash_installed": {
      const excludeSelf = action.excludeSelf !== false;
      const rezzedOnly = Boolean(action.rezzedOnly);
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          if (excludeSelf && id === sourceId) continue;
          const c = state.cards[id];
          if (!c || c.side !== "corp") continue;
          if (rezzedOnly && !c.rezzed) continue;
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(
          state,
          `May trash installed — no other installed Corp cards (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => {
          const title = state.cards[id]!.title;
          const effects: Effect[] = [
            { op: "do", action: { kind: "trash_corp_card", cardId: id } },
          ];
          if (action.then) {
            effects.push(structuredClone(action.then));
          }
          return {
            id: `trash:${id}`,
            label: `Trash ${title}`,
            effect:
              effects.length === 1
                ? effects[0]!
                : { op: "seq" as const, effects },
          };
        });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
logLine: `${source.title} — may trash another installed card (CR ${CR.trashing.number}).`,
});
      return { ok: true };
    }

case "trash_must_installed": {
      const excludeSelf = action.excludeSelf !== false;
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          if (excludeSelf && id === sourceId) continue;
          const c = state.cards[id];
          if (!c || c.side !== "corp") continue;
          targets.push(id);
        }
      }
      const legal = targets.filter((id) =>
        trashingKeepsScoreRestriction(state, source, id),
      );
      if (legal.length === 0) {
        return {
          ok: false,
          error: "Must trash an installed Corp card — none available.",
          cites: [CR.trashing, CR.costRestrictions],
        };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        legal.map((id) => {
          const title = state.cards[id]!.title;
          return {
            id: `trash:${id}`,
            label: `Trash ${title}`,
            effect: {
              op: "do" as const,
              action: { kind: "trash_corp_card" as const, cardId: id },
            },
          };
        });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
logLine: `${source.title} — must trash another installed card (CR ${CR.trashing.number}).`,
});
      return { ok: true };
    }

case "trash_rezzed_accessed": {
      const run = state.run;
      if (!run) {
        log(state, `Charm Offensive — no run at run end.`);
        return { ok: true };
      }
      const titles = new Set<string>();
      for (const id of run.accessedCardIds ?? []) {
        const c = state.cards[id];
        if (c?.title) titles.add(c.title);
      }
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (!c?.rezzed || !titles.has(c.title)) continue;
          candidates.push(id);
        }
      }
      if (candidates.length === 0) {
        log(state, `Charm Offensive — no rezzed copy of an accessed card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...candidates.map((cardId) => ({
            id: cardId,
            label: `Trash ${state.cards[cardId]!.title}`,
            effect: {
              op: "do" as const,
              action: { kind: "trash_corp_card" as const, cardId },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
logLine: `Charm Offensive — may trash 1 rezzed copy of an accessed card.`,
});
      return { ok: true };
    }

case "trash_rezzed_ice_gain_credits": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id]?.rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `${source.title} — no rezzed ice to trash.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        return applyPrimitive(ctx, {
          kind: "trash_rezzed_ice_gain_credits_resolve",
          cardId: targets[0]!,
          amount: action.amount,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `trash-rezzed-ice:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "trash_rezzed_ice_gain_credits_resolve" as const,
              cardId: id,
              amount: action.amount,
            },
          },
        })),
logLine: `${source.title} — choose a rezzed ice to trash.`,
});
      return { ok: true };
    }

case "trash_rezzed_ice_gain_credits_resolve": {
      const card = state.cards[action.cardId];
      if (!card?.rezzed || card.type !== "ice") {
        log(state, `Trash rezzed ice — invalid target.`);
        return { ok: true };
      }
      trashCorpCardToArchives(state, action.cardId);
      state.corp.credits += action.amount;
      log(
        state,
        `${source.title} — trash ${card.title}, gain ${action.amount}¢.`,
      );
      return { ok: true };
    }

case "trash_looked": {
      const id = action.cardId;
      if (!state.turn.rdLookedCards.includes(id)) return { ok: true };
      state.turn.rdLookedCards = state.turn.rdLookedCards.filter(
        (x) => x !== id,
      );
      trashCorpCardToArchives(state, id);
      log(state, `ABT — trash ${state.cards[id]!.title}.`);
      return { ok: true };
    }

case "trash_all_hosted_cards": {
      const hosted = [...(source.hostedCardIds ?? [])];
      source.hostedCardIds = [];
      for (const id of hosted) {
        const card = state.cards[id];
        if (!card) continue;
        card.hostId = undefined;
        if (card.side === "runner") {
          moveRunnerCardToHeap(state, id);
        } else {
          trashCorpCardToArchives(state, id);
        }
        log(state, `${source.title} — trash hosted ${card.title}.`);
      }
      return { ok: true };
    }

case "trash_co_looked_rd_card": {
      const top = state.corp.deck.slice(0, 3);
      if (!top.includes(action.cardId)) {
        log(state, `au_co_trash_looked_rd_card — card not in looked set.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((id) => !top.includes(id));
      for (const id of top) {
        const card = state.cards[id]!;
        if (id === action.cardId) {
          trashCorpCardToArchives(state, id);
          log(state, `${source.title} — trash ${card.title} from R&D.`);
        } else {
          card.zone = "corp:hq";
          card.faceup = false;
          state.corp.hand.push(id);
          log(state, `${card.title} added to HQ from R&D look.`);
        }
      }
      return { ok: true };
    }

case "trash_passed_unrezzed_ice": {
      // En Passant: trash 1 unrezzed ice passed during the last run (CR 1.2.1).
      const ids = (state.turn.lastRunPassedUnrezzedIceIds ?? []).filter(
        (id) => {
          const c = state.cards[id];
          return c && c.type === "ice" && !c.rezzed && c.zone.endsWith(":ice");
        },
      );
      if (ids.length === 0) {
        log(state, `Trash passed unrezzed ice — none available.`);
        return { ok: true };
      }
      const apply = (id: string): EvalResult => {
        const card = state.cards[id];
        if (!card) return { ok: true };
        trashCorpCardToArchives(state, id);
        log(state, `Trash unrezzed ${card.title} (passed last run).`);
        return { ok: true };
      };
      if (ids.length === 1) return apply(ids[0]!);
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: ids.map((id) => ({
          id: `en-passant:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "trash_passed_unrezzed_ice_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

case "trash_passed_unrezzed_ice_resolve": {
      const id = action.cardId;
      const card = state.cards[id];
      if (
        !card ||
        card.type !== "ice" ||
        card.rezzed ||
        !card.zone.endsWith(":ice")
      ) {
        return { ok: true };
      }
      trashCorpCardToArchives(state, id);
      log(state, `Trash unrezzed ${card.title} (passed last run).`);
      return { ok: true };
    }

case "may_trash_other_installed_gain_printed_install_and_draw": {
      const targets = state.runner.installed.filter((id) => id !== sourceId);
      if (targets.length === 0) {
        log(state, `${source.title} — no other installed cards to trash.`);
        return { ok: true };
      }
      const options: import("../ir.js").ChoiceOption[] = targets.map((id) => {
        const c = state.cards[id]!;
        const printed = c.installCost ?? 0;
        return {
          id: `trash:${id}`,
          label: `Trash ${c.title} (gain ${printed}¢, draw 1)`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "trash_runner_rig_card" as const,
                  cardId: id,
                },
              },
              {
                op: "do" as const,
                action: {
                  kind: "gain_credits" as const,
                  side: "runner" as const,
                  amount: printed,
                },
              },
              {
                op: "do" as const,
                action: {
                  kind: "draw" as const,
                  side: "runner" as const,
                  amount: 1,
                },
              },
            ],
          },
        };
      });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "runner" as const,
            amount: 0,
          },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
logLine: `${source.title} — may trash another installed card for printed install cost.`,
});
      return { ok: true };
    }

case "trash_encounter_ice_resolve_subroutine": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `Trash encounter ice — no encounter.`);
        return { ok: true };
      }
      const ice = state.cards[enc.iceId];
      if (!ice) {
        log(state, `Trash encounter ice — missing ice.`);
        return { ok: true };
      }
      const sub = ice.subroutines?.[action.subIndex];
      if (!sub) {
        log(state, `Trash encounter ice — no subroutine ${action.subIndex}.`);
        return { ok: true };
      }
      // The cost moves the ice. "This server" stays the server it protected
      // for the rest of this ability (CR 4.6.6i).
      ice.thisServerWhileResolving = state.run?.attackedServerId;
      // Trash ice; mark all subs broken so the encounter does not keep firing.
      removeCardFromCurrentZone(state, enc.iceId);
      state.corp.discardPile.push(enc.iceId);
      ice.zone = "corp:archives";
      ice.faceup = true;
      ice.rezzed = false;
      enc.broken = (ice.subroutines ?? []).map(() => true);
      log(
        state,
        `Trash ${ice.title}; resolve "${sub.text}" (ZATO City Grid).`,
      );
      const resolved = evalEffect({ state, sourceId: enc.iceId }, sub.effect);
      ice.thisServerWhileResolving = undefined;
      return resolved;
    }

case "trash_encounter_ice_if_strength_lte": {
      const iceId = state.run?.encounter?.iceId;
      if (!iceId) {
        log(state, `Trash encounter ice — no encounter.`);
        return { ok: true };
      }
      const str = iceStrength(state, iceId);
      if (str > action.maxStrength) {
        log(
          state,
          `Trash encounter ice — strength ${str} > ${action.maxStrength}.`,
        );
        return { ok: true };
      }
      const ice = state.cards[iceId]!;
      trashCorpCardToArchives(state, iceId);
      if (state.run?.encounter) state.run.encounter = null;
      log(
        state,
        `Trash encountered ${ice.title} (strength ${str} ≤ ${action.maxStrength}) (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

case "trash_aesop_for_credits": {
      const owned = state.runner.installed.filter((id) => id !== sourceId);
      if (owned.length === 0) {
        log(state, `Aesop's Pawnshop — no other installed card.`);
        return { ok: true };
      }
      // Printed: "trash 1 of your other installed cards" — the Runner chooses.
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: owned.map((id) => ({
          id: `aesop:${id}`,
          label: `Trash ${state.cards[id]!.title} → gain ${action.amount}¢`,
          effect: fx.do({
            kind: "trash_aesop_for_credits_resolve",
            cardId: id,
            amount: action.amount,
          }),
        })),
      });
      return { ok: true };
    }

case "trash_aesop_for_credits_resolve": {
      const cardId = action.cardId;
      if (!state.runner.installed.includes(cardId)) return { ok: true };
      const card = state.cards[cardId];
      // Log before leave-play so CR 9.6.10 inactive-cancel lines follow the trash.
      log(
        state,
        `Aesop's Pawnshop — trash ${card.title}, gain ${action.amount}¢.`,
      );
      trashToHeap(state, cardId);
      state.runner.credits += action.amount;
      return { ok: true };
    }

case "trash_top_of_stack": {
      if (state.runner.deck.length === 0) {
        log(state, `${source.title} — trash top of stack: stack empty.`);
        return { ok: true };
      }
      const topId = state.runner.deck[0]!;
      moveRunnerCardToHeap(state, topId);
      log(
        state,
        `${source.title} — trash top of stack (${state.cards[topId]?.title ?? topId}).`,
      );
      return { ok: true };
    }

case "trash_top_of_rd": {
      if (state.corp.deck.length === 0) {
        log(state, `${source.title} — trash top of R&D: R&D empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck.shift()!;
      trashCorpCardFacedownToArchives(state, topId);
      log(
        state,
        `${source.title} — trash top of R&D (${state.cards[topId]?.title ?? topId}).`,
      );
      maybeFireNuvemFirstRdTrash(state);
      return { ok: true };
    }

case "trash_top_n_may_install_discount": {
      const count = Math.max(0, action.count);
      const discount = Math.max(0, action.discount);
      const milled: string[] = [];
      for (let i = 0; i < count && state.runner.deck.length > 0; i++) {
        const id = state.runner.deck[0]!;
        moveRunnerCardToHeap(state, id);
        milled.push(id);
      }
      log(
        state,
        `${source.title} — trash top ${milled.length} of stack to heap.`,
      );
      const candidates = milled.filter((id) =>
        canInstallHeapCard(state, id, discount),
      );
      if (candidates.length === 0) {
        log(
          state,
          `${source.title} — no affordable install among milled cards.`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        candidates.map((id) => {
          const c = state.cards[id]!;
          const cost = gripInstallCostAfterDiscount(state, c, discount);
          return {
            id: `install:${id}`,
            label: `Install ${c.title} for ${cost}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_heap_card" as const,
                cardId: id,
                discount,
              },
            },
          };
        });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: { kind: "gain_credits" as const, side: "runner", amount: 0 },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
logLine: `${source.title} — may install 1 of ${candidates.length} milled card(s) (${discount}¢ discount).`,
});
      return { ok: true };
    }

case "may_trash_other_installed_search_stack_same_type_install": {
      const discount = Math.max(0, action.discount);
      const targets = state.runner.installed.filter((id) => id !== sourceId);
      if (targets.length === 0) {
        log(
          state,
          `${source.title} — may trash other installed: none available.`,
        );
        return { ok: true };
      }
      const installTypes = new Set(["program", "hardware", "resource"]);
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets
          .filter((id) => installTypes.has(state.cards[id]!.type))
          .map((id) => {
            const c = state.cards[id]!;
            const cardType = c.type as "program" | "hardware" | "resource";
            return {
              id: `trash:${id}`,
              label: `Trash ${c.title}; search for a ${cardType}`,
              effect: {
                op: "seq" as const,
                effects: [
                  {
                    op: "do" as const,
                    action: {
                      kind: "trash_runner_rig_card" as const,
                      cardId: id,
                    },
                  },
                  {
                    op: "do" as const,
                    action: {
                      kind: "search_stack_type_install" as const,
                      cardType,
                      discount,
                    },
                  },
                ],
              },
            };
          });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "runner" as const,
            amount: 0,
          },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
logLine: `${source.title} — may trash another installed card to search stack.`,
});
      return { ok: true };
    }

case "trash_runner_rig_card": {
      if (!state.runner.installed.includes(action.cardId)) {
        log(state, `Trash runner card — ${action.cardId} not installed.`);
        return { ok: true };
      }
      const title = state.cards[action.cardId]!.title;
      trashToHeap(state, action.cardId);
      log(
        state,
        `Trash installed ${title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

case "trash_runner_rig_card_record_program_cost": {
      if (!state.runner.installed.includes(action.cardId)) {
        log(state, `Trash runner card — ${action.cardId} not installed.`);
        return { ok: true };
      }
      const title = state.cards[action.cardId]!.title;
      const cost = state.cards[action.cardId]!.installCost;
      trashToHeap(state, action.cardId);
      state.turn.lastTrashedOwnProgramInstallCost = cost;
      log(
        state,
        `Trash installed ${title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

case "trash_type_may_pay_3_prevent": {
      const types: Array<import("../../state/types.js").CardType> = [
        "event",
        "hardware",
        "program",
        "resource",
      ];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: types.map((t) => ({
          id: `go-type:${t}`,
          label: `Choose ${t}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "game_over_after_type" as const,
              cardType: t,
            },
          },
        })),
logLine: `${source.title} — choose a Runner card type.`,
});
      return { ok: true };
    }

case "trash_hq_reencounter_passed_ice": {
      // Sisyphus Protocol: Corp chooses which HQ card to trash (CR 1.2.1).
      if (!state.run?.pendingReencounterIceId) {
        log(state, `Reencounter — no pending ice.`);
        return { ok: true };
      }
      if (state.corp.hand.length < 1) {
        log(state, `Reencounter — HQ empty.`);
        state.run.pendingReencounterIceId = undefined;
        return { ok: true };
      }
      const iceId = state.run.pendingReencounterIceId;
      const apply = (hqId: string): EvalResult => {
        if (!state.corp.hand.includes(hqId)) return { ok: true };
        const hqCard = state.cards[hqId]!;
        state.corp.hand = state.corp.hand.filter((id) => id !== hqId);
        state.corp.discardPile.push(hqId);
        hqCard.zone = "corp:archives";
        hqCard.faceup = true;
        noteCorpCardAddedToArchives(state);
        if (state.run) {
          state.run.reencounterIceId = iceId;
          state.run.pendingReencounterIceId = undefined;
        }
        log(
          state,
          `Trash ${hqCard.title} from HQ — Runner will encounter ice again.`,
        );
        return { ok: true };
      };
      if (state.corp.hand.length === 1) return apply(state.corp.hand[0]!);
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: state.corp.hand.map((id) => ({
          id: `sisyphus-hq:${id}`,
          label: `Trash ${state.cards[id]!.title} from HQ; re-encounter`,
          effect: fx.do({
            kind: "trash_hq_reencounter_passed_ice_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

case "trash_hq_reencounter_passed_ice_resolve": {
      if (!state.run?.pendingReencounterIceId) {
        log(state, `Reencounter — no pending ice.`);
        return { ok: true };
      }
      const hqId = action.cardId;
      if (!state.corp.hand.includes(hqId)) {
        log(state, `Reencounter — card no longer in HQ.`);
        return { ok: true };
      }
      const hqCard = state.cards[hqId]!;
      state.corp.hand = state.corp.hand.filter((id) => id !== hqId);
      state.corp.discardPile.push(hqId);
      hqCard.zone = "corp:archives";
      hqCard.faceup = true;
      noteCorpCardAddedToArchives(state);
      state.run.reencounterIceId = state.run.pendingReencounterIceId;
      state.run.pendingReencounterIceId = undefined;
      log(
        state,
        `Trash ${hqCard.title} from HQ — Runner will encounter ice again.`,
      );
      return { ok: true };
    }

case "trash_self_choose_rezzed_protecting_ice_encounter": {
      // Capture host server before trash (Ganked! leaves the root).
      const host = serverHostingCard(state, sourceId);
      const serverId = host?.id ?? state.run?.attackedServerId;
      releaseHostedCardsOnTrash(state, sourceId);
      removeCardFromCurrentZone(state, sourceId);
      if (source.side === "runner") {
        state.runner.discardPile.push(sourceId);
        source.zone = "runner:heap";
      } else {
        state.corp.discardPile.push(sourceId);
        source.zone = "corp:archives";
      }
      source.faceup = true;
      source.rezzed = false;
      log(state, `${source.title} trashed (CR ${CR.trashing.number}).`);
      if (!serverId || !state.run) {
        log(
          state,
          `${source.title} — no server to force encounter after trash.`,
        );
        return { ok: true };
      }
      const server = state.servers[serverId];
      const iceIds = (server?.ice ?? []).filter((id) => {
        const ice = state.cards[id];
        return ice?.type === "ice" && ice.rezzed;
      });
      if (iceIds.length === 0) {
        log(
          state,
          `${source.title} — no rezzed ice protecting ${serverId} to encounter.`,
        );
        return { ok: true };
      }
      if (iceIds.length === 1) {
        return applyPrimitive(ctx, {
          kind: "set_reencounter_ice",
          iceId: iceIds[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: iceIds.map((id) => ({
          id: `ganked-encounter:${id}`,
          label: `Runner encounters ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "set_reencounter_ice" as const, iceId: id },
          },
        })),
logLine: `${source.title} — choose rezzed ice protecting ${serverId} for encounter.`,
});
      return { ok: true };
    }

case "trash_random_from_grip": {
      const n = Math.max(0, action.amount ?? 0);
      if (n <= 0 || state.runner.hand.length === 0) {
        log(state, `Trash random from grip — nothing to trash.`);
        return { ok: true };
      }
      const picks = pickRandomSubset(
        state.runner.hand,
        Math.min(n, state.runner.hand.length),
      );
      for (const id of picks) {
        const title = state.cards[id]!.title;
        trashToHeap(state, id);
        log(
          state,
          `Trash ${title} from grip at random (CR ${CR.trashing.number}).`,
        );
      }
      return { ok: true };
    }

case "trash_must_own_installed": {
      const installed = [...state.runner.installed];
      if (installed.length === 0) {
        return {
          ok: false,
          error: "Must trash an installed card — none available.",
          cites: [CR.trashing],
        };
      }
      if (installed.length === 1) {
        const id = installed[0]!;
        const title = state.cards[id]!.title;
        trashToHeap(state, id);
        log(
          state,
          `Trash installed ${title} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: installed.map((id) => ({
          id: `trash-own-installed:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "trash_runner_rig_card" as const, cardId: id },
          },
        })),
logLine: `${source.title} — Runner must trash 1 installed card (CR ${CR.trashing.number}).`,
});
      return { ok: true };
    }

case "trash_rd": {
      let trashed = 0;
      for (let i = 0; i < action.amount && state.corp.deck.length > 0; i++) {
        const id = state.corp.deck.shift()!; // top of R&D is index 0
        trashCorpCardToArchives(state, id);
        trashed++;
      }
      log(state, `Power Shutdown — trash ${trashed} from top of R&D.`);
      return applyPrimitive(ctx, {
        kind: "trash_runner_install_lte",
        maxInstallCost: trashed,
      });
    }

case "trash_runner_install_lte": {
      const maxCost = action.maxInstallCost;
      const candidates = state.runner.installed.filter((id) => {
        const c = state.cards[id]!;
        if (c.type !== "program" && c.type !== "hardware") return false;
        return (c.installCost ?? 0) <= maxCost;
      });
      if (candidates.length === 0) {
        log(state, `Power Shutdown — no Runner install cost ≤ ${maxCost}.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `ps-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "trash_installed_runner_card" as const,
              cardId: id,
            },
          },
        })),
      });
      return { ok: true };
    }
    default:
      return null;
  }
}
