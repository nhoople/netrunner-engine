/**
 * Primitive kinds whose procedure is swap.
 * The effect switch in eval.ts dispatches here.
 */
import { openCardName } from "../../state/visibility/seatVisibility.js";
import {
  type EffectCtx,
  type EvalResult,
  evalEffect,
  applyPrimitive,
} from "../eval.js";
import {
  iceAtRunnerPosition,
  setRunnerPosition,
} from "../../state/uninstallAndPosition/runPosition.js";
import type { GameState } from "../../state/types/game.js";
import type { Server, ServerId } from "../../state/types/servers.js";
import { type Effect } from "../ir/effect.js";
import { type Primitive } from "../ir/primitive.js";
import { fx } from "../ir/fx.js";
import { occurCheckpoint } from "../../legality/checkpoints.js";
import { commitCheckpointSnapshot } from "../../state/triggers/checkpointSnapshot.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { fireOnFirstRemoteInstallThisTurn } from "../../state/triggers/miscConditionalHooks.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { CR } from "../../timing/labels.js";
import { revealCards } from "../../state/visibility/reveal.js";
import { chooseCards } from "../triggers/chooseCards.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { serverIdForIce } from "../../cards/stubs.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import { fireOnAgendaAddedToRunnerScore } from "../../state/hostingAndTrash/trashHooks.js";
import { installedIce } from "../rez/rezKinds.js";

function serverHoldingRootCard(
  state: EffectCtx["state"],
  cardId: string,
): Server | undefined {
  for (const server of Object.values(state.servers)) {
    if (server.root.includes(cardId)) return server;
  }
  return undefined;
}

/** CR 4.6.6e. A remote root holds one asset or agenda. A central root holds upgrades. */
function rootCanHold(
  server: Server,
  state: EffectCtx["state"],
  ids: string[],
): boolean {
  const types = ids.map((id) => state.cards[id]?.type);
  if (server.kind === "central") return types.every((t) => t === "upgrade");
  const agendaOrAsset = types.filter(
    (t) => t === "agenda" || t === "asset",
  ).length;
  return agendaOrAsset <= 1;
}

function installedIceIds(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    out.push(...server.ice);
  }
  return out;
}

function swapIcePositions(
  state: EffectCtx["state"],
  a: string,
  b: string,
): boolean {
  let aServer: ServerId | null = null;
  let aIdx = -1;
  let bServer: ServerId | null = null;
  let bIdx = -1;
  for (const server of Object.values(state.servers)) {
    const ia = server.ice.indexOf(a);
    if (ia >= 0) {
      aServer = server.id;
      aIdx = ia;
    }
    const ib = server.ice.indexOf(b);
    if (ib >= 0) {
      bServer = server.id;
      bIdx = ib;
    }
  }
  if (!aServer || aIdx < 0 || !bServer || bIdx < 0) return false;
  const ca = state.cards[a]!;
  const cb = state.cards[b]!;
  state.servers[aServer]!.ice[aIdx] = b;
  state.servers[bServer]!.ice[bIdx] = a;
  ca.zone = `server:${bServer}:ice`;
  cb.zone = `server:${aServer}:ice`;
  return true;
}

/**
 * While drawn cards are still set aside, Raman Rai may swap one of them
 * with a same-type card in Archives (CR 8.4.3b / 8.8.4d).
 */
export function offerRamanRaiSwapWhileSetAside(
  state: GameState,
  setAside: string[],
): boolean {
  if (state.pendingChoice) return false;
  if (state.turn.siRamanRaiUsedThisTurn) return false;
  if ((state.corp.clicks ?? 0) < 1) return false;
  const raman = Object.values(state.cards).find(
    (card) =>
      card.rezzed &&
      card.onDrawMayLoseClickRevealSwapArchivesSameTypeOncePerTurn,
  );
  if (!raman) return false;
  const options = [];
  for (const drawnId of setAside) {
    const drawn = state.cards[drawnId];
    if (!drawn) continue;
    const archives = state.corp.discardPile.filter(
      (id) => state.cards[id]?.type === drawn.type,
    );
    for (const archId of archives) {
      const arch = state.cards[archId]!;
      const archName = arch.faceup ? arch.title : "a facedown Archives card";
      options.push({
        id: `raman:${drawnId}:${archId}`,
        label: `Lose [click]: reveal ${drawn.title} and swap with ${archName}`,
        effect: fx.do({
          kind: "swap_raman_rai_resolve" as const,
          drawnId,
          archivesId: archId,
        }),
      });
    }
  }
  if (options.length === 0) return false;
  options.push({
    id: "raman:decline",
    label: "Decline",
    effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
  });
  openPendingChoose(state, {
    sourceId: raman.id,
    chooser: "corp",
    options,
    logLine: `Reaction window (CR ${CR.checkpointReaction.number}); ${raman.title} may swap a drawn card.`,
  });
  return true;
}

