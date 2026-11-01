/**
 * Primitive kinds whose procedure is swap.
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
import { occurCheckpoint } from "../../legality/checkpoints.js";
import { commitCheckpointSnapshot } from "../../state/checkpointSnapshot.js";
import { log } from "../../state/createGame.js";
import { fireOnFirstRemoteInstallThisTurn } from "../../state/miscConditionalHooks.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import { releaseHostedCardsOnTrash } from "../../state/trashHooks.js";
import { CR } from "../../timing/labels.js";
import {
  evalEffect,
  applyPrimitive,
} from "../eval.js";

export function applySwapKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "may_swap_approached_ice_with_hq": {
      const run = state.run;
      if (!run || run.position === null) {
        log(state, `Midori — no approached ice.`);
        return { ok: true };
      }
      const approachedId =
        state.servers[run.attackedServerId]?.ice[run.position];
      if (!approachedId) {
        log(state, `Midori — no approached ice.`);
        return { ok: true };
      }
      const hqIce = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
        ...hqIce.map((iceId) => ({
          id: iceId,
          label: `Swap with ${state.cards[iceId]!.title} from HQ`,
          effect: {
            op: "do" as const,
            action: {
              kind: "swap_approached_ice_with_hq" as const,
              replacementIceId: iceId,
            },
          },
        })),
      ];
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `Midori — may swap approached ice with ice from HQ.`,
});
      return { ok: true };
    }

case "swap_approached_ice_with_hq": {
      const run = state.run;
      if (!run || run.position === null) {
        log(state, `Midori swap — no run.`);
        return { ok: true };
      }
      const serverId = run.attackedServerId;
      const approachedId = state.servers[serverId]?.ice[run.position];
      const replacementId = action.replacementIceId;
      const replacement = state.cards[replacementId];
      const approached = approachedId ? state.cards[approachedId] : undefined;
      if (
        !approachedId ||
        !approached ||
        !replacement ||
        replacement.type !== "ice" ||
        !state.corp.hand.includes(replacementId)
      ) {
        log(state, `Midori swap — invalid ice.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== replacementId);
      state.servers[serverId]!.ice[run.position!] = replacementId;
      replacement.zone = `server:${serverId}:ice`;
      replacement.rezzed = false;
      replacement.faceup = false;
      state.corp.hand.push(approachedId);
      approached.zone = "corp:hq";
      approached.rezzed = false;
      log(
        state,
        `Midori — swap ${approached.title} with ${replacement.title} from HQ (unrezzed).`,
      );
      return applyPrimitive(ctx, { kind: "offer_jack_out" });
    }

case "swap_yagi_hq_with_attacked_root_or_ice": {
      if (!state.run) {
        log(state, `Yagi swap — not during a run.`);
        return { ok: true };
      }
      const sid = state.run.attackedServerId;
      const server = state.servers[sid];
      if (!server) {
        log(state, `Yagi swap — attacked server missing.`);
        return { ok: true };
      }
      const hq = [...state.corp.hand];
      const targets = [...server.root, ...server.ice];
      if (hq.length === 0 || targets.length === 0) {
        log(state, `Yagi swap — need HQ card and attacked root/ice.`);
        return { ok: true };
      }
      const options: import("../ir.js").ChoiceOption[] = [];
      for (const hqId of hq) {
        for (const srvId of targets) {
          options.push({
            id: `yagi:${hqId}:${srvId}`,
            label: `Swap ${state.cards[hqId]!.title} (HQ) with ${state.cards[srvId]!.title}`,
            effect: {
              op: "do",
              action: {
                kind: "swap_yagi_hq_with_attacked_pick",
                hqCardId: hqId,
                serverCardId: srvId,
              },
            },
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — swap HQ with attacked root/ice.`,
});
      return { ok: true };
    }

case "swap_yagi_hq_with_attacked_pick": {
      if (!state.run) {
        log(state, `Yagi swap pick — not during a run.`);
        return { ok: true };
      }
      const hqId = action.hqCardId;
      const srvId = action.serverCardId;
      const hqCard = state.cards[hqId];
      const srvCard = state.cards[srvId];
      const sid = state.run.attackedServerId;
      const server = state.servers[sid];
      if (
        !hqCard ||
        !srvCard ||
        !server ||
        !state.corp.hand.includes(hqId) ||
        (!server.root.includes(srvId) && !server.ice.includes(srvId))
      ) {
        log(state, `Yagi swap pick — invalid targets.`);
        return { ok: true };
      }
      const wasIce = server.ice.includes(srvId);
      const iceIdx = wasIce ? server.ice.indexOf(srvId) : -1;
      const rootIdx = !wasIce ? server.root.indexOf(srvId) : -1;
      state.corp.hand = state.corp.hand.filter((id) => id !== hqId);
      if (wasIce) {
        server.ice[iceIdx] = hqId;
        hqCard.zone = `server:${sid}:ice`;
      } else {
        server.root[rootIdx] = hqId;
        hqCard.zone = `server:${sid}:root`;
      }
      hqCard.rezzed = false;
      hqCard.faceup = false;
      state.corp.hand.push(srvId);
      srvCard.zone = "corp:hq";
      srvCard.rezzed = false;
      srvCard.faceup = false;
      log(
        state,
        `Swap ${hqCard.title} from HQ with ${srvCard.title} on ${sid}. The Runner stays in position (CR ${CR.iceChangeDuringMovement.number}).`,
      );
      return { ok: true };
    }

case "swap_this_root_with_other_root_or_hq": {
      if (!state.run) {
        log(state, `Daruma swap — not during a run.`);
        return { ok: true };
      }
      const sid = state.run.attackedServerId;
      const server = state.servers[sid];
      if (!server) {
        log(state, `Daruma swap — approached server missing.`);
        return { ok: true };
      }
      const thisRoot = [...server.root];
      if (thisRoot.length === 0) {
        log(state, `Daruma swap — no cards in this server root.`);
        return { ok: true };
      }
      const otherTargets: string[] = [];
      for (const [oid, srv] of Object.entries(state.servers)) {
        if (oid === sid) continue;
        for (const id of srv.root) otherTargets.push(id);
      }
      for (const id of state.corp.hand) {
        const c = state.cards[id];
        if (!c) continue;
        if (c.type === "agenda" || c.type === "asset" || c.type === "upgrade") {
          otherTargets.push(id);
        }
      }
      if (otherTargets.length === 0) {
        log(state, `Daruma swap — no other root or HQ targets.`);
        return { ok: true };
      }
      const options: import("../ir.js").ChoiceOption[] = [];
      for (const rootId of thisRoot) {
        for (const otherId of otherTargets) {
          options.push({
            id: `daruma:${rootId}:${otherId}`,
            label: `Swap ${state.cards[rootId]!.title} with ${state.cards[otherId]!.title}`,
            effect: {
              op: "do",
              action: {
                kind: "swap_pick",
                thisRootCardId: rootId,
                otherCardId: otherId,
                ...(action.onSuccess ? { onSuccess: action.onSuccess } : {}),
              },
            },
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — swap this root with other root or HQ.`,
});
      return { ok: true };
    }

case "swap_pick": {
      if (!state.run) {
        log(state, `Daruma swap pick — not during a run.`);
        return { ok: true };
      }
      const thisId = action.thisRootCardId;
      const otherId = action.otherCardId;
      const thisCard = state.cards[thisId];
      const otherCard = state.cards[otherId];
      const sid = state.run.attackedServerId;
      const thisServer = state.servers[sid];
      if (
        !thisCard ||
        !otherCard ||
        !thisServer ||
        !thisServer.root.includes(thisId)
      ) {
        log(state, `Daruma swap pick — invalid this-root card.`);
        return { ok: true };
      }
      const thisRootIdx = thisServer.root.indexOf(thisId);
      const otherInHq = state.corp.hand.includes(otherId);
      let otherServerId: string | null = null;
      let otherRootIdx = -1;
      if (!otherInHq) {
        for (const [oid, srv] of Object.entries(state.servers)) {
          const idx = srv.root.indexOf(otherId);
          if (idx >= 0) {
            otherServerId = oid;
            otherRootIdx = idx;
            break;
          }
        }
        if (!otherServerId) {
          log(state, `Daruma swap pick — other card not in root or HQ.`);
          return { ok: true };
        }
      } else if (
        otherCard.type !== "agenda" &&
        otherCard.type !== "asset" &&
        otherCard.type !== "upgrade"
      ) {
        log(state, `Daruma swap pick — HQ target must be agenda/asset/upgrade.`);
        return { ok: true };
      }

      thisServer.root.splice(thisRootIdx, 1);
      if (otherInHq) {
        state.corp.hand = state.corp.hand.filter((id) => id !== otherId);
        thisServer.root.splice(thisRootIdx, 0, otherId);
        otherCard.zone = `server:${sid}:root`;
        otherCard.rezzed = false;
        otherCard.faceup = false;
        state.corp.hand.push(thisId);
        thisCard.zone = "corp:hq";
        thisCard.rezzed = false;
        thisCard.faceup = false;
        log(
          state,
          `Daruma swap ${thisCard.title} (root) with ${otherCard.title} (HQ).`,
        );
      } else {
        const otherSid = otherServerId as import("../../state/types.js").ServerId;
        const otherSrv = state.servers[otherSid]!;
        otherSrv.root.splice(otherRootIdx, 1);
        thisServer.root.splice(thisRootIdx, 0, otherId);
        otherCard.zone = `server:${sid}:root`;
        otherSrv.root.splice(otherRootIdx, 0, thisId);
        thisCard.zone = `server:${otherSid}:root`;
        log(
          state,
          `Daruma swap ${thisCard.title} (${sid}) with ${otherCard.title} (${otherSid}).`,
        );
      }
      if (action.onSuccess) {
        return evalEffect({ state, sourceId }, action.onSuccess);
      }
      return { ok: true };
    }

case "swap_two_ice": {
      const allIce: string[] = [];
      for (const server of Object.values(state.servers)) {
        allIce.push(...server.ice);
      }
      if (allIce.length < 2) {
        log(state, `Swap ice — fewer than 2 ice installed.`);
        return { ok: true };
      }
      const options: Array<{
        id: string;
        label: string;
        effect: Effect;
      }> = [
        {
          id: "decline",
          label: "Decline to swap ice",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      // Offer swap of first with each other ice (bounded).
      const a = allIce[0]!;
      for (let i = 1; i < allIce.length; i++) {
        const b = allIce[i]!;
        options.push({
          id: `swap-${a}-${b}`,
          label: `Swap ${state.cards[a].title} with ${state.cards[b].title}`,
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
logLine: `Tāo Salonga — may swap two ice.`,
});
      return { ok: true };
    }

case "swap_ice_with_hq": {
      let serverId: import("../../state/types.js").ServerId | null = null;
      let iceIndex = -1;
      for (const server of Object.values(state.servers)) {
        const idx = server.ice.indexOf(sourceId);
        if (idx >= 0) {
          serverId = server.id;
          iceIndex = idx;
          break;
        }
      }
      if (!serverId || iceIndex < 0) {
        log(state, `Swap ice with HQ — ${source.title} not installed as ice.`);
        return { ok: true };
      }
      const hqIce = state.corp.hand.find(
        (id) => state.cards[id]?.type === "ice",
      );
      if (!hqIce) {
        log(state, `Swap ice with HQ — no ice in HQ.`);
        return { ok: true };
      }
      const incoming = state.cards[hqIce];
      const outgoingTitle = source.title;
      const hosted = new Set<string>(source.hostedCardIds ?? []);
      for (const [id, card] of Object.entries(state.cards)) {
        if (card.hostId === sourceId) hosted.add(id);
      }
      for (const id of hosted) {
        const card = state.cards[id];
        if (!card) continue;
        log(
          state,
          `${card.title} trashed (CR ${CR.swapBecomeInstalled.number}).`,
        );
      }
      releaseHostedCardsOnTrash(state, sourceId);
      const hostedCounters =
        (source.advancementCounters ?? 0) +
        (source.virusCounters ?? 0) +
        (source.powerCounters ?? 0) +
        (source.hostedCredits ?? 0);
      if (hostedCounters > 0) {
        source.advancementCounters = 0;
        source.virusCounters = 0;
        source.powerCounters = 0;
        source.hostedCredits = 0;
        log(
          state,
          `${hostedCounters} hosted counter(s) trashed (CR ${CR.swapBecomeInstalled.number}).`,
        );
      }
      // Baseline so 10.3.1a can see the zone change (CR 8.8.4b).
      if (!state.previousCheckpointSnapshot) {
        commitCheckpointSnapshot(state, null);
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== hqIce);
      // Replace in-place so position is preserved; move outgoing to HQ.
      state.servers[serverId]!.ice[iceIndex] = hqIce;
      incoming.zone = `server:${serverId}:ice`;
      incoming.rezzed = false;
      incoming.faceup = false;
      state.corp.hand.push(sourceId);
      source.zone = "corp:hq";
      source.rezzed = false;
      source.faceup = false;
      const gain = action.gainCredits ?? 0;
      log(state, `Swap ${outgoingTitle} with ${incoming.title} from HQ.`);
      // Install and uninstall conditions are met at the next checkpoint,
      // before the rest of this ability (CR 8.8.4b). Zone diff at 10.3.1a
      // marks first-remote-install when the incoming card landed on a remote.
      occurCheckpoint(
        state,
        "instruction",
        "Swap",
        [CR.swapBecomeInstalled],
        sourceId,
      );
      {
        const swapPending = state.pendingAbilities.find(
          (p) =>
            p.status === "pending" &&
            p.payload?.kind === "swap_install_trigger",
        );
        if (swapPending) {
          state.turn.firstRemoteInstallThisTurnUsed = true;
          swapPending.status = "resolving";
          swapPending.independentOfSource = true;
          const idCard = state.cards[state.corp.identityId];
          if (idCard?.onFirstRemoteInstallThisTurn) {
            fireOnFirstRemoteInstallThisTurn(state, idCard.id);
            if (state.pendingChoice) return { ok: true };
          }
          swapPending.status = "done";
          state.pendingAbilities = state.pendingAbilities.filter(
            (p) =>
              p.status === "pending" ||
              p.status === "imminent" ||
              p.status === "resolving",
          );
        }
      }
      if (state.pendingChoice && gain > 0) {
        state.turn.pendingSwapContinuationCredits = gain;
        return { ok: true };
      }
      if (gain > 0) {
        state.corp.credits += gain;
        log(state, `Corp gains ${gain}¢.`);
      }
      return { ok: true };
    }

case "swap_approached_ice_with_hq_or_archives": {
      const run = state.run;
      if (!run || run.position === null) {
        log(state, `Swap approached ice — no run.`);
        return { ok: true };
      }
      const serverId = run.attackedServerId;
      const approachedId = state.servers[serverId]?.ice[run.position];
      const replacementId = action.replacementIceId;
      const replacement = state.cards[replacementId];
      const approached = approachedId ? state.cards[approachedId] : undefined;
      if (
        !approachedId ||
        !approached ||
        !replacement ||
        replacement.type !== "ice"
      ) {
        log(state, `Swap approached ice — invalid ice.`);
        return { ok: true };
      }
      const fromHq = state.corp.hand.includes(replacementId);
      const fromArchives = state.corp.discardPile.includes(replacementId);
      if (!fromHq && !fromArchives) {
        log(state, `Swap approached ice — replacement not in HQ/Archives.`);
        return { ok: true };
      }
      const visibleToRunner = Boolean(approached.rezzed || approached.faceup);
      if (fromHq) {
        state.corp.hand = state.corp.hand.filter((id) => id !== replacementId);
      } else {
        state.corp.discardPile = state.corp.discardPile.filter(
          (id) => id !== replacementId,
        );
      }
      state.servers[serverId]!.ice[run.position!] = replacementId;
      replacement.zone = `server:${serverId}:ice`;
      replacement.rezzed = false;
      replacement.faceup = false;
      if (fromHq) {
        state.corp.hand.push(approachedId);
        approached.zone = "corp:hq";
        approached.rezzed = false;
      } else {
        state.corp.discardPile.push(approachedId);
        approached.zone = "corp:archives";
        approached.rezzed = false;
        approached.faceup = visibleToRunner;
        log(
          state,
          visibleToRunner
            ? `${approached.title} enters Archives faceup (CR ${CR.swapIntoZone.number}).`
            : `A card enters Archives facedown (CR ${CR.swapIntoZone.number}).`,
        );
      }
      log(
        state,
        `Swap approached ${approached.title} with ${replacement.title}.`,
      );
      return { ok: true };
    }

case "swap_source_ice_with_other": {
      let sourceServerId: import("../../state/types.js").ServerId | null = null;
      let sourceIdx = -1;
      const others: string[] = [];
      for (const server of Object.values(state.servers)) {
        const idx = server.ice.indexOf(sourceId);
        if (idx >= 0) {
          sourceServerId = server.id;
          sourceIdx = idx;
        }
        for (const id of server.ice) {
          if (id !== sourceId) others.push(id);
        }
      }
      if (!sourceServerId || sourceIdx < 0) {
        log(state, `Swap source ice — ${source.title} not installed as ice.`);
        return { ok: true };
      }
      if (others.length === 0) {
        log(state, `Swap source ice — no other installed ice.`);
        return { ok: true };
      }
      if (others.length === 1) {
        return applyPrimitive(ctx, {
          kind: "swap_two_installed_ice",
          otherIceId: others[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: others.map((id) => ({
          id: `swap-ice:${id}`,
          label: `Swap with ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "swap_two_installed_ice" as const,
              otherIceId: id,
            },
          },
        })),
logLine: `${source.title} — choose another ice to swap with.`,
});
      return { ok: true };
    }

case "may_swap_ice_with_other_installed": {
      const others: string[] = [];
      let installed = false;
      for (const server of Object.values(state.servers)) {
        if (server.ice.includes(sourceId)) installed = true;
        for (const id of server.ice) {
          if (id !== sourceId) others.push(id);
        }
      }
      if (!installed) {
        log(state, `May swap ice — source not installed as ice.`);
        return { ok: true };
      }
      if (others.length === 0) {
        log(state, `May swap ice — no other installed ice.`);
        return { ok: true };
      }
      const chooser = source.side === "corp" ? "corp" : "runner";
      openPendingChoose(state, {
        sourceId,
        chooser,
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: chooser,
                amount: 0,
              },
            },
          },
          ...others.map((id) => ({
            id: `swap-ice:${id}`,
            label: `Swap with ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "swap_two_installed_ice" as const,
                otherIceId: id,
              },
            },
          })),
        ],
logLine: `May swap ${source.title} with another installed ice.`,
});
      return { ok: true };
    }

case "may_swap_protecting_attacked_ice_with_other_installed": {
      const sid = state.run?.attackedServerId;
      if (!sid) {
        log(state, `May swap protecting ice — no attacked server.`);
        return { ok: true };
      }
      const protecting = [...(state.servers[sid]?.ice ?? [])];
      const allIce: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) allIce.push(id);
      }
      const eligibleProtecting = protecting.filter((pid) =>
        allIce.some((oid) => oid !== pid),
      );
      if (eligibleProtecting.length === 0) {
        log(
          state,
          `May swap protecting ice — no eligible pair (protecting + other).`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
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
          ...eligibleProtecting.map((pid) => ({
            id: `swap-protecting:${pid}`,
            label: `Swap ${state.cards[pid]!.title} (protecting)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "swap_protecting_attacked_ice_pick_other" as const,
                protectingIceId: pid,
              },
            },
          })),
        ],
logLine: `${source.title} — may swap ice protecting attacked server with another installed ice.`,
});
      return { ok: true };
    }

case "swap_protecting_attacked_ice_pick_other": {
      const protectingIceId = action.protectingIceId;
      const others: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (id !== protectingIceId) others.push(id);
        }
      }
      if (others.length === 0) {
        log(state, `Swap protecting ice — no other installed ice.`);
        return { ok: true };
      }
      if (others.length === 1) {
        return applyPrimitive(ctx, {
          kind: "swap_protecting_attacked_ice_with",
          protectingIceId,
          otherIceId: others[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: others.map((id) => ({
          id: `swap-other:${id}`,
          label: `Swap with ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "swap_protecting_attacked_ice_with" as const,
              protectingIceId,
              otherIceId: id,
            },
          },
        })),
logLine: `Choose another installed ice to swap with ${state.cards[protectingIceId]?.title ?? protectingIceId}.`,
});
      return { ok: true };
    }

case "swap_protecting_attacked_ice_with": {
      let aServer: import("../../state/types.js").ServerId | null = null;
      let aIdx = -1;
      let bServer: import("../../state/types.js").ServerId | null = null;
      let bIdx = -1;
      for (const server of Object.values(state.servers)) {
        const ia = server.ice.indexOf(action.protectingIceId);
        if (ia >= 0) {
          aServer = server.id;
          aIdx = ia;
        }
        const ib = server.ice.indexOf(action.otherIceId);
        if (ib >= 0) {
          bServer = server.id;
          bIdx = ib;
        }
      }
      if (!aServer || aIdx < 0 || !bServer || bIdx < 0) {
        log(state, `Swap protecting ice — one or both ice not installed.`);
        return { ok: true };
      }
      const a = state.cards[action.protectingIceId]!;
      const b = state.cards[action.otherIceId]!;
      state.servers[aServer]!.ice[aIdx] = action.otherIceId;
      state.servers[bServer]!.ice[bIdx] = action.protectingIceId;
      b.zone = `server:${aServer}:ice`;
      a.zone = `server:${bServer}:ice`;
      log(state, `Swap ${a.title} with ${b.title}.`);
      return { ok: true };
    }

case "swap_two_installed_ice": {
      // The first ice defaults to the source (cards that swap themselves);
      // Tenma Line swaps two other ice and names the first via iceId,
      // since its own source is not ice.
      const firstId = action.iceId ?? sourceId;
      const first = state.cards[firstId];
      if (!first) return { ok: true };
      let aServer: import("../../state/types.js").ServerId | null = null;
      let aIdx = -1;
      let bServer: import("../../state/types.js").ServerId | null = null;
      let bIdx = -1;
      for (const server of Object.values(state.servers)) {
        const ia = server.ice.indexOf(firstId);
        if (ia >= 0) {
          aServer = server.id;
          aIdx = ia;
        }
        const ib = server.ice.indexOf(action.otherIceId);
        if (ib >= 0) {
          bServer = server.id;
          bIdx = ib;
        }
      }
      if (!aServer || aIdx < 0 || !bServer || bIdx < 0) {
        log(state, `Swap ice — one or both ice not installed.`);
        return { ok: true };
      }
      const other = state.cards[action.otherIceId]!;
      state.servers[aServer]!.ice[aIdx] = action.otherIceId;
      state.servers[bServer]!.ice[bIdx] = firstId;
      other.zone = `server:${aServer}:ice`;
      first.zone = `server:${bServer}:ice`;
      log(
        state,
        `Swap ${first.title} with ${other.title}.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
