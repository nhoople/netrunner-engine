/**
 * Primitive kinds whose procedure is move.
 * The effect switch in eval.ts dispatches here.
 */
import type {
  EffectCtx,
  EvalResult,
} from "../eval.js";
import type { Primitive } from "../ir.js";
import { serverIdForIce } from "../../cards/stubs.js";
import { log } from "../../state/createGame.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import { CR } from "../../timing/labels.js";
import { applyPrimitive } from "../eval.js";

import {
  fireOnMovedToServerRoot,
} from "../eval.js";

export function applyMoveKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "move_unrezzed_ice_to_hq": {
      const iceId = action.iceId;
      const ice = state.cards[iceId];
      if (!ice || ice.type !== "ice") return { ok: true };
      const sid = serverIdForIce(state, iceId);
      if (sid) {
        state.servers[sid].ice = state.servers[sid].ice.filter((id) => id !== iceId);
      }
      ice.rezzed = false;
      ice.zone = "corp:hq";
      ice.faceup = false;
      state.corp.hand.push(iceId);
      log(state, `Add ${ice.title} to HQ.`);
      return { ok: true };
    }

case "move_runner_to_outermost_attacked": {
      if (!state.run) {
        log(state, `Move to outermost attacked — no active run.`);
        return { ok: true };
      }
      if (state.run.successful === true) {
        log(
          state,
          `Runner has no position during the Success Phase and does not move (CR ${CR.noPositionAfterApproach.number}).`,
        );
        return { ok: true };
      }
      const sid = state.run.attackedServerId;
      const server = state.servers[sid];
      if (!server) {
        log(state, `Move to outermost attacked — unknown server.`);
        return { ok: true };
      }
      if (server.ice.length > 0) {
        state.run.position = 0;
        state.log.push(
          `Runner moves to outermost ice protecting ${sid}.`,
        );
      } else {
        state.run.position = null;
        state.log.push(`Runner moves to ${sid} (no ice).`);
      }
      return { ok: true };
    }

case "move_advancements": {
      const sources = Object.values(state.cards).filter(
        (c) =>
          (c.advancementCounters ?? 0) > 0 &&
          (c.zone.endsWith(":root") || c.zone.endsWith(":ice")),
      );
      const dests = Object.values(state.cards).filter(
        (c) =>
          (c.type === "agenda" ||
            c.type === "asset" ||
            c.type === "ice" ||
            c.canAdvance) &&
          (c.zone.endsWith(":root") || c.zone.endsWith(":ice")),
      );
      if (sources.length === 0 || dests.length < 2) {
        log(state, `Move advancements — no valid source/dest.`);
        return { ok: true };
      }
      const from = sources[0]!;
      const to = dests.find((c) => c.id !== from.id);
      if (!to) {
        log(state, `Move advancements — no destination.`);
        return { ok: true };
      }
      const move = Math.min(action.amount, from.advancementCounters ?? 0);
      from.advancementCounters = (from.advancementCounters ?? 0) - move;
      to.advancementCounters = (to.advancementCounters ?? 0) + move;
      log(
        state,
        `Move ${move} advancement(s) from ${from.title} to ${to.title}.`,
      );
      return { ok: true };
    }

case "move_runner_to_archives_outermost": {
      if (!state.run) {
        log(state, `Move to Archives outermost — no active run.`);
        return { ok: true };
      }
      state.run.attackedServerId = "archives";
      const arch = state.servers.archives;
      if (arch.ice.length > 0) {
        state.run.position = 0;
        state.log.push(
          `Runner moves to outermost Archives ice (Proprionegation).`,
        );
      } else {
        state.run.position = null;
        state.log.push(`Runner moves to Archives (no ice).`);
      }
      return { ok: true };
    }