/** True when Raman Rai has at least one legal set-aside ↔ Archives swap. */
export function ramanRaiCanOfferSwap(
  state: GameState,
  setAside: string[],
): boolean {
  if (state.pendingChoice) return false;
  if (state.turn.siRamanRaiUsedThisTurn) return false;
  if ((state.corp.clicks ?? 0) < 1) return false;
  const raman = Object.values(state.cards).find(
    (card) =>
      card.rezzed &&
      card.onDrawMayLoseClickRevealSwapArchivesSameTypeOncePerTurn,
  );
  if (!raman) return false;
  for (const drawnId of setAside) {
    const drawn = state.cards[drawnId];
    if (!drawn) continue;
    if (
      state.corp.discardPile.some((id) => state.cards[id]?.type === drawn.type)
    ) {
      return true;
    }
  }
  return false;
}

function swapTwoInstalledIce(
  state: EffectCtx["state"],
  a: string,
  b: string,
): void {
  let aServer: ServerId | null = null;
  let bServer: ServerId | null = null;
  let aIdx = -1;
  let bIdx = -1;
  for (const [sid, server] of Object.entries(state.servers)) {
    const ai = server.ice.indexOf(a);
    if (ai >= 0) {
      aServer = sid as ServerId;
      aIdx = ai;
    }
    const bi = server.ice.indexOf(b);
    if (bi >= 0) {
      bServer = sid as ServerId;
      bIdx = bi;
    }
  }
  if (!aServer || !bServer || aIdx < 0 || bIdx < 0) return;
  state.servers[aServer]!.ice[aIdx] = b;
  state.servers[bServer]!.ice[bIdx] = a;
  const ca = state.cards[a]!;
  const cb = state.cards[b]!;
  ca.zone = `server:${aServer}:ice`;
  cb.zone = `server:${bServer}:ice`;
}

