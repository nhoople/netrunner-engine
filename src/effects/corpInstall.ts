/**
 * Corp basic install from HQ or Archives, paying costs or ignoring them.
 * Card sequences that install and then advance, rez, or lock stay in eval.ts.
 */
import { log } from "../state/createGame.js";
import {
  creditsAvailableForInstall,
  spendCreditsForInstall,
} from "../state/costs.js";
import { noteInstalledThisTurn } from "../state/programHardwareInstall.js";
import type { GameState, ServerId } from "../state/types.js";
import { CR } from "../timing/labels.js";
import { evalEffect, type EffectCtx, type EvalResult } from "./eval.js";
import type { Primitive } from "./ir.js";

export function corpCardInstallable(type: string): boolean {
  return (
    type === "agenda" ||
    type === "asset" ||
    type === "ice" ||
    type === "upgrade"
  );
}

export function resolveInstallServerId(
  state: GameState,
  serverId: string,
): ServerId | null {
  if (serverId !== "__new_remote__") {
    const sid = serverId as ServerId;
    return state.servers[sid] ? sid : null;
  }
  const remoteNum = state.nextRemoteNumber++;
  const sid = `remote-${remoteNum}` as ServerId;
  state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
  return sid;
}

export function applyCorpInstallPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "install_hq_card_paying_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.corp.hand.includes(cardId)) {
        log(state, `Install from HQ — card not in HQ.`);
        return { ok: true };
      }
      const cost = card.installCost ?? 0;
      if (creditsAvailableForInstall(state, "corp") < cost) {
        log(state, `Install from HQ — cannot afford ${cost}¢.`);
        return { ok: true };
      }
      spendCreditsForInstall(state, "corp", cost);
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      const remoteNum = state.nextRemoteNumber++;
      const sid = `remote-${remoteNum}` as ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      if (card.type === "ice") {
        state.servers[sid].ice.push(cardId);
        card.zone = `server:${sid}:ice`;
      } else {
        state.servers[sid].root.push(cardId);
        card.zone = `server:${sid}:root`;
      }
      card.rezzed = false;
      card.faceup = false;
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementTokens = card.advancementTokens ?? 0;
      }
      state.turn.lastInstalledFromEffectId = cardId;
      noteInstalledThisTurn(state, cardId);
      if (action.cannotScoreInstalledCardThisTurn) {
        if (!state.turn.cannotScoreOrRezCardIds.includes(cardId)) {
          state.turn.cannotScoreOrRezCardIds.push(cardId);
        }
      }
      // Paying-costs install is always from HQ.
      state.turn.corpInstalledFromHqThisTurn = true;
      log(
        state,
        `Install ${card.title} from HQ onto ${sid} for ${cost}¢.`,
      );
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      if (
        action.thenMayRemoveTagToAdvance &&
        state.runner.tags >= 1 &&
        state.turn.lastInstalledFromEffectId
      ) {
        const installedId = state.turn.lastInstalledFromEffectId;
        const installed = state.cards[installedId];
        state.pendingChoice = {
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
            {
              id: "tag-advance",
              label: `Remove 1 tag, place 1 advancement on ${installed?.title ?? installedId}`,
              effect: {
                op: "seq",
                effects: [
                  {
                    op: "do",
                    action: { kind: "remove_tags", amount: 1 },
                  },
                  {
                    op: "do",
                    action: {
                      kind: "place_advancements_on",
                      cardId: installedId,
                      amount: 1,
                    },
                  },
                ],
              },
            },
          ],
        };
        log(state, `May remove 1 tag to place 1 advancement on installed card.`);
      }
      return { ok: true };
    }
    case "install_archives_card_paying": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      const destId = resolveInstallServerId(state, action.serverId);
      const dest = destId ? state.servers[destId] : null;
      if (!card || !dest) {
        log(state, `Archives install paying — invalid card or server.`);
        return { ok: true };
      }
      if (!state.corp.discard.includes(cardId)) {
        log(state, `Archives install paying — card not in Archives.`);
        return { ok: true };
      }
      const cost = card.installCost ?? 0;
      if (state.corp.credits < cost) {
        return {
          ok: false,
          error: `Insufficient credits to install ${card.title} (${cost}¢).`,
          cites: [CR.corpBasicInstall],
        };
      }
      state.corp.credits -= cost;
      state.corp.discard = state.corp.discard.filter((id) => id !== cardId);
      if (card.type === "ice") {
        dest.ice.unshift(cardId);
        card.zone = `server:${destId}:ice`;
      } else {
        dest.root.push(cardId);
        card.zone = `server:${destId}:root`;
      }
      card.rezzed = false;
      card.faceup = false;
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementTokens = card.advancementTokens ?? 0;
      }
      noteInstalledThisTurn(state, cardId);
      log(
        state,
        `Install ${card.title} from Archives on ${destId} for ${cost}¢ (unrezzed).`,
      );
      if (card.onInstallFromNonHq) {
        const r = evalEffect(
          { state, sourceId: cardId },
          card.onInstallFromNonHq,
        );
        if (!r.ok) return r;
      }
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "install_archives_card_ignore_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      const destId = resolveInstallServerId(state, action.serverId);
      const dest = destId ? state.servers[destId] : null;
      if (!card || !dest) {
        log(state, `Archives install — invalid card or server.`);
        return { ok: true };
      }
      if (!state.corp.discard.includes(cardId)) {
        log(state, `Archives install — card not in Archives.`);
        return { ok: true };
      }
      state.corp.discard = state.corp.discard.filter((id) => id !== cardId);
      if (card.type === "ice") {
        dest.ice.unshift(cardId);
        card.zone = `server:${destId}:ice`;
      } else {
        dest.root.push(cardId);
        card.zone = `server:${destId}:root`;
      }
      card.rezzed = false;
      card.faceup = false;
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementTokens = card.advancementTokens ?? 0;
      }
      noteInstalledThisTurn(state, cardId);
      log(
        state,
        `Install ${card.title} from Archives on ${destId} ignoring costs (unrezzed).`,
      );
      if (card.onInstallFromNonHq) {
        const r = evalEffect(
          { state, sourceId: cardId },
          card.onInstallFromNonHq,
        );
        if (!r.ok) return r;
      }
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "install_hq_card_ignore_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      const destId = resolveInstallServerId(state, action.serverId);
      const dest = destId ? state.servers[destId] : null;
      if (!card || !dest) {
        log(state, `HQ install — invalid card or server.`);
        return { ok: true };
      }
      if (!state.corp.hand.includes(cardId)) {
        log(state, `HQ install — card not in HQ.`);
        return { ok: true };
      }
      if (card.type !== "ice" && dest.kind !== "remote") {
        log(state, `HQ install — non-ice must target a remote server.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      if (card.type === "ice") {
        dest.ice.unshift(cardId);
        card.zone = `server:${destId}:ice`;
      } else {
        dest.root.push(cardId);
        card.zone = `server:${destId}:root`;
      }
      card.rezzed = false;
      card.faceup = true;
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementTokens = card.advancementTokens ?? 0;
      }
      noteInstalledThisTurn(state, cardId);
      log(
        state,
        `Install ${card.title} from HQ on ${destId} ignoring costs (unrezzed).`,
      );
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    default:
      return null;
  }
}
