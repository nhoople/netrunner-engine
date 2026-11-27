/**
 * Primitive kinds for uninstalling cards to a hand or deck, and moving the
 * Runner during a run. The kind registry (`applyCoreKinds`) dispatches here.
 */
import { CR } from "../../timing/labels.js";
import {
  setAttackedServer,
  setRunnerPosition,
  moveRunnerToIce,
  moveRunnerToOutermost,
} from "../../state/uninstallAndPosition/runPosition.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { trashCard, controllerOf } from "../../state/hostingAndTrash/trash.js";
import {
  applyPrimitive,
  evalEffect,
  type EffectCtx,
  type EvalResult,
} from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { ServerId } from "../../state/types.js";
import { iceFaceVisible } from "../../state/visibility/seatVisibility.js";
import {
  rearrangeIce,
  moveIce,
} from "../../state/uninstallAndPosition/rearrange.js";
import { fx, type Primitive } from "../ir.js";
import { uninstallCard } from "../../state/uninstallAndPosition/uninstall.js";
import { serverIdForCard } from "../primitives/gainMoveMark.js";
import { unhostCard } from "../../state/hostingAndTrash/host.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";

function addInstalledToGrip(state: EffectCtx["state"], cardId: string): void {
  const card = state.cards[cardId];
  if (!card || !state.runner.installed.includes(cardId)) return;
  uninstallCard(state, cardId, "hand");
}

function installedRunnerCardIds(state: EffectCtx["state"]): string[] {
  return state.runner.installed.filter((id) => !state.cards[id]?.hostId);
}

function installedProgramsOrVirtualResources(
  state: EffectCtx["state"],
): string[] {
  // Printed Intake: any installed program or virtual resource (hosted cards
  // remain installed — CR 1.2.1 / card text).
  return state.runner.installed.filter((id) => {
    const c = state.cards[id];
    if (!c) return false;
    if (c.type === "program") return true;
    return c.type === "resource" && (c.subtypes ?? []).includes("virtual");
  });
}

function installedCorpCards(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      if (state.cards[id]) out.push(id);
    }
  }
  return out;
}

