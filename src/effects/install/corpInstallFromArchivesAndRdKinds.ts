/**
 * Primitive kinds for Corp installs from Archives and R&D. The kind registry
 * (`applyCoreKinds`) dispatches here.
 */
import { iceInstallCapRefuses } from "../../state/cardFlags/staticFlags.js";
import { revealCards, lookAtCards } from "../../state/visibility/reveal.js";
import {
  type EffectCtx,
  type EvalResult,
  serverHostingCard,
  returnRdLookedToDeckTop,
  shuffleCorpRdAfterSearch,
  offerInstallRezSplit,
  evalEffect,
  applyPrimitive,
  fireOnInstall,
  fireHostRezStateTriggers,
  fireOnRez,
} from "../eval.js";
import { type Effect, type Primitive, fx } from "../ir.js";
import { occurCheckpoint } from "../../legality/checkpoints.js";
import {
  corpInstallCost,
  creditsAvailableForInstall,
  installAndRezPaid,
  payInstallCost,
} from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { noteInstalledThisTurn } from "../../state/install/programHardwareInstall.js";
import { noteFirstInstallInServerRootThisTurn } from "../../state/hostingAndTrash/trashHooks.js";
import { CR } from "../../timing/labels.js";
import { corpCardInstallable, resolveInstallServerId } from "./corpInstall.js";
import { random } from "../../state/rng.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import {
  chooseCorpCardToInstall,
  corpInstallableIds,
} from "./corpAbilityInstall.js";
import type { ServerId } from "../../state/types.js";

function iceCandidatesFromHqOrArchives(
  state: EffectCtx["state"],
): Array<{ cardId: string; from: "hq" | "archives" }> {
  const out: Array<{ cardId: string; from: "hq" | "archives" }> = [];
  for (const id of state.corp.hand) {
    if (state.cards[id]?.type === "ice") out.push({ cardId: id, from: "hq" });
  }
  for (const id of state.corp.discardPile) {
    if (state.cards[id]?.type === "ice") {
      out.push({ cardId: id, from: "archives" });
    }
  }
  return out;
}

export function applyCorpInstallFromArchivesAndRdKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
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
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
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
      payInstallCost(state, "corp", cost, undefined, destId ?? undefined);
      state.corp.discardPile = state.corp.discardPile.filter(
        (id) => id !== cardId,
      );
      dest.root.push(cardId);
      card.zone = `server:${dest.id}:root`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementCounters =
        (card.advancementCounters ?? 0) + action.amount;
      noteInstalledThisTurn(state, cardId);
      log(
        state,
        `Install ${card.title} from Archives onto ${dest.id} for ${cost}¢ with ${action.amount} advancement(s).`,
      );
      fireOnInstall(state, cardId);
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
      if (iceInstallCapRefuses(state, card)) {
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
      // Architect installs only ("ignoring the install cost"); Architect
      // Deployment Test installs and rezzes (CR 8.5.2, 8.5.2a).
      const rezAfter = action.rez !== false;
      const doRez = rezAfter && card.type !== "agenda";
      // Installed facedown (CR 8.5.2). An agenda cannot be rezzed, so it is
      // revealed instead and stays facedown (CR 8.5.13d, 1.21.3).
      card.rezzed = false;
      card.faceup = false;
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementCounters = card.advancementCounters ?? 0;
      }
      noteInstalledThisTurn(state, cardId);
      log(
        state,
        rezAfter
          ? `Install ${card.title} from looked R&D on ${sid} ignoring costs.`
          : `Install a card from looked R&D on ${sid} ignoring the install cost.`,
      );
      if (rezAfter && !doRez) {
        revealCards(state, [cardId], sourceId, CR.revealForInstallAndRez);
      }
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
      // A refused install leaves the card in R&D with the others: it never
      // passes through HQ, and it is never faceup there (CR 1.21.6, 10.2.2a).
      if (iceInstallCapRefuses(state, card)) {
        returnRdLookedToDeckTop(state);
        return { ok: true };
      }
      const cost = corpInstallCost(card, 0);
      if (creditsAvailableForInstall(state, "corp") < cost) {
        log(state, `Install looked R&D card — cannot afford ${cost}¢.`);
        returnRdLookedToDeckTop(state);
        return { ok: true };
      }
      payInstallCost(state, "corp", cost);
      state.turn.rdLookedCards = state.turn.rdLookedCards.filter(
        (x) => x !== cardId,
      );
      state.corp.hand.push(cardId);
      card.zone = "corp:hq";
      card.faceup = false;
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
      if (iceInstallCapRefuses(state, card)) return { ok: true };
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
        revealCards(state, [card.id], sourceId);
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
        if (state.corp.credits >= installPay)
          return installUnrezzed(installPay);
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

    case "install_from_hq_or_archives": {
      // The Corp picks the card (CR 1.15.2), then its destination
      // (CR 8.5.16b). The install cost is paid unless the text ignores it.
      const candidates = corpInstallableIds(
        state,
        ["hq", "archives"],
        (id) => !(action.excludeAgenda && state.cards[id]?.type === "agenda"),
      );
      if (!action.cardIds) {
        if (candidates.length === 0) {
          log(state, `Install from HQ or Archives — no card can be installed.`);
          return { ok: true };
        }
        return evalEffect(
          ctx,
          chooseCorpCardToInstall({
            candidates,
            required: action.required,
            resume: { ...action },
          }),
        );
      }
      const cardId = action.cardIds.find((id) => candidates.includes(id));
      if (!cardId) {
        log(state, `Install from HQ or Archives — the Corp installs nothing.`);
        return { ok: true };
      }
      const here = action.excludeSourceServer
        ? serverHostingCard(state, sourceId)?.id
        : undefined;
      return evalEffect(ctx, {
        op: "do",
        action: {
          kind: "install_corp_card",
          cardId,
          ...(action.ignoreInstallCost ? { ignoreInstallCost: true } : {}),
          ...(here ? { excludeServerId: here } : {}),
        },
      });
    }

    case "may_install_facedown_from_archives": {
      // Printed (Hybrid Release): "you may install 1 facedown card from
      // Archives." The Corp picks the card and its destination.
      const candidates = corpInstallableIds(
        state,
        ["archives"],
        (id) => !state.cards[id]?.faceup,
      );
      if (!action.cardIds) {
        if (candidates.length === 0) {
          log(
            state,
            `Install facedown from Archives — no facedown card can be installed.`,
          );
          return { ok: true };
        }
        return evalEffect(
          ctx,
          chooseCorpCardToInstall({ candidates, resume: { ...action } }),
        );
      }
      const cardId = action.cardIds.find((id) => candidates.includes(id));
      if (!cardId) {
        log(
          state,
          `Install facedown from Archives — the Corp installs nothing.`,
        );
        return { ok: true };
      }
      return evalEffect(ctx, {
        op: "do",
        action: { kind: "install_corp_card", cardId },
      });
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
      const serverIds = Object.keys(
        state.servers,
      ) as import("../../state/types.js").ServerId[];
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const iceId of iceIds) {
        const ice = state.cards[iceId]!;
        const rezCost = ice.rezCost ?? 0;
        for (const sid of serverIds) {
          const installCost = corpInstallCost(
            ice,
            state.servers[sid].ice.length,
          );
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
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `${source.title} — install and rez ice from Archives (−${discount}¢).`,
      });
      return { ok: true };
    }

    case "install_and_rez_archives_ice": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (
        !card ||
        card.type !== "ice" ||
        !state.corp.discardPile.includes(cardId)
      ) {
        log(state, `Reanimation — ice not in Archives.`);
        return { ok: true };
      }
      if (iceInstallCapRefuses(state, card)) return { ok: true };
      const discount = Math.max(0, action.totalDiscount ?? 0);
      const destPreview =
        action.serverId === "new-remote"
          ? undefined
          : state.servers[
              action.serverId as import("../../state/types.js").ServerId
            ];
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
      state.corp.discardPile = state.corp.discardPile.filter(
        (id) => id !== cardId,
      );
      let destId = action.serverId as
        import("../../state/types.js").ServerId | "new-remote";
      if (destId === "new-remote") {
        const remoteNum = state.nextRemoteNumber++;
        destId =
          `remote-${remoteNum}` as import("../../state/types.js").ServerId;
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

    case "install_and_rez_from_archives_free": {
      // Printed (Trust Operation): "Install and rez 1 card from Archives,
      // ignoring all costs." The Corp picks the card and its destination.
      const candidates = corpInstallableIds(state, ["archives"]);
      if (!action.cardIds) {
        if (candidates.length === 0) {
          log(state, `Install+rez from Archives — none available.`);
          return { ok: true };
        }
        return evalEffect(
          ctx,
          chooseCorpCardToInstall({
            candidates,
            required: true,
            resume: { kind: "install_and_rez_from_archives_free" },
          }),
        );
      }
      const cardId = action.cardIds.find((id) => candidates.includes(id));
      if (!cardId) {
        log(state, `Install+rez from Archives — none available.`);
        return { ok: true };
      }
      return evalEffect(ctx, {
        op: "do",
        action: {
          kind: "install_corp_card",
          cardId,
          ignoreInstallCost: true,
          rez: true,
        },
      });
    }

    case "install_rd_ice_protecting_central_discount": {
      const card = state.cards[action.cardId];
      const serverId =
        action.serverId as import("../../state/types.js").ServerId;
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
      payInstallCost(state, "corp", pay);
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
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
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
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `May install from Archives ignoring all costs.`,
      });
      return { ok: true };
    }

    case "accelerated_beta_test": {
      const n = action.n ?? 3;
      // "You may look at the top 3 cards of R&D": the Corp may decline, and
      // then nothing is looked at or trashed (CR 9.6.9c, 1.2.1).
      if (!action.look) {
        openPendingChoose(state, {
          sourceId,
          chooser: "corp",
          options: [
            {
              id: "abt-look",
              label: `Look at the top ${n} cards of R&D`,
              effect: fx.do({ kind: "accelerated_beta_test", n, look: true }),
            },
            {
              id: "abt-decline",
              label: "Decline",
              effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
            },
          ],
          logLine: `${source?.title ?? "Accelerated Beta Test"} — the Corp may look at the top ${n} cards of R&D.`,
        });
        return { ok: true };
      }
      if (state.turn.rdLookedCards.length > 0) {
        return {
          ok: false,
          error: "R&D look already in progress.",
          cites: [],
        };
      }
      const taken = state.corp.deck.splice(
        0,
        Math.min(n, state.corp.deck.length),
      );
      state.turn.rdLookedCards = taken;
      lookAtCards(state, taken, sourceId);
      return applyPrimitive(ctx, { kind: "accelerated_beta_test_continue" });
    }

    case "accelerated_beta_test_continue": {
      const iceLeft = state.turn.rdLookedCards.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (iceLeft.length === 0) {
        for (const id of [...state.turn.rdLookedCards]) {
          state.turn.rdLookedCards = state.turn.rdLookedCards.filter(
            (x) => x !== id,
          );
          trashCard(state, id, { by: source.side });
          log(state, `ABT — trash ${state.cards[id]!.title}.`);
        }
        state.turn.rdLookedCards = [];
        return { ok: true };
      }
      const iceId = iceLeft[0]!;
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: `abt-skip:${iceId}`,
          label: `Decline ${state.cards[iceId]!.title} (will trash)`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "trash_looked",
                  cardId: iceId,
                },
              },
              {
                op: "do",
                action: { kind: "accelerated_beta_test_continue" },
              },
            ],
          },
        },
      ];
      for (const server of Object.values(state.servers)) {
        options.push({
          id: `abt-ice:${iceId}:${server.id}`,
          label: `Install and rez ${state.cards[iceId]!.title} protecting ${server.id}`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "install_ice" as const,
                  cardId: iceId,
                  serverId: server.id,
                },
              },
              {
                op: "do" as const,
                action: { kind: "accelerated_beta_test_continue" as const },
              },
            ],
          },
        });
      }
      options.push({
        id: `abt-ice:${iceId}:new`,
        label: `Install and rez ${state.cards[iceId]!.title} protecting a new remote`,
        effect: {
          op: "seq",
          effects: [
            {
              op: "do" as const,
              action: {
                kind: "install_ice" as const,
                cardId: iceId,
                serverId: "__new_remote__",
              },
            },
            {
              op: "do" as const,
              action: { kind: "accelerated_beta_test_continue" as const },
            },
          ],
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `ABT — may install and rez ${state.cards[iceId]!.title}.`,
      });
      return { ok: true };
    }

    case "install_and_rez_from_archives_paying_costs_rfg_other_copies": {
      const installable = state.corp.discardPile.filter((id) => {
        const t = state.cards[id]?.type;
        return (
          t === "asset" || t === "upgrade" || t === "ice" || t === "agenda"
        );
      });
      if (installable.length === 0) {
        log(state, `Restore — no installable card in Archives.`);
        return { ok: true };
      }
      const opts: { id: string; label: string; effect: Effect }[] = [];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        const rezCost = card.type === "agenda" ? 0 : (card.rezCost ?? 0);
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            const total = corpInstallCost(card, server.ice.length) + rezCost;
            if (state.corp.credits < total) continue;
            opts.push({
              id: `restore:${cardId}:${server.id}`,
              label: `Install+rez ${card.title} on ${server.id} (${total}¢)`,
              effect: fx.do({
                kind: "install_rez_resolve",
                cardId,
                serverId: server.id,
              }),
            });
          }
        } else {
          const total = rezCost;
          if (state.corp.credits < total) continue;
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            opts.push({
              id: `restore:${cardId}:${server.id}`,
              label: `Install+rez ${card.title} on ${server.id} (${total}¢)`,
              effect: fx.do({
                kind: "install_rez_resolve",
                cardId,
                serverId: server.id,
              }),
            });
          }
          opts.push({
            id: `restore:${cardId}:new`,
            label: `Install+rez ${card.title} on new remote (${total}¢)`,
            effect: fx.do({
              kind: "install_rez_resolve",
              cardId,
              serverId: "__new_remote__",
            }),
          });
        }
      }
      if (opts.length === 0) {
        log(state, `Restore — cannot afford any Archives install+rez.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: opts.slice(0, 24),
      });
      return { ok: true };
    }

    case "install_and_rez_x_advertisements_from_hq_or_archives": {
      const x = state.turn.lastPlayCostX ?? 0;
      const ads = [...state.corp.hand, ...state.corp.discardPile].filter(
        (id) => {
          const card = state.cards[id];
          if (!card || !(card.subtypes ?? []).includes("advertisement"))
            return false;
          if (card.type === "agenda") return false;
          const cost = corpInstallCost(card, 0) + (card.rezCost ?? 0);
          return state.corp.credits >= cost;
        },
      );
      if (x <= 0 || ads.length === 0) {
        log(state, `Ad Blitz — nothing to install (X=${x}).`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: ads.map((id) => ({
          id: `adblitz:${id}`,
          label: `Install+rez ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "install_rez_advertisement",
            cardId: id,
            remaining: x - 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "install_ice_hq_or_archives_any_position_ignore_costs": {
      const ice = iceCandidatesFromHqOrArchives(state);
      if (ice.length === 0) {
        log(state, `Timely Public Release — no ice in HQ or Archives.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: ice.map(({ cardId, from }) => ({
          id: `mo-ice:${from}:${cardId}`,
          label: `Install ${state.cards[cardId]!.title} from ${from.toUpperCase()}`,
          effect: fx.do({
            kind: "install_ice_choose_server",
            iceId: cardId,
            from,
          }),
        })),
        logLine: `Timely Public Release — choose ice from HQ or Archives.`,
      });
      return { ok: true };
    }

    case "install_up_to_n_from_archives_paying": {
      const max = Math.max(0, action.max ?? 2);
      return applyCorpInstallFromArchivesAndRdKinds(ctx, {
        kind: "install_up_to_n_from_archives_paying_continue",
        remaining: max,
      });
    }

    case "install_up_to_n_from_archives_paying_continue": {
      const remaining = action.remaining ?? 0;
      if (remaining <= 0) return { ok: true };
      const installable = state.corp.discardPile.filter((id) => {
        const t = state.cards[id]?.type;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      });
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "done",
          label: "Done installing",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        const cost = corpInstallCost(card, 0);
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            const iceCost = corpInstallCost(card, server.ice.length);
            if (state.corp.credits < iceCost) continue;
            options.push({
              id: `arch:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id} (${iceCost}¢)`,
              effect: {
                op: "seq",
                effects: [
                  fx.do({
                    kind: "install_archives_card_paying",
                    cardId,
                    serverId: server.id,
                  }),
                  fx.do({
                    kind: "install_up_to_n_from_archives_paying_continue",
                    remaining: remaining - 1,
                  }),
                ],
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            options.push({
              id: `arch:${cardId}:${server.id}`,
              label: `Install ${card.title} on ${server.id} (${cost}¢)`,
              effect: {
                op: "seq",
                effects: [
                  fx.do({
                    kind: "install_archives_card_paying",
                    cardId,
                    serverId: server.id,
                  }),
                  fx.do({
                    kind: "install_up_to_n_from_archives_paying_continue",
                    remaining: remaining - 1,
                  }),
                ],
              },
            });
          }
          options.push({
            id: `arch:${cardId}:new`,
            label: `Install ${card.title} on new remote (${cost}¢)`,
            effect: {
              op: "seq",
              effects: [
                fx.do({
                  kind: "install_archives_card_paying",
                  cardId,
                  serverId: "__new_remote__",
                }),
                fx.do({
                  kind: "install_up_to_n_from_archives_paying_continue",
                  remaining: remaining - 1,
                }),
              ],
            },
          });
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `Friends in High Places — install up to ${remaining} from Archives (paying).`,
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
      trashCard(state, iceId, { by: "corp", cause: "cost" });
      log(
        state,
        `Mutate — trashed ${state.cards[iceId]!.title} as additional cost.`,
      );
      return { ok: true };
    }
    case "resolve_mutate_operation": {
      const slot = state.turn.mutateTrashedIce;
      if (!slot) {
        return {
          ok: false,
          error: "Mutate additional cost not paid.",
          cites: [],
        };
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
      revealCards(state, revealed, sourceId);
      const shuffleRd = () => {
        for (const id of state.corp.deck) {
          state.cards[id]!.faceup = false;
        }
        for (let i = state.corp.deck.length - 1; i > 0; i--) {
          const j = Math.floor(random(state) * (i + 1));
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
    default:
      return null;
  }
}

export function applyCorpInstallFromArchivesAndRdKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "may_install_from_hq_or_archives_ignore_costs": {
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-ts",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      const addInstallable = (zone: "hq" | "archives", ids: string[]) => {
        for (const cardId of ids) {
          const card = state.cards[cardId];
          if (!card) continue;
          if (
            card.type !== "agenda" &&
            card.type !== "asset" &&
            card.type !== "upgrade" &&
            card.type !== "ice"
          ) {
            continue;
          }
          if (card.type === "ice") {
            for (const server of Object.values(state.servers)) {
              options.push({
                id: `ts-${zone}:${cardId}:${server.id}`,
                label: `Install ${card.title} from ${zone.toUpperCase()} protecting ${server.id}`,
                effect: {
                  op: "do",
                  action: {
                    kind:
                      zone === "hq"
                        ? ("install_hq_card_ignore_costs" as const)
                        : ("install_archives_card_ignore_costs" as const),
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
                id: `ts-${zone}:${cardId}:${server.id}`,
                label: `Install ${card.title} from ${zone.toUpperCase()} on ${server.id}`,
                effect: {
                  op: "do",
                  action: {
                    kind:
                      zone === "hq"
                        ? ("install_hq_card_ignore_costs" as const)
                        : ("install_archives_card_ignore_costs" as const),
                    cardId,
                    serverId: server.id,
                  },
                },
              });
            }
            options.push({
              id: `ts-${zone}:${cardId}:new`,
              label: `Install ${card.title} from ${zone.toUpperCase()} on new remote`,
              effect: {
                op: "do",
                action: {
                  kind:
                    zone === "hq"
                      ? ("install_hq_card_ignore_costs" as const)
                      : ("install_archives_card_ignore_costs" as const),
                  cardId,
                  serverId: "__new_remote__",
                },
              },
            });
          }
        }
      };
      addInstallable("hq", [...state.corp.hand]);
      addInstallable("archives", [...state.corp.discardPile]);
      if (options.length === 1) {
        log(state, `Team Sponsorship — no installable card in HQ/Archives.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `Team Sponsorship — may install from HQ or Archives ignoring install cost.`,
      });
      return { ok: true };
    }
    default:
      return null;
  }
}
