/**
 * Primitive kinds for Corp ice installs. The kind registry (`applyCoreKinds`)
 * dispatches here.
 */
import { iceInstallCapRefuses } from "../../state/cardFlags/staticFlags.js";
import { revealCards } from "../../state/visibility/reveal.js";
import {
  type EffectCtx,
  type EvalResult,
  fireIceRezDuringRunHooks,
  evalEffect,
  applyPrimitive,
  fireOnInstall,
  fireHostRezStateTriggers,
  fireOnRez,
} from "../eval.js";
import { type Effect, type Primitive, fx } from "../ir.js";
import { serverIdForIce } from "../../cards/stubs.js";
import {
  corpInstallCost,
  creditsAvailableForInstall,
  payInstallCost,
} from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { fireOnFirstIceRezEachTurn } from "../../state/triggers/miscConditionalHooks.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { noteInstalledThisTurn } from "../../state/install/programHardwareInstall.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import {
  setRunnerPosition,
  addOutermostIce,
} from "../../state/uninstallAndPosition/runPosition.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import type { ServerId } from "../../state/types.js";

export function applyCorpIceInstallKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "install_gachapon_after_choice": {
      const aside = [...(state.runner.setAside ?? [])];
      const need = 3;
      if (aside.length === 0) {
        log(state, `Gachapon — no remaining set-aside cards.`);
        return { ok: true };
      }
      if (aside.length <= need) {
        // Shuffle all remaining into stack; nothing to RFG.
        return applyPrimitive(ctx, {
          kind: "shuffle_selected_rfg_rest",
          cardIds: aside,
        });
      }
      // Offer iterative selection until `need` picked (or use combinatorial).
      // Deterministic UX: choose exactly `need` via continue leaf.
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: aside.map((id) => ({
          id: `gacha-shuf:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into stack (1/${need})`,
          effect: {
            op: "do" as const,
            action: {
              kind: "shuffle_pick_continue" as const,
              need,
              selected: [id],
            },
          },
        })),
        logLine: `${source.title} — shuffle exactly ${need} of ${aside.length} remaining into stack; RFG rest.`,
      });
      return { ok: true };
    }

    case "install_ice_inward_free": {
      // Brân 1.0: "You may install 1 piece of ice from HQ or Archives
      // directly inward from this ice, ignoring all costs." The Corp
      // chooses the ice (or declines).
      if (!state.run || source.type !== "ice") {
        log(state, `Install ice inward — not during encounter of ice.`);
        return { ok: true };
      }
      const serverId = state.run.attackedServerId;
      const server = state.servers[serverId];
      const pos = server.ice.indexOf(sourceId);
      if (pos < 0) {
        log(
          state,
          `Install ice inward — source not protecting attacked server.`,
        );
        return { ok: true };
      }
      const candidates = [...state.corp.hand, ...state.corp.discardPile].filter(
        (id) => state.cards[id].type === "ice",
      );
      if (candidates.length === 0) {
        log(state, `Install ice inward — no ice in HQ or Archives.`);
        return { ok: true };
      }
      const chosen = action.cardId;
      if (!chosen) {
        openPendingChoose(state, {
          sourceId,
          chooser: "corp",
          options: [
            {
              id: "decline",
              label: "Decline",
              effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
            },
            ...candidates.map((id) => ({
              id: `bran:${id}`,
              label: `Install ${state.cards[id]!.title} inward`,
              effect: fx.do({ kind: "install_ice_inward_free", cardId: id }),
            })),
          ],
        });
        return { ok: true };
      }
      if (!candidates.includes(chosen)) return { ok: true };
      if (iceInstallCapRefuses(state, state.cards[chosen])) return { ok: true };
      const iceFromHq = chosen;
      state.corp.hand = state.corp.hand.filter((id) => id !== iceFromHq);
      state.corp.discardPile = state.corp.discardPile.filter(
        (id) => id !== iceFromHq,
      );
      const card = state.cards[iceFromHq];
      // Insert immediately inward (higher index) of source.
      server.ice.splice(pos + 1, 0, iceFromHq);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementCounters = card.advancementCounters ?? 0;
      log(
        state,
        `Install ${card.title} inward of ${source.title} on ${serverId} (ignoring costs).`,
      );
      return { ok: true };
    }

    case "install_ice": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.turn.rdLookedCards.includes(cardId)) {
        log(state, `ABT install — card not in look zone.`);
        return { ok: true };
      }
      state.turn.rdLookedCards = state.turn.rdLookedCards.filter(
        (x) => x !== cardId,
      );
      if (iceInstallCapRefuses(state, card)) {
        trashCard(state, cardId, { by: source.side });
        return { ok: true };
      }
      let serverId = action.serverId as import("../../state/types.js").ServerId;
      if (action.serverId === "__new_remote__") {
        const remoteNum = state.nextRemoteNumber++;
        serverId =
          `remote-${remoteNum}` as import("../../state/types.js").ServerId;
        state.servers[serverId] = {
          id: serverId,
          kind: "remote",
          ice: [],
          root: [],
        };
      }
      const dest = state.servers[serverId];
      if (!dest) {
        trashCard(state, cardId, { by: source.side });
        return { ok: true };
      }
      dest.ice.unshift(cardId);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = true;
      card.faceup = true;
      noteInstalledThisTurn(state, cardId);
      state.turn.iceRezzedThisTurn = (state.turn.iceRezzedThisTurn ?? 0) + 1;
      state.turn.rezzedThisTurnIds = [
        ...(state.turn.rezzedThisTurnIds ?? []),
        cardId,
      ];
      log(
        state,
        `ABT — install and rez ${card.title} protecting ${serverId} ignoring costs.`,
      );
      const identity = state.cards[state.corp.identityId];
      if (
        identity?.onFirstIceRezEachTurn &&
        state.turn.iceRezzedThisTurn === 1
      ) {
        fireOnFirstIceRezEachTurn(state, state.corp.identityId);
        if (state.pendingChoice) return { ok: true };
      }
      fireOnRez(state, cardId);
      return { ok: true };
    }

    case "may_install_next_design_ice": {
      const remaining = Math.max(0, action.remaining);
      const usedServerIds = action.usedServerIds ?? [];
      const proceedToDraw = (): EvalResult =>
        evalEffect(ctx, {
          op: "do",
          action: { kind: "draw_until_hq_has", amount: action.thenDrawToHq },
        });
      if (remaining <= 0) return proceedToDraw();
      const iceCards = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (iceCards.length === 0) return proceedToDraw();
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "next-design-done",
          label: "Done installing ice",
          effect: {
            op: "do" as const,
            action: {
              kind: "draw_until_hq_has" as const,
              amount: action.thenDrawToHq,
            },
          },
        },
        ...iceCards.map((id) => ({
          id: `next-design-ice:${id}`,
          label: `Install ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "choose_next_design_server" as const,
              cardId: id,
              remaining,
              usedServerIds,
              thenDrawToHq: action.thenDrawToHq,
            },
          },
        })),
      ];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `${source.title} — may install up to ${remaining} more ice (≤1 per server, ignoring costs).`,
      });
      return { ok: true };
    }

    case "install_next_design_on_server": {
      const remaining = Math.max(0, action.remaining);
      const usedServerIds = [...(action.usedServerIds ?? [])];
      const cardId = action.cardId;
      const card = state.cards[cardId];
      let serverId = action.serverId;
      if (serverId === "__new_remote__") {
        const remoteNum = state.nextRemoteNumber++;
        serverId = `remote-${remoteNum}`;
        state.servers[serverId as import("../../state/types.js").ServerId] = {
          id: serverId as import("../../state/types.js").ServerId,
          kind: "remote",
          ice: [],
          root: [],
        };
        log(state, `Create ${serverId} for NEXT Design ice install.`);
      }
      if (card && state.corp.hand.includes(cardId)) {
        const dest =
          state.servers[serverId as import("../../state/types.js").ServerId];
        if (dest) {
          state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
          dest.ice.unshift(cardId);
          card.zone = `server:${serverId}:ice`;
          card.rezzed = false;
          card.faceup = false;
          card.advancementCounters = card.advancementCounters ?? 0;
          noteInstalledThisTurn(state, cardId);
          state.turn.corpInstalledFromHqThisTurn = true;
          usedServerIds.push(serverId);
          log(
            state,
            `Install ${card.title} from HQ protecting ${serverId}, ignoring all costs (${remaining - 1} remaining).`,
          );
          fireOnInstall(state, cardId);
        }
      }
      return evalEffect(ctx, {
        op: "do",
        action: {
          kind: "may_install_next_design_ice",
          remaining: remaining - 1,
          usedServerIds,
          thenDrawToHq: action.thenDrawToHq,
        },
      });
    }

    case "may_install_ice_from_hq_protecting_this_server_ignore_costs": {
      const serverId =
        serverIdForIce(state, sourceId) ??
        (() => {
          const m = /^server:([^:]+):ice$/.exec(source.zone);
          return m ? (m[1] as import("../../state/types.js").ServerId) : null;
        })();
      if (!serverId) {
        log(
          state,
          `Install ice from HQ on this server — source not on server ice.`,
        );
        return { ok: true };
      }
      const iceInHq = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (iceInHq.length === 0) {
        log(state, `Install ice from HQ on ${serverId} — no ice in HQ.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-hq-ice-this-server",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const iceId of iceInHq) {
        options.push({
          id: `hq-ice-this-server:${iceId}`,
          label: `Install ${state.cards[iceId]!.title} protecting ${serverId}`,
          effect: {
            op: "do",
            action: {
              kind: "install_hq_ice_protecting_server_ignore_costs",
              cardId: iceId,
              serverId,
            },
          },
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `May install 1 ice from HQ protecting ${serverId}, ignoring costs.`,
      });
      return { ok: true };
    }

    case "may_install_ice_from_hq_other_server_ignore_costs": {
      if (!state.run) {
        log(state, `Install ice from HQ — no run.`);
        return { ok: true };
      }
      const attacked = state.run.attackedServerId;
      const iceInHq = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      const otherServers = Object.values(state.servers).filter(
        (s) => s.id !== attacked,
      );
      if (iceInHq.length === 0 || otherServers.length === 0) {
        log(
          state,
          `Install ice from HQ on another server — no ice or no other server.`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-hq-ice",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const iceId of iceInHq) {
        for (const server of otherServers) {
          options.push({
            id: `hq-ice:${iceId}:${server.id}`,
            label: `Install ${state.cards[iceId]!.title} protecting ${server.id}`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_ice_protecting_server_ignore_costs",
                cardId: iceId,
                serverId: server.id,
              },
            },
          });
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `May install ice from HQ protecting another server, ignoring costs.`,
      });
      return { ok: true };
    }

    case "install_ice_from_hq_ignore_costs": {
      const iceInHq = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      const servers = Object.values(state.servers);
      if (iceInHq.length === 0 || servers.length === 0) {
        log(state, `Install ice from HQ — no ice in HQ.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const iceId of iceInHq) {
        for (const server of servers) {
          options.push({
            id: `hq-ice:${iceId}:${server.id}`,
            label: `Install ${state.cards[iceId]!.title} protecting ${server.id}`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_ice_protecting_server_ignore_costs",
                cardId: iceId,
                serverId: server.id,
              },
            },
          });
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `Install ice from HQ ignoring costs (any server).`,
      });
      return { ok: true };
    }

    case "install_hq_ice_protecting_server_ignore_costs": {
      const card = state.cards[action.cardId];
      const serverId =
        action.serverId as import("../../state/types.js").ServerId;
      const server = state.servers[serverId];
      if (!card || !server || !state.corp.hand.includes(action.cardId)) {
        log(state, `Install HQ ice — card or server missing.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== action.cardId);
      server.ice.unshift(action.cardId);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementCounters = card.advancementCounters ?? 0;
      log(
        state,
        `Install ${card.title} outermost on ${serverId} (ignore costs).`,
      );
      return { ok: true };
    }

    case "may_install_ice_from_hq_discount_then_move_source": {
      const discount = action.discount ?? 0;
      const iceInHq = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      const servers = Object.values(state.servers);
      if (iceInHq.length === 0 || servers.length === 0) {
        log(state, `Install ice from HQ — no ice or no server.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-hq-ice-discount",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const iceId of iceInHq) {
        for (const server of servers) {
          const pay = Math.max(
            0,
            corpInstallCost(state.cards[iceId]!, server.ice.length) - discount,
          );
          if (creditsAvailableForInstall(state, "corp") < pay) continue;
          options.push({
            id: `hq-ice-disc:${iceId}:${server.id}`,
            label: `Install ${state.cards[iceId]!.title} on ${server.id} for ${pay}¢`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_ice_protecting_server_paying_costs",
                cardId: iceId,
                serverId: server.id,
                discount,
                thenMoveSourceToServerRoot: true,
              },
            },
          });
        }
      }
      if (options.length === 1) {
        log(state, `Install ice from HQ — no affordable ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `May install ice from HQ paying ${discount}¢ less; move ${source.title} to that server root.`,
      });
      return { ok: true };
    }

    case "install_hq_ice_protecting_server_paying_costs": {
      const card = state.cards[action.cardId];
      const serverId =
        action.serverId as import("../../state/types.js").ServerId;
      const server = state.servers[serverId];
      if (!card || !server || !state.corp.hand.includes(action.cardId)) {
        log(state, `Install HQ ice paying costs — card or server missing.`);
        return { ok: true };
      }
      const discount = action.discount ?? 0;
      const pay = Math.max(
        0,
        corpInstallCost(card, server.ice.length) - discount,
      );
      if (creditsAvailableForInstall(state, "corp") < pay) {
        log(state, `Install HQ ice — cannot afford ${pay}¢.`);
        return { ok: true };
      }
      payInstallCost(state, "corp", pay);
      state.corp.hand = state.corp.hand.filter((id) => id !== action.cardId);
      server.ice.unshift(action.cardId);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementCounters = card.advancementCounters ?? 0;
      log(state, `Install ${card.title} outermost on ${serverId} for ${pay}¢.`);
      if (action.thenMoveSourceToServerRoot) {
        const move = evalEffect(ctx, {
          op: "do",
          action: { kind: "move_upgrade_to_server_root", serverId },
        });
        if (!move.ok) return move;
      }
      return { ok: true };
    }

    case "install_and_rez_hq_ice_protecting_server_ignore_costs": {
      const card = state.cards[action.cardId];
      if (!card || !state.corp.hand.includes(action.cardId)) {
        log(state, `Install+rez HQ ice — card not in HQ.`);
        return { ok: true };
      }
      let serverId = action.serverId as import("../../state/types.js").ServerId;
      if (action.serverId === "new-remote") {
        const remoteNum = state.nextRemoteNumber++;
        serverId =
          `remote-${remoteNum}` as import("../../state/types.js").ServerId;
        state.servers[serverId] = {
          id: serverId,
          kind: "remote",
          ice: [],
          root: [],
        };
      }
      const server = state.servers[serverId];
      if (!server) {
        log(state, `Install+rez HQ ice — server missing.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== action.cardId);
      server.ice.unshift(action.cardId);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = true;
      card.faceup = true;
      card.advancementCounters = card.advancementCounters ?? 0;
      revealCards(state, [card.id], sourceId);
      log(
        state,
        `Reveal ${card.title}; install and rez outermost on ${serverId} (ignore costs).`,
      );
      if (!state.turn.rezzedThisTurnIds) state.turn.rezzedThisTurnIds = [];
      if (!state.turn.rezzedThisTurnIds.includes(action.cardId)) {
        state.turn.rezzedThisTurnIds.push(action.cardId);
      }
      state.turn.lastInstalledFromEffectId = action.cardId;
      noteInstalledThisTurn(state, action.cardId);
      state.turn.corpInstalledFromHqThisTurn = true;
      fireOnInstall(state, action.cardId);
      fireOnRez(state, action.cardId);
      fireHostRezStateTriggers(state, action.cardId, "rez");
      fireIceRezDuringRunHooks(state, action.cardId);
      return { ok: true };
    }

    case "install_mti_ice_innermost_from_hq": {
      if (!state.run) {
        log(state, `Mti Mwekundu — no active run.`);
        return { ok: true };
      }
      const iceInHq = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (iceInHq.length === 0) {
        log(state, `Mti Mwekundu — no ice in HQ.`);
        return { ok: true };
      }
      const serverId = state.run.attackedServerId;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: iceInHq.map((id) => ({
          id: `mti:${id}`,
          label: `Install ${state.cards[id]!.title} innermost on ${serverId}`,
          effect: fx.do({
            kind: "install_mti_resolve",
            iceId: id,
            serverId,
          }),
        })),
      });
      return { ok: true };
    }

    case "install_mti_resolve": {
      if (!state.run) return { ok: true };
      const ice = state.cards[action.iceId];
      const serverId =
        action.serverId as import("../../state/types.js").ServerId;
      const server = state.servers[serverId];
      if (!ice || !server) return { ok: true };
      const hqIdx = state.corp.hand.indexOf(action.iceId);
      if (hqIdx >= 0) state.corp.hand.splice(hqIdx, 1);
      // Innermost = end of ice array (highest index).
      const hadApproachedIce = (state.run.passedIceIds?.length ?? 0) > 0;
      server.ice.push(action.iceId);
      ice.zone = `server:${serverId}:ice`;
      ice.rezzed = false;
      ice.faceup = false;
      setRunnerPosition(state.run, server.ice.length - 1);
      state.run.encounter = null;
      log(
        state,
        `Mti Mwekundu — install ${ice.title} innermost on ${serverId}; Runner approaches it.`,
      );
      if (hadApproachedIce) {
        return evalEffect(ctx, fx.do({ kind: "offer_jack_out" }));
      }
      return { ok: true };
    }

    case "install_jinja_drawn_ice": {
      const iceId = action.cardId;
      const serverId = action.serverId as ServerId;
      const server = state.servers[serverId];
      const ice = state.cards[iceId];
      const setAside =
        state.pendingDrawSetAside?.cardIds.includes(iceId) ?? false;
      if (!server || !ice || (!state.corp.hand.includes(iceId) && !setAside)) {
        return { ok: true };
      }
      const discount = action.discount ?? 4;
      const cost = Math.max(
        0,
        corpInstallCost(ice, server.ice.length) - discount,
      );
      if (state.corp.credits < cost) {
        log(state, `Jinja City Grid — cannot afford to install ${ice.title}.`);
        return { ok: true };
      }
      state.corp.credits -= cost;
      if (state.corp.hand.includes(iceId)) {
        state.corp.hand = state.corp.hand.filter((x) => x !== iceId);
      } else if (state.pendingDrawSetAside) {
        state.pendingDrawSetAside.cardIds =
          state.pendingDrawSetAside.cardIds.filter((id) => id !== iceId);
        // It leaves the set-aside zone for the server (CR 4.1.1c).
        removeCardFromCurrentZone(state, iceId);
      }
      // Outermost, as the text names no other position (CR 6.2.2a).
      addOutermostIce(state, serverId, iceId);
      ice.zone = `server:${serverId}:ice`;
      ice.rezzed = false;
      ice.faceup = false;
      log(
        state,
        `Jinja City Grid — install ${ice.title} protecting ${serverId} for ${cost}¢.`,
      );
      return { ok: true };
    }

    case "install_ice_from_hq_outermost_remote_ignore_costs_place_advancements": {
      const advancements = action.advancements ?? 3;
      const iceInHq = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (iceInHq.length === 0) {
        log(state, `Priority Construction — no ice in HQ.`);
        return { ok: true };
      }
      const remotes = Object.values(state.servers).filter(
        (s) => s.kind === "remote",
      );
      const opts: { id: string; label: string; effect: Effect }[] = [];
      for (const iceId of iceInHq) {
        for (const server of remotes) {
          opts.push({
            id: `pc:${iceId}:${server.id}`,
            label: `Install ${state.cards[iceId]!.title} outermost on ${server.id}`,
            effect: fx.do({
              kind: "install_priority_construction_resolve",
              iceId,
              serverId: server.id,
              advancements,
            }),
          });
        }
        opts.push({
          id: `pc:${iceId}:new`,
          label: `Install ${state.cards[iceId]!.title} outermost on new remote`,
          effect: fx.do({
            kind: "install_priority_construction_resolve",
            iceId,
            serverId: "__new_remote__",
            advancements,
          }),
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        // Do not truncate: every ice × remote (plus new-remote) pair is legal.
        options: opts,
      });
      return { ok: true };
    }

    case "win_remote_enforcement_pick_ice": {
      // Printed: install protecting a remote server — Corp chooses which
      // remote, including creating a new one (CR 1.2.1).
      const options: {
        id: string;
        label: string;
        effect: ReturnType<typeof fx.do>;
      }[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.kind !== "remote") continue;
        options.push({
          id: `re-install:${action.iceId}:${sid}`,
          label: `Install protecting ${sid}`,
          effect: fx.do({
            kind: "install_remote_enforcement",
            iceId: action.iceId,
            serverId: sid,
          }),
        });
      }
      options.push({
        id: `re-install:${action.iceId}:new`,
        label: `Install protecting a new remote`,
        effect: fx.do({
          kind: "install_remote_enforcement",
          iceId: action.iceId,
          serverId: "new-remote",
        }),
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
      });
      return { ok: true };
    }

    case "install_ice_choose_server": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice") {
        log(state, `Timely Public Release — invalid ice.`);
        return { ok: true };
      }
      const inZone =
        action.from === "hq"
          ? state.corp.hand.includes(action.iceId)
          : state.corp.discardPile.includes(action.iceId);
      if (!inZone) {
        log(state, `Timely Public Release — ice not in ${action.from}.`);
        return { ok: true };
      }
      const servers = Object.keys(state.servers) as ServerId[];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: servers.map((serverId) => ({
          id: `mo-server:${serverId}`,
          label: `Protect ${serverId}`,
          effect: fx.do({
            kind: "install_ice_choose_position",
            iceId: action.iceId,
            from: action.from,
            serverId,
          }),
        })),
        logLine: `Timely Public Release — choose server for ${ice.title}.`,
      });
      return { ok: true };
    }

    case "install_ice_choose_position": {
      const server = state.servers[action.serverId as ServerId];
      const ice = state.cards[action.iceId];
      if (!server || !ice) {
        log(state, `Timely Public Release — invalid server/ice.`);
        return { ok: true };
      }
      const maxPos = server.ice.length; // 0=outermost … length=innermost
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (let pos = 0; pos <= maxPos; pos++) {
        options.push({
          id: `mo-pos:${pos}`,
          label:
            pos === 0
              ? "Outermost"
              : pos === maxPos
                ? "Innermost"
                : `Position ${pos}`,
          effect: fx.do({
            kind: "install_ice_resolve",
            iceId: action.iceId,
            from: action.from,
            serverId: action.serverId,
            position: pos,
          }),
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `Timely Public Release — choose position on ${action.serverId}.`,
      });
      return { ok: true };
    }

    case "install_ice_resolve": {
      const serverId = action.serverId as ServerId;
      const server = state.servers[serverId];
      const ice = state.cards[action.iceId];
      if (!server || !ice || ice.type !== "ice") {
        log(state, `Timely Public Release — install failed.`);
        return { ok: true };
      }
      if (iceInstallCapRefuses(state, ice)) return { ok: true };
      if (action.from === "hq") {
        if (!state.corp.hand.includes(action.iceId)) return { ok: true };
        state.corp.hand = state.corp.hand.filter((id) => id !== action.iceId);
      } else {
        if (!state.corp.discardPile.includes(action.iceId)) return { ok: true };
        state.corp.discardPile = state.corp.discardPile.filter(
          (id) => id !== action.iceId,
        );
      }
      const pos = Math.max(0, Math.min(action.position, server.ice.length));
      server.ice.splice(pos, 0, action.iceId);
      ice.zone = `server:${serverId}:ice`;
      ice.rezzed = false;
      ice.faceup = false;
      log(
        state,
        `Timely Public Release — install ${ice.title} at position ${pos} on ${serverId} ignoring costs.`,
      );
      return { ok: true };
    }

    case "may_install_ice_from_hq_inward_of_source_ignore_costs": {
      if (!state.run || source?.type !== "ice") {
        log(state, `Bloom inward — not during ice encounter.`);
        return { ok: true };
      }
      const iceInHq = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (iceInHq.length === 0) {
        log(state, `Bloom inward — no ice in HQ.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "decline",
          label: "Decline",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        },
      ];
      for (const iceId of iceInHq) {
        options.push({
          id: `inward:${iceId}`,
          label: `Install ${state.cards[iceId]!.title} inward`,
          effect: fx.do({
            kind: "install_ice_inward",
            cardId: iceId,
          }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "install_ice_inward": {
      if (!state.run || source?.type !== "ice") return { ok: true };
      const iceId = action.cardId;
      if (!iceId || !state.corp.hand.includes(iceId)) return { ok: true };
      if (iceInstallCapRefuses(state, state.cards[iceId])) return { ok: true };
      const serverId = state.run.attackedServerId;
      const server = state.servers[serverId];
      const pos = server.ice.indexOf(sourceId);
      if (pos < 0) {
        log(state, `Bloom — source not on attacked server.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== iceId);
      const card = state.cards[iceId]!;
      server.ice.splice(pos + 1, 0, iceId);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementCounters = card.advancementCounters ?? 0;
      log(
        state,
        `Bloom — install ${card.title} inward of ${source.title} (ignore costs).`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