case "may_move_source_upgrade_to_another_server_root": {
      if (source.type !== "upgrade") {
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
        .replace(/:root$/, "") as import("../../state/types.js").ServerId;
      const targets = (
        Object.keys(state.servers) as import("../../state/types.js").ServerId[]
      ).filter((sid) => sid !== currentSid);
      if (targets.length === 0) {
        log(state, `Move upgrade — no other servers.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...targets.map((sid) => ({
            id: `move-root:${sid}`,
            label: `Move to ${sid} root`,
            effect: {
              op: "do" as const,
              action: {
                kind: "move_upgrade_to_server_root" as const,
                serverId: sid,
              },
            },
          })),
        ],
logLine: `May move ${source.title} to another server root.`,
});
      return { ok: true };
    }

case "move_upgrade_to_server_root": {
      const destId = action.serverId as import("../../state/types.js").ServerId;
      const dest = state.servers[destId];
      if (!dest || source.type !== "upgrade") {
        log(state, `Move upgrade — invalid destination.`);
        return { ok: true };
      }
      const zone = source.zone ?? "";
      if (!zone.endsWith(":root")) {
        log(state, `Move upgrade — source not in root.`);
        return { ok: true };
      }
      const fromSid = zone
        .replace(/^server:/, "")
        .replace(/:root$/, "") as import("../../state/types.js").ServerId;
      const from = state.servers[fromSid];
      if (from) {
        from.root = from.root.filter((id) => id !== sourceId);
      }
      dest.root.push(sourceId);
      source.zone = `server:${destId}:root`;
      log(
        state,
        `Move ${source.title} from ${fromSid} to ${destId} root.`,
      );
      fireOnMovedToServerRoot(state, sourceId);
      return { ok: true };
    }

case "may_move_rezzed_upgrade_to_another_server_root": {
      const upgrades: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          const c = state.cards[id];
          if (c?.type === "upgrade" && c.rezzed) upgrades.push(id);
        }
      }
      if (upgrades.length === 0) {
        log(state, `${source.title} — no rezzed upgrades to move.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: upgrades.map((id) => ({
          id: `pick-upgrade:${id}`,
          label: `Move ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "may_move_picked_rezzed_upgrade" as const,
              cardId: id,
            },
          },
        })),
logLine: `${source.title} — choose a rezzed upgrade to move.`,
});
      return { ok: true };
    }

case "may_move_picked_rezzed_upgrade": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "upgrade" || !card.rezzed) {
        log(state, `Move upgrade — target unavailable.`);
        return { ok: true };
      }
      const zone = card.zone ?? "";
      if (!zone.startsWith("server:") || !zone.endsWith(":root")) {
        log(state, `Move upgrade — not in a server root.`);
        return { ok: true };
      }
      const currentSid = zone
        .replace(/^server:/, "")
        .replace(/:root$/, "") as import("../../state/types.js").ServerId;
      const targets = (
        Object.keys(state.servers) as import("../../state/types.js").ServerId[]
      ).filter((sid) => sid !== currentSid);
      if (targets.length === 0) {
        log(state, `Move upgrade — no other servers.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((sid) => ({
          id: `move-rezzed:${action.cardId}:${sid}`,
          label: `Move ${card.title} to ${sid} root`,
          effect: {
            op: "do" as const,
            action: {
              kind: "move_rezzed_upgrade_to_server_root" as const,
              cardId: action.cardId,
              serverId: sid,
            },
          },
        })),
logLine: `Choose destination for ${card.title}.`,
});
      return { ok: true };
    }

case "move_rezzed_upgrade_to_server_root": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      const zone = card.zone ?? "";
      if (!zone.startsWith("server:") || !zone.endsWith(":root")) {
        return { ok: true };
      }
      const fromSid = zone
        .replace(/^server:/, "")
        .replace(/:root$/, "") as import("../../state/types.js").ServerId;
      const from = state.servers[fromSid];
      const to = state.servers[action.serverId as import("../../state/types.js").ServerId];
      if (!from || !to) return { ok: true };
      from.root = from.root.filter((id) => id !== action.cardId);
      to.root.push(action.cardId);
      card.zone = `server:${action.serverId}:root`;
      log(state, `Moved ${card.title} to ${action.serverId} root.`);
      return { ok: true };
    }

case "move_runner_card_to_stack_top": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.installed.includes(cardId)) {
        log(state, `move_runner_card_to_stack_top — not installed.`);
        return { ok: true };
      }
      state.runner.installed = state.runner.installed.filter((id) => id !== cardId);
      state.runner.deck.unshift(cardId);
      card.zone = "runner:stack";
      card.faceup = false;
      log(state, `Add ${card.title} to the top of the stack.`);
      return { ok: true };
    }

case "move_source_ice_to_outermost_attacked": {
      if (!state.run || source.type !== "ice") {
        log(state, `Move ice outermost — no run or source is not ice.`);
        return { ok: true };
      }
      const attacked = state.run.attackedServerId;
      let fromServer: import("../../state/types.js").Server | null = null;
      for (const server of Object.values(state.servers)) {
        if (server.ice.includes(sourceId)) {
          fromServer = server;
          break;
        }
      }
      if (!fromServer) {
        log(state, `Move ice outermost — source not installed as ice.`);
        return { ok: true };
      }
      const toServer = state.servers[attacked];
      if (!toServer) return { ok: true };
      fromServer.ice = fromServer.ice.filter((id) => id !== sourceId);
      toServer.ice.unshift(sourceId);
      source.zone = `server:${attacked}:ice`;
      state.run.position = 0;
      log(
        state,
        `Move ${source.title} to outermost protecting ${attacked}.`,
      );
      return { ok: true };
    }

case "move_source_ice_to_outermost_another_server_continue_run": {
      if (!state.run || source.type !== "ice") {
        log(state, `Bullfrog move — no run or source is not ice.`);
        return { ok: true };
      }
      let fromSid: string | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.ice.includes(sourceId)) {
          fromSid = sid;
          break;
        }
      }
      if (!fromSid) {
        log(state, `Bullfrog move — source not installed as ice.`);
        return { ok: true };
      }
      const targets = Object.keys(state.servers).filter((sid) => sid !== fromSid);
      if (targets.length === 0) {
        log(state, `Bullfrog move — no other servers.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        return applyPrimitive(ctx, {
          kind: "move_source_ice_to_outermost_server_continue_run",
          serverId: targets[0]! as import("../../state/types.js").ServerId,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((sid) => ({
          id: `bullfrog:${sid}`,
          label: `Move to outermost protecting ${sid}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "move_source_ice_to_outermost_server_continue_run" as const,
              serverId: sid as import("../../state/types.js").ServerId,
            },
          },
        })),
logLine: `${source.title} — choose another server to move to.`,
});
      return { ok: true };
    }

case "move_source_ice_to_outermost_server_continue_run": {
      if (!state.run || source.type !== "ice") {
        log(state, `Bullfrog move leaf — no run or source is not ice.`);
        return { ok: true };
      }
      let fromServer: import("../../state/types.js").Server | null = null;
      for (const server of Object.values(state.servers)) {
        if (server.ice.includes(sourceId)) {
          fromServer = server;
          break;
        }
      }
      if (!fromServer) {
        log(state, `Bullfrog move leaf — source not installed.`);
        return { ok: true };
      }
      const toSid = action.serverId as import("../../state/types.js").ServerId;
      const toServer = state.servers[toSid];
      if (!toServer) {
        log(state, `Bullfrog move leaf — unknown server ${toSid}.`);
        return { ok: true };
      }
      fromServer.ice = fromServer.ice.filter((id) => id !== sourceId);
      toServer.ice.unshift(sourceId);
      source.zone = `server:${toSid}:ice`;
      state.run.attackedServerId =
        toSid as import("../../state/types.js").ServerId;
      state.run.position = 0;
      log(
        state,
        `Move ${source.title} to outermost protecting ${toSid}; run continues.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