export function applySwapKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "may_swap_approached_ice_with_hq": {
      const run = state.run;
      if (!run || run.position === null) {
        log(state, `Midori — no approached ice.`);
        return { ok: true };
      }
      const approachedId = iceAtRunnerPosition(state);
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
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
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
      const approachedId = iceAtRunnerPosition(state);
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
      // Midori's "only once per run": a conditional ability is used once its
      // optional part is carried out, as here (CR 9.6.9d). Declining did not
      // use it.
      if (state.cards[sourceId]?.onApproachIceOncePerRun) {
        run.approachIceTriggersFiredIds = [
          ...(run.approachIceTriggersFiredIds ?? []),
          sourceId,
        ];
      }
      // The approached ice leaves play: it is uninstalled (CR 8.8.4b).
      trashHostedOnSwapOut(state, approachedId);
      state.corp.hand = state.corp.hand.filter((id) => id !== replacementId);
      state.servers[serverId]!.ice[run.position!] = replacementId;
      replacement.zone = `server:${serverId}:ice`;
      replacement.rezzed = false;
      replacement.faceup = false;
      state.corp.hand.push(approachedId);
      approached.zone = "corp:hq";
      approached.rezzed = false;
      approached.faceup = false;
      log(
        state,
        `Midori — swap ${approached.title} with ${replacement.title} from HQ (unrezzed). The Runner approaches the new ice (CR ${CR.swapBecomeInstalled.number}, 6.2.7b).`,
      );
      if (occurSwapCheckpoint(state, sourceId)) return { ok: true };
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
      const options: import("../ir/effect.js").ChoiceOption[] = [];
      for (const hqId of hq) {
        for (const srvId of targets) {
          if (!canSwapIntoPlaceOf(state, server, hqId, srvId)) continue;
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
      if (options.length === 0) {
        log(
          state,
          `Yagi swap — no HQ card may take the place of a card on ${sid} (CR ${CR.swapOnlyToValidLocation.number}).`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
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
      if (!canSwapIntoPlaceOf(state, server, hqId, srvId)) {
        log(
          state,
          `Yagi swap pick — ${hqCard.title} cannot take the place of ${srvCard.title} (CR ${CR.swapOnlyToValidLocation.number}).`,
        );
        return { ok: true };
      }
      const run = state.run;
      const encounteredOut = run.encounter?.iceId === srvId;
      const wasIce = server.ice.includes(srvId);
      const iceIdx = wasIce ? server.ice.indexOf(srvId) : -1;
      const rootIdx = !wasIce ? server.root.indexOf(srvId) : -1;
      // The card leaving the server is uninstalled (CR 8.8.4b).
      trashHostedOnSwapOut(state, srvId);
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
      const swapped = `Swap ${hqCard.title} from HQ with ${srvCard.title} on ${sid}.`;
      if (encounteredOut) {
        // The encountered ice was uninstalled: the encounter ends once the
        // open window completes (CR 6.2.7c). The HQ card fills its position,
        // so the position still exists (CR 6.2.4).
        run.encounter!.iceUninstalled = true;
        log(
          state,
          `${swapped} ${srvCard.title} is uninstalled, so the encounter ends (CR ${CR.swapBecomeInstalled.number}, ${CR.encounteredIceLeaves.number}).`,
        );
      } else if (run.phase === "initiation" || run.phase === "movement") {
        log(
          state,
          `${swapped} The Runner stays in position (CR ${CR.iceChangeDuringMovement.number}).`,
        );
      } else {
        log(state, `${swapped} (CR ${CR.swapBecomeInstalled.number}).`);
      }
      occurSwapCheckpoint(state, sourceId);
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
      const options: import("../ir/effect.js").ChoiceOption[] = [];
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
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
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
        log(
          state,
          `Daruma swap pick — HQ target must be agenda/asset/upgrade.`,
        );
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
        const otherSid =
          otherServerId as import("../../state/types/servers.js").ServerId;
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
      let serverId: import("../../state/types/servers.js").ServerId | null =
        null;
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
      trashHostedOnSwapOut(state, sourceId);
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
      if (occurSwapCheckpoint(state, sourceId)) return { ok: true };
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
      const approachedId = iceAtRunnerPosition(state);
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
      // The approached ice leaves play: it is uninstalled (CR 8.8.4b).
      trashHostedOnSwapOut(state, approachedId);
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
        approached.faceup = false;
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
        `Swap approached ${approached.title} with ${replacement.title}. The Runner approaches the new ice (CR ${CR.swapBecomeInstalled.number}, 6.2.7b).`,
      );
      occurSwapCheckpoint(state, sourceId);
      return { ok: true };
    }

    case "swap_source_ice_with_other": {
      let sourceServerId:
        import("../../state/types/servers.js").ServerId | null = null;
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
      // The ice to swap is the source, or the ice the ability names (Sipa:
      // the ice the Runner just passed).
      const firstId = action.iceId ?? sourceId;
      const others: string[] = [];
      let installed = false;
      for (const server of Object.values(state.servers)) {
        if (server.ice.includes(firstId)) installed = true;
        for (const id of server.ice) {
          if (id !== firstId) others.push(id);
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
            label: `Swap with ${openCardName(state, id, chooser)}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "swap_two_installed_ice" as const,
                otherIceId: id,
                ...(action.iceId ? { iceId: action.iceId } : {}),
              },
            },
          })),
        ],
        logLine: `May swap ${state.cards[firstId]!.title} with another installed ice.`,
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
            label: `Swap ${openCardName(state, pid, "runner")} (protecting)`,
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
          label: `Swap with ${openCardName(state, id, "runner")}`,
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
      let aServer: import("../../state/types/servers.js").ServerId | null =
        null;
      let aIdx = -1;
      let bServer: import("../../state/types/servers.js").ServerId | null =
        null;
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
      let aServer: import("../../state/types/servers.js").ServerId | null =
        null;
      let aIdx = -1;
      let bServer: import("../../state/types/servers.js").ServerId | null =
        null;
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
      log(state, `Swap ${first.title} with ${other.title}.`);
      return { ok: true };
    }

    case "mitra_aman_approach_ice": {
      // Its own ability trashes it, so the Corp does (CR 1.14.5).
      trashCard(state, sourceId, { by: "corp", cause: "cost" });
      state.corp.credits += 3;
      log(state, `Mitra Aman trashed → gain 3¢ (${state.corp.credits}¢).`);
      const run = state.run;
      if (!run || run.position === null) {
        log(state, `Mitra Aman — no approached ice.`);
        return { ok: true };
      }
      const approachedId = iceAtRunnerPosition(state);
      if (!approachedId) {
        log(state, `Mitra Aman — no approached ice.`);
        return { ok: true };
      }
      const candidates: string[] = [];
      for (const id of state.corp.hand) {
        if (state.cards[id]?.type === "ice") candidates.push(id);
      }
      for (const id of state.corp.discardPile) {
        if (state.cards[id]?.type === "ice") candidates.push(id);
      }
      if (candidates.length === 0) {
        log(state, `Mitra Aman — no ice in HQ or Archives to swap.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Decline swap",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
        ...candidates.map((iceId) => ({
          id: `mitra-swap:${iceId}`,
          label: `Swap with ${state.cards[iceId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "swap_approached_ice_with_hq_or_archives" as const,
              replacementIceId: iceId,
            },
          },
        })),
      ];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `Mitra Aman — may swap approached ice.`,
      });
      return { ok: true };
    }

    case "swap_2_other_ice_or_2_non_ice": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "meta-ice",
            label: "Swap 2 other installed ice",
            effect: fx.do({ kind: "may_swap_two_installed_ice" }),
          },
          {
            id: "meta-nonice",
            label: "Swap 2 installed non-ice cards",
            effect: fx.do({ kind: "swap_2_non_ice" }),
          },
        ],
      });
      return { ok: true };
    }

    case "swap_2_non_ice": {
      const cards: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          const c = state.cards[id];
          if (c && c.type !== "ice") cards.push(id);
        }
      }
      if (cards.length < 2) {
        log(state, `Metamorph — fewer than 2 installed non-ice cards.`);
        return { ok: true };
      }
      // The Corp picks the two cards (CR 1.15.2).
      if (!action.cardIds && cards.length > 2) {
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "corp",
            candidates: cards,
            count: 2,
            purpose: "resume",
            label: "swap",
            resume: { kind: "swap_2_non_ice" },
          }),
        );
      }
      const chosen = (action.cardIds ?? []).filter((id) => cards.includes(id));
      const [a, b] = chosen.length === 2 ? chosen : cards;
      const ca = state.cards[a!]!;
      const cb = state.cards[b!]!;
      const serverA = serverHoldingRootCard(state, a!);
      const serverB = serverHoldingRootCard(state, b!);
      if (
        serverA &&
        serverB &&
        serverA.id !== serverB.id &&
        (!rootCanHold(
          serverA,
          state,
          serverA.root.map((id) => (id === a ? b! : id)),
        ) ||
          !rootCanHold(
            serverB,
            state,
            serverB.root.map((id) => (id === b ? a! : id)),
          ))
      ) {
        log(
          state,
          `Metamorph — that swap does nothing (CR ${CR.swapOnlyToValidLocation.number}).`,
        );
        return { ok: true };
      }
      const zoneA = ca.zone;
      const zoneB = cb.zone;
      // Swap zones and server root membership.
      for (const server of Object.values(state.servers)) {
        const ia = server.root.indexOf(a!);
        const ib = server.root.indexOf(b!);
        if (ia >= 0) server.root[ia] = b!;
        if (ib >= 0) server.root[ib] = a!;
      }
      ca.zone = zoneB;
      cb.zone = zoneA;
      log(state, `Metamorph — swap ${ca.title} and ${cb.title}.`);
      return { ok: true };
    }

    case "swap_2_unrezzed_ice": {
      const ice = installedIceIds(state).filter(
        (id) => state.cards[id] && !state.cards[id]!.rezzed,
      );
      if (ice.length < 2) {
        log(state, `Reshape — need 2 unrezzed ice.`);
        return { ok: true };
      }
      const opts: { id: string; label: string; effect: Effect }[] = [];
      for (let i = 0; i < ice.length; i++) {
        for (let j = i + 1; j < ice.length; j++) {
          const a = ice[i]!;
          const b = ice[j]!;
          opts.push({
            id: `reshape:${a}:${b}`,
            label: `Swap ${state.cards[a]!.title} and ${state.cards[b]!.title}`,
            effect: fx.do({
              kind: "swap_2_unrezzed_ice_resolve",
              iceIdA: a,
              iceIdB: b,
            }),
          });
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: opts.slice(0, 24),
      });
      return { ok: true };
    }

    case "swap_2_unrezzed_ice_resolve": {
      const a = action.iceIdA;
      const b = action.iceIdB;
      if (!swapIcePositions(state, a, b)) {
        log(state, `Reshape — swap failed.`);
        return { ok: true };
      }
      log(
        state,
        `Reshape — swap ${state.cards[a]?.title ?? a} and ${state.cards[b]?.title ?? b}.`,
      );
      return { ok: true };
    }

    case "swap_with_grip_subtype": {
      const subtype = action.subtype;
      if (!source || !state.runner.installed.includes(sourceId)) {
        return { ok: true };
      }
      const grip = state.runner.hand.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes(subtype),
      );
      if (grip.length === 0) {
        log(state, `${source.title} — no ${subtype} in grip.`);
        return { ok: true };
      }
      if (grip.length === 1) {
        return applySwapKinds(ctx, {
          kind: "swap_with_grip_subtype_resolve",
          cardId: grip[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: grip.map((cardId) => ({
          id: `swap:${cardId}`,
          label: `Swap with ${state.cards[cardId]!.title}`,
          effect: fx.do({
            kind: "swap_with_grip_subtype_resolve",
            cardId,
          }),
        })),
      });
      return { ok: true };
    }

    case "swap_with_grip_subtype_resolve": {
      const gripId = action.cardId;
      if (!source || !state.runner.installed.includes(sourceId))
        return { ok: true };
      if (!state.runner.hand.includes(gripId)) return { ok: true };
      const gripCard = state.cards[gripId]!;
      // Uninstall source → grip
      state.runner.installed = state.runner.installed.filter(
        (id) => id !== sourceId,
      );
      state.runner.hand.push(sourceId);
      source.zone = "runner:grip";
      source.faceup = true;
      // Install grip card into rig (same MU slot)
      state.runner.hand = state.runner.hand.filter((id) => id !== gripId);
      state.runner.installed.push(gripId);
      gripCard.zone = "runner:installed";
      gripCard.faceup = true;
      log(state, `${source.title} — swap with ${gripCard.title} from grip.`);
      return { ok: true };
    }

    case "may_swap_drawn": {
      const drawnId = action.cardId;
      const drawn = state.cards[drawnId];
      if (!drawn || !state.corp.hand.includes(drawnId)) return { ok: true };
      if ((state.corp.clicks ?? 0) < 1) {
        log(state, `Raman Rai — no click to lose.`);
        return { ok: true };
      }
      const archives = state.corp.discardPile.filter(
        (id) => state.cards[id]?.type === drawn.type,
      );
      if (archives.length === 0) {
        log(state, `Raman Rai — no same-type card in Archives.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...archives.map((archId) => ({
            id: `raman:${archId}`,
            label: `Lose [click]: swap with ${state.cards[archId]!.title}`,
            effect: fx.do({
              kind: "swap_raman_rai_resolve",
              drawnId,
              archivesId: archId,
            }),
          })),
          {
            id: "raman:decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "swap_raman_rai_resolve": {
      if ((state.corp.clicks ?? 0) < 1) return { ok: true };
      const drawnId = action.drawnId;
      const archivesId = action.archivesId;
      const pending = state.pendingDrawSetAside;
      const inSetAside = pending?.cardIds.includes(drawnId) ?? false;
      if (
        (!inSetAside && !state.corp.hand.includes(drawnId)) ||
        !state.corp.discardPile.includes(archivesId)
      ) {
        return { ok: true };
      }
      state.corp.clicks -= 1;
      const drawn = state.cards[drawnId]!;
      const arch = state.cards[archivesId]!;
      revealCards(state, [drawn.id, arch.id], sourceId);
      log(
        state,
        `Raman Rai — reveal ${drawn.title} and ${arch.title}; lose [click].`,
      );
      state.corp.discardPile = state.corp.discardPile.filter(
        (id) => id !== archivesId,
      );
      if (inSetAside && pending) {
        const idx = pending.cardIds.indexOf(drawnId);
        pending.cardIds[idx] = archivesId;
        state.corp.discardPile.push(drawnId);
        drawn.zone = "corp:archives";
        drawn.faceup = true;
        arch.zone = "corp:set-aside";
        arch.faceup = true;
        log(
          state,
          `${arch.title} joins the set-aside cards (CR ${CR.swapToSetAside.number}).`,
        );
      } else {
        state.corp.hand = state.corp.hand.filter((id) => id !== drawnId);
        state.corp.hand.push(archivesId);
        state.corp.discardPile.push(drawnId);
        arch.zone = "corp:hq";
        arch.faceup = false;
        drawn.zone = "corp:archives";
        drawn.faceup = true;
      }
      state.turn.siRamanRaiUsedThisTurn = true;
      log(state, `Raman Rai — swap ${drawn.title} ↔ ${arch.title}.`);
      return { ok: true };
    }

    case "swap_mumbad_passed_ice": {
      const iceId = action.iceId;
      const otherId = action.otherIceId;
      const ice = state.cards[iceId];
      const other = state.cards[otherId];
      if (!ice || !other) return { ok: true };
      let serverId: string | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.ice.includes(iceId) && server.ice.includes(otherId)) {
          serverId = sid;
          const a = server.ice.indexOf(iceId);
          const b = server.ice.indexOf(otherId);
          server.ice[a] = otherId;
          server.ice[b] = iceId;
          break;
        }
      }
      if (serverId) {
        log(
          state,
          `Mumbad City Grid — swap ${ice.title} with ${other.title} on ${serverId}.`,
        );
      }
      return { ok: true };
    }

    case "swap_nihongai_resolve": {
      const rdCardId = action.rdCardId;
      const hqCardId = action.hqCardId;
      if (!rdCardId || !hqCardId) return { ok: true };
      const rdIdx = state.corp.deck.indexOf(rdCardId);
      const hqIdx = state.corp.hand.indexOf(hqCardId);
      if (rdIdx < 0 || hqIdx < 0) {
        log(state, `Nihongai Grid — cards no longer available.`);
        return { ok: true };
      }
      state.corp.deck[rdIdx] = hqCardId;
      state.corp.hand[hqIdx] = rdCardId;
      state.cards[hqCardId]!.zone = "corp:rd";
      state.cards[rdCardId]!.zone = "corp:hq";
      log(
        state,
        `Nihongai Grid — swap ${state.cards[rdCardId]!.title} ↔ ${state.cards[hqCardId]!.title}.`,
      );
      return { ok: true };
    }
    case "may_swap_two_installed_ice": {
      const ice = installedIceIds(state);
      if (ice.length < 2) {
        log(state, `Tenma Line — need 2 installed ice.`);
        return { ok: true };
      }
      // The Corp makes the choices of its own ability: any 2 pieces of
      // installed ice, one at a time (CR 1.15.2).
      //
      // Two copies of the same ice in different places are different picks.
      const picked = action.cardIds ?? [];
      if (picked.length < 2) {
        const left = ice.filter((id) => !picked.includes(id));
        openPendingChoose(state, {
          sourceId,
          chooser: "corp",
          options: left.map((id) => {
            const sid = serverIdForIce(state, id);
            const at = sid ? state.servers[sid]!.ice.indexOf(id) + 1 : 0;
            return {
              id: `tenma:${id}`,
              label: `${picked.length === 0 ? "Swap" : "With"} ${state.cards[id]!.title} (${sid}, position ${at} from the outermost)`,
              effect: fx.do({
                kind: "may_swap_two_installed_ice",
                cardIds: [...picked, id],
              }),
            };
          }),
          hiddenFromOpponent: left.some((id) => !state.cards[id]?.rezzed),
          logLine:
            picked.length === 0
              ? `Tenma Line — the Corp chooses 2 pieces of installed ice to swap.`
              : undefined,
        });
        return { ok: true };
      }
      const [a, b] = picked;
      if (!a || !b) return { ok: true };
      return evalEffect(
        ctx,
        fx.do({ kind: "swap_two_installed_ice", iceId: a, otherIceId: b }),
      );
    }
    case "swap_stolen_with_corp_scored": {
      const stolenId = state.turn.lastStolenAgendaId;
      if (!stolenId || !state.runner.scoreArea.includes(stolenId)) {
        log(state, `Turntable — no stolen agenda to swap.`);
        return { ok: true };
      }
      const corpScored = state.corp.scoreArea.filter((id) => id !== stolenId);
      if (corpScored.length === 0) {
        log(state, `Turntable — Corp score area empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: corpScored.map((id) => ({
          id: `tt-swap:${id}`,
          label: `Swap with ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "swap_turntable_resolve" as const,
              corpAgendaId: id,
            },
          },
        })),
        logLine: `Turntable — choose Corp scored agenda to swap.`,
      });
      return { ok: true };
    }

    case "swap_turntable_resolve": {
      const stolenId = state.turn.lastStolenAgendaId;
      const corpId = action.corpAgendaId;
      if (
        !stolenId ||
        !state.runner.scoreArea.includes(stolenId) ||
        !state.corp.scoreArea.includes(corpId)
      ) {
        return {
          ok: false,
          error: "Turntable swap — agendas not in score areas.",
          cites: [],
        };
      }
      state.runner.scoreArea = state.runner.scoreArea.filter(
        (id) => id !== stolenId,
      );
      state.corp.scoreArea = state.corp.scoreArea.filter((id) => id !== corpId);
      state.corp.scoreArea.push(stolenId);
      state.runner.scoreArea.push(corpId);
      const stolen = state.cards[stolenId];
      const corpAg = state.cards[corpId];
      if (stolen) stolen.zone = "corp:score";
      if (corpAg) corpAg.zone = "runner:score";
      fireOnAgendaAddedToRunnerScore(state);
      log(
        state,
        `Turntable — swap ${stolen?.title ?? stolenId} with ${corpAg?.title ?? corpId}.`,
      );
      return { ok: true };
    }
    case "may_swap_with_hq": {
      const hqAgendaAsset = state.corp.hand.filter((id) => {
        const c = state.cards[id]!;
        return c.type === "agenda" || c.type === "asset";
      });
      if (hqAgendaAsset.length === 0) {
        log(state, `Toshiyuki Sakai — no agenda/asset in HQ to swap.`);
        return { ok: true };
      }
      // Printed "you may": the Corp may decline (CR 9.6.9).
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...hqAgendaAsset.map((id) => ({
            id: `toshiyuki-swap:${id}`,
            label: `Swap with ${state.cards[id]!.title} from HQ`,
            effect: fx.do({
              kind: "swap_execute",
              hqCardId: id,
            }),
          })),
          {
            id: "decline",
            label: "Decline",
            effect: fx.gainCredits("corp", 0),
          },
        ],
        logLine: `Toshiyuki Sakai — may swap with agenda/asset from HQ.`,
      });
      return { ok: true };
    }
    case "swap_execute": {
      const hqId = action.hqCardId;
      const sakai = state.cards[sourceId];
      const incoming = state.cards[hqId];
      if (!sakai || !incoming) return { ok: true };
      const zoneParts = sakai.zone.split(":");
      const serverId = zoneParts[1] as ServerId;
      const server = state.servers[serverId];
      if (!server) return { ok: true };
      const adv = sakai.advancementCounters ?? 0;
      removeCardFromCurrentZone(state, sourceId);
      removeCardFromCurrentZone(state, hqId);
      state.corp.hand = state.corp.hand.filter((x: string) => x !== hqId);
      server.root = server.root.filter((x: string) => x !== sourceId);
      incoming.zone = sakai.zone;
      incoming.rezzed = false;
      incoming.faceup = false;
      incoming.advancementCounters = adv;
      server.root.push(incoming.id);
      state.corp.hand.push(sourceId);
      state.cards[sourceId]!.zone = "corp:hq";
      state.cards[sourceId]!.faceup = false;
      log(
        state,
        `Toshiyuki Sakai — swap with ${incoming.title}; new card installed unrezzed with ${adv} advancement(s).`,
      );
      return { ok: true };
    }

    case "swap_scored_agendas": {
      const corpAgendas = state.corp.scoreArea.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      const runnerAgendas = state.runner.scoreArea.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (corpAgendas.length === 0 || runnerAgendas.length === 0) {
        log(
          state,
          `Exchange of Information — both score areas need an agenda.`,
        );
        return { ok: true };
      }
      if (corpAgendas.length === 1 && runnerAgendas.length === 1) {
        return applySwapKinds(ctx, {
          kind: "swap_resolve",
          corpAgendaId: corpAgendas[0]!,
          runnerAgendaId: runnerAgendas[0]!,
        });
      }
      const options = [];
      for (const cId of corpAgendas) {
        for (const rId of runnerAgendas) {
          options.push({
            id: `swap:${cId}:${rId}`,
            label: `Swap ${state.cards[cId]!.title} ↔ ${state.cards[rId]!.title}`,
            effect: fx.do({
              kind: "swap_resolve",
              corpAgendaId: cId,
              runnerAgendaId: rId,
            }),
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "swap_resolve": {
      const cId = action.corpAgendaId;
      const rId = action.runnerAgendaId;
      if (
        !state.corp.scoreArea.includes(cId) ||
        !state.runner.scoreArea.includes(rId)
      ) {
        log(
          state,
          `Exchange of Information — agendas no longer in score areas.`,
        );
        return { ok: true };
      }
      state.corp.scoreArea = state.corp.scoreArea.filter((x) => x !== cId);
      state.runner.scoreArea = state.runner.scoreArea.filter((x) => x !== rId);
      state.corp.scoreArea.push(rId);
      state.runner.scoreArea.push(cId);
      const cCard = state.cards[cId]!;
      const rCard = state.cards[rId]!;
      cCard.zone = "runner:score";
      rCard.zone = "corp:score";
      fireOnAgendaAddedToRunnerScore(state);
      log(
        state,
        `Exchange of Information — swap ${cCard.title} ↔ ${rCard.title}.`,
      );
      return { ok: true };
    }

    case "may_swap_passed_ice": {
      const iceId = action.iceId ?? state.run?.encounter?.iceId;
      if (!iceId || !state.cards[iceId]) {
        log(state, `Inversificator — no ice to swap.`);
        return { ok: true };
      }
      const others = installedIce(state).filter((id) => id !== iceId);
      if (others.length === 0) {
        log(state, `Inversificator — no other installed ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
          ...others.map((id) => ({
            id: `swap:${id}`,
            label: `Swap with ${state.cards[id]!.title}`,
            effect: fx.do({
              kind: "swap_inversificator_resolve",
              iceId,
              otherId: id,
            }),
          })),
        ],
      });
      return { ok: true };
    }

    case "swap_inversificator_resolve": {
      const a = action.iceId;
      const b = action.otherId;
      if (!a || !b) return { ok: true };
      swapTwoInstalledIce(state, a, b);
      log(
        state,
        `Inversificator — swap ${state.cards[a]?.title} with ${state.cards[b]?.title}.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}

/**
 * May `incomingId` take the place of `outgoingId` in `server` (CR 8.8.2)?
 * Ice takes an ice position. A root takes an upgrade, or an agenda or asset
 * on a remote, holding no other agenda or asset (CR 3.3.1, 8.5.2b, 8.5.2c).
 * A card limited to particular servers keeps that limit when swapped
 * (CR 8.5.12), and a root holds at most one region (CR 3.6.5).
 */
function canSwapIntoPlaceOf(
  state: GameState,
  server: Server,
  incomingId: string,
  outgoingId: string,
): boolean {
  const incoming = state.cards[incomingId];
  if (!incoming) return false;
  if (server.ice.includes(outgoingId)) return incoming.type === "ice";
  if (!server.root.includes(outgoingId)) return false;
  const named = incoming.installServers ?? [];
  if (named.length && !named.includes(server.id as "hq" | "rd" | "archives")) {
    return false;
  }
  if (incoming.remoteOnly && server.kind !== "remote") return false;
  const others = server.root
    .filter((id) => id !== outgoingId)
    .map((id) => state.cards[id]);
  if (incoming.type === "upgrade") {
    const oneOfAKind = (c: (typeof others)[number]) =>
      (c?.subtypes ?? []).includes("region") || Boolean(c?.limitOnePerServer);
    return !(oneOfAKind(incoming) && others.some(oneOfAKind));
  }
  if (incoming.type !== "agenda" && incoming.type !== "asset") return false;
  if (server.kind !== "remote" && !named.length) return false;
  return !others.some((c) => c?.type === "agenda" || c?.type === "asset");
}

/**
 * A card swapped out of play is uninstalled: trash the cards and counters it
 * hosted, and set a checkpoint baseline so 10.3.1a sees the zone change
 * (CR 8.8.4b). Call before the swap moves the card.
 */
function trashHostedOnSwapOut(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  const hosted = new Set<string>(card.hostedCardIds ?? []);
  for (const [id, other] of Object.entries(state.cards)) {
    if (other.hostId === cardId) hosted.add(id);
  }
  for (const id of hosted) {
    const other = state.cards[id];
    if (!other) continue;
    // The hosted cards keep their link; the next checkpoint trashes them
    // (CR 8.8.4b, 1.13.13, 10.3.1g).
    log(
      state,
      `${other.title} will be trashed at the next checkpoint (CR ${CR.swapBecomeInstalled.number}).`,
    );
  }
  const hostedCounters =
    (card.advancementCounters ?? 0) +
    (card.virusCounters ?? 0) +
    (card.powerCounters ?? 0) +
    (card.hostedCredits ?? 0);
  if (hostedCounters > 0) {
    card.advancementCounters = 0;
    card.virusCounters = 0;
    card.powerCounters = 0;
    card.hostedCredits = 0;
    log(
      state,
      `${hostedCounters} hosted counter(s) trashed (CR ${CR.swapBecomeInstalled.number}).`,
    );
  }
  if (!state.previousCheckpointSnapshot) {
    commitCheckpointSnapshot(state, null);
  }
}

/**
 * Install and uninstall conditions of a swap are met at the next checkpoint,
 * before the rest of the ability (CR 8.8.4b). Zone diff at 10.3.1a marks
 * first-remote-install when the incoming card landed on a remote. Returns
 * true when a choice from that trigger is now open.
 */
function occurSwapCheckpoint(state: GameState, sourceId: string): boolean {
  occurCheckpoint(
    state,
    "instruction",
    "Swap",
    [CR.swapBecomeInstalled],
    sourceId,
  );
  const swapPending = state.pendingAbilities.find(
    (p) => p.status === "pending" && p.payload?.kind === "swap_install_trigger",
  );
  if (!swapPending) return false;
  state.turn.firstRemoteInstallThisTurnUsed = true;
  swapPending.status = "resolving";
  swapPending.independentOfSource = true;
  const idCard = state.cards[state.corp.identityId];
  if (idCard?.onFirstRemoteInstallThisTurn) {
    fireOnFirstRemoteInstallThisTurn(state, idCard.id);
    if (state.pendingChoice) return true;
  }
  swapPending.status = "done";
  state.pendingAbilities = state.pendingAbilities.filter(
    (p) =>
      p.status === "pending" ||
      p.status === "imminent" ||
      p.status === "resolving",
  );
  return false;
}

export function applySwapKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "swap_encounter_barrier_adjacent": {
      const run = state.run;
      const iceId = run?.encounter?.iceId;
      if (!run || !iceId) {
        log(state, `Surfer — not encountering ice.`);
        return { ok: true };
      }
      const ice = state.cards[iceId];
      if (
        !ice ||
        !(ice.subtypes ?? []).some((s) => s.toLowerCase() === "barrier")
      ) {
        log(state, `Surfer — not encountering barrier.`);
        return { ok: true };
      }
      const sid = run.attackedServerId;
      const server = state.servers[sid];
      if (!server) return { ok: true };
      const pos = server.ice.indexOf(iceId);
      if (pos < 0) return { ok: true };
      const neighbors: number[] = [];
      if (pos > 0) neighbors.push(pos - 1);
      if (pos < server.ice.length - 1) neighbors.push(pos + 1);
      if (neighbors.length === 0) {
        log(state, `Surfer — no adjacent ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: neighbors.map((nPos) => {
          const otherId = server.ice[nPos]!;
          return {
            id: `surfer-swap:${otherId}`,
            label: `Swap with ${openCardName(state, otherId, "runner")}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "swap_surfer_resolve" as const,
                otherIceId: otherId,
              },
            },
          };
        }),
        logLine: `Surfer — choose adjacent ice to swap.`,
      });
      return { ok: true };
    }

    case "swap_surfer_resolve": {
      const run = state.run;
      const iceId = run?.encounter?.iceId;
      if (!run || !iceId) return { ok: true };
      const otherId = action.otherIceId;
      const sid = run.attackedServerId;
      const server = state.servers[sid];
      if (!server) return { ok: true };
      const a = server.ice.indexOf(iceId);
      const b = server.ice.indexOf(otherId);
      if (a < 0 || b < 0) return { ok: true };
      server.ice[a] = otherId;
      server.ice[b] = iceId;
      setRunnerPosition(run, b);
      // Printed: still encountering that ice (the barrier), from its new
      // position — do not switch the encounter onto the other ice (CR 1.2.1).
      log(
        state,
        `Surfer — swap ${state.cards[iceId]!.title} with ${state.cards[otherId]!.title}; still encountering.`,
      );
      return { ok: true };
    }

    case "swap_hq_archives_per_advancement_on_self": {
      // Printed: swap 1 HQ ↔ Archives card for each advancement (CR 1.2.1) —
      // no optional decline after the [trash] cost.
      const n = source.advancementCounters ?? 0;
      if (n <= 0) {
        log(state, `${source.title} — no advancements.`);
        return { ok: true };
      }
      log(
        state,
        `${source.title} — swap HQ↔Archives for each of ${n} advancement(s).`,
      );
      return applySwapKindsWhenSourceExists(ctx, {
        kind: "swap_allele_step",
        remaining: n,
      });
    }

    case "swap_allele_step": {
      const remaining = action.remaining;
      if (remaining <= 0) return { ok: true };
      const hq = [...state.corp.hand];
      const archives = [...state.corp.discardPile];
      if (hq.length === 0 || archives.length === 0) {
        log(state, `Allele Repression — HQ or Archives empty.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const hqId of hq) {
        for (const archId of archives) {
          options.push({
            id: `allele:${hqId}:${archId}`,
            label: `Swap ${state.cards[hqId]!.title} ↔ ${state.cards[archId]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "swap_allele_resolve" as const,
                hqCardId: hqId,
                archivesCardId: archId,
                remaining: remaining - 1,
              },
            },
          });
        }
      }
      options.push({
        id: "stop",
        label: "Stop swapping",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "swap_allele_resolve": {
      const hqId = action.hqCardId;
      const archId = action.archivesCardId;
      if (
        !state.corp.hand.includes(hqId) ||
        !state.corp.discardPile.includes(archId)
      ) {
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== hqId);
      state.corp.discardPile = state.corp.discardPile.filter(
        (id) => id !== archId,
      );
      state.corp.hand.push(archId);
      state.corp.discardPile.push(hqId);
      const hqCard = state.cards[hqId]!;
      const archCard = state.cards[archId]!;
      hqCard.zone = "corp:archives";
      // Not visible to the Runner when trashed: facedown (CR 4.4.6b).
      hqCard.faceup = false;
      archCard.zone = "corp:hq";
      archCard.faceup = false;
      log(
        state,
        `Allele Repression — swap ${hqCard.title} (HQ) ↔ ${archCard.title} (Archives).`,
      );
      if (action.remaining > 0) {
        return applySwapKindsWhenSourceExists(ctx, {
          kind: "swap_allele_step",
          remaining: action.remaining,
        });
      }
      return { ok: true };
    }
    default:
      return null;
  }
}
