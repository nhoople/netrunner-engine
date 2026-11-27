/**
 * Primitive kinds for Corp installs that rez the card or place advancements on
 * it, and agenda installs. The kind registry (`applyCoreKinds`) dispatches
 * here.
 */
import { iceInstallCapRefuses } from "../../state/cardFlags/staticFlags.js";
import { revealCards } from "../../state/visibility/reveal.js";
import {
  type EffectCtx,
  type EvalResult,
  evalEffect,
  applyPrimitive,
  fireOnInstall,
  fireHostRezStateTriggers,
  fireOnRez,
} from "../eval.js";
import { offerInstallRezSplit } from "./installChoices.js";
import { type Effect, type Primitive, fx } from "../ir.js";
import {
  corpInstallCost,
  installAndRezPaid,
  payInstallCost,
} from "../../state/keywordsAndCredits/costs.js";
import { creditsAvailableForInstall } from "../../state/keywordsAndCredits/runnerCredits.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { noteInstalledThisTurn } from "../../state/install/programHardwareInstall.js";
import { CR } from "../../timing/labels.js";
import { corpCardInstallable, resolveInstallServerId } from "./corpInstall.js";
import {
  chooseCorpCardToInstall,
  corpInstallableIds,
} from "./corpAbilityInstall.js";
import { addOutermostIce } from "../../state/uninstallAndPosition/runPosition.js";
import type { ServerId } from "../../state/types.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import { hostCard } from "../../state/hostingAndTrash/host.js";
import { removeCardFromGame } from "../../state/uninstallAndPosition/uninstall.js";

function serverIdForInstalledCorpCard(
  state: EffectCtx["state"],
  cardId: string,
): ServerId | null {
  for (const [sid, server] of Object.entries(state.servers)) {
    if (server.root.includes(cardId) || server.ice.includes(cardId)) {
      return sid as ServerId;
    }
  }
  return null;
}

function nextRemoteId(state: EffectCtx["state"]): ServerId {
  let n = 1;
  while (state.servers[`remote-${n}` as ServerId]) n += 1;
  return `remote-${n}` as ServerId;
}

