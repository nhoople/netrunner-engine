/**
 * Primitive kinds whose procedure is search.
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
import {
  creditsAvailableForInstall,
  subtractRunnerCreditPool,
} from "../../state/costs.js";
import { log } from "../../state/createGame.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import { noteInstalledThisTurn } from "../../state/programHardwareInstall.js";
import {
  memoryLimit,
  usedMemory,
  effectiveMemoryCost,
} from "../../state/turn.js";
import { enterSetAside } from "../../state/zones.js";
import { CR } from "../../timing/labels.js";
import { corpCardInstallable } from "../corpInstall.js";
import {
  noteSearchConditionalAbilities,
  addFoundStackCardAfterSearch,
  museEligiblePrograms,
  serverHostingCard,
  shuffleCorpRdAfterSearch,
  evalEffect,
  applyPrimitive,
} from "../eval.js";
import {
  gripInstallCostAfterDiscount,
  searchStackProgramInstall,
  searchStackTypeInstall,
  shuffleRunnerStack,
} from "../runnerInstall.js";

import {
  fireOnInstall,
  fireHostRezStateTriggers,
  fireOnRez,
} from "../eval.js";

export function applySearchKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "may_search_stack_copy_of_last_installed_hardware_add_to_grip": {
      const lastId = state.turn.lastHardwareInstalledId;
      const last = lastId ? state.cards[lastId] : undefined;
      if (!last || last.type !== "hardware") {
        log(state, `${source.title} — no hardware install to copy.`);
        return { ok: true };
      }
      const title = last.title;
      const matches = state.runner.deck.filter(
        (id) => state.cards[id]?.title === title,
      );
      if (matches.length === 0) {
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: [
            {
              id: "decline-search",
              label: "Decline search",
              effect: {
                op: "do" as const,
                action: { kind: "gain_credits", side: "runner", amount: 0 },
              },
            },
            {
              id: "search-none",
              label: `Search stack for another ${title} (none)`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "search_stack_copy_of_last_installed_hardware_add_to_grip" as const,
                },
              },
            },
          ],
logLine: `${source.title} — may search stack for another ${title}.`,
});
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline-search",
            label: "Decline search",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          {
            id: "search-copy",
            label: `Search stack for another ${title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "search_stack_copy_of_last_installed_hardware_add_to_grip" as const,
              },
            },
          },
        ],
logLine: `${source.title} — may search stack for another ${title}.`,
});
      return { ok: true };
    }

case "search_stack_copy_of_last_installed_hardware_add_to_grip": {
      const lastId = state.turn.lastHardwareInstalledId;
      const last = lastId ? state.cards[lastId] : undefined;
      if (!last || last.type !== "hardware") {
        shuffleRunnerStack(state);
        log(state, `${source.title} — search: no hardware install.`);
        return { ok: true };
      }
      const title = last.title;
      const matches = state.runner.deck.filter(
        (id) => state.cards[id]?.title === title,
      );
      if (matches.length === 0) {
        shuffleRunnerStack(state);
        log(state, `Search stack for ${title} — none found.`);
        return { ok: true };
      }
      const id = matches[0]!;
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      state.runner.hand.push(id);
      state.cards[id]!.zone = "runner:grip";
      state.cards[id]!.faceup = true;
      shuffleRunnerStack(state);
      log(
        state,
        `Search stack — reveal ${state.cards[id]!.title} and add to grip.`,
      );
      return { ok: true };
    }

case "search_stack_subtype_may_install": {
      const want = action.subtype.toLowerCase();
      const matches = state.runner.deck.filter((id) =>
        (state.cards[id]?.subtypes ?? []).some(
          (s) => s.toLowerCase() === want,
        ),
      );
      if (matches.length === 0) {
        shuffleRunnerStack(state);
        log(
          state,
          `Search stack for ${action.subtype} — none found.`,
        );
        return { ok: true };
      }
      const id = matches[0]!;
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      state.runner.hand.push(id);
      state.cards[id]!.zone = "runner:grip";
      state.cards[id]!.faceup = true;
      shuffleRunnerStack(state);
      log(
        state,
        matches.length === 1
          ? `Search stack — add ${state.cards[id]!.title} to grip.`
          : `Search stack — add ${state.cards[id]!.title} to grip (${matches.length} matches; first selected).`,
      );
      const card = state.cards[id]!;
      const cost = gripInstallCostAfterDiscount(state, card, 0);
      const canInstall =
        ["program", "hardware", "resource"].includes(card.type) &&
        !(card.installOnIce || (card.subtypes ?? []).includes("trojan")) &&
        (card.type !== "program" ||
          usedMemory(state) + effectiveMemoryCost(state, id) <= memoryLimit(state)) &&
        creditsAvailableForInstall(state, "runner") >= cost;
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-install",
          label: "Decline install",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      if (canInstall) {
        options.unshift({
          id: `install:${id}`,
          label: `Install ${card.title} for ${cost}¢`,
          effect: {
            op: "do",
            action: {
              kind: "install_grip_card",
              cardId: id,
              discount: 0,
            },
          },
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options,
logLine: `${source.title} — may install ${card.title} from grip.`,
});
      return { ok: true };
    }

case "search_rd_type_to_hq": {
      const cardType = action.cardType;
      const id = state.corp.deck.find(
        (cid) => state.cards[cid]?.type === cardType,
      );
      if (!id) {
        log(state, `Search R&D for ${cardType} — none found.`);
        if (action.shuffleIfNone) state.corp.deck.reverse();
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((x) => x !== id);
      state.corp.hand.push(id);
      state.cards[id]!.zone = "corp:hq";
      state.cards[id]!.faceup = true;
      state.corp.deck.reverse();
      const title = state.cards[id]!.title;
      const shown = cardType === "agenda" ? `agenda ${title}` : title;
      log(state, `Search R&D — reveal ${shown} and add to HQ.`);
      return { ok: true };
    }

case "search_rd_up_to_one_each_subtype_to_hq": {
      const subtypes = action.subtypes ?? [];
      const found: string[] = [];
      for (const sub of subtypes) {
        const id = state.corp.deck.find((cid) => {
          if (found.includes(cid)) return false;
          const c = state.cards[cid];
          return (
            c.type === "ice" && (c.subtypes ?? []).includes(sub.toLowerCase())
          );
        });
        if (id) found.push(id);
      }
      if (found.length === 0) {
        log(state, `Search R&D for ${subtypes.join("/")} — none found.`);
        shuffleCorpRdAfterSearch(state);
        return { ok: true };
      }
      for (const id of found) {
        state.corp.deck = state.corp.deck.filter((x) => x !== id);
        state.corp.hand.push(id);
        state.cards[id].zone = "corp:hq";
        state.cards[id].faceup = true;
        log(
          state,
          `Search R&D — reveal ${state.cards[id].title} and add to HQ.`,
        );
      }
      shuffleCorpRdAfterSearch(state);
      return { ok: true };
    }

case "search_rd_operation_to_top_rd": {
      const ops = state.corp.deck.filter(
        (cid) => state.cards[cid]?.type === "operation",
      );
      if (ops.length === 0) {
        log(state, `Search R&D for operation — none found.`);
        return { ok: true };
      }
      const pick = ops[0]!;
      state.corp.deck = state.corp.deck.filter((x) => x !== pick);
      state.cards[pick].faceup = true;
      log(state, `Search R&D — reveal ${state.cards[pick].title}.`);
      shuffleCorpRdAfterSearch(state);
      state.corp.deck.unshift(pick);
      state.cards[pick].zone = "corp:rd";
      state.cards[pick].faceup = true;
      log(state, `Put ${state.cards[pick].title} on top of R&D.`);
      return { ok: true };
    }

case "search_rd_reveal_may_install_ignore_costs_else_hq": {
      const eligible = [...state.corp.deck];
      if (eligible.length === 0) {
        log(state, `Search R&D — deck empty.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-search-rd-reveal",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
        ...eligible.map((id) => ({
          id: `search-rd-reveal:${id}`,
          label: `Search for ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "search_rd_reveal_pick_install_or_hq" as const,
              cardId: id,
            },
          },
        })),
      ];
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `May search R&D for 1 card, reveal, install or add to HQ.`,
});
      return { ok: true };
    }

case "search_rd_reveal_pick_install_or_hq": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card) {
        log(state, `Search R&D reveal — invalid card.`);
        return { ok: true };
      }
      const deckIdx = state.corp.deck.indexOf(cardId);
      if (deckIdx < 0) {
        log(state, `Search R&D reveal — not in R&D.`);
        return { ok: true };
      }
      state.corp.deck.splice(deckIdx, 1);
      card.faceup = true;
      log(state, `Search R&D — reveal ${card.title}.`);
      shuffleCorpRdAfterSearch(state);
      state.corp.hand.push(cardId);
      card.zone = "corp:hq";
      const installOpts: Array<{ id: string; label: string; effect: Effect }> =
        [
          {
            id: "leave-in-hq",
            label: "Add to HQ",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ];
      if (card.type === "ice") {
        for (const server of Object.values(state.servers)) {
          installOpts.push({
            id: `install-hq:${cardId}:${server.id}`,
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
      } else if (corpCardInstallable(card.type)) {
        for (const server of Object.values(state.servers)) {
          if (server.kind !== "remote") continue;
          installOpts.push({
            id: `install-hq:${cardId}:${server.id}`,
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
        installOpts.push({
          id: `install-hq:${cardId}:new`,
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
      openPendingChoose(state, { sourceId, chooser: "corp", options: installOpts,
logLine: `May install ${card.title} ignoring costs or leave in HQ.`,
});
      return { ok: true };
    }

case "search_rd_operation_or_agenda_to_hq": {
      const id = state.corp.deck.find((cid) => {
        const t = state.cards[cid].type;
        return t === "operation" || t === "agenda";
      });
      if (!id) {
        log(state, `Search R&D for operation or agenda — none found.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((x) => x !== id);
      state.corp.hand.push(id);
      state.cards[id].zone = "corp:hq";
      state.cards[id].faceup = true;
      shuffleCorpRdAfterSearch(state);
      log(
        state,
        `Search R&D — reveal ${state.cards[id].title} and add to HQ.`,
      );
      return { ok: true };
    }

case "search_rd_install_rez_ice_on_source_server": {
      const host = serverHostingCard(state, sourceId);
      if (!host) {
        log(state, `${source.title} — not installed on a server.`);
        return { ok: true };
      }
      const iceIds = state.corp.deck.filter(
        (id) => state.cards[id].type === "ice",
      );
      if (iceIds.length === 0) {
        log(state, `Search R&D for ice — none found.`);
        return { ok: true };
      }
      const discount = Math.max(0, action.totalDiscount ?? 0);
      if (iceIds.length === 1) {
        return evalEffect(
          { state, sourceId },
          {
            op: "do",
            action: {
              kind: "install_rez_rd_ice_on_source_server",
              cardId: iceIds[0]!,
              totalDiscount: discount,
            },
          },
        );
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...iceIds.map((id) => ({
            id: `tucana-ice:${id}`,
            label: `Install and rez ${state.cards[id].title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_rez_rd_ice_on_source_server" as const,
                cardId: id,
                totalDiscount: discount,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ],
logLine: `Search R&D — choose ice to install on ${host.id}.`,
});
      return { ok: true };
    }

case "search_rd_install_rez_by_printed_rez_cost": {
      const base = state.turn.lastTrashedRezzedPrintedRezCost;
      if (base === null) {
        log(
          state,
          `${source.title} — no trashed rezzed printed rez cost recorded.`,
        );
        return { ok: true };
      }
      const targetCost = base + action.delta;
      const pick = state.corp.deck.find((id) => {
        const c = state.cards[id];
        if (c.rezCost === undefined) return false;
        return c.rezCost === targetCost;
      });
      if (!pick) {
        log(
          state,
          `${source.title} — no R&D card with printed rez ${targetCost}¢.`,
        );
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((id) => id !== pick);
      const card = state.cards[pick]!;
      state.corp.deck.reverse();
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
      log(
        state,
        `${source.title} — install ${card.title} from R&D on ${sid} (printed rez ${card.rezCost}¢; ignore install costs).`,
      );
      const rezCost = card.rezCost ?? 0;
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (state.corp.credits >= rezCost) {
        options.push({
          id: `ob-rez:${pick}`,
          label: `Pay ${rezCost}¢: rez ${card.title}`,
          effect: {
            op: "do",
            action: { kind: "rez_installed_paying", cardId: pick },
          },
        });
      }
      options.push({
        id: `ob-reveal:${pick}`,
        label: `Decline to rez ${card.title}`,
        effect: {
          op: "do",
          action: { kind: "reveal_installed_to_verify", cardId: pick },
        },
      });
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

case "search_stack_icebreaker": {
      const cardIds = [...state.runner.deck];
      state.turn.hiddenZoneSearch = {
        viewer: "runner",
        hiddenFrom: "corp",
        zone: "runner:stack",
        cardIds,
        open: true,
      };
      log(
        state,
        `Runner may look at the stack for this search; it stays hidden from the Corp (CR ${CR.searchHiddenSecretZone.number}).`,
      );
      log(
        state,
        `Runner looks at all ${cardIds.length} card(s) in the stack for an icebreaker (CR ${CR.search.number}).`,
      );
      const finishSearch = (): void => {
        if (state.turn.hiddenZoneSearch) state.turn.hiddenZoneSearch.open = false;
        log(
          state,
          `Search complete; Runner may no longer look at the stack (CR ${CR.searchHiddenSecretZone.number}).`,
        );
        state.runner.deck.reverse();
        log(
          state,
          `Stack shuffled (CR ${CR.shuffleDeckAfterSearch.number}).`,
        );
        noteSearchConditionalAbilities(state);
      };
      const matches = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        return (
          Boolean(c.breaker) || (c.subtypes ?? []).includes("icebreaker")
        );
      });
      if (matches.length === 0) {
        log(state, `Search stack for icebreaker — none found.`);
        finishSearch();
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...matches.map((id) => ({
            id: `search-find:${id}`,
            label: `Find ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "search_stack_icebreaker_resolve" as const,
                cardId: id,
                ...(action.mayInstallIfSuccessfulRunThisTurn
                  ? { mayInstallIfSuccessfulRunThisTurn: true }
                  : {}),
              },
            },
          })),
          {
            id: "search-fail-to-find",
            label: "Find nothing",
            effect: {
              op: "do" as const,
              action: {
                kind: "search_stack_icebreaker_resolve" as const,
                fail: true,
              },
            },
          },
        ],
logLine: `Runner may fail to find (CR ${CR.failToFind.number}).`,
});
      return { ok: true };
    }

case "search_stack_icebreaker_resolve": {
      const finishSearch = (): void => {
        if (state.turn.hiddenZoneSearch) state.turn.hiddenZoneSearch.open = false;
        log(
          state,
          `Search complete; Runner may no longer look at the stack (CR ${CR.searchHiddenSecretZone.number}).`,
        );
        state.runner.deck.reverse();
        log(
          state,
          `Stack shuffled (CR ${CR.shuffleDeckAfterSearch.number}).`,
        );
        noteSearchConditionalAbilities(state);
      };
      if (action.fail || !action.cardId) {
        log(state, `Runner fails to find (CR ${CR.failToFind.number}).`);
        finishSearch();
        return { ok: true };
      }
      const id = action.cardId;
      const card = state.cards[id];
      if (!card || !state.runner.deck.includes(id)) {
        log(state, `Search stack for icebreaker — none found.`);
        finishSearch();
        return { ok: true };
      }
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      enterSetAside(state, [id], { side: "runner", faceup: false });
      log(
        state,
        `A card found and set aside facedown (CR ${CR.find.number}).`,
      );
      finishSearch();
      state.runner.setAside = (state.runner.setAside ?? []).filter((x) => x !== id);
      card.setAsideGroupId = undefined;
      card.faceup = true;
      log(
        state,
        `${card.title} revealed (CR ${CR.revealForSearch.number}).`,
      );
      state.runner.hand.push(id);
      card.zone = "runner:grip";
      log(
        state,
        `Search stack — add ${card.title} to grip.`,
      );
      if (
        action.mayInstallIfSuccessfulRunThisTurn &&
        state.turn.successfulRunThisTurn
      ) {
        const cost = card.installCost;
        if (state.runner.credits >= cost) {
          subtractRunnerCreditPool(state, cost);
          state.runner.hand = state.runner.hand.filter((x) => x !== id);
          state.runner.installed.push(id);
          card.zone = "runner:installed";
          log(state, `Install ${card.title} from Mutual Favor (${cost}¢).`);
          fireOnInstall(state, id);
        }
      }
      return { ok: true };
    }

case "search_rd_non_agenda": {
      const matches = state.corp.deck.filter(
        (id) => state.cards[id].type !== "agenda",
      );
      if (matches.length === 0) {
        log(state, `Search R&D for non-agenda — none found.`);
        return { ok: true };
      }
      const id = matches[0]!;
      state.corp.deck = state.corp.deck.filter((x) => x !== id);
      state.corp.hand.push(id);
      state.cards[id].zone = "corp:hq";
      state.cards[id].faceup = false;
      state.corp.deck.reverse();
      log(
        state,
        `Search R&D — add ${state.cards[id].title} to HQ (non-agenda).`,
      );
      return { ok: true };
    }

case "search_rd_to_hq": {
      const n = Math.min(action.amount, state.corp.deck.length);
      for (let i = 0; i < n; i++) {
        const id = state.corp.deck[0]!;
        // Prefer first card; for multi-search take sequential tops after shuffle sense:
        // Deterministic: take first N distinct from current deck order.
        void id;
      }
      const taken: string[] = [];
      for (let i = 0; i < n; i++) {
        const id = state.corp.deck.shift();
        if (!id) break;
        taken.push(id);
        state.corp.hand.push(id);
        state.cards[id].zone = "corp:hq";
        state.cards[id].faceup = false;
      }
      state.corp.deck.reverse();
      log(
        state,
        `Search R&D — add ${taken.length} card(s) to HQ (${taken.map((id) => state.cards[id].title).join(", ") || "none"}).`,
      );
      return { ok: true };
    }

case "may_search_hq_rd_archives_agenda_to_hq_or_rd_bottom": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...(["hq", "rd", "archives"] as const).map((zone) => ({
            id: `search-${zone}`,
            label: `Search ${zone.toUpperCase()} for an agenda`,
            effect: {
              op: "do" as const,
              action: {
                kind: "search_zone_agenda_to_hq_or_rd_bottom" as const,
                zone,
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
logLine: `${source.title} — may search HQ, R&D, or Archives for an agenda.`,
});
      return { ok: true };
    }

case "search_zone_agenda_to_hq_or_rd_bottom": {
      const zone = action.zone;
      const pool: string[] =
        zone === "hq"
          ? [...state.corp.hand]
          : zone === "rd"
            ? [...state.corp.deck]
            : [...state.corp.discardPile];
      const agendas = pool.filter((id) => state.cards[id]?.type === "agenda");
      if (zone === "rd") {
        // shuffle after searching regardless
      }
      if (agendas.length === 0) {
        if (zone === "rd") {
          // shuffle noop
        }
        log(state, `${source.title} — no agenda in ${zone}.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: agendas.flatMap((id) => [
          {
            id: `agenda-hq:${id}`,
            label: `Reveal ${state.cards[id]!.title}; add to HQ`,
            effect: {
              op: "do" as const,
              action: {
                kind: "place_agenda_hq_or_rd_bottom" as const,
                cardId: id,
                destination: "hq" as const,
              },
            },
          },
          {
            id: `agenda-bottom:${id}`,
            label: `Reveal ${state.cards[id]!.title}; bottom of R&D`,
            effect: {
              op: "do" as const,
              action: {
                kind: "place_agenda_hq_or_rd_bottom" as const,
                cardId: id,
                destination: "rd_bottom" as const,
              },
            },
          },
        ]),
logLine: `${source.title} — choose agenda from ${zone}.`,
});
      return { ok: true };
    }

case "search_stack_non_virus_program_install_ignore_costs_track": {
      const matches = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "program" &&
          !(c.subtypes ?? []).includes("virus")
        );
      });
      if (matches.length === 0) {
        // shuffle
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = state.runner.deck[i]!;
          state.runner.deck[i] = state.runner.deck[j]!;
          state.runner.deck[j] = tmp;
        }
        log(state, `${source.title} — no non-virus program in stack.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: matches.map((id) => ({
          id: `install:${id}`,
          label: `Install ${state.cards[id]!.title} ignoring costs`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_stack_program_ignore_costs_track" as const,
              cardId: id,
            },
          },
        })),
logLine: `${source.title} — search stack for a non-virus program.`,
});
      return { ok: true };
    }

case "search_rd_take_card_to_hq": {
      const id = action.cardId;
      if (!state.corp.deck.includes(id)) {
        log(state, `Search R&D take — card not in R&D.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((x) => x !== id);
      state.corp.hand.push(id);
      state.cards[id]!.zone = "corp:hq";
      state.cards[id]!.faceup = false;
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      log(state, `Search R&D — reveal ${state.cards[id]!.title} and add to HQ.`);
      return { ok: true };
    }

case "may_search_rd_non_agenda_any_subtype_to_hq": {
      const subtypes = new Set(
        action.subtypes.map((s: string) => s.toLowerCase()),
      );
      const matches = state.corp.deck.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type === "agenda") return false;
        return (c.subtypes ?? []).some((s) => subtypes.has(s.toLowerCase()));
      });
      if (matches.length === 0) {
        for (let i = state.corp.deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = state.corp.deck[i]!;
          state.corp.deck[i] = state.corp.deck[j]!;
          state.corp.deck[j] = tmp;
        }
        log(state, `${source.title} — no matching non-agenda in R&D.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...matches.map((id) => ({
            id: `take:${id}`,
            label: `Reveal ${state.cards[id]!.title}; add to HQ`,
            effect: {
              op: "do" as const,
              action: {
                kind: "search_rd_take_card_to_hq" as const,
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
logLine: `${source.title} — may search R&D for black ops / gray ops / liability.`,
});
      return { ok: true };
    }

case "search_stack_same_title_may_install_paying": {
      const title = source.title;
      const matches = state.runner.deck.filter(
        (id) => state.cards[id]?.title === title,
      );
      if (matches.length === 0) {
        shuffleRunnerStack(state);
        log(state, `Search stack for ${title} — none found.`);
        return { ok: true };
      }
      const id = matches[0]!;
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      state.runner.hand.push(id);
      state.cards[id]!.zone = "runner:grip";
      state.cards[id]!.faceup = true;
      shuffleRunnerStack(state);
      log(state, `Search stack — reveal ${state.cards[id]!.title} and add to grip.`);
      const card = state.cards[id]!;
      const cost = gripInstallCostAfterDiscount(state, card, 0);
      const canInstall =
        ["program", "hardware", "resource"].includes(card.type) &&
        creditsAvailableForInstall(state, "runner", card) >= cost;
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-install",
          label: "Decline install",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      if (canInstall) {
        options.unshift({
          id: `install:${id}`,
          label: `Install ${card.title} for ${cost}¢`,
          effect: {
            op: "do",
            action: {
              kind: "install_grip_card",
              cardId: id,
              discount: 0,
            },
          },
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options,
logLine: `${source.title} — may install ${card.title} from grip.`,
});
      return { ok: true };
    }

case "search_stack_subtype_add_to_grip": {
      const want = action.subtype.toLowerCase();
      const wantType = action.type;
      const matches = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        if (!c) return false;
        if (wantType && c.type !== wantType) return false;
        return (c.subtypes ?? []).some((s) => s.toLowerCase() === want);
      });
      if (matches.length === 0) {
        shuffleRunnerStack(state);
        log(
          state,
          `Search stack for ${wantType ?? "card"} (${action.subtype}) — none found.`,
        );
        return { ok: true };
      }
      const id =
        matches.length === 1
          ? matches[0]!
          : matches[0]!; // first match; choice UX optional
      if (matches.length > 1) {
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: matches.map((mid) => ({
            id: `stack-grip:${mid}`,
            label: `Reveal ${state.cards[mid]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "search_stack_subtype_add_to_grip_pick" as const,
                cardId: mid,
              },
            },
          })),
logLine: `Search stack — choose ${action.subtype} ${wantType ?? "card"} to reveal.`,
});
        return { ok: true };
      }
      addFoundStackCardAfterSearch(state, id);
      return { ok: true };
    }

case "search_stack_subtype_add_to_grip_pick": {
      addFoundStackCardAfterSearch(state, action.cardId);
      return { ok: true };
    }

case "search_stack_host_virus_or_weapon": {
      const max = Math.max(1, action.max);
      const eligible = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        const subs = c.subtypes ?? [];
        return subs.includes("virus") || subs.includes("weapon");
      });
      const picks: string[] = [];
      const seenTitles = new Set<string>();
      for (const id of eligible) {
        if (picks.length >= max) break;
        const title = state.cards[id]!.title;
        if (seenTitles.has(title)) continue;
        seenTitles.add(title);
        picks.push(id);
      }
      if (picks.length === 0) {
        shuffleRunnerStack(state);
        log(
          state,
          `${source.title} — search stack for virus/weapon; none found.`,
        );
        return { ok: true };
      }
      if (!source.hostedCardIds) source.hostedCardIds = [];
      for (const id of picks) {
        state.runner.deck = state.runner.deck.filter((x) => x !== id);
        const card = state.cards[id]!;
        card.hostId = sourceId;
        card.faceup = true;
        card.zone = `hosted:${sourceId}`;
        source.hostedCardIds.push(id);
        log(
          state,
          `${source.title} hosts ${card.title} faceup (not installed).`,
        );
      }
      shuffleRunnerStack(state);
      return { ok: true };
    }

case "search_stack_program_install": {
      return searchStackProgramInstall(state, sourceId);
    }

case "search_rd_ice_install_central_discount": {
      const iceIds = state.corp.deck.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (iceIds.length === 0) {
        log(state, `Search R&D for ice — none found.`);
        return { ok: true };
      }
      const discount = Math.max(0, action.discount ?? 0);
      const offerInstall = (cardId: string): EvalResult => {
        const card = state.cards[cardId]!;
        card.faceup = true;
        log(state, `Search R&D — reveal ${card.title}.`);
        const deckIdx = state.corp.deck.indexOf(cardId);
        if (deckIdx >= 0) state.corp.deck.splice(deckIdx, 1);
        shuffleCorpRdAfterSearch(state);
        const centrals = Object.values(state.servers).filter(
          (s) => s.kind === "central",
        );
        openPendingChoose(state, {
          sourceId,
          chooser: "corp",
          options: centrals.map((server) => ({
            id: `sap:${cardId}:${server.id}`,
            label: `Install ${card.title} protecting ${server.id}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_rd_ice_protecting_central_discount" as const,
                cardId,
                serverId: server.id,
                discount,
              },
            },
          })),
logLine: `${source.title} — install revealed ice protecting a central (−${discount}¢).`,
});
        return { ok: true };
      };
      if (iceIds.length === 1) return offerInstall(iceIds[0]!);
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: iceIds.map((id) => ({
          id: `sap-search:${id}`,
          label: `Reveal ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "search_rd_ice_install_central_discount_pick" as const,
              cardId: id,
              discount,
            },
          },
        })),
logLine: `Search R&D — choose ice to reveal and install.`,
});
      return { ok: true };
    }

case "search_rd_ice_install_central_discount_pick": {
      const cardId = action.cardId;
      const discount = Math.max(0, action.discount ?? 0);
      const card = state.cards[cardId];
      if (!card || card.type !== "ice" || !state.corp.deck.includes(cardId)) {
        log(state, `Secure and Protect pick — invalid ice.`);
        return { ok: true };
      }
      card.faceup = true;
      log(state, `Search R&D — reveal ${card.title}.`);
      state.corp.deck = state.corp.deck.filter((x) => x !== cardId);
      shuffleCorpRdAfterSearch(state);
      const centrals = Object.values(state.servers).filter(
        (s) => s.kind === "central",
      );
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: centrals.map((server) => ({
          id: `sap:${cardId}:${server.id}`,
          label: `Install ${card.title} protecting ${server.id}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_rd_ice_protecting_central_discount" as const,
              cardId,
              serverId: server.id,
              discount,
            },
          },
        })),
logLine: `${source.title} — install revealed ice protecting a central (−${discount}¢).`,
});
      return { ok: true };
    }

case "search_stack_type_install": {
      return searchStackTypeInstall(
        state,
        sourceId,
        action.cardType,
        action.discount,
      );
    }

case "may_search_rd_install_rez_ignore_costs": {
      const eligible = state.corp.deck.filter((id) => {
        const t = state.cards[id]?.type;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      });
      if (eligible.length === 0) {
        log(state, `Search R&D install+rez — none found.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline-search-rd",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...eligible.map((id) => ({
            id: `search-rd-install:${id}`,
            label: `Install${state.cards[id]!.type === "agenda" ? "" : " and rez"} ${state.cards[id]!.title} ignoring costs`,
            effect: {
              op: "do" as const,
              action: {
                kind: "search_rd_pick_install_rez_ignore_costs" as const,
                cardId: id,
              },
            },
          })),
        ],
logLine: `May search R&D for 1 card to install and rez ignoring costs.`,
});
      return { ok: true };
    }

case "search_rd_pick_install_rez_ignore_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card) {
        log(state, `Search R&D install — invalid card.`);
        return { ok: true };
      }
      const deckIdx = state.corp.deck.indexOf(cardId);
      if (deckIdx < 0) {
        log(state, `Search R&D install — not in R&D.`);
        return { ok: true };
      }
      state.corp.deck.splice(deckIdx, 1);
      shuffleCorpRdAfterSearch(state);
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
      card.rezzed = doRez;
      card.faceup = true;
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementCounters = card.advancementCounters ?? 0;
      }
      if (doRez && (card.hostedCreditsOnInstall ?? 0) > 0) {
        card.hostedCredits = card.hostedCreditsOnInstall;
      }
      if (doRez && (card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      noteInstalledThisTurn(state, cardId);
      log(
        state,
        `Install${doRez ? " and rez" : ""} ${card.title} from R&D on ${sid} ignoring costs.`,
      );
      fireOnInstall(state, cardId);
      if (doRez) fireOnRez(state, cardId);
      if (doRez && card.type === "ice") {
        fireHostRezStateTriggers(state, cardId, "rez");
      }
      return { ok: true };
    }

case "search_install_non_daemon": {
      const zones: Array<"stack" | "heap" | "grip"> = [
        "stack",
        "heap",
        "grip",
      ];
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const zone of zones) {
        if (museEligiblePrograms(state, zone).length === 0) continue;
        options.push({
          id: `zone:${zone}`,
          label: `Search ${zone}`,
          effect: {
            op: "do",
            action: { kind: "search_zone", zone },
          },
        });
      }
      if (options.length === 0) {
        log(state, `${source.title} — no non-daemon programs to search.`);
        return { ok: true };
      }
      if (options.length === 1) {
        return applyPrimitive(ctx, {
          kind: "search_zone",
          zone: options[0]!.id.slice("zone:".length) as
            | "stack"
            | "heap"
            | "grip",
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options,
logLine: `${source.title} — choose zone to search.`,
});
      return { ok: true };
    }

case "search_zone": {
      const cands = museEligiblePrograms(state, action.zone);
      if (cands.length === 0) {
        log(state, `Muse — no non-daemon programs in ${action.zone}.`);
        if (action.zone === "stack") shuffleRunnerStack(state);
        return { ok: true };
      }
      if (cands.length === 1) {
        return applyPrimitive(ctx, {
          kind: "install_picked",
          cardId: cands[0]!,
          from: action.zone,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `muse-pick:${id}`,
          label: `Install ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_picked" as const,
              cardId: id,
              from: action.zone,
            },
          },
        })),
logLine: `Muse — choose non-daemon program from ${action.zone} (${cands.length}).`,
});
      return { ok: true };
    }
    default:
      return null;
  }
}
