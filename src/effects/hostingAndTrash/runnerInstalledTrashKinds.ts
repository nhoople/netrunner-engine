/**
 * Primitive kinds for trashing installed Runner cards. The kind registry
 * (`applyCoreKinds`) dispatches here.
 */
import { log } from "../../state/setupAndEnd/createGame.js";
import { facedownInstalledRunnerCard } from "../../state/continuous/active.js";
import { CR } from "../../timing/labels.js";
import { trashCard, controllerOf } from "../../state/hostingAndTrash/trash.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import {
  pendingTrashAmong,
  applyPrimitive,
  trashInstalledLegalTargets,
  trashingKeepsScoreRestriction,
  type EffectCtx,
  type EvalResult,
} from "../eval.js";
import { type Effect, fx, type Primitive } from "../ir.js";
import { shuffleInPlace } from "../../state/rng.js";
import { installedCorpCards } from "../primitives/chooseGainShuffle.js";
import { applySpinTcPrimitive } from "../primitives/breachTrashTurn.js";
import type { GameState } from "../../state/types.js";
import { applyRedsandFmPrimitive } from "../primitives/derezRfgTrash.js";
import { countRezzedNextIce } from "../damageAndPrevention/damageAndPreventionKinds.js";

/**
 * Who chooses and carries out a "trash 1 program/hardware" subroutine:
 * "The Runner trashes ..." names the Runner; otherwise the ability's
 * controller does (CR 1.14.5).
 */
function trashChooser(source: GameState["cards"][string]): "corp" | "runner" {
  const runnerTrashes = (source.subroutines ?? []).some((sub) =>
    /runner trashes/i.test(sub.text ?? ""),
  );
  return runnerTrashes ? "runner" : source.side;
}

export function runnerPrograms(state: EffectCtx["state"]): string[] {
  return state.runner.installed.filter(
    (id) => state.cards[id]?.type === "program",
  );
}

function installedRunnerCards(state: EffectCtx["state"]): string[] {
  return [...state.runner.installed].filter((id) => state.cards[id]);
}

function installedPrograms(state: EffectCtx["state"]): string[] {
  return state.runner.installed.filter(
    (id) => state.cards[id]?.type === "program",
  );
}

export function applyRunnerInstalledTrashKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
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
      // A facedown card has no card type, so it is no program (CR 8.1.4a).
      let programs = state.runner.installed.filter(
        (id) =>
          state.cards[id].type === "program" &&
          !facedownInstalledRunnerCard(state, id),
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
      const chooser = trashChooser(source);
      if (action.pick === "choose" && programs.length > 1) {
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
      trashCard(state, progId, { by: chooser });
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
        trashCard(state, id);
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
      trashCard(state, resId);
      log(
        state,
        `Trash installed ${action.subtype} resource ${title} (CR ${CR.trashing.number}).`,
      );
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
      // "Trashing a resource this way cannot be prevented" (Corporate Town,
      // Character Assassination): no trash interrupt opens (CR 1.2.1).
      const preventable = action.cannotPrevent ? false : undefined;
      if (action.pick === "choose" && resources.length > 1) {
        state.pendingTrashProgram = {
          sourceId,
          candidates: [...resources],
          ...(preventable === false ? { preventable } : {}),
        };
        log(
          state,
          `Trash resource — Corp must choose among ${resources.length} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const resId = resources[0]!;
      const title = state.cards[resId].title;
      trashCard(state, resId, {
        by: controllerOf(state, sourceId),
        ...(preventable === false ? { preventable } : {}),
      });
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
        trashCard(state, resId, { by: controllerOf(state, sourceId) });
        log(state, `Trash own resource ${title} (CR ${CR.trashing.number}).`);
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
        trashCard(state, progId);
        state.turn.lastTrashedOwnProgramInstallCost = cost;
        log(state, `Trash own program ${title} (CR ${CR.trashing.number}).`);
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
      trashCard(state, action.cardId);
      log(state, `Trash ${state.cards[action.cardId]!.title} from stack look.`);
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
      trashCard(state, id);
      log(
        state,
        `Trash ${title} (virtual resource or link) (CR ${CR.trashing.number}).`,
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
      // A facedown card has no card type, so it is no hardware (CR 8.1.4a).
      const hw = state.runner.installed.filter(
        (id) =>
          state.cards[id].type === "hardware" &&
          !facedownInstalledRunnerCard(state, id),
      );
      if (action.pick === "choose") {
        // Lab Dog: "The Runner trashes an installed piece of hardware."
        return pendingTrashAmong(
          state,
          sourceId,
          hw,
          "hardware",
          trashChooser(source),
        );
      }
      if (hw.length === 0) {
        log(
          state,
          `Trash hardware — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const id = hw[0]!;
      trashCard(state, id);
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
        return c?.type === "hardware" && (c.installCost ?? 0) <= maxCost;
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
      trashCard(state, id);
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
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
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
        return pendingTrashAmong(state, sourceId, cands, "program or hardware");
      }
      if (cands.length === 0) {
        log(
          state,
          `Trash program/hardware — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const id = cands[0]!;
      trashCard(state, id);
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
      trashCard(state, id);
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
        trashCard(state, pick);
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

    case "trash_installed_runner_card": {
      const cardId = action.cardId;
      if (!state.runner.installed.includes(cardId)) return { ok: true };
      trashCard(state, cardId);
      state.turn.projectAresTrashedCount =
        (state.turn.projectAresTrashedCount ?? 0) + 1;
      state.turn.projectAresTrashRemaining = Math.max(
        0,
        (state.turn.projectAresTrashRemaining ?? 1) - 1,
      );
      log(state, `Trash installed ${state.cards[cardId]!.title}.`);
      return { ok: true };
    }

    case "trash_installed_runner": {
      const cands = [...state.runner.installed];
      if (action.pick === "choose" || cands.length > 1) {
        return pendingTrashAmong(
          state,
          sourceId,
          cands,
          "installed Runner card",
        );
      }
      if (cands.length === 0) {
        log(state, `Trash installed Runner card — none installed.`);
        return { ok: true };
      }
      const id = cands[0]!;
      trashCard(state, id);
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
        log(state, `Trash Runner ≤ ${maxCost}¢ install — none eligible.`);
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
      trashCard(state, id);
      log(
        state,
        `Trash installed ${state.cards[id].title} (≤${maxCost}¢) (CR ${CR.trashing.number}).`,
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
      trashCard(state, cardId, { by: controllerOf(state, sourceId) });
      state.runner.credits += action.amount;
      return { ok: true };
    }

    case "trash_runner_rig_card": {
      if (!state.runner.installed.includes(action.cardId)) {
        log(state, `Trash runner card — ${action.cardId} not installed.`);
        return { ok: true };
      }
      const title = state.cards[action.cardId]!.title;
      trashCard(state, action.cardId);
      log(state, `Trash installed ${title} (CR ${CR.trashing.number}).`);
      return { ok: true };
    }

    case "trash_runner_rig_card_record_program_cost": {
      if (!state.runner.installed.includes(action.cardId)) {
        log(state, `Trash runner card — ${action.cardId} not installed.`);
        return { ok: true };
      }
      const title = state.cards[action.cardId]!.title;
      const cost = state.cards[action.cardId]!.installCost;
      trashCard(state, action.cardId);
      state.turn.lastTrashedOwnProgramInstallCost = cost;
      log(state, `Trash installed ${title} (CR ${CR.trashing.number}).`);
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
        trashCard(state, id, { by: controllerOf(state, sourceId) });
        log(state, `Trash installed ${title} (CR ${CR.trashing.number}).`);
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

    case "ss_wake_up_call": {
      const targets = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        if (!c) return false;
        if (c.type === "hardware") return true;
        if (c.type === "resource" && !(c.subtypes ?? []).includes("virtual")) {
          return true;
        }
        return false;
      });
      if (targets.length === 0) {
        log(state, `${source?.title ?? "Wake Up Call"} — no legal targets.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `wuc:${id}`,
          label: `Choose ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "resolve_wake_up_call", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "resolve_wake_up_call": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "trash",
            label: `Trash ${card.title}`,
            effect: fx.do({
              kind: "trash_wake_up_call",
              cardId: action.cardId,
            }),
          },
          {
            id: "meat",
            label: "Suffer 4 meat damage",
            effect: fx.do({ kind: "meat_damage", amount: 4 }),
          },
        ],
        logLine: `${source?.title ?? "Wake Up Call"} — Runner chooses trash ${card.title} or 4 meat.`,
      });
      return { ok: true };
    }

    case "trash_wake_up_call": {
      trashCard(state, action.cardId, { by: controllerOf(state, sourceId) });
      log(
        state,
        `Wake Up Call — trash ${state.cards[action.cardId]?.title ?? action.cardId}.`,
      );
      return { ok: true };
    }
    case "runner_trashes_one_installed": {
      const installed = [...state.runner.installed];
      if (installed.length === 0) {
        log(state, `Markus 1.0 — Runner has no installed cards.`);
        return { ok: true };
      }
      if (installed.length === 1) {
        trashCard(state, installed[0]!);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: installed.map((id) => ({
          id: `trash-installed:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
        })),
      });
      return { ok: true };
    }
    case "trash_one_installed_runner_program": {
      const progs = runnerPrograms(state);
      if (progs.length === 0) {
        log(state, `Trash program — none installed.`);
        return { ok: true };
      }
      if (progs.length === 1) {
        trashCard(state, progs[0]!);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: progs.map((id) => ({
          id: `trash-prog:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
        })),
      });
      return { ok: true };
    }
    case "trash_looked_program": {
      const id = action.cardId;
      const rest = (state.turn.rdLookedCards ?? []).filter((x) => x !== id);
      for (const rid of rest) {
        state.corp.deck.unshift(rid);
        state.cards[rid]!.faceup = false;
      }
      trashCard(state, id, { by: controllerOf(state, sourceId) });
      state.turn.rdLookedCards = [];
      shuffleInPlace(state, state.corp.deck);
      log(
        state,
        `Keyhole — trash ${state.cards[id]?.title ?? id}; shuffle R&D.`,
      );
      return { ok: true };
    }

    case "warroid_runner_trashes_installed": {
      const amount = Math.max(1, action.amount ?? 2);
      const candidates = installedRunnerCards(state);
      if (candidates.length === 0) {
        log(state, `Warroid Tracker — Runner has no installed cards.`);
        return { ok: true };
      }
      const n = Math.min(amount, candidates.length);
      // Ask Runner to pick n cards (simplified: sequential picks).
      const pickOne = (remaining: number, pool: string[]): Effect => {
        if (remaining <= 0 || pool.length === 0) {
          return fx.do({ kind: "gain_credits", side: "runner", amount: 0 });
        }
        return {
          op: "choose",
          chooser: "runner",
          options: pool.map((id) => ({
            id: `trash:${id}`,
            label: `Trash ${state.cards[id]!.title}`,
            effect: fx.seq(
              fx.do({ kind: "trash_warroid_one", cardId: id }),
              pickOne(
                remaining - 1,
                pool.filter((x) => x !== id),
              ),
            ),
          })),
        };
      };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: (pickOne(n, candidates) as Extract<Effect, { op: "choose" }>)
          .options,
      });
      return { ok: true };
    }

    case "trash_warroid_one": {
      const cardId = (action as { cardId: string }).cardId;
      if (!state.cards[cardId] || !state.runner.installed.includes(cardId)) {
        return { ok: true };
      }
      trashCard(state, cardId, { by: controllerOf(state, sourceId) });
      log(state, `Warroid Tracker — trash ${state.cards[cardId]?.title}.`);
      return { ok: true };
    }

    case "trash_loop": {
      const runnerInstalled = installedRunnerCards(state);
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "decline",
          label: "Decline — Corp draws 1 and gains 5¢",
          effect: fx.seq(
            fx.do({ kind: "draw", side: "corp", amount: 1 }),
            fx.do({ kind: "gain_credits", side: "corp", amount: 5 }),
          ),
        },
      ];
      for (const id of runnerInstalled) {
        options.push({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "runner_trash_standoff_after", cardId: id }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "runner_trash_standoff_after": {
      const cardId = (action as { cardId: string }).cardId;
      if (state.runner.installed.includes(cardId)) {
        trashCard(state, cardId, { by: controllerOf(state, sourceId) });
        log(state, `Standoff — Runner trashes ${state.cards[cardId]?.title}.`);
      }
      const corpInstalled = installedCorpCards(state);
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "decline",
          label: "Decline (end Standoff)",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        },
      ];
      for (const id of corpInstalled) {
        options.push({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title} and repeat`,
          effect: fx.seq(
            fx.do({ kind: "corp_trash", cardId: id }),
            fx.do({ kind: "trash_loop" }),
          ),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "trash_installed_icebreaker": {
      const breakers = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        return c && (c.subtypes ?? []).some((s) => s === "icebreaker");
      });
      if (breakers.length === 0) {
        log(state, `Holmegaard — no installed icebreakers.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: breakers.map((id) => ({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "trash_hunter_seeker_installed": {
      const candidates: string[] = [];
      for (const id of state.runner.installed) {
        if (state.cards[id]) candidates.push(id);
      }
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          if (state.cards[id]) candidates.push(id);
        }
      }
      if (candidates.length === 0) {
        log(state, `Hunter Seeker — no installed cards.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: candidates.map((id) => ({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind:
              state.cards[id]!.side === "runner"
                ? "trash_installed_runner_card"
                : "trash_installed_corp_card",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "runner_trash_continue": {
      const trashed = [...(action.trashed ?? [])];
      const remaining = action.remaining ?? [];
      // Trash the newly chosen ones already in trashed that are still installed.
      for (const id of trashed) {
        if (!state.runner.installed.includes(id)) continue;
        trashCard(state, id, { by: controllerOf(state, sourceId) });
        state.runner.credits += 1;
      }
      if (remaining.length === 0) {
        return applyRedsandFmPrimitive(ctx, {
          kind: "corp_gain",
          cardType: action.cardType,
          trashed,
        })!;
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "br:done",
            label: "Done trashing",
            effect: fx.do({
              kind: "corp_gain",
              cardType: action.cardType,
              trashed,
            }),
          },
          ...remaining.map((id) => ({
            id: `br:trash:${id}`,
            label: `Trash ${state.cards[id]?.title ?? id}`,
            effect: fx.do({
              kind: "runner_trash_continue",
              cardType: action.cardType,
              trashed: [...trashed, id],
              remaining: remaining.filter((x) => x !== id),
            }),
          })),
        ],
      });
      return { ok: true };
    }

    case "trash_chop_bot_installed_then_draw_or_remove_tag": {
      const cands = state.runner.installed.filter((id) => id !== sourceId);
      if (cands.length === 0) {
        log(state, `Chop Bot 3000 — no other installed card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `chop:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_chop_bot_then_choose", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "trash_chop_bot_then_choose": {
      const cardId = (action as { cardId: string }).cardId;
      trashCard(state, cardId);
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "chop-draw",
            label: "Draw 1 card",
            effect: fx.draw("runner", 1),
          },
          {
            id: "chop-tag",
            label: "Remove 1 tag",
            effect: fx.do({ kind: "remove_tags", amount: 1 }),
          },
        ],
      });
      return { ok: true };
    }

    case "trash_installed_with_install_cost_lte_tags": {
      const tags = state.runner.tags;
      const targets = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        if (!c) return false;
        const cost = c.installCost ?? 0;
        return cost <= tags;
      });
      if (targets.length === 0) {
        log(
          state,
          `Best Defense — no installed card with install cost ≤ ${tags} tag(s).`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `best-defense:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "trash_trojan_horse": {
      const maxCost = state.turn.lastTraceExcess ?? 0;
      const progs = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        return c?.type === "program" && (c.installCost ?? 0) <= maxCost;
      });
      if (progs.length === 0) {
        log(state, `Trojan Horse — no program with install cost ≤ ${maxCost}.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: progs.map((id) => ({
          id: `trojan:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_trojan_horse_resolve", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "trash_trojan_horse_resolve": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.installed.includes(cardId))
        return { ok: true };
      trashCard(state, cardId, { by: "corp" });
      log(state, `Trojan Horse — trash ${card.title}.`);
      return { ok: true };
    }

    case "trash_all_resources_unless_remove_bad_publicity": {
      const bp = state.corp.badPublicity ?? 0;
      const opts: { id: string; label: string; effect: Effect }[] = [
        {
          id: "trash-resources",
          label: "Trash all installed resources",
          effect: fx.do({ kind: "trash_all_resources" }),
        },
      ];
      if (bp >= 1) {
        opts.unshift({
          id: "remove-bp",
          label: "Remove 1 bad publicity",
          effect: fx.do({ kind: "remove_bad_publicity_instead", amount: 1 }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options: opts });
      return { ok: true };
    }

    case "trash_all_resources": {
      for (const id of [...state.runner.installed]) {
        if (state.cards[id]?.type === "resource") trashCard(state, id);
      }
      log(state, `The All-Seeing I — trash all resources.`);
      return { ok: true };
    }

    case "trash_own_installed": {
      // The Runner trashes their own card (Heartbeat, Endless Hunger), which
      // Wasteland counts (`noteRunnerInstalledCardTrashing`, CR 1.14.5).
      trashCard(state, action.cardId, { by: "runner" });
      return { ok: true };
    }

    case "trash_installed_virus": {
      const viruses = state.runner.installed.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes("virus"),
      );
      if (viruses.length === 0) {
        log(state, `Macrophage — no installed virus.`);
        return { ok: true };
      }
      if (viruses.length === 1 || action.pick === "first") {
        const id = viruses[0]!;
        trashCard(state, id, { by: controllerOf(state, sourceId) });
        log(state, `Macrophage — trash virus ${state.cards[id]!.title}.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: viruses.map((id) => ({
          id: `trash-virus:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_installed_virus_resolve", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "trash_installed_virus_resolve": {
      const cardId = action.cardId;
      if (!cardId || !state.runner.installed.includes(cardId))
        return { ok: true };
      trashCard(state, cardId, { by: controllerOf(state, sourceId) });
      log(state, `Macrophage — trash virus ${state.cards[cardId]!.title}.`);
      return { ok: true };
    }
    case "trash_hardware_additional_cost": {
      const hw = state.runner.installed.filter(
        (id) => state.cards[id]?.type === "hardware",
      );
      if (hw.length === 0) {
        return {
          ok: false,
          error: "No hardware to trash for Trade-In.",
          cites: [],
        };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: hw.map((id) => ({
          id: `trade-in-hw:${id}`,
          label: `Trash ${state.cards[id]!.title} (additional cost)`,
          effect: fx.do({ kind: "trade_in_record_hw", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "trash_hellion_beta_two_installed_non_program": {
      const targets = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        return c && c.type !== "program";
      });
      if (targets.length === 0) {
        log(state, `Hellion Beta Test — no installed non-program cards.`);
        return { ok: true };
      }
      const count = Math.min(2, targets.length);
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `hellion:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "trash_hellion_beta_pick",
            cardId: id,
            remaining: count - 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "trash_hellion_beta_pick": {
      const cardId = action.cardId;
      const remaining = action.remaining ?? 0;
      if (cardId)
        trashCard(state, cardId, { by: controllerOf(state, sourceId) });
      log(
        state,
        `Hellion Beta Test — trash ${state.cards[cardId!]?.title ?? cardId}.`,
      );
      if (remaining <= 0) return { ok: true };
      const targets = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        return c && c.type !== "program" && id !== cardId;
      });
      if (targets.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `hellion:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "trash_hellion_beta_pick",
            cardId: id,
            remaining: remaining - 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "trash_sadaka_hq_then_resource": {
      if (state.corp.hand.length === 0) {
        log(state, `Sadaka — HQ empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: state.corp.hand.map((id) => ({
          id: `sadaka-hq:${id}`,
          label: `Trash ${state.cards[id]!.title} from HQ`,
          effect: fx.do({
            kind: "trash_sadaka_hq_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "trash_sadaka_resource": {
      const cardId = (action as { cardId: string }).cardId;
      if (!state.runner.installed.includes(cardId)) return { ok: true };
      trashCard(state, cardId);
      log(state, `Sadaka — trash resource ${state.cards[cardId]?.title}.`);
      return { ok: true };
    }
    case "trash_own_resource_with_subtype": {
      const subtype = action.subtype;
      const resources = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        return c?.type === "resource" && (c.subtypes ?? []).includes(subtype);
      });
      if (resources.length === 0) {
        return {
          ok: false,
          error: `Must trash an installed ${subtype} resource — none available.`,
          cites: [],
        };
      }
      if (resources.length === 1) {
        const resId = resources[0]!;
        const title = state.cards[resId]!.title;
        trashCard(state, resId);
        log(state, `Trash own ${subtype} resource ${title}.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: resources.map((id) => ({
          id: `trash-own-sub:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "trash_own_resource_with_subtype_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "trash_own_resource_with_subtype_resolve": {
      const cardId = action.cardId;
      if (!state.runner.installed.includes(cardId)) return { ok: true };
      trashCard(state, cardId);
      log(state, `Trash own resource ${state.cards[cardId]!.title}.`);
      return { ok: true };
    }
    case "trash_connection": {
      const cardId = (action as { cardId: string }).cardId;
      if (!state.runner.installed.includes(cardId)) {
        log(state, `Snatch and Grab — connection already gone.`);
        return { ok: true };
      }
      trashCard(state, cardId);
      log(state, `Snatch and Grab — trash ${state.cards[cardId]!.title}.`);
      return { ok: true };
    }

    case "trash_programs": {
      const x = countRezzedNextIce(state);
      if (x <= 0) {
        log(state, `NEXT Gold — X=0, trash no programs.`);
        return { ok: true };
      }
      const progs = installedPrograms(state);
      if (progs.length === 0) {
        log(state, `NEXT Gold — no installed programs.`);
        return { ok: true };
      }
      const n = Math.min(x, progs.length);
      // Offer Corp choice iteratively via pendingChoice for first batch.
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: progs.map((id) => ({
          id: `next-gold-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "trash_program_pick",
            cardId: id,
            remaining: n - 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "trash_program_pick": {
      const cardId = (action as { cardId: string }).cardId;
      const remaining = (action as { remaining: number }).remaining;
      const card = state.cards[cardId];
      if (
        !card ||
        card.type !== "program" ||
        !state.runner.installed.includes(cardId)
      ) {
        return {
          ok: false,
          error: "NEXT Gold trash target invalid.",
          cites: [],
        };
      }
      trashCard(state, cardId);
      log(state, `NEXT Gold — trash ${card.title}.`);
      if (remaining > 0) {
        const progs = installedPrograms(state);
        if (progs.length === 0) return { ok: true };
        openPendingChoose(state, {
          sourceId,
          chooser: "corp",
          options: progs.map((id) => ({
            id: `next-gold-trash:${id}`,
            label: `Trash ${state.cards[id]!.title}`,
            effect: fx.do({
              kind: "trash_program_pick",
              cardId: id,
              remaining: remaining - 1,
            }),
          })),
        });
      }
      return { ok: true };
    }
    case "trash_per_tag": {
      // Each gained subroutine: "The Runner trashes 1 of their installed
      // cards" — the Runner chooses, one subroutine at a time.
      const tags = state.runner.tags;
      if (tags <= 0) {
        log(state, `Information Overload — Runner has no tags.`);
        return { ok: true };
      }
      return applyRunnerInstalledTrashKinds(ctx, {
        kind: "trash_per_tag_continue",
        remaining: tags,
      });
    }
    case "trash_per_tag_continue": {
      const remaining = action.remaining ?? 0;
      const installed = [...state.runner.installed];
      if (remaining <= 0 || installed.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: installed.map((id) => ({
          id: `io-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.seq(
            fx.do({ kind: "trash_own_installed", cardId: id }),
            fx.do({ kind: "trash_per_tag_continue", remaining: remaining - 1 }),
          ),
        })),
      });
      return { ok: true };
    }
    case "trash_will_o_wisp_breaker_used": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Do not trash Will-o'-the-Wisp",
            effect: fx.gainCredits("corp", 0),
          },
          {
            id: "trash",
            label:
              "Trash Will-o'-the-Wisp: an icebreaker used this run goes to the bottom of the stack",
            effect: fx.do({ kind: "resolve_will_o_wisp" }),
          },
        ],
      });
      return { ok: true };
    }

    case "trash_one_program_used_this_run_cannot_prevent": {
      // Printed: trash 1 installed program you used during that run (CR 1.2.1).
      // Prefer explicit programsUsedThisRun; also count breakers that broke.
      const bag = state.run as
        | {
            programsUsedThisRun?: string[];
            breakersThatBroke?: string[];
          }
        | null
        | undefined;
      const fromBag = bag?.programsUsedThisRun ?? [];
      const fromBreakers = bag?.breakersThatBroke ?? [];
      const candidates = [...new Set([...fromBag, ...fromBreakers])].filter(
        (id) => {
          const c = state.cards[id];
          return (
            c && c.type === "program" && state.runner.installed.includes(id)
          );
        },
      );
      if (candidates.length === 0) {
        log(state, `Cold Read — no program used this run to trash.`);
        return { ok: true };
      }
      if (candidates.length === 1) {
        const id = candidates[0]!;
        trashCard(state, id, {
          by: controllerOf(state, sourceId),
          preventable: false,
        });
        log(
          state,
          `Cold Read — trash ${state.cards[id]!.title} (cannot prevent).`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "trash_program_cannot_prevent",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "trash_program_cannot_prevent": {
      const cardId = action.cardId;
      if (!cardId || !state.runner.installed.includes(cardId)) {
        log(state, `Cold Read — program not installed.`);
        return { ok: true };
      }
      trashCard(state, cardId, {
        by: controllerOf(state, sourceId),
        preventable: false,
      });
      log(
        state,
        `Cold Read — trash ${state.cards[cardId]!.title} (cannot prevent).`,
      );
      return { ok: true };
    }

    case "trash_installed_not_matching_runner_identity_faction": {
      const idFaction = state.cards[state.runner.identityId]?.faction;
      const targets = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        return c && c.faction && c.faction !== idFaction;
      });
      if (targets.length === 0) {
        log(
          state,
          `Enforcing Loyalty — no installed card not matching Runner ID faction.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
        })),
      });
      return { ok: true };
    }
    case "trash_exec_sysop_clone_remove_bp": {
      const subtypes = new Set(["sysop", "executive", "clone"]);
      const cands: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id]!;
          if ((c.subtypes ?? []).some((s) => subtypes.has(s))) cands.push(id);
        }
      }
      if (cands.length === 0) {
        log(state, `Restoring Face — no sysop/executive/clone to trash.`);
        return { ok: true };
      }
      if (cands.length === 1) {
        const id = cands[0]!;
        // "Reveal and trash": revealed, so faceup (CR 1.21.6, 4.4.6b).
        trashCard(state, id, { by: "corp", faceup: true });
        log(state, `Restoring Face — trash ${state.cards[id]!.title}.`);
        return applySpinTcPrimitive(ctx, {
          kind: "remove_bad_publicity_up_to",
          max: 2,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `restoring-face:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.seq(
            fx.do({
              kind: "trash_installed_corp_card",
              cardId: id,
              revealed: true,
            }),
            fx.do({ kind: "remove_bad_publicity_up_to", max: 2 }),
          ),
        })),
        logLine: `Restoring Face — choose sysop/executive/clone to trash.`,
      });
      return { ok: true };
    }
    default:
      return null;
  }
}

export function applyRunnerInstalledTrashKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "trash_hardware_with_subtype": {
      const want = action.subtype.toLowerCase();
      const targets = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "hardware") return false;
        return (c.subtypes ?? []).some((s) => s.toLowerCase() === want);
      });
      if (targets.length === 0) {
        log(state, `Trash ${action.subtype} — none installed.`);
        return { ok: true };
      }
      if (action.pick === "choose" && targets.length > 1) {
        openPendingChoose(state, {
          sourceId,
          chooser: "corp",
          options: targets.map((id) => ({
            id: `trash-hw-sub:${id}`,
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
      trashCard(state, targets[0]!);
      return { ok: true };
    }
    default:
      return null;
  }
}