export function applyUninstallAndPositionKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "redirect_approach_to_server": {
      if (!state.run) {
        return {
          ok: false,
          error: "Redirect approach requires an active run.",
          cites: [CR.announceServer],
        };
      }
      const sid = action.serverId;
      const server = state.servers[sid];
      if (!server) {
        return {
          ok: false,
          error: `Unknown server ${sid}.`,
          cites: [CR.announceServer],
        };
      }
      // "Instead change the attacked server ... and approach that server":
      // the Runner approaches the server itself, with no position
      // (CR 1.2.1, 6.2.5c).
      setAttackedServer(state.run, sid);
      setRunnerPosition(state.run, null);
      log(
        state,
        `Baker — change attacked server to ${sid} and approach ${sid}.`,
      );
      return { ok: true };
    }

    case "copycat_jump_to_rezzed_copy": {
      if (!state.run?.lastPassedRezzedIceId) {
        log(state, `Copycat — no passed ice.`);
        return { ok: true };
      }
      const passed = state.cards[state.run.lastPassedRezzedIceId];
      if (!passed) return { ok: true };
      const defId = passed.defId;
      const matches: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const iceId of server.ice) {
          if (iceId === state.run.lastPassedRezzedIceId) continue;
          const ice = state.cards[iceId];
          if (ice?.type === "ice" && ice.rezzed && ice.defId === defId) {
            matches.push(iceId);
          }
        }
      }
      trashCard(state, sourceId, { by: controllerOf(state, sourceId) });
      log(state, `Trash ${source.title}.`);
      if (matches.length === 0) {
        log(state, `Copycat — no other rezzed copy to jump to.`);
        return { ok: true };
      }
      if (matches.length === 1) {
        return applyPrimitive(ctx, {
          kind: "copycat_continue_from_ice",
          iceId: matches[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: matches.map((iceId) => ({
          id: `copycat:${iceId}`,
          label: `Continue from ${state.cards[iceId]!.title}`,
          effect: {
            op: "do",
            action: { kind: "copycat_continue_from_ice", iceId },
          },
        })),
      });
      return { ok: true };
    }

    case "copycat_continue_from_ice": {
      if (!state.run) return { ok: true };
      const iceId = action.iceId;
      const ice = state.cards[iceId];
      if (!ice || ice.type !== "ice" || !ice.rezzed) {
        log(state, `Copycat — invalid ice.`);
        return { ok: true };
      }
      let hostServer: string | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.ice.includes(iceId)) {
          hostServer = sid;
          break;
        }
      }
      if (!hostServer) return { ok: true };
      // "Continue the run as if passing" that ice: the Runner moves to its
      // position (CR 6.2.8a).
      if (!moveRunnerToIce(state, iceId)) {
        log(
          state,
          `Copycat — the Runner cannot move to a position now (CR ${CR.ineffectiveMove.number}).`,
        );
        return { ok: true };
      }
      state.run.passedIceIds = [...(state.run.passedIceIds ?? []), iceId];
      log(
        state,
        `Copycat — continue the run as if passing ${ice.title} on ${hostServer}.`,
      );
      return { ok: true };
    }

    case "rearrange_ice": {
      // Arrange installed ice (CR 8.3.1, 8.3.2): the chooser fills each
      // position of the listed servers, outermost first, from their ice.
      // Nothing moves until every position is filled: no checkpoint occurs
      // while ice is being arranged (CR 8.3.2a).
      const serverIds = action.serverIds.filter(
        (sid) => (state.servers[sid]?.ice.length ?? 0) > 0,
      );
      const slots: { serverId: ServerId; index: number }[] = [];
      for (const sid of serverIds) {
        state.servers[sid]!.ice.forEach((_, index) =>
          slots.push({ serverId: sid, index }),
        );
      }
      if (slots.length < 2) {
        // CR 8.3.1a: arranging 1 or fewer cards does nothing.
        log(
          state,
          `${source.title} — fewer than 2 ice to arrange (CR ${CR.arrangeOrRearrange.number}).`,
        );
        return { ok: true };
      }
      const current = slots.map(
        (slot) => state.servers[slot.serverId]!.ice[slot.index]!,
      );
      // An unrezzed ice is named by where it is now, not by its title, for
      // a player who may not see its face (CR 1.21.1).
      const nameFor = (id: string, viewer: "corp" | "runner"): string => {
        const card = state.cards[id];
        if (card && iceFaceVisible(card, viewer)) return card.title;
        const at = slots[current.indexOf(id)];
        return at
          ? `the unrezzed ice at ${at.serverId}, position ${at.index + 1}`
          : "an unrezzed ice";
      };
      const placed = [...(action.placed ?? [])];
      const remaining = current.filter((id) => !placed.includes(id));
      if (remaining.length === 1) placed.push(remaining[0]!);
      if (placed.length >= slots.length) {
        const arrangement: Partial<Record<ServerId, string[]>> = {};
        slots.forEach((slot, i) => {
          (arrangement[slot.serverId] ??= []).push(placed[i]!);
        });
        // The log goes to both players, so it names ice as the Runner sees
        // them, by their position before the arrangement.
        const lines = serverIds.map(
          (sid) =>
            `${source.title} — ${sid}: ${(arrangement[sid] ?? [])
              .map((id) => nameFor(id, "runner"))
              .join(" → ")} (CR ${CR.arrangeIce.number}).`,
        );
        if (!rearrangeIce(state, arrangement)) {
          log(state, `${source.title} — the ice changed; nothing is arranged.`);
          return { ok: true };
        }
        for (const line of lines) log(state, line);
        return { ok: true };
      }
      const slot = slots[placed.length]!;
      const restInPlace = current.slice(placed.length);
      const keepRest =
        restInPlace.length === remaining.length &&
        restInPlace.every((id) => remaining.includes(id));
      const where = `${slot.serverId}, position ${slot.index + 1} from the outside`;
      openPendingChoose(state, {
        sourceId,
        chooser: action.chooser,
        options: [
          ...remaining.map((iceId) => ({
            id: `arrange:${slot.serverId}:${slot.index}:${iceId}`,
            label: `${nameFor(iceId, action.chooser)} → ${where}`,
            effect: fx.do({
              ...action,
              placed: [...placed, iceId],
            }),
          })),
          ...(keepRest
            ? [
                {
                  id: "arrange:keep-rest",
                  label: "Leave the rest where they are",
                  effect: fx.do({
                    ...action,
                    placed: [...placed, ...restInPlace],
                  }),
                },
              ]
            : []),
        ],
        logLine: `${source.title} — choose the ice for ${where}.`,
      });
      return { ok: true };
    }

    case "add_n_installed_runner_to_grip": {
      const n = Math.max(1, action.amount ?? 2);
      const targets = [...state.runner.installed];
      if (targets.length === 0) {
        log(
          state,
          `${source?.title ?? "Self-Growth Program"} — no installed Runner cards.`,
        );
        return { ok: true };
      }
      // Offer choosing up to n cards; if fewer exist, take all via sequential choices.
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `sgp:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: fx.do({
            kind: "add_n_installed_runner_to_grip_pick",
            cardId: id,
            remaining: n - 1,
          }),
        })),
        logLine: `${source?.title ?? "Self-Growth Program"} — add ${n} installed Runner card(s) to grip.`,
      });
      return { ok: true };
    }

    case "add_n_installed_runner_to_grip_pick": {
      addInstalledToGrip(state, action.cardId);
      log(
        state,
        `Add ${state.cards[action.cardId]?.title ?? action.cardId} to the grip.`,
      );
      const remaining = action.remaining ?? 0;
      if (remaining <= 0) return { ok: true };
      const targets = [...state.runner.installed];
      if (targets.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `sgp:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: fx.do({
            kind: "add_n_installed_runner_to_grip_pick",
            cardId: id,
            remaining: remaining - 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "may_move_miraju_archives_jack_out_derez": {
      const ice = state.cards[sourceId];
      if (ice?.rezzed) {
        ice.rezzed = false;
        log(state, `Mirāju — derez.`);
      }
      if (!state.run) return { ok: true };
      moveRunnerToOutermost(state, "archives");
      log(state, `Mirāju — Runner moves to outermost Archives.`);
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "jack-out",
            label: "Jack out",
            effect: fx.do({ kind: "end_the_run" }),
          },
          {
            id: "continue",
            label: "Continue the run",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "rearrange_ice_protecting_all_servers": {
      // Mandatory Seed Replacement: "rearrange any number of ice protecting
      // all servers". Arranging is repositioning among the current
      // positions, by swaps, so each server keeps its number of ice
      // (CR 8.3.1, 8.3.2).
      return evalEffect(
        ctx,
        fx.do({
          kind: "rearrange_ice",
          chooser: "corp",
          serverIds: Object.keys(state.servers) as ServerId[],
        }),
      );
    }

    case "choose_jua_two_bounce_one": {
      const installed = [...state.runner.installed];
      if (installed.length === 0) {
        log(state, `Jua — Runner has no installed cards.`);
        return { ok: true };
      }
      if (installed.length === 1) {
        // Choose the only card; Runner must bounce it.
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: [
            {
              id: `bounce:${installed[0]}`,
              label: `Add ${state.cards[installed[0]!]!.title} to top of stack`,
              effect: fx.do({
                kind: "resolve_jua_bounce",
                cardId: installed[0]!,
              }),
            },
          ],
        });
        return { ok: true };
      }
      // Corp chooses 2; then Runner picks which to bounce.
      const pairs: [string, string][] = [];
      for (let i = 0; i < installed.length; i++) {
        for (let j = i + 1; j < installed.length; j++) {
          pairs.push([installed[i]!, installed[j]!]);
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: pairs.map(([a, b]) => ({
          id: `pair:${a}:${b}`,
          label: `Choose ${state.cards[a]!.title} and ${state.cards[b]!.title}`,
          effect: fx.do({
            kind: "dtwn_jua_runner_pick_bounce",
            cardIds: [a, b],
          }),
        })),
      });
      return { ok: true };
    }

    case "dtwn_jua_runner_pick_bounce": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: action.cardIds.map((id) => ({
          id: `bounce:${id}`,
          label: `Add ${state.cards[id]!.title} to top of stack`,
          effect: fx.do({ kind: "resolve_jua_bounce", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "resolve_jua_bounce": {
      const id = action.cardId;
      if (!state.runner.installed.includes(id)) return { ok: true };
      const card = state.cards[id]!;
      uninstallCard(state, id, "deck-top", {
        logLine: `Jua — add ${card.title} to top of the stack.`,
      });
      return { ok: true };
    }

    case "dtwn_threat_assessment": {
      const installed = [...state.runner.installed];
      if (installed.length === 0) {
        log(state, `Threat Assessment — no installed Runner cards.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: installed.map((id) => ({
          id: `threat:${id}`,
          label: `Choose ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "resolve_threat_assessment", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "resolve_threat_assessment": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "tags",
            label: "Take 2 tags",
            effect: fx.do({ kind: "give_tags", amount: 2 }),
          },
          {
            id: "bounce",
            label: `Add ${state.cards[action.cardId]?.title ?? "card"} to top of stack`,
            effect: fx.do({
              kind: "resolve_jua_bounce",
              cardId: action.cardId,
            }),
          },
        ],
      });
      return { ok: true };
    }

    case "move_to_outermost": {
      const servers = Object.keys(state.servers) as ServerId[];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: servers.map((sid) => ({
          id: `builder:${sid}`,
          label: `Move Builder to outermost of ${sid}`,
          effect: fx.do({ kind: "move_to_server", serverId: sid }),
        })),
      });
      return { ok: true };
    }

    case "move_to_server": {
      const serverId = (action as { serverId: ServerId }).serverId;
      const from = serverIdForCard(state, sourceId);
      if (!from || !state.servers[serverId]) {
        return { ok: false, error: "Builder move invalid.", cites: [] };
      }
      moveIce(state, sourceId, serverId, "outermost");
      log(state, `Builder — move to outermost of ${serverId}.`);
      return { ok: true };
    }

    case "uninstall_program_or_hardware_to_grip": {
      const cands = state.runner.installed.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware";
      });
      if (cands.length === 0) {
        log(state, `Uninstall — no program/hardware installed.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `uninst:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: fx.do({ kind: "uninstall_to_grip", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "uninstall_to_grip": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.installed.includes(cardId)) {
        return {
          ok: false,
          error: "Uninstall target not installed.",
          cites: [],
        };
      }
      uninstallCard(state, cardId, "hand", {
        logLine: `Uninstall — ${card.title} to grip.`,
      });
      return { ok: true };
    }

    case "move_program_to_stack_top": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.installed.includes(cardId)) {
        log(state, `Brahman — program not installed.`);
        return { ok: true };
      }
      uninstallCard(state, cardId, "deck-top");
      log(state, `Brahman — add ${card.title} to the top of the stack.`);
      return { ok: true };
    }

    case "return_program": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.hostId !== sourceId) {
        return {
          ok: false,
          error: "London Library — program not hosted.",
          cites: [],
        };
      }
      // An installed program is uninstalled (CR 8.5.1b); one hosted
      // without being installed just moves (CR 1.13.12).
      if (!uninstallCard(state, cardId, "hand")) {
        unhostCard(state, cardId);
        removeCardFromCurrentZone(state, cardId);
        state.runner.hand.push(cardId);
        card.zone = "runner:grip";
        card.faceup = true;
      }
      log(state, `London Library — add ${card.title} to grip.`);
      return { ok: true };
    }
    case "redirect_omar_success": {
      const sid = action.serverId as "hq" | "rd";
      if (state.run && (sid === "hq" || sid === "rd")) {
        log(state, `Omar Keung — change attacked server to ${sid}.`);
        setAttackedServer(state.run, sid);
      }
      return { ok: true };
    }

    case "tdatd_amani_bounce": {
      const installed = installedRunnerCardIds(state);
      if (installed.length === 0) {
        log(state, `Amani Senai — no installed Runner card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: installed.map((id) => ({
          id: `amani:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: fx.do({
            kind: "add_installed_runner_card_to_grip",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "win_slipstream": {
      if (!state.run?.lastPassedRezzedIceId) {
        log(state, `Slipstream — no passed ice context.`);
        return { ok: true };
      }
      trashCard(state, sourceId);
      const passedId = state.run.lastPassedRezzedIceId;
      let passedPos = -1;
      let passedServer: import("../../state/types.js").ServerId | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        const idx = server.ice.indexOf(passedId);
        if (idx >= 0) {
          passedPos = idx;
          passedServer = sid as import("../../state/types.js").ServerId;
          break;
        }
      }
      if (passedPos < 0 || !passedServer) return { ok: true };
      const passedInward =
        state.servers[passedServer]!.ice.length - 1 - passedPos;
      const options: {
        id: string;
        label: string;
        effect: ReturnType<typeof fx.do>;
      }[] = [];
      for (const sid of ["hq", "rd", "archives"] as const) {
        if (sid === passedServer) continue;
        const iceRow = state.servers[sid]?.ice ?? [];
        const matchIndex = iceRow.length - 1 - passedInward;
        const iceId = iceRow[matchIndex];
        if (!iceId) continue;
        const ice = state.cards[iceId];
        if (!ice) continue;
        options.push({
          id: `slip:${iceId}`,
          label: `Move to ${ice.title} protecting ${sid}`,
          effect: fx.do({ kind: "move_slipstream", iceId, serverId: sid }),
        });
      }
      if (options.length === 0) {
        log(state, `Slipstream — no matching central ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
      });
      return { ok: true };
    }

    case "move_slipstream": {
      if (!state.run) return { ok: true };
      const serverId =
        action.serverId as import("../../state/types.js").ServerId;
      const server = state.servers[serverId];
      if (!server) return { ok: true };
      if (!moveRunnerToIce(state, action.iceId)) return { ok: true };
      state.run.encounter = {
        iceId: action.iceId,
        broken: (state.cards[action.iceId]?.subroutines ?? []).map(() => false),
      };
      log(
        state,
        `Slipstream — approach ${state.cards[action.iceId]?.title} on ${action.serverId}.`,
      );
      return { ok: true };
    }

    case "win_intake_bounce": {
      const targets = installedProgramsOrVirtualResources(state);
      if (targets.length === 0) {
        log(state, `Intake — no program or virtual resource.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        return evalEffect(
          ctx,
          fx.do({
            kind: "resolve_intake_bounce",
            cardId: targets[0]!,
          }),
        );
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `intake:${id}`,
          label: `Bounce ${state.cards[id]!.title} to grip`,
          effect: fx.do({ kind: "resolve_intake_bounce", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "resolve_intake_bounce": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      uninstallCard(state, action.cardId, "hand", {
        logLine: `Intake — add ${card.title} to grip.`,
      });
      return { ok: true };
    }
    case "add_fully_broken_barrier_to_hq": {
      const iceId = state.run?.encounter?.iceId;
      if (!iceId) return { ok: true };
      const ice = state.cards[iceId];
      if (!ice || !(ice.subtypes ?? []).includes("barrier")) {
        return { ok: true };
      }
      uninstallCard(state, iceId, "hand");
      log(state, `Ankusa — add fully broken barrier ${ice.title} to HQ.`);
      return { ok: true };
    }
    case "resolve_will_o_wisp": {
      // "You may trash this upgrade. If you do, choose 1 installed
      // icebreaker that was used to break at least 1 subroutine during this
      // run. The Runner adds that icebreaker to the bottom of the stack."
      // The trash comes first; with no such icebreaker it is still trashed
      // (CR 1.2.1).
      const up = state.cards[sourceId];
      if (!up?.zone.startsWith("server:")) {
        log(
          state,
          `Will-o'-the-Wisp is no longer installed, so it cannot be trashed.`,
        );
        return { ok: true };
      }
      trashCard(state, sourceId, { by: "corp" });
      const used = (state.run?.breakersThatBroke ?? []).filter(
        (id) =>
          state.runner.installed.includes(id) &&
          (state.cards[id]?.subtypes ?? []).includes("icebreaker"),
      );
      if (used.length === 0) {
        log(state, `Will-o'-the-Wisp — no icebreaker was used this run.`);
        return { ok: true };
      }
      if (used.length === 1) {
        return applyPrimitive(ctx, {
          kind: "resolve_will_o_wisp_breaker",
          cardId: used[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: used.map((id) => ({
          id: `wow-breaker:${id}`,
          label: `${state.cards[id]!.title} to the bottom of the stack`,
          effect: fx.do({
            kind: "resolve_will_o_wisp_breaker",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }
    case "resolve_will_o_wisp_breaker": {
      const cardId = (action as { cardId: string }).cardId;
      if (state.runner.installed.includes(cardId)) {
        uninstallCard(state, cardId, "deck-bottom");
        log(
          state,
          `Will-o'-the-Wisp — the Runner adds ${state.cards[cardId]!.title} to the bottom of the stack.`,
        );
      }
      return { ok: true };
    }

    case "redirect_resolve": {
      const serverId = action.serverId as ServerId | undefined;
      if (!state.run || !serverId || !state.servers[serverId]) {
        log(state, `Mind Game — invalid redirect.`);
        return { ok: true };
      }
      // "The Runner moves to the outermost position of that server"
      // (CR 6.2.8b): no position, not −1, when it has no ice.
      const moved = moveRunnerToOutermost(state, serverId);
      (
        state.run as {
          jackOutAdditionalCostAddInstalledToStackBottom?: boolean;
        }
      ).jackOutAdditionalCostAddInstalledToStackBottom = true;
      log(
        state,
        moved
          ? `Mind Game — move to outermost of ${serverId}; jack out costs +1 installed to stack bottom.`
          : `Mind Game — the Runner cannot move to a position now (CR ${CR.ineffectiveMove.number}); jack out costs +1 installed to stack bottom.`,
      );
      return evalEffect(ctx, fx.do({ kind: "offer_jack_out" }));
    }
    case "redirect_susanoo_to_archives": {
      if (!state.run || state.run.attackedServerId === "archives") {
        return { ok: true };
      }
      // The Runner's position becomes Archives' outermost (CR 6.2.8b).
      moveRunnerToOutermost(state, "archives");
      log(state, `Susanoo-no-Mikoto — Runner moves to outermost Archives.`);
      return { ok: true };
    }

    case "add_installed_non_virtual_runner_to_grip": {
      const targets = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        return c && !(c.subtypes ?? []).includes("virtual");
      });
      if (targets.length === 0) {
        log(state, `Hatchet Job — no installed non-virtual Runner card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `grip:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: fx.do({
            kind: "add_installed_runner_card_to_grip",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "return_to_stack": {
      for (const id of action.cardIds ?? []) {
        const card = state.cards[id];
        if (!card) continue;
        card.zone = "runner:stack";
        unhostCard(state, card.id);
        state.runner.deck.push(id);
      }
      return { ok: true };
    }

    case "add_installed_to_hq": {
      const installed = installedCorpCards(state);
      if (installed.length === 0) {
        log(state, `Replanting — no installed card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: installed.map((id) => ({
          id: `hq:${id}`,
          label: `Add ${state.cards[id]!.title} to HQ`,
          effect: fx.do({ kind: "move_to_hq", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "move_to_hq": {
      const cardId = action.cardId;
      if (!cardId || !state.cards[cardId]) return { ok: true };
      const card = state.cards[cardId]!;
      if (uninstallCard(state, cardId, "hand")) {
        log(state, `Replanting — add ${card.title} to HQ.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, cardId);
      card.zone = "corp:hq";
      card.rezzed = false;
      card.faceup = false;
      unhostCard(state, card.id);
      card.advancementCounters = 0;
      state.corp.hand.push(cardId);
      log(state, `Replanting — add ${card.title} to HQ.`);
      return { ok: true };
    }

    case "move_source_upgrade_to_another_server_root": {
      if (source?.type !== "upgrade") {
        log(state, `Move upgrade — source is not an upgrade.`);
        return { ok: true };
      }
      const zone = source.zone ?? "";
      if (!zone.endsWith(":root")) {
        log(state, `Move upgrade — source not in a server root.`);
        return { ok: true };
      }
      const currentSid = zone
        .replace(/^server:/, "")
        .replace(/:root$/, "") as ServerId;
      const targets = (Object.keys(state.servers) as ServerId[]).filter(
        (sid) => sid !== currentSid,
      );
      if (targets.length === 0) {
        log(state, `Move upgrade — no other servers.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((sid) => ({
          id: `move-root:${sid}`,
          label: `Move to ${sid} root`,
          effect: fx.do({ kind: "move_upgrade_to_server_root", serverId: sid }),
        })),
      });
      return { ok: true };
    }

    case "redirect_aginfusion_resolve": {
      const run = state.run;
      const sid = action.serverId as ServerId | undefined;
      if (!run || !sid || !state.servers[sid]) {
        log(state, `AgInfusion — invalid redirect server.`);
        return { ok: true };
      }
      // "The Runner moves to the outermost position of that server and
      // encounters any ice there" (CR 6.2.8b). Index 0 is outermost.
      if (!moveRunnerToOutermost(state, sid)) return { ok: true };
      run.encounter = null;
      const outer = state.servers[sid]!.ice[0];
      if (outer) {
        run.forceEncounterIceId = outer;
        // Unrezzed ice is not named: the log goes to both players (CR 1.21.1).
        const ice = state.cards[outer];
        log(
          state,
          `AgInfusion — Runner moves to outermost of ${sid} (${ice?.rezzed ? ice.title : "unrezzed ice"}).`,
        );
      } else {
        log(state, `AgInfusion — Runner moves to ${sid} (no ice).`);
      }
      return { ok: true };
    }
    default:
      return null;
  }
}