export function applyCorpInstallThenRezOrAdvanceKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
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
        if (iceInstallCapRefuses(state, card)) continue;
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

    case "may_install_rez_bioroid_inward": {
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
      // "You may install and rez": the Corp may decline, even with one
      // candidate (CR 9.6.9).
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...candidates.map((id) => ({
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
      if (iceInstallCapRefuses(state, card)) return { ok: true };
      const fromHq = state.corp.hand.includes(id);
      if (fromHq) {
        state.corp.hand = state.corp.hand.filter((cid) => cid !== id);
      } else {
        state.corp.discardPile = state.corp.discardPile.filter(
          (cid) => cid !== id,
        );
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

    case "install_and_rez_asset_or_upgrade_free": {
      // Printed (License Acquisition): "you may install and rez 1 asset
      // or upgrade from HQ or Archives, ignoring all costs." The Corp
      // picks the card and its destination.
      const candidates = corpInstallableIds(state, ["hq", "archives"], (id) => {
        const t = state.cards[id]?.type;
        return t === "asset" || t === "upgrade";
      });
      const named =
        action.cardIds ?? (action.cardId ? [action.cardId] : undefined);
      if (!named) {
        if (candidates.length === 0) {
          log(state, `Install+rez asset/upgrade — none in HQ/Archives.`);
          return { ok: true };
        }
        return evalEffect(
          ctx,
          chooseCorpCardToInstall({
            candidates,
            resume: { kind: "install_and_rez_asset_or_upgrade_free" },
          }),
        );
      }
      const cardId = named.find((id) => candidates.includes(id));
      if (!cardId) {
        log(state, `Install+rez asset/upgrade — the Corp installs nothing.`);
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
      state.runner.scoreArea = state.runner.scoreArea.filter(
        (id) => id !== cardId,
      );
      const server =
        state.servers[serverId as import("../../state/types.js").ServerId];
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
      if (action.placeAdvancementIfRunnerTagged && state.runner.tags > 0) {
        card.advancementCounters = (card.advancementCounters ?? 0) + 1;
        log(
          state,
          `Runner still tagged — place 1 advancement on ${card.title}.`,
        );
      }
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
      const installOnly = Math.max(
        0,
        installCost - (action.installDiscount ?? 0),
      );
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
      payInstallCost(state, "corp", pay);
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
        // Shown to both players, and still facedown (CR 1.21.3a).
        card.rezzed = false;
        card.faceup = false;
        revealCards(state, [cardId], sourceId);
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
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
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
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
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
      payInstallCost(state, "corp", cost);
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
      log(state, `Install ${card.title} from HQ on ${destId} for ${cost}¢.`);
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

    case "install_asa_non_agenda_same_server": {
      const lastId = state.turn.installedThisTurn.at(-1);
      if (!lastId) {
        log(state, `Asa Group — no install to match.`);
        return { ok: true };
      }
      const serverId = serverIdForInstalledCorpCard(state, lastId);
      if (!serverId) {
        log(state, `Asa Group — last install has no server.`);
        return { ok: true };
      }
      const hq = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "asset" || t === "upgrade" || t === "ice";
      });
      if (hq.length === 0) {
        log(state, `Asa Group — no non-agenda in HQ.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const cardId of hq) {
        const card = state.cards[cardId]!;
        if (card.type === "ice") {
          options.push({
            id: `asa-ice:${cardId}`,
            label: `Install ${card.title} protecting ${serverId}`,
            effect: fx.do({
              kind: "install_asa_resolve",
              cardId,
              serverId,
              asIce: true,
            }),
          });
        } else {
          options.push({
            id: `asa-root:${cardId}`,
            label: `Install ${card.title} in root of ${serverId}`,
            effect: fx.do({
              kind: "install_asa_resolve",
              cardId,
              serverId,
              asIce: false,
            }),
          });
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `${source?.title ?? "Asa Group"} — may install non-agenda same server (${serverId}).`,
      });
      return { ok: true };
    }

    case "install_priority_construction_resolve": {
      let serverId = action.serverId as ServerId | "__new_remote__";
      if (serverId === "__new_remote__") {
        const remoteNum = state.nextRemoteNumber++;
        serverId = `remote-${remoteNum}` as ServerId;
        state.servers[serverId] = {
          id: serverId,
          kind: "remote",
          ice: [],
          root: [],
        };
      }
      const server = state.servers[serverId];
      const iceId = action.iceId;
      const card = state.cards[iceId];
      if (!server || !card || card.type !== "ice") {
        log(state, `Priority Construction — invalid install.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== iceId);
      // Outermost = index 0.
      server.ice.unshift(iceId);
      card.zone = `server:${serverId}:ice`;
      card.faceup = false;
      card.rezzed = false;
      const adv = action.advancements ?? 3;
      card.advancementCounters = (card.advancementCounters ?? 0) + adv;
      log(
        state,
        `Priority Construction — install ${card.title} outermost on ${serverId} with ${adv} advancement(s) (ignore costs).`,
      );
      return { ok: true };
    }

    case "install_rez_resolve": {
      let serverId = action.serverId as ServerId | "__new_remote__";
      if (serverId === "__new_remote__") {
        const remoteNum = state.nextRemoteNumber++;
        serverId = `remote-${remoteNum}` as ServerId;
        state.servers[serverId] = {
          id: serverId,
          kind: "remote",
          ice: [],
          root: [],
        };
      }
      const server = state.servers[serverId];
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!server || !card) {
        log(state, `Restore — invalid target.`);
        return { ok: true };
      }
      const installCost = corpInstallCost(
        card,
        card.type === "ice" ? server.ice.length : 0,
      );
      const rezCost = card.type === "agenda" ? 0 : (card.rezCost ?? 0);
      const total = installCost + rezCost;
      if (state.corp.credits < total) {
        log(state, `Restore — cannot afford ${total}¢.`);
        return { ok: true };
      }
      state.corp.credits -= total;
      state.corp.discardPile = state.corp.discardPile.filter(
        (id) => id !== cardId,
      );
      if (card.type === "ice") {
        // Outermost, as the text names no other position (CR 6.2.2a).
        addOutermostIce(state, serverId, cardId);
        card.zone = `server:${serverId}:ice`;
      } else {
        server.root.push(cardId);
        card.zone = `server:${serverId}:root`;
      }
      if (card.type !== "agenda") {
        card.rezzed = true;
      }
      card.faceup = true;
      const defId = card.defId;
      // RFG other copies of that card in Archives.
      const others = state.corp.discardPile.filter(
        (id) => state.cards[id]?.defId === defId,
      );
      for (const oid of others) {
        removeCardFromGame(state, oid);
        const oc = state.cards[oid];
        log(
          state,
          `Restore — RFG other copy ${oc?.title ?? oid} from Archives.`,
        );
      }
      log(
        state,
        `Restore — install${card.type !== "agenda" ? "+rez" : ""} ${card.title} on ${serverId} for ${total}¢.`,
      );
      return { ok: true };
    }

    case "may_install_drawn_agenda": {
      const agendaId = action.cardId;
      const setAside =
        state.pendingDrawSetAside?.cardIds.includes(agendaId) ?? false;
      if (
        !state.corp.hand.includes(agendaId) &&
        !setAside &&
        state.corp.deck.includes(agendaId)
      ) {
        return { ok: true };
      }
      if (!state.cards[agendaId]) return { ok: true };
      const agenda = state.cards[agendaId]!;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "pd:install",
            label: `Reveal and install ${agenda.title}`,
            effect: fx.do({
              kind: "install_agenda",
              cardId: agendaId,
            }),
          },
          {
            id: "pd:decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "install_agenda": {
      const agendaId = action.cardId;
      const inHand = state.corp.hand.includes(agendaId);
      const setAside =
        state.pendingDrawSetAside?.cardIds.includes(agendaId) ?? false;
      if (!inHand && !setAside) return { ok: true };
      if (inHand) {
        state.corp.hand = state.corp.hand.filter((id) => id !== agendaId);
      } else if (state.pendingDrawSetAside) {
        state.pendingDrawSetAside.cardIds =
          state.pendingDrawSetAside.cardIds.filter((id) => id !== agendaId);
      }
      const agenda = state.cards[agendaId]!;
      let n = 1;
      while (state.servers[`remote-${n}` as ServerId]) n += 1;
      const serverId = `remote-${n}` as ServerId;
      state.servers[serverId] = {
        id: serverId,
        kind: "remote",
        ice: [],
        root: [],
      };
      state.corp.hand = state.corp.hand.filter((id) => id !== agendaId);
      agenda.zone = `server:${serverId}:root`;
      agenda.faceup = false;
      agenda.rezzed = false;
      state.servers[serverId]!.root.push(agendaId);
      revealCards(state, [agenda.id], sourceId);
      log(
        state,
        `Political Dealings — reveal and install ${agenda.title} in ${serverId}.`,
      );
      return { ok: true };
    }

    case "install_new_construction_resolve": {
      const id = action.cardId;
      if (!state.corp.hand.includes(id)) return { ok: true };
      const card = state.cards[id]!;
      if (iceInstallCapRefuses(state, card)) return { ok: true };
      const serverId = nextRemoteId(state);
      state.servers[serverId] = {
        id: serverId,
        kind: "remote",
        root: [],
        ice: [],
      };
      state.nextRemoteNumber = Math.max(
        state.nextRemoteNumber,
        Number(serverId.replace("remote-", "")) + 1,
      );
      state.corp.hand = state.corp.hand.filter((x) => x !== id);
      if (card.type === "ice") {
        state.servers[serverId]!.ice.push(id);
        card.zone = `server:${serverId}:ice`;
      } else {
        state.servers[serverId]!.root.push(id);
        card.zone = `server:${serverId}:root`;
      }
      card.faceup = Boolean(card.installFaceup);
      card.rezzed = false;
      if (
        action.rezIgnoringCosts &&
        card.type !== "agenda" &&
        card.type !== "ice"
      ) {
        card.rezzed = true;
        card.faceup = true;
        log(
          state,
          `New Construction — install and rez ${card.title} in ${serverId} (ignoring costs).`,
        );
      } else {
        log(state, `New Construction — install ${card.title} in ${serverId}.`);
      }
      return { ok: true };
    }
    case "install_mushin_from_hq_root": {
      const hq = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "asset" || t === "agenda" || t === "upgrade";
      });
      if (hq.length === 0) {
        log(state, `Mushin — no asset/agenda/upgrade in HQ.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: hq.map((id) => ({
          id: `mushin:${id}`,
          label: `Install ${state.cards[id]!.title} from HQ in a server root`,
          effect: fx.do({
            kind: "install_mushin_hq_card_server_pick",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }
    case "install_mushin_hq_card_server_pick": {
      const cardId = action.cardId;
      // Printed: "Install a card from HQ in a new remote server" —
      // always a new remote, never an existing one.
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: `mushin-new:${cardId}`,
            label: `Install ${state.cards[cardId]!.title} in a new remote`,
            effect: fx.do({ kind: "install_mushin_new_remote", cardId }),
          },
        ],
      });
      return { ok: true };
    }
    case "install_mushin_new_remote": {
      const { cardId } = action;
      const idx = state.corp.hand.indexOf(cardId);
      if (idx < 0) return { ok: true };
      state.corp.hand.splice(idx, 1);
      const card = state.cards[cardId]!;
      const sid = `remote-${state.nextRemoteNumber++}` as ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [cardId] };
      card.zone = `server:${sid}:root`;
      card.faceup = false;
      card.rezzed = false;
      card.advancementCounters = (card.advancementCounters ?? 0) + 3;
      // Printed: it cannot be rezzed or scored until your next turn begins.
      if (!state.cannotScoreOrRezUntilNextCorpTurnCardIds) {
        state.cannotScoreOrRezUntilNextCorpTurnCardIds = [];
      }
      if (!state.cannotScoreOrRezUntilNextCorpTurnCardIds.includes(cardId)) {
        state.cannotScoreOrRezUntilNextCorpTurnCardIds.push(cardId);
      }
      log(
        state,
        `Mushin — install ${card.title} in new ${sid} and place 3 advancement counters; it cannot be rezzed or scored until your next turn begins.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}

export function applyCorpInstallThenRezOrAdvanceKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "install_asset_from_hq_rez_discount": {
      const discount = action.discount ?? 2;
      const max = source.maxHostedCards ?? 3;
      const have = source.hostedCardIds?.length ?? 0;
      if (have >= max) {
        log(state, `Worlds Plaza — host capacity full.`);
        return { ok: true };
      }
      const assets = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "asset",
      );
      if (assets.length === 0) {
        log(state, `Worlds Plaza — no asset in HQ.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: assets.map((cardId) => ({
          id: `wp:${cardId}`,
          label: `Install and rez ${state.cards[cardId]!.title} (−${discount}¢)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "resolve_worlds_plaza" as const,
              cardId,
              discount,
            },
          },
        })),
      });
      return { ok: true };
    }

    case "install_agenda_faceup": {
      const agendas = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (agendas.length === 0) {
        log(state, `Casting Call — no agenda in HQ.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: agendas.map((cardId) => ({
          id: `casting:${cardId}`,
          label: `Install ${state.cards[cardId]!.title} faceup`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_casting_call" as const,
              cardId,
            },
          },
        })),
      });
      return { ok: true };
    }

    case "install_casting_call": {
      const agendaId = action.cardId;
      const agenda = state.cards[agendaId];
      if (!agenda || agenda.type !== "agenda") return { ok: true };
      // Install into a new remote faceup and host Casting Call as condition.
      let remoteIdx = 1;
      while (state.servers[`remote-${remoteIdx}` as ServerId]) remoteIdx += 1;
      const serverId = `remote-${remoteIdx}` as ServerId;
      state.servers[serverId] = {
        id: serverId,
        kind: "remote",
        ice: [],
        root: [],
      };
      state.corp.hand = state.corp.hand.filter((id) => id !== agendaId);
      agenda.zone = `server:${serverId}:root`;
      agenda.faceup = true;
      agenda.rezzed = false;
      state.servers[serverId]!.root.push(agendaId);
      // Host condition counter on agenda.
      removeCardFromCurrentZone(state, sourceId);
      hostCard(state, source.id, agendaId, { installed: true });
      source.zone = `hosted:${agendaId}`;
      source.faceup = true;
      source.castingCallCondition = true;
      agenda.onAccessGiveTags = (agenda.onAccessGiveTags ?? 0) + 2;
      log(
        state,
        `Casting Call — install ${agenda.title} faceup in ${serverId}; host condition (2 tags on access).`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
