/**
 * Primitive kinds whose procedure is install.
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
import { serverIdForIce } from "../../cards/stubs.js";
import { occurCheckpoint } from "../../legality/checkpoints.js";
import {
  corpInstallCost,
  creditsAvailableForInstall,
  installAndRezPaid,
  spendCreditsForInstall,
  subtractRunnerCreditPool,
} from "../../state/costs.js";
import { log } from "../../state/createGame.js";
import {
  fireOnFirstIceRezEachTurn,
  fireOnInstallFromNonHq,
  fireOnInstallProgramFromHeap,
} from "../../state/miscConditionalHooks.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import {
  noteInstalledThisTurn,
  noteProgramOrHardwareInstalled,
} from "../../state/programHardwareInstall.js";
import {
  moveRunnerCardToHeap,
  noteFirstInstallInServerRootThisTurn,
} from "../../state/trashHooks.js";
import {
  memoryLimit,
  usedMemory,
  effectiveMemoryCost,
} from "../../state/turn.js";
import { noteVirusProgramInstalled } from "../../state/virusInstall.js";
import { CR } from "../../timing/labels.js";
import {
  corpCardInstallable,
  resolveInstallServerId,
} from "../corpInstall.js";
import { trashCorpCardToArchives } from "../corpTrash.js";
import {
  fireIceRezDuringRunHooks,
  museZoneCards,
  finishMuseInstall,
  serverHostingCard,
  returnRdLookedToDeckTop,
  shuffleCorpRdAfterSearch,
  offerInstallRezSplit,
  evalEffect,
  applyPrimitive,
} from "../eval.js";
import { fx } from "../ir.js";
import {
  canInstallHeapCard,
  gripInstallCostAfterDiscount,
  installGripCardDiscounted,
  installHeapCardDiscounted,
  installSetAsideCardPayingNoShuffle,
  installSetAsideIgnoringCosts,
  installSetAsideProgramPaying,
  installStackCardPaying,
  installStackProgramPaying,
  shuffleRunnerStack,
} from "../runnerInstall.js";

import {
  fireOnInstall,
  fireHostRezStateTriggers,
  fireOnRez,
} from "../eval.js";

export function applyInstallKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "install_any_number_from_hq_ignore_costs": {
      const installable = state.corp.hand.filter((id) =>
        corpCardInstallable(state.cards[id]?.type ?? ""),
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "done-hq-install",
          label: "Done",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `hq-any:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id}`,
              effect: {
                op: "seq",
                effects: [
                  {
                    op: "do",
                    action: {
                      kind: "install_hq_card_ignore_costs",
                      cardId,
                      serverId: server.id,
                    },
                  },
                  {
                    op: "do",
                    action: { kind: "install_any_number_from_hq_ignore_costs" },
                  },
                ],
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            options.push({
              id: `hq-any:${cardId}:${server.id}`,
              label: `Install ${card.title} on ${server.id}`,
              effect: {
                op: "seq",
                effects: [
                  {
                    op: "do",
                    action: {
                      kind: "install_hq_card_ignore_costs",
                      cardId,
                      serverId: server.id,
                    },
                  },
                  {
                    op: "do",
                    action: { kind: "install_any_number_from_hq_ignore_costs" },
                  },
                ],
              },
            });
          }
          options.push({
            id: `hq-any:${cardId}:new`,
            label: `Install ${card.title} on new remote`,
            effect: {
              op: "seq",
              effects: [
                {
                  op: "do",
                  action: {
                    kind: "install_hq_card_ignore_costs",
                    cardId,
                    serverId: "__new_remote__",
                  },
                },
                {
                  op: "do",
                  action: { kind: "install_any_number_from_hq_ignore_costs" },
                },
              ],
            },
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `Install any number from HQ ignoring all costs (${installable.length} installable).`,
});
      return { ok: true };
    }

case "may_install_from_archives_in_remote_root_with_advancements": {
      const amount = Math.max(0, action.amount);
      const installable = state.corp.discardPile.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "agenda" || t === "asset" || t === "upgrade";
      });
      const affordable = installable.filter(
        (id) =>
          creditsAvailableForInstall(state, "corp") >=
          corpInstallCost(state.cards[id]!, 0),
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-kakurenbo-install",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of affordable) {
        const card = state.cards[cardId]!;
        const cost = corpInstallCost(card, 0);
        for (const server of Object.values(state.servers)) {
          if (server.kind !== "remote") continue;
          options.push({
            id: `kak:${cardId}:${server.id}`,
            label: `Install ${card.title} on ${server.id} (${cost}¢) +${amount} adv`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_archives_remote_root_with_advancements" as const,
                cardId,
                serverId: server.id,
                amount,
              },
            },
          });
        }
        options.push({
          id: `kak:${cardId}:new`,
          label: `Install ${card.title} on new remote (${cost}¢) +${amount} adv`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_archives_remote_root_with_advancements" as const,
              cardId,
              serverId: "__new_remote__",
              amount,
            },
          },
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — may install from Archives in remote root +${amount} advancements (paying).`,
});
      return { ok: true };
    }

case "install_archives_remote_root_with_advancements": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      const destId = resolveInstallServerId(state, action.serverId);
      const dest = destId ? state.servers[destId] : null;
      if (!card || !dest || dest.kind !== "remote") {
        log(state, `Kakurenbo install — invalid card or remote.`);
        return { ok: true };
      }
      if (!state.corp.discardPile.includes(cardId)) {
        log(state, `Kakurenbo install — card not in Archives.`);
        return { ok: true };
      }
      const cost = corpInstallCost(card, 0);
      if (creditsAvailableForInstall(state, "corp") < cost) {
        log(state, `Kakurenbo install — cannot afford ${cost}¢.`);
        return { ok: true };
      }
      spendCreditsForInstall(state, "corp", cost);
      state.corp.discardPile = state.corp.discardPile.filter((id) => id !== cardId);
      dest.root.push(cardId);
      card.zone = `server:${dest.id}:root`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementCounters = (card.advancementCounters ?? 0) + action.amount;
      noteInstalledThisTurn(state, cardId);
      log(
        state,
        `Install ${card.title} from Archives onto ${dest.id} for ${cost}¢ with ${action.amount} advancement(s).`,
      );
      fireOnInstall(state, cardId);
      return { ok: true };
    }

case "install_set_aside": {
      return installSetAsideCardPayingNoShuffle(
        state,
        action.cardId,
        Math.max(0, action.discount),
      );
    }

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

case "install_caissa_from_zone_ignore_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "program") return { ok: true };
      if (state.runner.hand.includes(cardId)) {
        state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      } else if (state.runner.discardPile.includes(cardId)) {
        state.runner.discardPile = state.runner.discardPile.filter((id) => id !== cardId);
      } else return { ok: true };
      card.zone = "runner:installed";
      state.runner.installed.push(cardId);
      log(state, `Install ${card.title} ignoring all costs.`);
      return { ok: true };
    }

case "install_rez_rd_looked_card_ignore_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.turn.rdLookedCards.includes(cardId)) {
        log(state, `Install looked R&D card — not in look zone.`);
        returnRdLookedToDeckTop(state);
        return { ok: true };
      }
      state.turn.rdLookedCards = state.turn.rdLookedCards.filter(
        (x) => x !== cardId,
      );
      returnRdLookedToDeckTop(state);
      const remoteNum = state.nextRemoteNumber++;
      const sid =
        `remote-${remoteNum}` as import("../../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      if (card.type === "ice") {
        state.servers[sid].ice.push(cardId);
        card.zone = `server:${sid}:ice`;
      } else {
        state.servers[sid].root.push(cardId);
        card.zone = `server:${sid}:root`;
      }
      const doRez = card.type !== "agenda";
      card.rezzed = false;
      card.faceup = card.type === "agenda";
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementCounters = card.advancementCounters ?? 0;
      }
      noteInstalledThisTurn(state, cardId);
      log(
        state,
        `Install ${card.title} from looked R&D on ${sid} ignoring costs.`,
      );
      fireOnInstall(state, cardId);
      if (!doRez && card.type !== "ice") {
        noteFirstInstallInServerRootThisTurn(state, sid, cardId);
      }
      if (doRez) {
        log(
          state,
          `Pay 0¢ to rez ${card.title} (all costs ignored, CR 1.16.5c).`,
        );
        occurCheckpoint(
          state,
          "instruction",
          "Rez cost paid",
          [CR.costCheckpoint],
          sourceId,
        );
        if (card.type !== "ice") {
          noteFirstInstallInServerRootThisTurn(state, sid, cardId);
        }
        card.rezzed = true;
        card.faceup = true;
        if ((card.hostedCreditsOnInstall ?? 0) > 0) {
          card.hostedCredits = card.hostedCreditsOnInstall;
        }
        if ((card.recurringCreditsMax ?? 0) > 0) {
          card.recurringCredits = card.recurringCreditsMax;
        }
        log(state, `Rez ${card.title}.`);
        fireOnRez(state, cardId);
      }
      if (doRez && card.type === "ice") {
        fireHostRezStateTriggers(state, cardId, "rez");
      }
      return { ok: true };
    }

case "install_rd_looked_card_paying_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.turn.rdLookedCards.includes(cardId)) {
        log(state, `Install looked R&D card — not in look zone.`);
        returnRdLookedToDeckTop(state);
        return { ok: true };
      }
      const cost = corpInstallCost(card, 0);
      if (creditsAvailableForInstall(state, "corp") < cost) {
        log(state, `Install looked R&D card — cannot afford ${cost}¢.`);
        returnRdLookedToDeckTop(state);
        return { ok: true };
      }
      spendCreditsForInstall(state, "corp", cost);
      state.turn.rdLookedCards = state.turn.rdLookedCards.filter(
        (x) => x !== cardId,
      );
      state.corp.hand.push(cardId);
      card.zone = "corp:hq";
      card.faceup = true;
      const r = evalEffect(
        { state, sourceId },
        {
          op: "do",
          action: { kind: "install_hq_card_paying_costs", cardId },
        },
      );
      returnRdLookedToDeckTop(state);
      return r;
    }

case "install_rez_rd_ice_on_source_server": {
      const host = serverHostingCard(state, sourceId);
      if (!host) {
        log(state, `${source.title} — not installed on a server.`);
        return { ok: true };
      }
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "ice") {
        log(state, `Install ice from R&D — invalid ice.`);
        return { ok: true };
      }
      const deckIdx = state.corp.deck.indexOf(cardId);
      if (deckIdx < 0) {
        log(state, `Install ice from R&D — not in R&D.`);
        return { ok: true };
      }
      const discount = Math.max(0, action.totalDiscount ?? 0);
      const installCost = corpInstallCost(card, host.ice.length);
      const rezCost = card.rezCost ?? 0;
      const installUnrezzed = (installPay: number): EvalResult => {
        state.corp.deck.splice(deckIdx, 1);
        shuffleCorpRdAfterSearch(state);
        state.corp.credits -= installPay;
        host.ice.unshift(cardId);
        card.zone = `server:${host.id}:ice`;
        card.rezzed = false;
        card.faceup = true;
        log(state, `Install ${card.title} on ${host.id} for ${installPay}¢.`);
        log(
          state,
          `Reveal ${card.title} (CR ${CR.revealForInstallAndRez.number}).`,
        );
        return { ok: true };
      };
      if (discount > 0 && action.installDiscount === undefined) {
        let cheapest = Number.POSITIVE_INFINITY;
        for (let i = 0; i <= discount; i++) {
          cheapest = Math.min(
            cheapest,
            installAndRezPaid(installCost, rezCost, i, discount - i),
          );
        }
        if (state.corp.credits < cheapest) {
          const installDiscount = Math.min(discount, installCost);
          const installPay = Math.max(0, installCost - installDiscount);
          if (state.corp.credits < installPay) {
            log(
              state,
              `Cannot afford to install ${card.title} for ${installPay}¢ — leave in R&D.`,
            );
            return { ok: true };
          }
          return installUnrezzed(installPay);
        }
      }
      const split = offerInstallRezSplit(
        state,
        sourceId,
        discount,
        installCost,
        rezCost,
        action.installDiscount,
        (installDiscount) => ({
          op: "do",
          action: {
            kind: "install_rez_rd_ice_on_source_server",
            cardId,
            totalDiscount: discount,
            installDiscount,
          },
        }),
      );
      if (split.offered) return { ok: true };
      const total = split.pay;
      const chosenInstall = action.installDiscount ?? 0;
      const installPay = Math.max(0, installCost - chosenInstall);
      if (state.corp.credits < total) {
        if (state.corp.credits >= installPay) return installUnrezzed(installPay);
        log(
          state,
          `Cannot afford to install and rez ${card.title} for ${total}¢ — leave in R&D.`,
        );
        return { ok: true };
      }
      state.corp.deck.splice(deckIdx, 1);
      shuffleCorpRdAfterSearch(state);
      state.corp.credits -= total;
      host.ice.unshift(cardId);
      card.zone = `server:${host.id}:ice`;
      card.rezzed = true;
      card.faceup = true;
      log(
        state,
        `Install and rez ${card.title} on ${host.id} for ${total}¢ (${discount}¢ divided between install and rez; CR ${CR.totalInstallRez.number}).`,
      );
      return { ok: true };
    }

case "install_hq_new_remotes_with_advancements": {
      const max = Math.max(0, action.max);
      const adv = Math.max(0, action.advancements);
      const eligible = state.corp.hand.filter((id) => {
        const t = state.cards[id].type;
        return t === "agenda" || t === "asset" || t === "ice";
      });
      let installed = 0;
      for (const pick of eligible) {
        if (installed >= max) break;
        const card = state.cards[pick];
        const cost = corpInstallCost(card, 0);
        if (state.corp.credits < cost) {
          log(
            state,
            `Mitosis install — skip ${card.title} (need ${cost}¢, have ${state.corp.credits}).`,
          );
          continue;
        }
        state.corp.credits -= cost;
        state.corp.hand = state.corp.hand.filter((id) => id !== pick);
        const remoteNum = state.nextRemoteNumber++;
        const sid =
          `remote-${remoteNum}` as import("../../state/types.js").ServerId;
        state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
        state.turn.remotesCreatedThisTurn += 1;
        if (card.type === "ice") {
          state.servers[sid].ice.push(pick);
          card.zone = `server:${sid}:ice`;
        } else {
          state.servers[sid].root.push(pick);
          card.zone = `server:${sid}:root`;
        }
        card.rezzed = false;
        card.faceup = false;
        card.advancementCounters = (card.advancementCounters ?? 0) + adv;
        noteInstalledThisTurn(state, pick);
        if (!state.turn.cannotScoreOrRezCardIds.includes(pick)) {
          state.turn.cannotScoreOrRezCardIds.push(pick);
        }
        installed += 1;
        log(
          state,
          `${source.title} — install ${card.title} on ${sid} with ${adv} advancement(s); cannot score/rez this turn.`,
        );
      }
        if (installed === 0) {
        log(state, `${source.title} — no HQ cards installed.`);
      }
      return { ok: true };
    }

case "install_from_hq_or_archives": {
      // May install 1 card from HQ or Archives (Ansel / Ablative). Auto: first from HQ, else Archives.
      const eligible = (id: string, allowOperation: boolean): boolean => {
        const t = state.cards[id].type;
        if (action.excludeAgenda && t === "agenda") return false;
        if (t === "operation") return allowOperation && !action.excludeAgenda;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      };
      const pick =
        state.corp.hand.find((id) => eligible(id, true)) ??
        state.corp.discardPile.find((id) => eligible(id, false));
      if (!pick) {
        log(state, `Install from HQ/Archives — no eligible card.`);
        return { ok: true };
      }
      const fromArchives = state.corp.discardPile.includes(pick);
      const card = state.cards[pick];
      if (card.type === "operation") {
        log(state, `Install from HQ/Archives — operations are not installable.`);
        return { ok: true };
      }
      // Remove from current zone
      state.corp.hand = state.corp.hand.filter((id) => id !== pick);
      state.corp.discardPile = state.corp.discardPile.filter((id) => id !== pick);
      const attacked =
        state.timing.structure === "breach" && state.run
          ? state.servers[state.run.attackedServerId]
          : undefined;
      if (attacked && card.type !== "ice") {
        attacked.root.push(pick);
        card.zone = `server:${attacked.id}:root`;
        card.rezzed = false;
        card.faceup = false;
        log(
          state,
          `A card is installed in the root of the breached server (CR ${CR.checkpointCardEnteringRoot.number}).`,
        );
        // CR 10.3.1j candidates come from the zone diff at 10.3.1a.
        occurCheckpoint(
          state,
          "instruction",
          "Install into a breached root",
          [CR.checkpointCardEnteringRoot],
          sourceId,
        );
        return { ok: true };
      }
      // Drafter: ice installed during its encounter protects the attacked
      // server, outward of the Runner (CR 6.2.6a).
      if (
        card.type === "ice" &&
        state.run?.encounter?.iceId === sourceId &&
        state.servers[state.run.attackedServerId]
      ) {
        const attackedServer = state.servers[state.run.attackedServerId]!;
        attackedServer.ice.unshift(pick);
        card.zone = `server:${attackedServer.id}:ice`;
        card.rezzed = false;
        card.faceup = false;
        if (typeof state.run.position === "number") state.run.position += 1;
        log(
          state,
          `Install ${card.title} outward of the Runner on ${attackedServer.id} (CR ${CR.iceChangeOutward.number}).`,
        );
        return { ok: true };
      }
      // New remote always differs from source server (Ablative excludeSourceServer).
      const remoteNum = state.nextRemoteNumber++;
      const sid = `remote-${remoteNum}` as import("../../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      if (card.type === "ice") {
        state.servers[sid].ice.push(pick);
        card.zone = `server:${sid}:ice`;
      } else {
        state.servers[sid].root.push(pick);
        card.zone = `server:${sid}:root`;
      }
      card.rezzed = false;
      card.faceup = false;
      log(
        state,
        `Install ${card.title} from HQ/Archives onto ${sid} (ignoring costs).`,
      );
      if (fromArchives && card.onInstallFromNonHq) {
        fireOnInstallFromNonHq(state, pick);
        if (state.pendingChoice) return { ok: true };
      }
      return { ok: true };
    }

case "may_install_facedown_from_archives": {
      const installable = state.corp.discardPile.filter((id) => {
        const t = state.cards[id].type;
        return (
          t === "agenda" ||
          t === "asset" ||
          t === "ice" ||
          t === "upgrade"
        );
      });
      if (installable.length === 0) {
        log(state, `Install facedown from Archives — no eligible card.`);
        return { ok: true };
      }
      const pick = installable[0]!;
      state.corp.discardPile = state.corp.discardPile.filter((id) => id !== pick);
      const card = state.cards[pick]!;
      const remoteNum = state.nextRemoteNumber++;
      const sid = `remote-${remoteNum}` as import("../../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      if (card.type === "ice") {
        state.servers[sid].ice.push(pick);
        card.zone = `server:${sid}:ice`;
      } else {
        state.servers[sid].root.push(pick);
        card.zone = `server:${sid}:root`;
      }
      card.rezzed = false;
      card.faceup = false;
      log(
        state,
        `Install ${card.title} facedown from Archives onto ${sid}.`,
      );
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
        log(state, `Install ice inward — source not protecting attacked server.`);
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

case "install_rez_bioroid_inward": {
      if (!state.run || source.type !== "ice") {
        log(state, `Howler — not during encounter of ice.`);
        return { ok: true };
      }
      const candidates = [...state.corp.hand, ...state.corp.discardPile].filter(
        (id) => {
          const c = state.cards[id];
          return (
            c && c.type === "ice" && (c.subtypes ?? []).includes("bioroid")
          );
        },
      );
      if (candidates.length === 0) {
        log(state, `Howler — no bioroid ice in HQ/Archives.`);
        return { ok: true };
      }
      const serverId = state.run.attackedServerId;
      const server = state.servers[serverId];
      const pos = server.ice.indexOf(sourceId);
      if (pos < 0) {
        log(state, `Howler — source not protecting attacked server.`);
        return { ok: true };
      }
      if (candidates.length === 1) {
        return applyPrimitive(ctx, {
          kind: "install_rez_chosen",
          cardId: candidates[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: candidates.map((id) => ({
          id: `howler:${id}`,
          label: `Install and rez ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_rez_chosen" as const,
              cardId: id,
            },
          },
        })),
logLine: `Howler — choose a bioroid ice to install and rez.`,
});
      return { ok: true };
    }

case "install_rez_chosen": {
      if (!state.run || source.type !== "ice") return { ok: true };
      const id = action.cardId;
      const card = state.cards[id];
      if (!card) return { ok: true };
      const serverId = state.run.attackedServerId;
      const server = state.servers[serverId];
      const pos = server.ice.indexOf(sourceId);
      if (pos < 0) return { ok: true };
      const fromHq = state.corp.hand.includes(id);
      if (fromHq) {
        state.corp.hand = state.corp.hand.filter((cid) => cid !== id);
      } else {
        state.corp.discardPile = state.corp.discardPile.filter((cid) => cid !== id);
      }
      server.ice.splice(pos + 1, 0, id);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = true;
      card.faceup = true;
      card.advancementCounters = card.advancementCounters ?? 0;
      state.run.howlerId = sourceId;
      state.run.howlerInstalledIceId = id;
      log(
        state,
        `Install and rez ${card.title} inward of ${source.title} on ${serverId}, ignoring all costs (CR 10.1).`,
      );
      return { ok: true };
    }

case "may_install_from_grip": {
      const discount = action.discount ?? 0;
      const typeFilter =
        action.types && action.types.length > 0
          ? new Set(action.types)
          : null;
      const subtypeFilter = action.subtype?.toLowerCase() ?? null;
      const installable = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (!["program", "hardware", "resource"].includes(c.type)) {
          return false;
        }
        if (typeFilter && !typeFilter.has(c.type as "program" | "hardware" | "resource")) {
          return false;
        }
        if (
          subtypeFilter &&
          !(c.subtypes ?? []).some((s) => s.toLowerCase() === subtypeFilter)
        ) {
          return false;
        }
        if (c.installOnIce || (c.subtypes ?? []).includes("trojan")) {
          return false;
        }
        if (c.type === "program") {
          const need = effectiveMemoryCost(state, id);
          if (usedMemory(state) + need > memoryLimit(state)) return false;
        }
        const cost = gripInstallCostAfterDiscount(state, c, discount);
        return creditsAvailableForInstall(state, "runner") >= cost;
      });
      if (installable.length === 0) {
        log(state, `May install from grip — no installable affordable cards.`);
        return { ok: true };
      }
      const options = [
        {
          id: "decline",
          label: "Decline to install",
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "runner" as const,
              amount: 0,
            },
          },
        },
        ...installable.map((id) => {
          const c = state.cards[id];
          const cost = gripInstallCostAfterDiscount(state, c, discount);
          return {
            id,
            label: `Install ${c.title} for ${cost}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_grip_card" as const,
                cardId: id,
                discount,
              },
            },
          };
        }),
      ];
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
logLine: `May install a card from grip.`,
});
      return { ok: true };
    }

case "install_stack_program_ignore_costs_track": {
      const id = action.cardId;
      if (!state.runner.deck.includes(id)) {
        log(state, `Install from stack — not in stack.`);
        return { ok: true };
      }
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      // shuffle rest
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      const card = state.cards[id]!;
      // console limit / install into installed ignoring costs
      if ((card.subtypes ?? []).includes("console")) {
        for (const rid of [...state.runner.installed]) {
          const other = state.cards[rid];
          if ((other?.subtypes ?? []).includes("console")) {
            moveRunnerCardToHeap(state, rid);
          }
        }
      }
      state.runner.installed.push(id);
      card.zone = "runner:installed";
      card.faceup = true;
      if ((card.powerCountersOnInstall ?? 0) > 0) {
        card.powerCounters = card.powerCountersOnInstall;
      }
      fireOnInstall(state, id);
      noteProgramOrHardwareInstalled(state, id);
      if (state.run) {
        state.run.betaBuildTrackedInstallId = id;
      } else {
        // track on source until run starts
        (source as { betaBuildPendingTrackId?: string }).betaBuildPendingTrackId = id;
      }
      log(state, `Install ${card.title} from stack ignoring all costs.`);
      return { ok: true };
    }

case "install_and_rez_ice_from_archives": {
      const iceIds = state.corp.discardPile.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (iceIds.length === 0) {
        log(state, `${source.title} — no ice in Archives.`);
        return { ok: true };
      }
      const discount = Math.max(0, action.totalDiscount ?? 0);
      const bpSubtype = action.badPublicityIfNotSubtype;
      const serverIds = Object.keys(state.servers) as import("../../state/types.js").ServerId[];
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const iceId of iceIds) {
        const ice = state.cards[iceId]!;
        const rezCost = ice.rezCost ?? 0;
        for (const sid of serverIds) {
          const installCost = corpInstallCost(ice, state.servers[sid].ice.length);
          const installOff = Math.min(discount, installCost);
          const total = installAndRezPaid(
            installCost,
            rezCost,
            installOff,
            discount - installOff,
          );
          options.push({
            id: `reanim:${iceId}:${sid}`,
            label: `Install+rez ${ice.title} on ${sid} (${total}¢)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_and_rez_archives_ice" as const,
                cardId: iceId,
                totalDiscount: discount,
                badPublicityIfNotSubtype: bpSubtype,
                serverId: sid,
              },
            },
          });
        }
        const freshInstall = corpInstallCost(ice, 0);
        const freshOff = Math.min(discount, freshInstall);
        const freshTotal = installAndRezPaid(
          freshInstall,
          rezCost,
          freshOff,
          discount - freshOff,
        );
        options.push({
          id: `reanim:${iceId}:new-remote`,
          label: `Install+rez ${ice.title} on new remote (${freshTotal}¢)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_and_rez_archives_ice" as const,
              cardId: iceId,
              totalDiscount: discount,
              badPublicityIfNotSubtype: bpSubtype,
              serverId: "new-remote",
            },
          },
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — install and rez ice from Archives (−${discount}¢).`,
});
      return { ok: true };
    }

case "install_and_rez_archives_ice": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "ice" || !state.corp.discardPile.includes(cardId)) {
        log(state, `Reanimation — ice not in Archives.`);
        return { ok: true };
      }
      const discount = Math.max(0, action.totalDiscount ?? 0);
      const destPreview =
        action.serverId === "new-remote"
          ? undefined
          : state.servers[action.serverId as import("../../state/types.js").ServerId];
      const installCost = corpInstallCost(card, destPreview?.ice.length ?? 0);
      const rezCost = card.rezCost ?? 0;
      const split = offerInstallRezSplit(
        state,
        sourceId,
        discount,
        installCost,
        rezCost,
        action.installDiscount,
        (installDiscount) => ({
          op: "do",
          action: {
            kind: "install_and_rez_archives_ice",
            cardId,
            totalDiscount: discount,
            installDiscount,
            serverId: action.serverId,
            ...(action.badPublicityIfNotSubtype
              ? { badPublicityIfNotSubtype: action.badPublicityIfNotSubtype }
              : {}),
          },
        }),
      );
      if (split.offered) return { ok: true };
      const pay = split.pay;
      if (state.corp.credits < pay) {
        return {
          ok: false,
          error: `Insufficient credits to install+rez ${card.title} (${pay}¢).`,
          cites: [CR.playOperation],
        };
      }
      state.corp.credits -= pay;
      state.corp.discardPile = state.corp.discardPile.filter((id) => id !== cardId);
      let destId = action.serverId as import("../../state/types.js").ServerId | "new-remote";
      if (destId === "new-remote") {
        const remoteNum = state.nextRemoteNumber++;
        destId = `remote-${remoteNum}` as import("../../state/types.js").ServerId;
        state.servers[destId] = {
          id: destId,
          kind: "remote",
          ice: [],
          root: [],
        };
      }
      const dest = state.servers[destId];
      if (!dest) {
        log(state, `Reanimation — invalid server.`);
        return { ok: true };
      }
      dest.ice.unshift(cardId);
      card.zone = `server:${destId}:ice`;
      card.rezzed = true;
      card.faceup = true;
      noteInstalledThisTurn(state, cardId);
      if (!(state.turn.rezzedThisTurnIds ?? []).includes(cardId)) {
        state.turn.rezzedThisTurnIds = [
          ...(state.turn.rezzedThisTurnIds ?? []),
          cardId,
        ];
      }
      log(
        state,
        `Install and rez ${card.title} from Archives on ${destId} for ${pay}¢ (−${discount}¢).`,
      );
      const needBp =
        action.badPublicityIfNotSubtype &&
        !(card.subtypes ?? []).includes(action.badPublicityIfNotSubtype);
      if (needBp) {
        const r = evalEffect(
          { state, sourceId },
          { op: "do", action: { kind: "give_bad_publicity", amount: 1 } },
        );
        if (!r.ok) return r;
      }
      fireOnRez(state, cardId);
      fireOnInstall(state, cardId);
      return { ok: true };
    }

case "install_and_rez_asset_or_upgrade_free": {
      // Printed (License Acquisition): "you may install and rez 1 asset
      // or upgrade from HQ or Archives" — the Corp chooses the card.
      const candidates = [...state.corp.hand, ...state.corp.discardPile].filter(
        (id) => {
          const t = state.cards[id].type;
          return t === "asset" || t === "upgrade";
        },
      );
      if (candidates.length === 0) {
        log(state, `Install+rez asset/upgrade — none in HQ/Archives.`);
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
              id: `lic-acq:${id}`,
              label: `Install and rez ${state.cards[id]!.title}`,
              effect: fx.do({
                kind: "install_and_rez_asset_or_upgrade_free",
                cardId: id,
              }),
            })),
          ],
        });
        return { ok: true };
      }
      if (!candidates.includes(chosen)) return { ok: true };
      const pick = chosen;
      const card = state.cards[pick];
      state.corp.hand = state.corp.hand.filter((id) => id !== pick);
      state.corp.discardPile = state.corp.discardPile.filter((id) => id !== pick);
      let serverId: import("../../state/types.js").ServerId;
      if (card.type === "upgrade") {
        // Prefer first remote, else create
        const remotes = Object.values(state.servers).filter(
          (s) => s.kind === "remote",
        );
        if (remotes.length > 0) {
          serverId = remotes[0]!.id;
        } else {
          const remoteNum = state.nextRemoteNumber++;
          serverId = `remote-${remoteNum}`;
          state.servers[serverId] = {
            id: serverId,
            kind: "remote",
            ice: [],
            root: [],
          };
        }
      } else {
        const remoteNum = state.nextRemoteNumber++;
        serverId = `remote-${remoteNum}`;
        state.servers[serverId] = {
          id: serverId,
          kind: "remote",
          ice: [],
          root: [],
        };
      }
      state.servers[serverId].root.push(pick);
      card.zone = `server:${serverId}:root`;
      card.rezzed = true;
      card.faceup = true;
      if ((card.hostedCreditsOnInstall ?? 0) > 0) {
        card.hostedCredits = card.hostedCreditsOnInstall;
      }
      if ((card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      if ((card.badPublicityCountersOnRez ?? 0) > 0 && card.rezzed) {
        card.badPublicityCounters = card.badPublicityCountersOnRez;
      }
      log(
        state,
        `Install and rez ${card.title} on ${serverId} ignoring costs.`,
      );
      fireOnRez(state, pick);
      fireOnInstall(state, pick);
      return { ok: true };
    }

case "install_and_rez_from_archives_free": {
      const pick = state.corp.discardPile.find((id) => {
        const t = state.cards[id].type;
        return (
          t === "asset" || t === "upgrade" || t === "ice" || t === "agenda"
        );
      });
      if (!pick) {
        log(state, `Install+rez from Archives — none available.`);
        return { ok: true };
      }
      const card = state.cards[pick];
      state.corp.discardPile = state.corp.discardPile.filter((id) => id !== pick);
      const remoteNum = state.nextRemoteNumber++;
      const serverId =
        `remote-${remoteNum}` as import("../../state/types.js").ServerId;
      state.servers[serverId] = {
        id: serverId,
        kind: "remote",
        ice: [],
        root: [],
      };
      if (card.type === "ice") {
        state.servers[serverId].ice.push(pick);
        card.zone = `server:${serverId}:ice`;
      } else {
        state.servers[serverId].root.push(pick);
        card.zone = `server:${serverId}:root`;
      }
      if (card.type !== "agenda") {
        card.rezzed = true;
      }
      card.faceup = true;
      if (card.type === "agenda") {
        log(
          state,
          `Reveal ${card.title} (CR ${CR.revealForInstallAndRez.number}).`,
        );
      }
      if ((card.hostedCreditsOnInstall ?? 0) > 0) {
        card.hostedCredits = card.hostedCreditsOnInstall;
      }
      if ((card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      log(
        state,
        `Install${card.type !== "agenda" ? " and rez" : ""} ${card.title} from Archives on ${serverId} ignoring costs.`,
      );
      if (card.onRez && card.rezzed) {
        fireOnRez(state, pick);
      }
      fireOnInstall(state, pick);
      return { ok: true };
    }

case "install_resource_discount": {
      const discount = action.discount;
      // The Runner chooses which grip resource to install (printed:
      // "Install 1 resource from your grip, paying 3 less").
      const matches = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "resource") return false;
        return state.runner.credits >= Math.max(0, c.installCost - discount);
      });
      if (matches.length === 0) {
        log(state, `Install resource discounted — none in grip.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: matches.map((id) => ({
          id: `career-fair:${id}`,
          label: `Install ${state.cards[id]!.title} (${discount}¢ discount)`,
          effect: fx.do({ kind: "install_grip_card", cardId: id, discount }),
        })),
      });
      return { ok: true };
    }

case "install_grip_card": {
      return installGripCardDiscounted(
        state,
        action.cardId,
        action.discount,
        sourceId,
        action.hostId,
      );
    }

case "install_from_grip_discount": {
      const typeSet = new Set(action.types);
      const candidates = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (!typeSet.has(c.type as "program" | "hardware" | "resource")) {
          return false;
        }
        if (c.installOnIce || (c.subtypes ?? []).includes("trojan")) {
          return false;
        }
        if (c.type === "program") {
          const need = effectiveMemoryCost(state, id);
          if (usedMemory(state) + need > memoryLimit(state)) return false;
        }
        const cost = gripInstallCostAfterDiscount(state, c, action.discount);
        return state.runner.credits >= cost;
      });
      if (candidates.length === 0) {
        log(
          state,
          `Install from grip discounted — no affordable ${action.types.join("/")}.`,
        );
        return { ok: true };
      }
      const buildEffect = (id: string): Effect => {
        const installFx: Effect = {
          op: "do",
          action: {
            kind: "install_grip_card",
            cardId: id,
            discount: action.discount,
          },
        };
        const tail: Effect[] = [];
        if (action.mayCharge) {
          tail.push({
            op: "do",
            action: { kind: "may_charge_card", cardId: id },
          });
        }
        if (action.thenOnInstall) {
          tail.push(action.thenOnInstall);
        }
        if (tail.length === 0) return installFx;
        return { op: "seq", effects: [installFx, ...tail] };
      };
      if (candidates.length === 1) {
        return evalEffect({ state, sourceId }, buildEffect(candidates[0]!));
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => {
          const c = state.cards[id];
          const cost = gripInstallCostAfterDiscount(state, c, action.discount);
          return {
            id: `install-${id}`,
            label: `Install ${c.title} for ${cost}¢`,
            effect: buildEffect(id),
          };
        }),
logLine: `Install from grip — choose among ${candidates.length} cards (${action.discount}¢ discount).`,
});
      return { ok: true };
    }

case "install_from_runner_score": {
      const x = state.turn.ipEnforcementTagsRemoved ?? 0;
      const candidates = state.runner.scoreArea.filter((id) => {
        const c = state.cards[id];
        return c?.type === "agenda" && (c.agendaPoints ?? 0) === x;
      });
      if (candidates.length === 0) {
        log(
          state,
          `IP Enforcement — no agenda in Runner score area with ${x} agenda point(s).`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: candidates.map((cardId) => ({
          id: cardId,
          label: `Install ${state.cards[cardId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_runner_score_agenda_on_remote" as const,
              cardId,
              placeAdvancementIfRunnerTagged: true,
            },
          },
        })),
logLine: `IP Enforcement — install agenda (${x} point(s)) from Runner score.`,
});
      return { ok: true };
    }

case "may_install_one_hosted_program": {
      const hosted = (source.hostedCardIds ?? []).filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted programs to install.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...hosted.map((cardId) => ({
            id: cardId,
            label: `Install ${state.cards[cardId]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_hosted_program" as const,
                cardId,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
logLine: `${source.title} — may install 1 hosted program.`,
});
      return { ok: true };
    }

case "install_hosted_program": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (
        !card ||
        card.type !== "program" ||
        !(source.hostedCardIds ?? []).includes(cardId)
      ) {
        log(state, `install_hosted_program — invalid hosted program.`);
        return { ok: true };
      }
      const need = effectiveMemoryCost(state, cardId);
      if (usedMemory(state) + need > memoryLimit(state)) {
        log(state, `install_hosted_program — insufficient MU.`);
        return { ok: true };
      }
      const cost = Math.max(0, card.installCost ?? 0);
      if (state.runner.credits < cost) {
        log(state, `install_hosted_program — insufficient credits (${cost}¢).`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      source.hostedCardIds = (source.hostedCardIds ?? []).filter(
        (id) => id !== cardId,
      );
      card.hostId = undefined;
      card.zone = "runner:installed";
      card.faceup = true;
      state.runner.installed.push(cardId);
      noteVirusProgramInstalled(state, cardId);
      noteProgramOrHardwareInstalled(state, cardId);
      log(state, `Install hosted ${card.title} for ${cost}¢.`);
      fireOnInstall(state, cardId);
      return { ok: true };
    }

case "may_install_one_hosted_card": {
      const hosted = (source.hostedCardIds ?? []).filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware";
      });
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted program/hardware to install.`);
        return { ok: true };
      }
      const discountFlag = Boolean(
        action.firstThisTurnDiscountPerUniqueConnection,
      );
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...hosted.map((cardId) => ({
            id: cardId,
            label: `Install ${state.cards[cardId]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_hosted_card" as const,
                cardId,
                ...(discountFlag
                  ? { firstThisTurnDiscountPerUniqueConnection: true }
                  : {}),
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
logLine: `${source.title} — may install 1 hosted card.`,
});
      return { ok: true };
    }

case "install_hosted_card": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (
        !card ||
        (card.type !== "program" && card.type !== "hardware") ||
        !(source.hostedCardIds ?? []).includes(cardId)
      ) {
        log(state, `install_hosted_card — invalid hosted card.`);
        return { ok: true };
      }
      if (card.type === "program") {
        const need = effectiveMemoryCost(state, cardId);
        if (usedMemory(state) + need > memoryLimit(state)) {
          log(state, `install_hosted_card — insufficient MU.`);
          return { ok: true };
        }
      }
      let cost = Math.max(0, card.installCost ?? 0);
      if (
        action.firstThisTurnDiscountPerUniqueConnection &&
        !state.turn.paulesCafeInstallUsedThisTurn
      ) {
        const uniqueConnections = state.runner.installed.filter((id) => {
          const c = state.cards[id];
          return (
            Boolean(c?.unique) && (c?.subtypes ?? []).includes("connection")
          );
        }).length;
        cost = Math.max(0, cost - uniqueConnections);
        state.turn.paulesCafeInstallUsedThisTurn = true;
      }
      if (state.runner.credits < cost) {
        log(state, `install_hosted_card — insufficient credits (${cost}¢).`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      source.hostedCardIds = (source.hostedCardIds ?? []).filter(
        (id) => id !== cardId,
      );
      card.hostId = undefined;
      card.zone = "runner:installed";
      card.faceup = true;
      state.runner.installed.push(cardId);
      noteVirusProgramInstalled(state, cardId);
      noteProgramOrHardwareInstalled(state, cardId);
      log(state, `Install hosted ${card.title} for ${cost}¢.`);
      fireOnInstall(state, cardId);
      return { ok: true };
    }

case "install_up_to_from_hq_paying_costs": {
      return applyPrimitive(ctx, {
        kind: "install_up_to_from_hq_paying_costs_continue",
        remaining: Math.max(0, action.max),
      });
    }

case "install_up_to_from_hq_paying_costs_continue": {
      let remaining = Math.max(0, action.remaining);
      if (action.justInstalledId && action.serverId) {
        const id = action.justInstalledId;
        const card = state.cards[id];
        if (card && state.corp.hand.includes(id)) {
            let serverId: import("../../state/types.js").ServerId;
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
              log(state, `Create ${serverId} for HQ install.`);
            } else {
              serverId =
                action.serverId as import("../../state/types.js").ServerId;
            }
            const dest = state.servers[serverId];
            if (dest) {
              const asIce = Boolean(action.asIce) || card.type === "ice";
              const cost = corpInstallCost(card, asIce ? dest.ice.length : 0);
              if (creditsAvailableForInstall(state, "corp") < cost) {
                log(state, `Install from HQ — cannot afford ${cost}¢.`);
              } else {
              spendCreditsForInstall(state, "corp", cost);
              state.corp.hand = state.corp.hand.filter((cid) => cid !== id);
              if (asIce) {
                dest.ice.unshift(id);
                card.zone = `server:${serverId}:ice`;
              } else {
                dest.root.push(id);
                card.zone = `server:${serverId}:root`;
              }
              card.rezzed = false;
              card.faceup = false;
              if (card.type === "agenda" || card.type === "asset") {
                card.advancementCounters = card.advancementCounters ?? 0;
              }
              noteInstalledThisTurn(state, id);
              state.turn.corpInstalledFromHqThisTurn = true;
              remaining = Math.max(0, remaining - 1);
              log(
                state,
                `Install ${card.title} from HQ on ${serverId} for ${cost}¢ (${remaining} remaining).`,
              );
              fireOnInstall(state, id);
              if (remaining > 0 && !state.pendingChoice) {
                occurCheckpoint(
                  state,
                  "instruction",
                  "Between instructions",
                  [CR.resolveAbility],
                  sourceId,
                );
              }
            }
          }
        }
      }
      if (remaining <= 0 || state.pendingChoice) return { ok: true };
      const installable = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        if (t !== "agenda" && t !== "asset" && t !== "upgrade" && t !== "ice") {
          return false;
        }
        return (
          creditsAvailableForInstall(state, "corp") >=
          corpInstallCost(state.cards[id]!, 0)
        );
      });
      if (installable.length === 0) {
        log(state, `${source.title} — no affordable HQ cards to install.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "done-hq-installs",
          label: "Done",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        const cost = corpInstallCost(card, 0);
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            const iceCost = corpInstallCost(card, server.ice.length);
            if (creditsAvailableForInstall(state, "corp") < iceCost) continue;
            options.push({
              id: `hq-ice:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id} (${iceCost}¢)`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_up_to_from_hq_paying_costs_continue" as const,
                  remaining,
                  justInstalledId: cardId,
                  serverId: server.id,
                  asIce: true,
                },
              },
            });
          }
          options.push({
            id: `hq-ice:${cardId}:new`,
            label: `Install ${card.title} protecting a new remote (${cost}¢)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_up_to_from_hq_paying_costs_continue" as const,
                remaining,
                justInstalledId: cardId,
                serverId: "__new_remote__",
                asIce: true,
              },
            },
          });
        } else if (card.type === "upgrade") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `hq-up:${cardId}:${server.id}`,
              label: `Install ${card.title} in ${server.id} root (${cost}¢)`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_up_to_from_hq_paying_costs_continue" as const,
                  remaining,
                  justInstalledId: cardId,
                  serverId: server.id,
                  asIce: false,
                },
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            options.push({
              id: `hq-root:${cardId}:${server.id}`,
              label: `Install ${card.title} in ${server.id} root (${cost}¢)`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_up_to_from_hq_paying_costs_continue" as const,
                  remaining,
                  justInstalledId: cardId,
                  serverId: server.id,
                  asIce: false,
                },
              },
            });
          }
          options.push({
            id: `hq-root:${cardId}:new`,
            label: `Install ${card.title} in a new remote (${cost}¢)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_up_to_from_hq_paying_costs_continue" as const,
                remaining,
                justInstalledId: cardId,
                serverId: "__new_remote__",
                asIce: false,
              },
            },
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — install up to ${remaining} more from HQ paying costs.`,
});
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
        trashCorpCardToArchives(state, cardId);
        return { ok: true };
      }
      dest.ice.unshift(cardId);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = true;
      card.faceup = true;
      noteInstalledThisTurn(state, cardId);
      state.turn.iceRezzedThisTurn = (state.turn.iceRezzedThisTurn ?? 0) + 1;
      state.turn.rezzedThisTurnIds = [...(state.turn.rezzedThisTurnIds ?? []), cardId];
      log(
        state,
        `ABT — install and rez ${card.title} protecting ${serverId} ignoring costs.`,
      );
      const identity = state.cards[state.corp.identityId];
      if (identity?.onFirstIceRezEachTurn && state.turn.iceRezzedThisTurn === 1) {
        fireOnFirstIceRezEachTurn(state, state.corp.identityId);
        if (state.pendingChoice) return { ok: true };
      }
      fireOnRez(state, cardId);
      return { ok: true };
    }

case "install_runner_score_agenda_on_remote": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.scoreArea.includes(cardId)) {
        log(state, `install_runner_score_agenda — invalid agenda.`);
        return { ok: true };
      }
      const remotes = Object.entries(state.servers).filter(
        ([, s]) => s.kind === "remote",
      );
      if (remotes.length === 0) {
        return {
          ok: false,
          error: "No remote server to install agenda.",
          cites: [CR.playOperation],
        };
      }
      const installEffects: Effect[] = remotes.map(([serverId]) => ({
        op: "do" as const,
        action: {
          kind: "install_runner_score_agenda_on_server" as const,
          cardId,
          serverId,
          placeAdvancementIfRunnerTagged: action.placeAdvancementIfRunnerTagged,
        },
      }));
      if (installEffects.length === 1) {
        return evalEffect(ctx, installEffects[0]!);
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: remotes.map(([serverId], i) => ({
          id: serverId,
          label: `Install on ${serverId}`,
          effect: installEffects[i]!,
        })),
      });
      return { ok: true };
    }

case "install_runner_score_agenda_on_server": {
      const { cardId, serverId } = action;
      const card = state.cards[cardId];
      if (!card || !state.runner.scoreArea.includes(cardId)) {
        log(state, `install_runner_score_agenda_on_server — invalid.`);
        return { ok: true };
      }
      state.runner.scoreArea = state.runner.scoreArea.filter((id) => id !== cardId);
      const server = state.servers[serverId as import("../../state/types.js").ServerId];
      if (!server) {
        return {
          ok: false,
          error: "Invalid server.",
          cites: [CR.playOperation],
        };
      }
      server.root.push(cardId);
      card.zone = `server:${serverId}:root`;
      card.faceup = true;
      card.rezzed = false;
      if ((card.agendaCounters ?? 0) > 0) {
        card.agendaCounters = 0;
        log(
          state,
          `${card.title}'s hosted agenda counter is trashed (CR ${CR.trashHostedWhenHostLeaves.number}).`,
        );
      }
      log(state, `IP Enforcement — install ${card.title} on ${serverId}.`);
      if (
        action.placeAdvancementIfRunnerTagged &&
        state.runner.tags > 0
      ) {
        card.advancementCounters = (card.advancementCounters ?? 0) + 1;
        log(state, `Runner still tagged — place 1 advancement on ${card.title}.`);
      }
      return { ok: true };
    }

case "may_install_program_hardware_from_last_runner_discarded": {
      const ids = state.turn.runnerDiscardedToMaxHandIds.filter((id) => {
        const c = state.cards[id];
        return (
          c &&
          (c.type === "program" || c.type === "hardware") &&
          state.runner.discardPile.includes(id)
        );
      });
      if (ids.length === 0) {
        log(state, `Install from discarded — none eligible.`);
        return { ok: true };
      }
      if (!openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          ...ids
            .filter((cardId) => canInstallHeapCard(state, cardId, 0))
            .map((cardId) => ({
              id: cardId,
              label: `Install ${state.cards[cardId]!.title} from heap`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_heap_card" as const,
                  cardId,
                  discount: 0,
                },
              },
            })),
        ],
      })) return { ok: true };
      if ((state.pendingChoice?.options.length ?? 0) <= 1) {
        state.pendingChoice = null;
        log(state, `Install from discarded — none affordable.`);
        return { ok: true };
      }
      log(state, `May install 1 program/hardware from cards just discarded.`);
      return { ok: true };
    }

case "install_program_from_stack_or_heap_free": {
      const fromHeap = state.runner.discardPile.find(
        (id) => state.cards[id].type === "program",
      );
      const fromStack = state.runner.deck.find(
        (id) => state.cards[id].type === "program",
      );
      const id = fromHeap ?? fromStack;
      if (!id) {
        log(state, `Install program from stack/heap — none found.`);
        return { ok: true };
      }
      const card = state.cards[id];
      state.runner.discardPile = state.runner.discardPile.filter((x) => x !== id);
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      state.runner.installed.push(id);
      card.zone = "runner:installed";
      card.faceup = true;
      card.bounceToStackAtTurnEnd = true;
      if ((card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      log(
        state,
        `Install ${card.title} ignoring costs (will bounce to stack at turn end).`,
      );
      log(
        state,
        `${source.title} creates a lingering effect: ${card.title} returns to the stack at the end of the turn, independent of ${source.title}. ${source.title} is fully resolved (CR ${CR.playingLingeringEffects.number}).`,
      );
      fireOnInstall(state, id);
      noteVirusProgramInstalled(state, id);
      noteProgramOrHardwareInstalled(state, id);
      // Exile treats a program set aside from the heap, then installed, as
      // installed from the heap (CR 4.8.3).
      if (fromHeap && card.type === "program") {
        const idCard = state.cards[state.runner.identityId];
        if (idCard?.onInstallProgramFromHeap) {
          fireOnInstallProgramFromHeap(state, idCard.id);
          if (state.pendingChoice) return { ok: true };
        }
      }
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
            action: { kind: "draw_until_hq_has" as const, amount: action.thenDrawToHq },
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
      openPendingChoose(state, { sourceId, chooser: "corp", options,
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
        const dest = state.servers[serverId as import("../../state/types.js").ServerId];
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

case "may_install_from_heap": {
      const types = new Set(action.types);
      const discount = Math.max(0, action.discount ?? 0);
      const candidates = state.runner.discardPile.filter((id) => {
        const c = state.cards[id];
        return c && types.has(c.type as "program" | "hardware" | "resource") &&
          canInstallHeapCard(state, id, discount);
      });
      if (candidates.length === 0) {
        log(state, `${source.title} — may install from heap: none affordable.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...candidates.map((id) => {
            const c = state.cards[id]!;
            return {
              id: `install:${id}`,
              label: `Install ${c.title}`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_heap_card" as const,
                  cardId: id,
                  discount,
                },
              },
            };
          }),
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
logLine: `${source.title} — may install from heap (${[...types].join("/")}).`,
});
      return { ok: true };
    }

case "install_haas_pet_project_continue": {
      let remaining = Math.max(0, action.remaining);
      const serverId = action.serverId as import("../../state/types.js").ServerId;
      const dest = state.servers[serverId];
      if (!dest || dest.kind !== "remote") {
        log(state, `Pet Project install — invalid remote ${serverId}.`);
        return { ok: true };
      }
      if (action.justInstalledId) {
        const id = action.justInstalledId;
        const card = state.cards[id];
        const fromZone =
          action.justInstalledFrom === "archives"
            ? state.corp.discardPile
            : state.corp.hand;
        if (card && fromZone.includes(id)) {
          if (action.justInstalledFrom === "archives") {
            state.corp.discardPile = state.corp.discardPile.filter((cid) => cid !== id);
          } else {
            state.corp.hand = state.corp.hand.filter((cid) => cid !== id);
          }
          if (action.asIce || card.type === "ice") {
            dest.ice.unshift(id);
            card.zone = `server:${serverId}:ice`;
          } else {
            dest.root.push(id);
            card.zone = `server:${serverId}:root`;
          }
          card.rezzed = false;
          card.faceup = false;
          noteInstalledThisTurn(state, id);
          remaining = Math.max(0, remaining - 1);
          log(
            state,
            `Install ${card.title} from ${action.justInstalledFrom === "archives" ? "Archives" : "HQ"} on ${serverId}, ignoring all costs (${remaining} remaining).`,
          );
          fireOnInstall(state, id);
        }
      }
      if (remaining <= 0) return { ok: true };
      const hqCandidates = state.corp.hand.filter((id) =>
        ["agenda", "asset", "upgrade", "ice"].includes(
          state.cards[id]?.type ?? "",
        ),
      );
      const archiveEligible = state.corp.discardPile.filter((id) =>
        ["agenda", "asset", "upgrade", "ice"].includes(
          state.cards[id]?.type ?? "",
        ),
      );
      if (hqCandidates.length === 0 && archiveEligible.length === 0) {
        log(state, `${source.title} — no more eligible cards in HQ/Archives.`);
        return { ok: true };
      }
      const buildOption = (id: string, from: "hq" | "archives") => {
        const card = state.cards[id]!;
        const asIce = card.type === "ice";
        return {
          id: `haas-${from}:${id}`,
          label: `Install ${card.title} from ${from === "hq" ? "HQ" : "Archives"} (ignore costs)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_haas_pet_project_continue" as const,
              remaining,
              serverId,
              justInstalledId: id,
              justInstalledFrom: from,
              asIce,
            },
          },
        };
      };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-haas-pet-project",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...hqCandidates.map((id) => buildOption(id, "hq")),
          ...archiveEligible.map((id) => buildOption(id, "archives")),
        ],
logLine: `${source.title} — install up to ${remaining} more from HQ/Archives into ${serverId}.`,
});
      return { ok: true };
    }

case "install_up_to_n_programs_from_grip_discount": {
      const remaining = Math.max(0, action.remaining);
      const discount = action.discount;
      if (remaining <= 0) return { ok: true };
      const programs = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        return (
          Boolean(c) &&
          c.type === "program" &&
          !c.installOnIce &&
          !(c.subtypes ?? []).includes("trojan")
        );
      });
      const hosts = state.runner.installed.filter((id) => {
        const host = state.cards[id];
        if (!host?.daemonHost) return false;
        const hosted = state.runner.installed.filter(
          (guest) => state.cards[guest]?.hostId === id,
        ).length;
        return (
          host.maxHostedCards === undefined || hosted < host.maxHostedCards
        );
      });
      const installSeq = (id: string, hostId?: string): Effect => ({
        op: "seq",
        effects: [
          {
            op: "do",
            action: {
              kind: "install_grip_card",
              cardId: id,
              discount,
              ...(hostId ? { hostId } : {}),
            },
          },
          {
            op: "do",
            action: {
              kind: "install_up_to_n_programs_from_grip_discount",
              remaining: remaining - 1,
              discount,
            },
          },
        ],
      });
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const id of programs) {
        const c = state.cards[id]!;
        const printed = gripInstallCostAfterDiscount(state, c, discount);
        const fitsMemory =
          usedMemory(state) + effectiveMemoryCost(state, id) <=
          memoryLimit(state);
        if (
          fitsMemory &&
          creditsAvailableForInstall(state, "runner") >= printed
        ) {
          options.push({
            id: `monolith:${id}`,
            label: `Install ${c.title} (${discount}¢ discount)`,
            effect: installSeq(id),
          });
        }
        for (const hostId of hosts) {
          const host = state.cards[hostId]!;
          const hostedCost = Math.max(
            0,
            printed - (host.daemonHostInstallCreditDiscount ?? 0),
          );
          if (creditsAvailableForInstall(state, "runner") < hostedCost) {
            continue;
          }
          options.push({
            id: `monolith:${id}:host:${hostId}`,
            label: `Install ${c.title} on ${host.title} for ${hostedCost}¢`,
            effect: installSeq(id, hostId),
          });
        }
      }
      if (options.length === 0) {
        log(state, `${source.title} — no more affordable programs to install.`);
        return { ok: true };
      }
      options.push({
        id: "done",
        label: "Done installing",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      });
      openPendingChoose(state, { sourceId, chooser: "runner", options,
logLine: `${source.title} — install up to ${remaining} program(s) from grip (${discount}¢ discount each; CR ${CR.runnerBasicInstall.number}).`,
});
      return { ok: true };
    }

case "install_scavenge_program": {
      const discount = Math.max(
        0,
        state.turn.lastTrashedOwnProgramInstallCost ?? 0,
      );
      const gripCandidates = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "program") return false;
        if (c.installOnIce || (c.subtypes ?? []).includes("trojan")) {
          return false;
        }
        const need = effectiveMemoryCost(state, id);
        if (usedMemory(state) + need > memoryLimit(state)) return false;
        const cost = gripInstallCostAfterDiscount(state, c, discount);
        return creditsAvailableForInstall(state, "runner") >= cost;
      });
      const heapCandidates = state.runner.discardPile.filter((id) => {
        const c = state.cards[id];
        return c && c.type === "program" && canInstallHeapCard(state, id, discount);
      });
      if (gripCandidates.length === 0 && heapCandidates.length === 0) {
        log(state, `${source.title} — no affordable program to install.`);
        return { ok: true };
      }
      const options = [
        ...gripCandidates.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `scavenge-grip:${id}`,
            label: `Install ${c.title} (from grip)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_grip_card" as const,
                cardId: id,
                discount,
              },
            },
          };
        }),
        ...heapCandidates.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `scavenge-heap:${id}`,
            label: `Install ${c.title} (from heap)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_heap_card" as const,
                cardId: id,
                discount,
              },
            },
          };
        }),
      ];
      if (options.length === 1) {
        return evalEffect(ctx, options[0]!.effect);
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
logLine: `${source.title} — choose a program to install (${discount}¢ discount; CR ${CR.runnerBasicInstall.number}).`,
});
      return { ok: true };
    }

case "install_from_heap": {
      const types = new Set(action.types);
      const discount = Math.max(0, action.discount ?? 0);
      const candidates = state.runner.discardPile.filter((id) => {
        const c = state.cards[id];
        return (
          c &&
          types.has(c.type as "program" | "hardware" | "resource") &&
          canInstallHeapCard(state, id, discount)
        );
      });
      if (candidates.length === 0) {
        log(state, `${source.title} — install from heap: none affordable.`);
        return { ok: true };
      }
      if (candidates.length === 1) {
        return evalEffect(ctx, {
          op: "do",
          action: {
            kind: "install_heap_card",
            cardId: candidates[0]!,
            discount,
          },
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `install:${id}`,
            label: `Install ${c.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_heap_card" as const,
                cardId: id,
                discount,
              },
            },
          };
        }),
logLine: `${source.title} — install from heap (${[...types].join("/")}).`,
});
      return { ok: true };
    }

case "install_stack_program": {
      return installStackProgramPaying(
        state,
        action.cardId,
        sourceId,
        action.gripCardId,
      );
    }

case "install_set_aside_program": {
      return installSetAsideProgramPaying(
        state,
        action.cardId,
        action.discount,
        sourceId,
      );
    }

case "install_rd_ice_protecting_central_discount": {
      const card = state.cards[action.cardId];
      const serverId = action.serverId as import("../../state/types.js").ServerId;
      const server = state.servers[serverId];
      if (!card || !server || server.kind !== "central") {
        log(state, `Install R&D ice on central — missing card/server.`);
        return { ok: true };
      }
      // Card was removed from R&D at reveal time; ensure it's not still there.
      state.corp.deck = state.corp.deck.filter((id) => id !== action.cardId);
      const discount = Math.max(0, action.discount ?? 0);
      const pay = Math.max(
        0,
        corpInstallCost(card, server.ice.length) - discount,
      );
      if (creditsAvailableForInstall(state, "corp") < pay) {
        log(
          state,
          `Cannot afford to install ${card.title} for ${pay}¢ — return to R&D.`,
        );
        state.corp.deck.unshift(action.cardId);
        card.zone = "corp:rd";
        card.faceup = false;
        return { ok: true };
      }
      spendCreditsForInstall(state, "corp", pay);
      server.ice.unshift(action.cardId);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementCounters = card.advancementCounters ?? 0;
      log(
        state,
        `Install ${card.title} outermost on ${serverId} for ${pay}¢ (−${discount}¢).`,
      );
      return { ok: true };
    }

case "install_rejig_bounce": {
      const candidates = state.runner.installed.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware";
      });
      if (candidates.length === 0) {
        log(state, `${source.title} — no installed program or hardware.`);
        return { ok: true };
      }
      const build = (cardId: string): Effect => {
        const printed = state.cards[cardId]!.installCost ?? 0;
        return {
          op: "seq" as const,
          effects: [
            {
              op: "do" as const,
              action: {
                kind: "return_rig_card_to_grip" as const,
                cardId,
              },
            },
            {
              op: "do" as const,
              action: {
                kind: "install_from_grip_discount" as const,
                types: ["program", "hardware"],
                discount: printed,
              },
            },
          ],
        };
      };
      if (candidates.length === 1) {
        return evalEffect({ state, sourceId }, build(candidates[0]!));
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => {
          const c = state.cards[id]!;
          const printed = c.installCost ?? 0;
          return {
            id: `rejig:${id}`,
            label: `Add ${c.title} to grip (install −${printed}¢)`,
            effect: build(id),
          };
        }),
logLine: `${source.title} — choose installed program/hardware to add to grip.`,
});
      return { ok: true };
    }

case "install_heap_card": {
      return installHeapCardDiscounted(
        state,
        action.cardId,
        action.discount,
        sourceId,
      );
    }

case "install_stack_card": {
      return installStackCardPaying(
        state,
        action.cardId,
        action.discount,
        sourceId,
      );
    }

case "may_install_from_hq_paying_costs": {
      const eligible = state.corp.hand.filter((id) => {
        const t = state.cards[id].type;
        if (action.excludeAgenda && t === "agenda") return false;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      });
      const affordable = eligible.filter(
        (id) =>
          creditsAvailableForInstall(state, "corp") >=
          corpInstallCost(state.cards[id]!, 0),
      );
      if (affordable.length === 0) {
        log(state, `Install from HQ paying costs — no eligible affordable card.`);
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
          ...affordable.map((id) => ({
            id: `hq-install:${id}`,
            label: `Install ${state.cards[id].title} for ${corpInstallCost(state.cards[id]!, 0)}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_hq_card_paying_costs" as const,
                cardId: id,
                ...(action.thenMayRemoveTagToAdvance
                  ? { thenMayRemoveTagToAdvance: true }
                  : {}),
                ...(action.cannotScoreInstalledCardThisTurn
                  ? { cannotScoreInstalledCardThisTurn: true }
                  : {}),
              },
            },
          })),
        ],
logLine: `May install one card from HQ paying install costs.`,
});
      return { ok: true };
    }

case "may_install_from_hq_in_remote_root_paying_costs": {
      const hqCards = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "agenda" || t === "asset" || t === "upgrade";
      });
      const affordable = hqCards.filter(
        (id) =>
          creditsAvailableForInstall(state, "corp") >=
          corpInstallCost(state.cards[id]!, 0),
      );
      if (affordable.length === 0) {
        log(state, `May install from HQ in remote root — none affordable.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline install",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...affordable.map((id) => ({
            id: `drm-install:${id}`,
            label: `Install ${state.cards[id]!.title} in a new remote root for ${corpInstallCost(state.cards[id]!, 0)}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_hq_card_paying_costs" as const,
                cardId: id,
              },
            },
          })),
        ],
logLine: `May install 1 card from HQ in the root of a remote server paying costs.`,
});
      return { ok: true };
    }

case "may_install_from_hq_on_other_remote_ignore_costs": {
      const trigger = state.turn.triggerRemoteInstallServerId;
      const remotes = Object.values(state.servers).filter(
        (s) => s.kind === "remote" && s.id !== trigger,
      );
      const hqCards = state.corp.hand.filter((id) => {
        const t = state.cards[id].type;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      });
      if (remotes.length === 0 || hqCards.length === 0) {
        log(state, `HQ chain install — no other remote or no HQ cards.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of hqCards) {
        for (const remote of remotes) {
          options.push({
            id: `teia:${cardId}:${remote.id}`,
            label: `Install ${state.cards[cardId].title} on ${remote.id} (ignore costs)`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_on_remote_ignore_costs",
                cardId,
                serverId: remote.id,
                cannotScoreInstalledCardThisTurn:
                  action.cannotScoreInstalledCardThisTurn,
              },
            },
          });
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
logLine: `May install from HQ on another remote ignoring costs.`,
});
      return { ok: true };
    }

case "install_hq_on_remote_ignore_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      const destId = action.serverId as import("../../state/types.js").ServerId;
      const dest = state.servers[destId];
      if (!card || !dest || dest.kind !== "remote") {
        log(state, `HQ remote install — invalid target.`);
        return { ok: true };
      }
      if (!state.corp.hand.includes(cardId)) {
        log(state, `HQ remote install — card not in HQ.`);
        return { ok: true };
      }
      if (destId === state.turn.triggerRemoteInstallServerId) {
        log(state, `HQ remote install — must be another remote.`);
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
      card.faceup = false;
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementCounters = card.advancementCounters ?? 0;
      }
      noteInstalledThisTurn(state, cardId);
      if (action.cannotScoreInstalledCardThisTurn) {
        if (!state.turn.cannotScoreOrRezCardIds.includes(cardId)) {
          state.turn.cannotScoreOrRezCardIds.push(cardId);
        }
      }
      log(
        state,
        `Install ${card.title} on ${destId} from HQ ignoring all costs.`,
      );
      fireOnInstall(state, cardId);
      return { ok: true };
    }

case "install_from_archives": {
      const allowed = new Set(action.types);
      const installable = state.corp.discardPile.filter((id) =>
        allowed.has(
          state.cards[id]?.type as "agenda" | "asset" | "ice" | "upgrade",
        ),
      );
      if (installable.length === 0) {
        return {
          ok: false,
          error: "Must install from Archives — no eligible card.",
          cites: [CR.corpBasicInstall],
        };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        const cost = corpInstallCost(card, 0);
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            const iceCost = corpInstallCost(card, server.ice.length);
            if (state.corp.credits < iceCost) continue;
            options.push({
              id: `arch-pay:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id} (${iceCost}¢)`,
              effect: {
                op: "do",
                action: {
                  kind: "install_archives_card_paying",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            options.push({
              id: `arch-pay:${cardId}:${server.id}`,
              label: `Install ${card.title} on ${server.id} (${cost}¢)`,
              effect: {
                op: "do",
                action: {
                  kind: "install_archives_card_paying",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
          options.push({
            id: `arch-pay:${cardId}:new`,
            label: `Install ${card.title} on new remote (${cost}¢)`,
            effect: {
              op: "do",
              action: {
                kind: "install_archives_card_paying",
                cardId,
                serverId: "__new_remote__",
              },
            },
          });
        }
      }
      if (options.length === 0) {
        return {
          ok: false,
          error: "Cannot afford to install any eligible Archives card.",
          cites: [CR.corpBasicInstall],
        };
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `Install 1 agenda, asset, or ice from Archives (paying).`,
});
      return { ok: true };
    }

case "may_install_from_archives_ignore_costs": {
      const installable = state.corp.discardPile.filter((id) =>
        corpCardInstallable(state.cards[id]?.type ?? ""),
      );
      if (installable.length === 0) {
        log(state, `Install from Archives — no installable card.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-arch-install",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `arch:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_archives_card_ignore_costs",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            options.push({
              id: `arch:${cardId}:${server.id}`,
              label: `Install ${card.title} on ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_archives_card_ignore_costs",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
          options.push({
            id: `arch:${cardId}:new`,
            label: `Install ${card.title} on new remote`,
            effect: {
              op: "do",
              action: {
                kind: "install_archives_card_ignore_costs",
                cardId,
                serverId: "__new_remote__",
              },
            },
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `May install from Archives ignoring all costs.`,
});
      return { ok: true };
    }

case "may_install_from_hq_ignore_costs": {
      const installable = state.corp.hand.filter((id) =>
        corpCardInstallable(state.cards[id]?.type ?? ""),
      );
      if (installable.length === 0) {
        log(state, `Install from HQ — no installable card.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-hq-install",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `hq-install:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_hq_card_ignore_costs",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            options.push({
              id: `hq-install:${cardId}:${server.id}`,
              label: `Install ${card.title} on ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_hq_card_ignore_costs",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
          options.push({
            id: `hq-install:${cardId}:new`,
            label: `Install ${card.title} on new remote`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_card_ignore_costs",
                cardId,
                serverId: "__new_remote__",
              },
            },
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `May install from HQ ignoring all costs.`,
});
      return { ok: true };
    }

case "may_install_from_hq_ignore_costs_exclude_source_server": {
      const excludeServerId = state.turn.onTrashSourceServerId;
      const installable = state.corp.hand.filter((id) =>
        corpCardInstallable(state.cards[id]?.type ?? ""),
      );
      if (installable.length === 0) {
        log(
          state,
          `Install from HQ (exclude source server root) — no installable card.`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-hq-install",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `hq-install:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_hq_card_ignore_costs",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            if (excludeServerId && server.id === excludeServerId) continue;
            options.push({
              id: `hq-install:${cardId}:${server.id}`,
              label: `Install ${card.title} on ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_hq_card_ignore_costs",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
          options.push({
            id: `hq-install:${cardId}:new`,
            label: `Install ${card.title} on new remote`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_card_ignore_costs",
                cardId,
                serverId: "__new_remote__",
              },
            },
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `May install from HQ ignoring all costs (cannot install in root of ${excludeServerId ?? "source server"}).`,
});
      return { ok: true };
    }

case "install_program_from_grip_paying_cost": {
      const programs = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (c.type !== "program") return false;
        if (c.installOnIce || (c.subtypes ?? []).includes("trojan")) {
          return false;
        }
        const need = effectiveMemoryCost(state, id);
        if (usedMemory(state) + need > memoryLimit(state)) return false;
        const cost = gripInstallCostAfterDiscount(state, c, 0);
        return creditsAvailableForInstall(state, "runner") >= cost;
      });
      if (programs.length === 0) {
        log(state, `Install program from grip — no affordable program.`);
        return { ok: true };
      }
      const trackSubtype = action.trackOnRunEndTrashUnlessSubtype;
      const finish = (pick: string): EvalResult => {
        const r = installGripCardDiscounted(state, pick, 0, sourceId);
        if (!r.ok) return r;
        if (state.run && trackSubtype !== undefined) {
          state.run.identityInstalledProgramId = pick;
          state.run.identityInstalledProgramTrashUnlessSubtype = trackSubtype;
        }
        return { ok: true };
      };
      if (action.cardId && programs.includes(action.cardId)) {
        return finish(action.cardId);
      }
      if (programs.length === 1) {
        return finish(programs[0]!);
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `arissana-install:${id}`,
          label: `Install ${state.cards[id].title}`,
          effect: {
            op: "do",
            action: {
              kind: "install_program_from_grip_paying_cost",
              cardId: id,
              trackOnRunEndTrashUnlessSubtype: trackSubtype,
            },
          },
        })),
logLine: `Choose program from grip to install.`,
});
      return { ok: true };
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
      openPendingChoose(state, { sourceId, chooser: "corp", options,
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
      openPendingChoose(state, { sourceId, chooser: "corp", options,
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
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `Install ice from HQ ignoring costs (any server).`,
});
      return { ok: true };
    }

case "install_hq_ice_protecting_server_ignore_costs": {
      const card = state.cards[action.cardId];
      const serverId = action.serverId as import("../../state/types.js").ServerId;
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
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `May install ice from HQ paying ${discount}¢ less; move ${source.title} to that server root.`,
});
      return { ok: true };
    }

case "install_hq_ice_protecting_server_paying_costs": {
      const card = state.cards[action.cardId];
      const serverId = action.serverId as import("../../state/types.js").ServerId;
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
      spendCreditsForInstall(state, "corp", pay);
      state.corp.hand = state.corp.hand.filter((id) => id !== action.cardId);
      server.ice.unshift(action.cardId);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementCounters = card.advancementCounters ?? 0;
      log(
        state,
        `Install ${card.title} outermost on ${serverId} for ${pay}¢.`,
      );
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
        serverId = `remote-${remoteNum}` as import("../../state/types.js").ServerId;
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

case "may_install_and_rez_from_hq": {
      const discount = Math.max(0, action.totalDiscount ?? 0);
      const eligible = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      });
      if (eligible.length === 0) {
        log(state, `Install and rez from HQ — no eligible cards.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline-eminent-hq",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...eligible.map((id) => {
            const c = state.cards[id]!;
            const install = corpInstallCost(c, 0);
            const rez = c.type === "agenda" ? 0 : (c.rezCost ?? 0);
            const installOff = Math.min(discount, install);
            const total = installAndRezPaid(
              install,
              rez,
              installOff,
              discount - installOff,
            );
            return {
              id: `eminent-hq:${id}`,
              label: `Install${c.type === "agenda" ? "" : " and rez"} ${c.title} (≤${total}¢ after ${discount}¢ discount)`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_and_rez_hq_card_with_discount" as const,
                  cardId: id,
                  totalDiscount: discount,
                },
              },
            };
          }),
        ],
logLine: `May install and rez 1 card from HQ paying ${discount}¢ less total.`,
});
      return { ok: true };
    }

case "install_and_rez_hq_card_with_discount": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.corp.hand.includes(cardId)) {
        log(state, `Install+rez from HQ — card not in HQ.`);
        return { ok: true };
      }
      const discount = Math.max(0, action.totalDiscount ?? 0);
      const installCost = corpInstallCost(card, 0);
      const rezCost = card.type === "agenda" ? 0 : (card.rezCost ?? 0);
      const split = offerInstallRezSplit(
        state,
        sourceId,
        discount,
        installCost,
        rezCost,
        action.installDiscount,
        (installDiscount) => ({
          op: "do",
          action: {
            kind: "install_and_rez_hq_card_with_discount",
            cardId,
            totalDiscount: discount,
            installDiscount,
          },
        }),
      );
      if (split.offered) return { ok: true };
      const isAgenda = card.type === "agenda";
      const canRez = !isAgenda;
      const fullTotal = split.pay;
      const installOnly = Math.max(0, installCost - (action.installDiscount ?? 0));
      const credits = creditsAvailableForInstall(state, "corp");
      const doRez = canRez && credits >= fullTotal;
      const pay = doRez ? fullTotal : installOnly;
      if (credits < pay) {
        log(
          state,
          `Install from HQ — cannot afford ${pay}¢ for ${card.title}.`,
        );
        return { ok: true };
      }
      spendCreditsForInstall(state, "corp", pay);
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      const remoteNum = state.nextRemoteNumber++;
      const sid =
        `remote-${remoteNum}` as import("../../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      if (card.type === "ice") {
        state.servers[sid].ice.push(cardId);
        card.zone = `server:${sid}:ice`;
      } else {
        state.servers[sid].root.push(cardId);
        card.zone = `server:${sid}:root`;
      }
      if (doRez) {
        card.rezzed = true;
        card.faceup = true;
      } else {
        card.rezzed = false;
        card.faceup = true; // revealed
      }
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementCounters = card.advancementCounters ?? 0;
      }
      if (doRez && (card.hostedCreditsOnInstall ?? 0) > 0) {
        card.hostedCredits = card.hostedCreditsOnInstall;
      }
      if (doRez && (card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      state.turn.lastInstalledFromEffectId = cardId;
      noteInstalledThisTurn(state, cardId);
      state.turn.corpInstalledFromHqThisTurn = true;
      log(
        state,
        doRez
          ? `Install and rez ${card.title} on ${sid} for ${pay}¢ (${discount}¢ discount).`
          : `Install ${card.title} unrezzed (revealed) on ${sid} for ${pay}¢ (${discount}¢ discount; cannot rez).`,
      );
      fireOnInstall(state, cardId);
      if (doRez) fireOnRez(state, cardId);
      if (doRez && card.type === "ice") {
        fireHostRezStateTriggers(state, cardId, "rez");
      }
      return { ok: true };
    }

case "install_hosted_card_ignore_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (
        !card ||
        (card.type !== "program" && card.type !== "hardware") ||
        !(source.hostedCardIds ?? []).includes(cardId)
      ) {
        log(state, `install_hosted_card_ignore_costs — invalid hosted card.`);
        return { ok: true };
      }
      if (card.type === "program") {
        const need = effectiveMemoryCost(state, cardId);
        if (usedMemory(state) + need > memoryLimit(state)) {
          log(state, `install_hosted_card_ignore_costs — insufficient MU.`);
          return { ok: true };
        }
      }
      source.hostedCardIds = (source.hostedCardIds ?? []).filter(
        (id) => id !== cardId,
      );
      card.hostId = undefined;
      card.powerCounters = undefined;
      card.zone = "runner:installed";
      card.faceup = true;
      state.runner.installed.push(cardId);
      noteVirusProgramInstalled(state, cardId);
      noteProgramOrHardwareInstalled(state, cardId);
      log(state, `Install hosted ${card.title} ignoring all costs.`);
      fireOnInstall(state, cardId);
      return { ok: true };
    }

case "may_install_from_hq_ignore_costs_then_place_advancements": {
      const amount = Math.max(0, action.amount);
      const installable = state.corp.hand.filter((id) =>
        corpCardInstallable(state.cards[id]?.type ?? ""),
      );
      if (installable.length === 0) {
        log(state, `Install from HQ then advance — no installable card.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-hq-install",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `hq-install-adv:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_hq_card_ignore_costs_then_place_advancements",
                  cardId,
                  serverId: server.id,
                  amount,
                },
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            options.push({
              id: `hq-install-adv:${cardId}:${server.id}`,
              label: `Install ${card.title} on ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_hq_card_ignore_costs_then_place_advancements",
                  cardId,
                  serverId: server.id,
                  amount,
                },
              },
            });
          }
          options.push({
            id: `hq-install-adv:${cardId}:new`,
            label: `Install ${card.title} on new remote`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_card_ignore_costs_then_place_advancements",
                cardId,
                serverId: "__new_remote__",
                amount,
              },
            },
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `May install from HQ ignoring costs, then place ${amount} advancement(s).`,
});
      return { ok: true };
    }

case "install_hq_card_ignore_costs_then_place_advancements": {
      const installR = applyPrimitive(ctx, {
        kind: "install_hq_card_ignore_costs",
        cardId: action.cardId,
        serverId: action.serverId,
      });
      if (!installR.ok) return installR;
      const amount = Math.max(0, action.amount);
      if (amount <= 0) return { ok: true };
      const installed = state.cards[action.cardId];
      if (!installed || !installed.zone.includes("server:")) {
        log(state, `Place advancements after HQ install — card not installed.`);
        return { ok: true };
      }
      return applyPrimitive(ctx, {
        kind: "place_advancements_on",
        cardId: action.cardId,
        amount,
      });
    }

case "install_up_to_from_heap_facedown": {
      return applyPrimitive(ctx, {
        kind: "install_up_to_from_heap_facedown_continue",
        remaining: Math.max(0, action.max),
      });
    }

case "install_up_to_from_heap_facedown_continue": {
      let remaining = Math.max(0, action.remaining);
      if (action.justInstalledId) {
        const id = action.justInstalledId;
        const idx = state.runner.discardPile.indexOf(id);
        if (idx >= 0) {
          state.runner.discardPile.splice(idx, 1);
          state.runner.installed.push(id);
          const card = state.cards[id]!;
          card.zone = "runner:installed";
          card.faceup = false;
          card.rezzed = false;
          noteInstalledThisTurn(state, id);
          remaining = Math.max(0, remaining - 1);
          log(
            state,
            `Install ${card.title} from heap facedown (${remaining} remaining).`,
          );
        }
      }
      if (remaining <= 0 || state.runner.discardPile.length === 0) {
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "done-heap-facedown",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          ...state.runner.discardPile.map((id) => ({
            id: `heap-fd:${id}`,
            label: `Install ${state.cards[id]!.title} facedown`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_up_to_from_heap_facedown_continue" as const,
                remaining,
                justInstalledId: id,
              },
            },
          })),
        ],
logLine: `Install up to ${remaining} more from heap facedown.`,
});
      return { ok: true };
    }

case "install_continue": {
      let remaining = Math.max(0, action.remaining);
      let serverId = action.serverId;
      if (serverId === "__new_remote__" && !action.justInstalledId) {
        const remoteNum = state.nextRemoteNumber++;
        const sid = `remote-${remoteNum}` as import("../../state/types.js").ServerId;
        serverId = sid;
        state.servers[sid] = {
          id: sid,
          kind: "remote",
          ice: [],
          root: [],
        };
        log(state, `Create ${sid} for Fast Break installs.`);
      }
      if (action.justInstalledId) {
        const id = action.justInstalledId;
        const card = state.cards[id];
        if (card && state.corp.hand.includes(id)) {
            const dest = state.servers[serverId as import("../../state/types.js").ServerId];
            if (dest) {
              const asIce = Boolean(action.asIce) || card.type === "ice";
              const cost = corpInstallCost(card, asIce ? dest.ice.length : 0);
              if (creditsAvailableForInstall(state, "corp") >= cost) {
            spendCreditsForInstall(state, "corp", cost);
            state.corp.hand = state.corp.hand.filter((cid) => cid !== id);
              if (asIce) {
                dest.ice.unshift(id);
                card.zone = `server:${serverId}:ice`;
              } else {
                dest.root.push(id);
                card.zone = `server:${serverId}:root`;
              }
              card.rezzed = false;
              card.faceup = false;
              if (card.type === "agenda" || card.type === "asset") {
                card.advancementCounters = card.advancementCounters ?? 0;
              }
              noteInstalledThisTurn(state, id);
              state.turn.corpInstalledFromHqThisTurn = true;
              remaining = Math.max(0, remaining - 1);
              log(
                state,
                `Install ${card.title} from HQ on ${serverId} for ${cost}¢ (${remaining} remaining).`,
              );
              fireOnInstall(state, id);
            }
          }
        }
      }
      if (remaining <= 0) return { ok: true };
      const dest = state.servers[serverId as import("../../state/types.js").ServerId];
      if (!dest || dest.kind !== "remote") {
        log(state, `Fast Break install — invalid remote ${serverId}.`);
        return { ok: true };
      }
      const rootCards = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        if (t !== "agenda" && t !== "asset" && t !== "upgrade") return false;
        return (
          creditsAvailableForInstall(state, "corp") >=
          corpInstallCost(state.cards[id]!, 0)
        );
      });
      const iceCost = corpInstallCost({ type: "ice" }, dest.ice.length);
      const iceCards = state.corp.hand.filter((id) => {
        if (state.cards[id]?.type !== "ice") return false;
        return creditsAvailableForInstall(state, "corp") >= iceCost;
      });
      if (rootCards.length === 0 && iceCards.length === 0) {
        log(state, `Fast Break — no more affordable HQ cards.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-fb-install",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...rootCards.map((id) => ({
            id: `fb-root:${id}`,
            label: `Install ${state.cards[id]!.title} in root for ${corpInstallCost(state.cards[id]!, 0)}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_continue" as const,
                remaining,
                serverId,
                justInstalledId: id,
                asIce: false,
              },
            },
          })),
          ...iceCards.map((id) => ({
            id: `fb-ice:${id}`,
            label: `Install ${state.cards[id]!.title} protecting for ${iceCost}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_continue" as const,
                remaining,
                serverId,
                justInstalledId: id,
                asIce: true,
              },
            },
          })),
        ],
logLine: `Fast Break — install up to ${remaining} more into/protecting ${serverId}.`,
});
      return { ok: true };
    }

case "install_from_hq_on_remote_root_place_advancement_cannot_score_or_rez_until_next_corp_turn": {
      const amount = Math.max(0, action.amount);
      const installable = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        if (t !== "agenda" && t !== "asset" && t !== "upgrade") return false;
        return (
          creditsAvailableForInstall(state, "corp") >=
          corpInstallCost(state.cards[id]!, 0)
        );
      });
      if (installable.length === 0) {
        log(state, `${source.title} — no affordable root card in HQ.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        const cost = corpInstallCost(card, 0);
        for (const server of Object.values(state.servers)) {
          if (server.kind !== "remote") continue;
          options.push({
            id: `saraswati:${cardId}:${server.id}`,
            label: `Install ${card.title} on ${server.id} for ${cost}¢`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_remote_root_place_adv_lock_until_next_corp_turn",
                cardId,
                serverId: server.id,
                amount,
              },
            },
          });
        }
        options.push({
          id: `saraswati:${cardId}:new`,
          label: `Install ${card.title} on new remote for ${cost}¢`,
          effect: {
            op: "do",
            action: {
              kind: "install_hq_remote_root_place_adv_lock_until_next_corp_turn",
              cardId,
              serverId: "__new_remote__",
              amount,
            },
          },
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — install from HQ on a remote root (pay costs), place ${amount} advancement(s), lock until next Corp turn.`,
});
      return { ok: true };
    }

case "install_hq_remote_root_place_adv_lock_until_next_corp_turn": {
      const card = state.cards[action.cardId];
      if (!card || !state.corp.hand.includes(action.cardId)) {
        log(state, `Saraswati — card not in HQ.`);
        return { ok: true };
      }
      const cost = corpInstallCost(card, 0);
      if (creditsAvailableForInstall(state, "corp") < cost) {
        log(state, `Saraswati — cannot afford ${cost}¢.`);
        return { ok: true };
      }
      spendCreditsForInstall(state, "corp", cost);
      const destId = resolveInstallServerId(state, action.serverId);
      const dest = destId ? state.servers[destId] : null;
      if (!dest || dest.kind !== "remote") {
        log(state, `Saraswati — invalid remote.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== action.cardId);
      dest.root.push(action.cardId);
      card.zone = `server:${destId}:root`;
      card.rezzed = false;
      card.faceup = false;
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementCounters = card.advancementCounters ?? 0;
      }
      noteInstalledThisTurn(state, action.cardId);
      state.turn.corpInstalledFromHqThisTurn = true;
      log(
        state,
        `Install ${card.title} from HQ on ${destId} for ${cost}¢.`,
      );
      fireOnInstall(state, action.cardId);
      const amount = Math.max(0, action.amount);
      if (amount > 0) {
        const placeR = applyPrimitive(ctx, {
          kind: "place_advancements_on",
          cardId: action.cardId,
          amount,
        });
        if (!placeR.ok) return placeR;
      }
      if (!state.cannotScoreOrRezUntilNextCorpTurnCardIds) {
        state.cannotScoreOrRezUntilNextCorpTurnCardIds = [];
      }
      if (
        !state.cannotScoreOrRezUntilNextCorpTurnCardIds.includes(action.cardId)
      ) {
        state.cannotScoreOrRezUntilNextCorpTurnCardIds.push(action.cardId);
      }
      log(
        state,
        `${card.title} cannot be scored or rezzed until Corp's next turn begins.`,
      );
      return { ok: true };
    }

case "install_picked": {
      const card = state.cards[action.cardId];
      if (!card || !museZoneCards(state, action.from).includes(action.cardId)) {
        log(state, `Muse — picked card missing.`);
        if (action.from === "stack") shuffleRunnerStack(state);
        return { ok: true };
      }
      const isTrojan =
        (card.subtypes ?? []).includes("trojan") || Boolean(card.installOnIce);
      if (isTrojan) {
        const iceIds: string[] = [];
        for (const server of Object.values(state.servers)) {
          iceIds.push(...server.ice);
        }
        if (iceIds.length === 0) {
          log(state, `Muse — no ice to host trojan ${card.title}.`);
          if (action.from === "stack") shuffleRunnerStack(state);
          return { ok: true };
        }
        if (iceIds.length === 1) {
          return applyPrimitive(ctx, {
            kind: "install_on_ice",
            cardId: action.cardId,
            iceId: iceIds[0]!,
            from: action.from,
          });
        }
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: iceIds.map((iceId) => ({
            id: `muse-ice:${iceId}`,
            label: `Host on ${state.cards[iceId]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_on_ice" as const,
                cardId: action.cardId,
                iceId,
                from: action.from,
              },
            },
          })),
logLine: `Muse — choose ice to host ${card.title}.`,
});
        return { ok: true };
      }
      return applyPrimitive(ctx, {
        kind: "install_on_daemon",
        cardId: action.cardId,
        from: action.from,
      });
    }

case "install_on_ice": {
      return finishMuseInstall(
        state,
        action.cardId,
        action.from,
        sourceId,
        action.iceId,
        true,
      );
    }

case "install_on_daemon": {
      return finishMuseInstall(
        state,
        action.cardId,
        action.from,
        sourceId,
        sourceId,
        false,
      );
    }

case "install_wizard_chest": {
      return installSetAsideIgnoringCosts(state, action.cardId, sourceId);
    }

case "install_heap_paying_click": {
      const card = state.cards[action.cardId];
      if (!card || !state.runner.discardPile.includes(action.cardId)) {
        log(state, `install_heap_paying_click — card not in heap.`);
        return { ok: true };
      }
      if (state.runner.clicks < action.clickCost) {
        log(state, `install_heap_paying_click — not enough clicks.`);
        return { ok: true };
      }
      const cost = card.installCost ?? 0;
      if (creditsAvailableForInstall(state, "runner") < cost) {
        log(state, `install_heap_paying_click — cannot afford ${card.title}.`);
        return { ok: true };
      }
      state.runner.clicks -= action.clickCost;
      spendCreditsForInstall(state, "runner", cost);
      state.runner.discardPile = state.runner.discardPile.filter(
        (x) => x !== action.cardId,
      );
      state.runner.installed.push(action.cardId);
      card.zone = "runner:installed";
      card.faceup = true;
      if ((card.powerCountersOnInstall ?? 0) > 0) {
        card.powerCounters = card.powerCountersOnInstall;
      }
      noteInstalledThisTurn(state, action.cardId);
      log(
        state,
        `Install ${card.title} from heap for ${action.clickCost}[click] + ${cost}¢.`,
      );
      fireOnInstall(state, action.cardId);
      noteProgramOrHardwareInstalled(state, action.cardId);
      return { ok: true };
    }
    default:
      return null;
  }
}
