/**
 * Primitive kinds for trashing installed Corp cards. The kind registry
 * (`applyCoreKinds`) dispatches here.
 */
import { removeCardFromGame } from "../../state/uninstallAndPosition/uninstall.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../../timing/labels.js";
import {
  applyPrimitive,
  type EvalResult,
  evalEffect,
  serverHostingCard,
  type EffectCtx,
} from "../eval.js";
import { trashInstalledLegalTargets } from "./trashTargetsAndHooks.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { type Effect, fx, type Primitive } from "../ir.js";
import { trashCard, controllerOf } from "../../state/hostingAndTrash/trash.js";
import { catalogCardNames } from "../visibility/cardNames.js";
import { unhostAllFrom, unhostCard } from "../../state/hostingAndTrash/host.js";
import { openCardName } from "../../state/visibility/seatVisibility.js";
import { markRemainingSubroutinesNotBrokenByRunner } from "../../state/turnAndActions/break.js";
import { iceStrength } from "../continuous/iceStrength.js";
import {
  canInstallHeapCard,
  gripInstallCostAfterDiscount,
} from "../install/runnerInstall.js";
import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/runnerCredits.js";
import { revealCards, lookAtCards } from "../../state/visibility/reveal.js";
import { installedRunnerIds } from "../visibility/visibilityKinds.js";
import { random } from "../../state/rng.js";
import { iceAtRunnerPosition } from "../../state/uninstallAndPosition/runPosition.js";
import type { ServerId, GameState } from "../../state/types.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { noteInlineConditional } from "../../state/triggers/inlineConditionalHooks.js";
import { noteStoredConditional } from "../../state/triggers/storedConditionalHooks.js";
import { checkpointAfterInstruction } from "../../legality/checkpoints.js";
import {
  bmCounter,
  setBmCounter,
  applyDeckOrderKinds,
} from "../searchAndDeck/deckOrderKinds.js";

/**
 * Trash a set of Corp cards together, as one instruction (CR 9.12.2a). Each
 * card goes through the trash procedure; its own trash triggers (Calvin
 * B4L3Y) are noted there. "Whenever the Runner trashes a Corp card"
 * (Hostile Infrastructure) meets its condition once for each card of the
 * set, its own copy included, and stays active for those instances
 * (CR 9.6.4b, 9.1.8g). All of them become pending at the one checkpoint
 * after the set and resolve in its reaction window, where the Corp orders
 * its abilities (CR 10.3.1a, 10.3.2, 9.2.8d). Singularity and Apocalypse
 * call this.
 */
export function trashCorpCardSet(
  state: GameState,
  ids: readonly string[],
  opts: {
    by: "corp" | "runner" | null;
    /** The instruction, for the checkpoint's log. */
    instruction: string;
    logEach?: (title: string) => string;
  },
): void {
  // Every active Hostile Infrastructure sees each card of the set, the
  // trashed ones and those elsewhere alike (CR 9.12.2a, 9.1.8g).
  const infrastructure = Object.values(state.servers)
    .flatMap((server) => [...server.root, ...server.ice])
    .filter((id) => {
      const card = state.cards[id];
      return (
        Boolean(card?.rezzed) &&
        (card?.netDamageWheneverRunnerTrashesCorpCard ?? 0) > 0 &&
        !abilitiesSuppressed(state, id)
      );
    });
  // "Whenever the Runner trashes at least 1 card from the root of or
  // protecting this server" (Warroid Tracker): one instance for the set per
  // source whose server lost a card, itself included (CR 9.12.2a, 9.1.8g).
  const atLeastOne = Object.entries(state.servers).flatMap(([sid, server]) =>
    server.root
      .filter((id) => {
        const card = state.cards[id];
        return (
          Boolean(card?.rezzed) &&
          Boolean(card?.onRunnerTrashFromThisServerRootOrProtecting) &&
          !abilitiesSuppressed(state, id)
        );
      })
      .map((id) => ({ id, sid })),
  );
  // Ronald Five meets its trigger once per card of the set, itself
  // included, so its sources are gathered before any card moves to
  // Archives (CR 9.12.2a, 9.1.8g).
  const ronaldFive = Object.values(state.servers)
    .flatMap((server) => server.root)
    .filter((id) => {
      const card = state.cards[id];
      return (
        Boolean(card?.rezzed) &&
        Boolean(card?.runnerLosesClickWhenTrashesCorpCard) &&
        !abilitiesSuppressed(state, id)
      );
    });
  const trashed: string[] = [];
  const trashedFrom = new Set<string>();
  for (const id of ids) {
    const card = state.cards[id];
    if (!card) continue;
    const zoneBefore = card.zone;
    trashCard(state, id, { by: opts.by, simultaneousSet: true });
    // A card the trash procedure refused is still where it was; one that a
    // replacement sent elsewhere (Marilyn Campaign) is still trashed.
    if (card.zone !== zoneBefore) {
      trashed.push(id);
      const m = /^server:([^:]+):(root|ice)$/.exec(zoneBefore);
      if (m) trashedFrom.add(m[1]!);
    }
    if (opts.logEach) log(state, opts.logEach(card.title));
  }
  if (opts.by === "runner") {
    for (const id of ronaldFive) {
      for (let n = 0; n < trashed.length; n++) {
        const r = evalEffect(
          { state, sourceId: id },
          {
            op: "do",
            action: { kind: "lose_clicks", side: "runner", amount: 1 },
          },
        );
        if (!r.ok) log(state, `${state.cards[id]?.title ?? id} — ${r.error}`);
      }
    }
  }
  let noted = 0;
  if (opts.by === "runner") {
    for (const id of infrastructure) {
      const card = state.cards[id];
      const per = card?.netDamageWheneverRunnerTrashesCorpCard ?? 0;
      if (trashed.length === 0) break;
      log(
        state,
        `${card?.title ?? id} remains active — ${trashed.length} instances become pending (CR ${CR.abilityRemainsActive.number}).`,
      );
      trashed.forEach((trashedId, n) => {
        noteInlineConditional(state, {
          cardId: id,
          abilityKey: "hostile-infrastructure:net-on-trash",
          controller: "corp",
          mandatory: true,
          // CR 9.1.8g: the trigger met by the move into Archives stays
          // active until these instances resolve.
          independentOfSource: true,
          effect: { op: "do", action: { kind: "net_damage", amount: per } },
          logLine: `${card?.title ?? id} becomes pending — the Runner trashed ${state.cards[trashedId]?.title ?? trashedId} (${n + 1} of ${trashed.length}).`,
        });
        noted += 1;
      });
    }
  }
  if (opts.by === "runner") {
    for (const { id, sid } of atLeastOne) {
      if (!trashedFrom.has(sid)) continue;
      const card = state.cards[id];
      noteStoredConditional(state, {
        cardId: id,
        abilityKey: "warroid-tracker:on-trash-set",
        effectKey: "onRunnerTrashFromThisServerRootOrProtecting",
        controller: "corp",
        mandatory: true,
        independentOfSource: true,
        logLine: `${card?.title ?? id} — one instance becomes pending for this trash (CR ${CR.actOnSet.number}).`,
      });
      noted += 1;
    }
  }
  // Calvin B4L3Y-class trash triggers of the set were noted by the trash
  // procedure for this same checkpoint.
  if (noted > 0 || (state.turn.storedConditionalPending ?? []).length > 0) {
    checkpointAfterInstruction(state, opts.instruction);
  }
}

function rfgCard(state: EffectCtx["state"], cardId: string): void {
  removeCardFromGame(state, cardId);
}

function installedCorpIds(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) out.push(id);
  }
  return out;
}

function rfgFromHeap(state: EffectCtx["state"], cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  state.runner.discardPile = state.runner.discardPile.filter(
    (id) => id !== cardId,
  );
  card.zone = "removed-from-game";
  card.faceup = true;
  state.removedFromGame = state.removedFromGame ?? [];
  if (!state.removedFromGame.includes(cardId)) {
    state.removedFromGame.push(cardId);
  }
}

export function applyCorpInstalledTrashKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "rfg_self": {
      removeCardFromGame(state, sourceId);
      log(
        state,
        `${source.title} is removed from the game (CR ${CR.playOperation.number}).`,
      );
      return { ok: true };
    }

    case "rfg_installed_card": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.installed.includes(cardId)) {
        log(state, `RFG installed — ${cardId} not in Runner installed.`);
        return { ok: true };
      }
      removeCardFromGame(state, cardId);
      log(
        state,
        `Remove ${card.title} from the game (CR ${CR.playOperation.number}).`,
      );
      return { ok: true };
    }

    case "rfg_installed_with_any_subtype": {
      const wanted = new Set(action.subtypes);
      const candidates = state.runner.installed.filter((id) => {
        const subs = state.cards[id]?.subtypes ?? [];
        return subs.some((s) => wanted.has(s));
      });
      if (candidates.length === 0) {
        log(
          state,
          `${source.title} — RFG installed (${action.subtypes.join("/")}): none.`,
        );
        return { ok: true };
      }
      if (action.pick === "first" || candidates.length === 1) {
        return applyPrimitive(ctx, {
          kind: "rfg_installed_card",
          cardId: candidates[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: candidates.map((id) => ({
          id: `rfg-installed:${id}`,
          label: `Remove ${state.cards[id]!.title} from the game`,
          effect: {
            op: "do" as const,
            action: {
              kind: "rfg_installed_card" as const,
              cardId: id,
            },
          },
        })),
        logLine: `${source.title} — choose an installed ${action.subtypes.join("/")} to remove from the game.`,
      });
      return { ok: true };
    }

    case "rfg_self_then_derez_bypassed_ice": {
      const bypassed = state.run?.bypassedIceIds ?? [];
      const targetId = bypassed[bypassed.length - 1];
      const rfg = applyPrimitive(ctx, { kind: "rfg_self" });
      if (!rfg.ok) return rfg;
      if (!targetId) {
        log(state, `${source.title} — RFG; no bypassed ice to derez.`);
        return { ok: true };
      }
      const ice = state.cards[targetId];
      if (!ice?.rezzed) {
        log(
          state,
          `${source.title} — RFG; ${ice?.title ?? targetId} already unrezzed.`,
        );
        return { ok: true };
      }
      ice.rezzed = false;
      ice.faceup = false;
      log(
        state,
        `${source.title} — RFG and derez ${ice.title} (CR ${CR.derez.number}).`,
      );
      return { ok: true };
    }

    case "game_over_after_type": {
      const targets = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== action.cardType) return false;
        if (c.breaker) return false;
        if ((c.subtypes ?? []).includes("icebreaker")) return false;
        return true;
      });
      if (targets.length === 0) {
        log(
          state,
          `${source.title} — no installed non-icebreaker ${action.cardType} cards.`,
        );
        return { ok: true };
      }
      return applyPrimitive(ctx, {
        kind: "game_over_continue",
        remaining: targets,
      });
    }

    case "game_over_continue": {
      const remaining = [...action.remaining];
      const next = remaining.shift();
      if (!next) {
        log(state, `${source.title} — Game Over trash queue complete.`);
        return { ok: true };
      }
      return applyPrimitive(ctx, {
        kind: "game_over_process_card",
        cardId: next,
        remaining,
      });
    }

    case "game_over_process_card": {
      const card = state.cards[action.cardId];
      if (!card || !state.runner.installed.includes(action.cardId)) {
        return applyPrimitive(ctx, {
          kind: "game_over_continue",
          remaining: action.remaining,
        });
      }
      const canPay = state.runner.credits >= 3;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...(canPay
            ? [
                {
                  id: `go-prevent:${action.cardId}`,
                  label: `Pay 3¢ to prevent trashing ${card.title}`,
                  effect: {
                    op: "seq" as const,
                    effects: [
                      {
                        op: "do" as const,
                        action: {
                          kind: "lose_credits" as const,
                          side: "runner" as const,
                          amount: 3,
                        },
                      },
                      {
                        op: "do" as const,
                        action: {
                          kind: "game_over_continue" as const,
                          remaining: action.remaining,
                        },
                      },
                    ],
                  },
                },
              ]
            : []),
          {
            id: `go-trash:${action.cardId}`,
            label: `Trash ${card.title}`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "trash_runner_rig_card" as const,
                    cardId: action.cardId,
                  },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "game_over_continue" as const,
                    remaining: action.remaining,
                  },
                },
              ],
            },
          },
        ],
        logLine: `${source.title} — Runner may pay 3¢ to prevent trashing ${card.title}.`,
      });
      return { ok: true };
    }

    case "trash_ice_rezzed_this_run": {
      const ids = state.run?.iceRezzedThisRunIds ?? [];
      const targets = ids.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "ice") return false;
        // Still installed protecting a server.
        for (const server of Object.values(state.servers)) {
          if (server.ice.includes(id)) return true;
        }
        return false;
      });
      if (targets.length === 0) {
        log(
          state,
          `Trash ice rezzed this run — none available (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && targets.length > 1) {
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: targets.map((id) => ({
            id: `trash-ice-rezzed:${id}`,
            label: `Trash ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: { kind: "trash_corp_card" as const, cardId: id },
            },
          })),
          logLine: `Trash ice rezzed this run — Runner chooses among ${targets.length}.`,
        });
        return { ok: true };
      }
      const iceId = targets[0]!;
      const title = state.cards[iceId]!.title;
      const r = applyPrimitive(ctx, {
        kind: "trash_corp_card",
        cardId: iceId,
      });
      if (!r.ok) return r;
      log(
        state,
        `Trash ice ${title} rezzed this run (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

    case "corp_trash_ice_protecting_server": {
      const sid = action.serverId as import("../../state/types.js").ServerId;
      const ice = [...(state.servers[sid]?.ice ?? [])];
      if (ice.length === 0) {
        log(state, `${source.title} — no ice protecting ${action.serverId}.`);
        return { ok: true };
      }
      if (ice.length === 1) {
        return applyPrimitive(ctx, {
          kind: "corp_trash_ice_card",
          cardId: ice[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: ice.map((id) => ({
          id: `kraken-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "corp_trash_ice_card" as const, cardId: id },
          },
        })),
        logLine: `${source.title} — Corp trashes 1 ice protecting ${action.serverId}.`,
      });
      return { ok: true };
    }

    case "corp_trash_ice_card": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "ice") {
        log(state, `Corp trash ice — invalid target.`);
        return { ok: true };
      }
      const r = applyPrimitive(ctx, {
        kind: "trash_corp_card",
        cardId: action.cardId,
      });
      if (!r.ok) return r;
      log(state, `Corp trashes ice ${card.title}.`);
      return { ok: true };
    }

    case "trash_any_rezzed_give_tags": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (!c || c.side !== "corp" || !c.rezzed) continue;
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(
          state,
          `Trash any rezzed — no rezzed Corp cards (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => {
          const title = state.cards[id]!.title;
          return {
            id: `trash-tag:${id}`,
            label: `Trash ${title} (give 1 tag)`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: { kind: "trash_corp_card" as const, cardId: id },
                },
                {
                  op: "do" as const,
                  action: { kind: "give_tags" as const, amount: 1 },
                },
                {
                  op: "do" as const,
                  action: { kind: "trash_any_rezzed_give_tags" as const },
                },
              ],
            },
          };
        });
      options.push({
        id: "done",
        label: "Done",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `${source.title} — trash any number of rezzed cards, 1 tag each (CR ${CR.trashing.number}, ${CR.tags.number}).`,
      });
      return { ok: true };
    }

    case "trash_project_ares_next": {
      const remaining = state.turn.projectAresTrashRemaining ?? 0;
      if (remaining <= 0) {
        if ((state.turn.projectAresTrashedCount ?? 0) > 0) {
          return applyPrimitive(ctx, { kind: "give_bad_publicity", amount: 1 });
        }
        return { ok: true };
      }
      const cands = [...state.runner.installed];
      if (cands.length === 0) {
        state.turn.projectAresTrashRemaining = 0;
        if ((state.turn.projectAresTrashedCount ?? 0) > 0) {
          return applyPrimitive(ctx, { kind: "give_bad_publicity", amount: 1 });
        }
        return { ok: true };
      }
      if (cands.length === 1) {
        const r1 = applyPrimitive(ctx, {
          kind: "trash_installed_runner_card",
          cardId: cands[0]!,
        });
        if (!r1.ok) return r1;
        return applyPrimitive(ctx, { kind: "trash_project_ares_next" });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((cardId) => ({
          id: `trash:${cardId}`,
          label: `Trash ${state.cards[cardId]!.title}`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "trash_installed_runner_card",
                  cardId,
                },
              },
              {
                op: "do" as const,
                action: { kind: "trash_project_ares_next" },
              },
            ],
          },
        })),
      });
      return { ok: true };
    }

    case "trash_next": {
      const remaining = state.turn.invasionPrivacyTrashRemaining ?? 0;
      if (remaining <= 0) return { ok: true };
      const targets = state.runner.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "resource" || t === "event";
      });
      if (targets.length === 0) {
        state.turn.invasionPrivacyTrashRemaining = 0;
        return { ok: true };
      }
      const invasionOpts: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((cardId) => ({
          id: `trash:${cardId}`,
          label: `Trash ${state.cards[cardId]!.title}`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "trash_from_grip" as const,
                  cardId,
                },
              },
              {
                op: "do",
                action: { kind: "trash_next" as const },
              },
            ],
          },
        }));
      invasionOpts.push({
        id: "done",
        label: "Done",
        effect: {
          op: "do",
          action: { kind: "invasion_of_privacy_finish" as const },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: invasionOpts,
      });
      return { ok: true };
    }

    case "trash_self": {
      // Its own ability trashes it, so its controller does (CR 1.14.5).
      trashCard(state, sourceId, { by: source.side });
      log(state, `${source.title} trashed (CR ${CR.trashing.number}).`);
      return { ok: true };
    }

    case "trash_attacked_server_root": {
      const sid = state.run?.attackedServerId;
      if (!sid) {
        log(state, `Trash attacked-server root — no run.`);
        return { ok: true };
      }
      const server = state.servers[sid];
      const rootIds = [...server.root];
      if (rootIds.length === 0) {
        log(state, `Trash ${sid} root — empty.`);
      }
      trashCorpCardSet(state, rootIds, {
        by: controllerOf(state, sourceId),
        instruction: "trash_attacked_server_root",
        logEach: (title) =>
          `Trash ${title} from ${sid} root (CR ${CR.trashing.number}).`,
      });
      return { ok: true };
    }

    case "may_corp_trash_climactic_ice": {
      const sid = action.serverId as import("../../state/types.js").ServerId;
      const server = state.servers[sid];
      const iceIds = server?.ice ?? [];
      if (iceIds.length === 0) {
        return applyPrimitive(ctx, {
          kind: "climactic_register_bonus_access",
          amount: 2,
        });
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        iceIds.map((id) => ({
          id: `climactic-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "trash_climactic_ice" as const,
              cardId: id,
            },
          },
        }));
      options.push({
        id: "climactic-decline",
        label: "Decline — Runner gets +2 access on first HQ/R&D breach",
        effect: {
          op: "do" as const,
          action: {
            kind: "climactic_register_bonus_access" as const,
            amount: 2,
          },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `${source.title} — Corp may trash 1 ice protecting ${sid}.`,
      });
      return { ok: true };
    }

    case "trash_climactic_ice": {
      const ice = state.cards[action.cardId];
      if (!ice || ice.type !== "ice") {
        log(state, `Climactic trash ice — not ice.`);
        return { ok: true };
      }
      trashCard(state, action.cardId, { by: source.side });
      log(state, `Climactic Showdown — trash ${ice.title}.`);
      return { ok: true };
    }

    case "may_trash_name_agenda_steal_ignore_costs": {
      if (!state.run) {
        log(state, `${source.title} — no run for Whistleblower.`);
        return { ok: true };
      }
      // "Choose a card name" (CR 1.2.1): any name may be chosen, so the
      // list comes from the catalog's agendas, the only cards the steal can
      // apply to. Built from the game's cards, it would show the Runner what
      // is in HQ and R&D (CR 10.2.2a, 10.2.2b).
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline-wb",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          ...catalogCardNames((def) => def.type === "agenda").map((title) => ({
            id: `wb-name:${title}`,
            label: `Trash Whistleblower — name ${title}`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: { kind: "trash_self" as const },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "name_agenda" as const,
                    title,
                  },
                },
              ],
            },
          })),
        ],
        logLine: `${source.title} — may trash to name an agenda for steal-ignore-costs.`,
      });
      return { ok: true };
    }

    case "trash_corp_card": {
      const card = state.cards[action.cardId];
      if (!card || card.side !== "corp") {
        log(
          state,
          `Trash corp card — ${card?.title ?? action.cardId} not a Corp card (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const installed =
        card.zone.endsWith(":ice") || card.zone.endsWith(":root");
      if (!installed) {
        log(
          state,
          `Trash corp card — ${card.title} not installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      trashCard(state, action.cardId, { by: source.side });
      log(state, `Trash ${card.title} (CR ${CR.trashing.number}).`);
      return { ok: true };
    }

    case "trash_n_installed_corp": {
      const count = Math.max(1, action.count);
      const targets = trashInstalledLegalTargets(state, sourceId, {});
      if (targets.length < count) {
        return {
          ok: false,
          error: `Must trash ${count} installed Corp cards — only ${targets.length} available.`,
          cites: [CR.trashing],
        };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: action.chooser,
        options: targets.map((id) => ({
          id: `trash-n:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "trash_corp_card_then_trash_n" as const,
              cardId: id,
              remaining: count - 1,
              chooser: action.chooser,
            },
          },
        })),
        logLine: `${source.title} — trash ${count} installed Corp card(s) (${action.chooser} chooses).`,
      });
      return { ok: true };
    }

    case "trash_corp_card_then_trash_n": {
      const trash = applyPrimitive(ctx, {
        kind: "trash_corp_card",
        cardId: action.cardId,
      });
      if (!trash.ok) return trash;
      if (action.remaining <= 0) return { ok: true };
      return applyPrimitive(ctx, {
        kind: "trash_n_installed_corp",
        count: action.remaining,
        chooser: action.chooser,
      });
    }

    case "may_trash_installed": {
      const excludeSelf = action.excludeSelf !== false;
      const rezzedOnly = Boolean(action.rezzedOnly);
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          if (excludeSelf && id === sourceId) continue;
          const c = state.cards[id];
          if (!c || c.side !== "corp") continue;
          if (rezzedOnly && !c.rezzed) continue;
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(
          state,
          `May trash installed — no other installed Corp cards (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => {
          const title = state.cards[id]!.title;
          const effects: Effect[] = [
            { op: "do", action: { kind: "trash_corp_card", cardId: id } },
          ];
          if (action.then) {
            effects.push(structuredClone(action.then));
          }
          return {
            id: `trash:${id}`,
            label: `Trash ${title}`,
            effect:
              effects.length === 1
                ? effects[0]!
                : { op: "seq" as const, effects },
          };
        });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `${source.title} — may trash another installed card (CR ${CR.trashing.number}).`,
      });
      return { ok: true };
    }

    case "trash_rezzed_accessed": {
      const run = state.run;
      if (!run) {
        log(state, `Charm Offensive — no run at run end.`);
        return { ok: true };
      }
      const titles = new Set<string>();
      for (const id of run.accessedCardIds ?? []) {
        const c = state.cards[id];
        if (c?.title) titles.add(c.title);
      }
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (!c?.rezzed || !titles.has(c.title)) continue;
          candidates.push(id);
        }
      }
      if (candidates.length === 0) {
        log(state, `Charm Offensive — no rezzed copy of an accessed card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...candidates.map((cardId) => ({
            id: cardId,
            label: `Trash ${state.cards[cardId]!.title}`,
            effect: {
              op: "do" as const,
              action: { kind: "trash_corp_card" as const, cardId },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
        logLine: `Charm Offensive — may trash 1 rezzed copy of an accessed card.`,
      });
      return { ok: true };
    }

    case "trash_rezzed_ice_gain_credits": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id]?.rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `${source.title} — no rezzed ice to trash.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        return applyPrimitive(ctx, {
          kind: "trash_rezzed_ice_gain_credits_resolve",
          cardId: targets[0]!,
          amount: action.amount,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `trash-rezzed-ice:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "trash_rezzed_ice_gain_credits_resolve" as const,
              cardId: id,
              amount: action.amount,
            },
          },
        })),
        logLine: `${source.title} — choose a rezzed ice to trash.`,
      });
      return { ok: true };
    }

    case "trash_rezzed_ice_gain_credits_resolve": {
      const card = state.cards[action.cardId];
      if (!card?.rezzed || card.type !== "ice") {
        log(state, `Trash rezzed ice — invalid target.`);
        return { ok: true };
      }
      trashCard(state, action.cardId, { by: source.side });
      state.corp.credits += action.amount;
      log(
        state,
        `${source.title} — trash ${card.title}, gain ${action.amount}¢.`,
      );
      return { ok: true };
    }

    case "trash_all_hosted_cards": {
      const hosted = [...(source.hostedCardIds ?? [])];
      unhostAllFrom(state, source.id);
      for (const id of hosted) {
        const card = state.cards[id];
        if (!card) continue;
        unhostCard(state, card.id);
        if (card.side === "runner") {
          trashCard(state, id);
        } else {
          trashCard(state, id, { by: source.side });
        }
        log(state, `${source.title} — trash hosted ${card.title}.`);
      }
      return { ok: true };
    }

    case "trash_passed_unrezzed_ice": {
      // En Passant: trash 1 unrezzed ice passed during the last run (CR 1.2.1).
      const ids = (state.turn.lastRunPassedUnrezzedIceIds ?? []).filter(
        (id) => {
          const c = state.cards[id];
          return c && c.type === "ice" && !c.rezzed && c.zone.endsWith(":ice");
        },
      );
      if (ids.length === 0) {
        log(state, `Trash passed unrezzed ice — none available.`);
        return { ok: true };
      }
      const apply = (id: string): EvalResult => {
        const card = state.cards[id];
        if (!card) return { ok: true };
        trashCard(state, id, { by: source.side });
        log(state, `Trash unrezzed ${card.title} (passed last run).`);
        return { ok: true };
      };
      if (ids.length === 1) return apply(ids[0]!);
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: ids.map((id) => ({
          id: `en-passant:${id}`,
          label: `Trash ${openCardName(state, id, "runner")}`,
          effect: fx.do({
            kind: "trash_passed_unrezzed_ice_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "trash_passed_unrezzed_ice_resolve": {
      const id = action.cardId;
      const card = state.cards[id];
      if (
        !card ||
        card.type !== "ice" ||
        card.rezzed ||
        !card.zone.endsWith(":ice")
      ) {
        return { ok: true };
      }
      trashCard(state, id, { by: source.side });
      log(state, `Trash unrezzed ${card.title} (passed last run).`);
      return { ok: true };
    }

    case "may_trash_other_installed_gain_printed_install_and_draw": {
      const targets = state.runner.installed.filter((id) => id !== sourceId);
      if (targets.length === 0) {
        log(state, `${source.title} — no other installed cards to trash.`);
        return { ok: true };
      }
      const options: import("../ir.js").ChoiceOption[] = targets.map((id) => {
        const c = state.cards[id]!;
        const printed = c.installCost ?? 0;
        return {
          id: `trash:${id}`,
          label: `Trash ${c.title} (gain ${printed}¢, draw 1)`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "trash_runner_rig_card" as const,
                  cardId: id,
                },
              },
              {
                op: "do" as const,
                action: {
                  kind: "gain_credits" as const,
                  side: "runner" as const,
                  amount: printed,
                },
              },
              {
                op: "do" as const,
                action: {
                  kind: "draw" as const,
                  side: "runner" as const,
                  amount: 1,
                },
              },
            ],
          },
        };
      });
      options.push({
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
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `${source.title} — may trash another installed card for printed install cost.`,
      });
      return { ok: true };
    }

    case "trash_encounter_ice_resolve_subroutine": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `Trash encounter ice — no encounter.`);
        return { ok: true };
      }
      const ice = state.cards[enc.iceId];
      if (!ice) {
        log(state, `Trash encounter ice — missing ice.`);
        return { ok: true };
      }
      const sub = ice.subroutines?.[action.subIndex];
      if (!sub) {
        log(state, `Trash encounter ice — no subroutine ${action.subIndex}.`);
        return { ok: true };
      }
      // The cost moves the ice. "This server" stays the server it protected
      // for the rest of this ability (CR 4.6.6i).
      ice.thisServerWhileResolving = state.run?.attackedServerId;
      // Trash ice; no other subroutine fires, and none was broken by the
      // Runner (CR 6.5.7a).
      trashCard(state, enc.iceId, { by: "corp", cause: "cost" });
      markRemainingSubroutinesNotBrokenByRunner(
        enc,
        (ice.subroutines ?? []).length,
      );
      log(state, `Trash ${ice.title}; resolve "${sub.text}" (ZATO City Grid).`);
      const resolved = evalEffect({ state, sourceId: enc.iceId }, sub.effect);
      ice.thisServerWhileResolving = undefined;
      return resolved;
    }

    case "trash_encounter_ice_if_strength_lte": {
      const iceId = state.run?.encounter?.iceId;
      if (!iceId) {
        log(state, `Trash encounter ice — no encounter.`);
        return { ok: true };
      }
      const str = iceStrength(state, iceId);
      if (str > action.maxStrength) {
        log(
          state,
          `Trash encounter ice — strength ${str} > ${action.maxStrength}.`,
        );
        return { ok: true };
      }
      const ice = state.cards[iceId]!;
      trashCard(state, iceId, { by: source.side });
      log(
        state,
        `Trash encountered ${ice.title} (strength ${str} ≤ ${action.maxStrength}) (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

    case "trash_top_n_may_install_discount": {
      const count = Math.max(0, action.count);
      const discount = Math.max(0, action.discount);
      const milled: string[] = [];
      for (let i = 0; i < count && state.runner.deck.length > 0; i++) {
        const id = state.runner.deck[0]!;
        trashCard(state, id);
        milled.push(id);
      }
      log(
        state,
        `${source.title} — trash top ${milled.length} of stack to heap.`,
      );
      const candidates = milled.filter((id) =>
        canInstallHeapCard(state, id, discount),
      );
      if (candidates.length === 0) {
        log(
          state,
          `${source.title} — no affordable install among milled cards.`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        candidates.map((id) => {
          const c = state.cards[id]!;
          const cost = gripInstallCostAfterDiscount(state, c, discount);
          return {
            id: `install:${id}`,
            label: `Install ${c.title} for ${cost}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_heap_card" as const,
                cardId: id,
                discount,
              },
            },
          };
        });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: { kind: "gain_credits" as const, side: "runner", amount: 0 },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `${source.title} — may install 1 of ${candidates.length} milled card(s) (${discount}¢ discount).`,
      });
      return { ok: true };
    }

    case "trash_type_may_pay_3_prevent": {
      const types: Array<import("../../state/types.js").CardType> = [
        "event",
        "hardware",
        "program",
        "resource",
      ];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: types.map((t) => ({
          id: `go-type:${t}`,
          label: `Choose ${t}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "game_over_after_type" as const,
              cardType: t,
            },
          },
        })),
        logLine: `${source.title} — choose a Runner card type.`,
      });
      return { ok: true };
    }

    case "trash_self_choose_rezzed_protecting_ice_encounter": {
      // Capture host server before trash (Ganked! leaves the root).
      const host = serverHostingCard(state, sourceId);
      const serverId = host?.id ?? state.run?.attackedServerId;
      trashCard(state, sourceId, { by: source.side });
      log(state, `${source.title} trashed (CR ${CR.trashing.number}).`);
      if (!serverId || !state.run) {
        log(
          state,
          `${source.title} — no server to force encounter after trash.`,
        );
        return { ok: true };
      }
      const server = state.servers[serverId];
      const iceIds = (server?.ice ?? []).filter((id) => {
        const ice = state.cards[id];
        return ice?.type === "ice" && ice.rezzed;
      });
      if (iceIds.length === 0) {
        log(
          state,
          `${source.title} — no rezzed ice protecting ${serverId} to encounter.`,
        );
        return { ok: true };
      }
      if (iceIds.length === 1) {
        return applyPrimitive(ctx, {
          kind: "set_reencounter_ice",
          iceId: iceIds[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: iceIds.map((id) => ({
          id: `ganked-encounter:${id}`,
          label: `Runner encounters ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "set_reencounter_ice" as const, iceId: id },
          },
        })),
        logLine: `${source.title} — choose rezzed ice protecting ${serverId} for encounter.`,
      });
      return { ok: true };
    }

    case "corp_trash": {
      const cardId = (action as { cardId: string }).cardId;
      if (state.cards[cardId]) {
        trashCard(state, cardId, { by: controllerOf(state, sourceId) });
        log(state, `Standoff — Corp trashes ${state.cards[cardId]?.title}.`);
      }
      return { ok: true };
    }

    case "trash_per_power": {
      const n = source?.powerCounters ?? 0;
      if (n <= 0) {
        log(state, `Estelle Moon — no power counters.`);
        return { ok: true };
      }
      state.corp.credits += 2 * n;
      log(state, `Estelle Moon — gain ${2 * n}¢ and draw ${n}.`);
      return evalEffect(ctx, fx.draw("corp", n));
    }

    case "rfg_resolve": {
      rfgCard(state, action.cardId);
      const n = action.credits ?? 2;
      state.runner.credits += n;
      log(
        state,
        `Bloo Moose — RFG ${state.cards[action.cardId]?.title ?? action.cardId}; gain ${n}¢ → ${state.runner.credits}¢.`,
      );
      return { ok: true };
    }

    case "trash_emergent_continue": {
      const candidates = state.runner.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware";
      });
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "done-trash",
          label: `Done trashing (X=${action.trashedCost}) — search stack`,
          effect: fx.do({
            kind: "search_emergent_install",
            discount: action.trashedCost,
          }),
        },
      ];
      for (const id of candidates) {
        const c = state.cards[id]!;
        const cost = c.installCost ?? 0;
        options.push({
          id: `trash:${id}`,
          label: `Trash ${c.title} (install cost ${cost})`,
          effect: fx.do({
            kind: "trash_emergent_one",
            cardId: id,
            trashedCost: action.trashedCost + cost,
          }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "trash_emergent_one": {
      const id = action.cardId;
      if (!state.runner.hand.includes(id)) return { ok: true };
      const card = state.cards[id]!;
      trashCard(state, id, { by: "runner" });
      log(state, `Emergent Creativity — trash ${card.title} from grip.`);
      return (
        applyCorpInstalledTrashKinds(ctx, {
          kind: "trash_emergent_continue",
          trashedCost: action.trashedCost,
        }) ?? { ok: true }
      );
    }

    case "trash_bacterial_one": {
      const looked =
        (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked ??
        [];
      const id = action.cardId;
      (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked =
        looked.filter((x) => x !== id);
      // The Corp's agenda trashes it (CR 1.14.5).
      // Trashed from R&D: facedown, and not named (CR 4.4.6b).
      trashCard(state, id, { by: "corp", faceup: false });
      log(state, `Bacterial Programming — trash 1 card.`);
      return (
        applyDeckOrderKinds(ctx, {
          kind: "dtwn_bacterial_partition",
        }) ?? { ok: true }
      );
    }

    case "trash_rezzed_paying_trash_cost": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (!c?.rezzed) continue;
          if (typeof c.trashCost !== "number") continue;
          if (state.runner.credits < c.trashCost) continue;
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Political Operative — no eligible rezzed card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...targets.map((cardId) => {
            const c = state.cards[cardId]!;
            const x = c.trashCost ?? 0;
            return {
              id: `po:${cardId}`,
              label: `Pay ${x}¢: trash ${c.title}`,
              effect: fx.do({
                kind: "trash_political_operative_resolve",
                cardId,
              }),
            };
          }),
          {
            id: "po:decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "trash_political_operative_resolve": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card?.rezzed) return { ok: true };
      const x = card.trashCost ?? 0;
      if (state.runner.credits < x) {
        log(state, `Political Operative — insufficient credits.`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, x);
      trashCard(state, cardId, { by: controllerOf(state, sourceId) });
      log(state, `Political Operative — pay ${x}¢; trash ${card.title}.`);
      return { ok: true };
    }

    case "trash_named": {
      // "The Runner reveals the grip and trashes all cards with the chosen
      // name revealed this way": the whole grip is revealed first (CR 1.21.3),
      // then the Runner, named by the text, trashes the matches (CR 1.14.5).
      const grip = [...state.runner.hand];
      const name = source?.title ?? "Salem's Hospitality";
      revealCards(state, grip, sourceId);
      const titles = grip.map((id) => state.cards[id]?.title ?? id);
      log(
        state,
        grip.length > 0
          ? `${name} — the Runner reveals the grip: ${titles.join(", ")}.`
          : `${name} — the Runner reveals an empty grip.`,
      );
      const matches = grip.filter(
        (id) => state.cards[id]?.title === action.title,
      );
      for (const id of matches) {
        trashCard(state, id, { by: "runner", cause: "ability" });
      }
      log(
        state,
        `${name} — the Runner trashes ${matches.length} ${matches.length === 1 ? "copy" : "copies"} of ${action.title}.`,
      );
      return { ok: true };
    }

    case "cotc_code_replicator": {
      const iceId =
        state.run?.encounter?.iceId ?? state.turn.cotcLastPassedIceId;
      if (!iceId || !state.run) {
        log(state, `Code Replicator — no passed ice.`);
        return { ok: true };
      }
      trashCard(state, sourceId, { by: controllerOf(state, sourceId) });
      state.run.reencounterIceId = iceId;
      state.run.cotcCodeReplicatorMayJackOut = true;
      log(
        state,
        `Code Replicator — trash self; Runner approaches ${state.cards[iceId]?.title} again (may jack out).`,
      );
      return { ok: true };
    }

    case "trash_all_installed_corp_cards": {
      // One instruction trashes the whole set (CR 9.12.2a): Hostile
      // Infrastructure has one instance per card, pending with the set's
      // other trash triggers in one reaction window (CR 9.6.4b, 9.2.8d).
      log(state, `Apocalypse — trash all installed Corp cards.`);
      trashCorpCardSet(state, installedCorpIds(state), {
        by: controllerOf(state, sourceId),
        instruction: "trash_all_installed_corp_cards",
      });
      return { ok: true };
    }

    case "trash_installed_prevent_damage": {
      // Heartbeat: "Trash 1 of your installed cards", Heartbeat included.
      const cands = installedRunnerIds(state);
      if (cands.length === 0) {
        log(state, `Heartbeat — no installed card to trash.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `hb:${id}`,
          label: `Trash ${state.cards[id]!.title} to prevent 1 damage`,
          effect: fx.seq(
            fx.do({ kind: "trash_own_installed", cardId: id }),
            fx.do({ kind: "prevent_pending_damage", amount: action.amount }),
          ),
        })),
      });
      return { ok: true };
    }

    case "rfg_named": {
      const defId = action.defId;
      if (!defId) return { ok: true };
      const matches = state.runner.discardPile.filter(
        (id) =>
          state.cards[id]?.defId === defId || state.cards[id]?.id === defId,
      );
      for (const id of [...matches]) {
        rfgFromHeap(state, id);
      }
      log(
        state,
        `Ark Lockdown — remove ${matches.length} copy(ies) of ${defId} from the heap.`,
      );
      return { ok: true };
    }

    case "win_embezzle": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: ["asset", "ice", "operation", "upgrade"].map((t) => ({
          id: `embezzle:${t}`,
          label: `Name ${t}`,
          effect: fx.do({ kind: "win_embezzle_named", cardType: t }),
        })),
      });
      return { ok: true };
    }

    case "win_embezzle_named": {
      const hq = [...state.corp.hand];
      for (let i = hq.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = hq[i]!;
        hq[i] = hq[j]!;
        hq[j] = tmp;
      }
      const revealed = hq.slice(0, Math.min(2, hq.length));
      let trashed = 0;
      for (const id of revealed) {
        const c = state.cards[id];
        if (!c) continue;
        revealCards(state, [c.id], sourceId);
        log(state, `Embezzle — reveal ${c.title} from HQ.`);
        if (c.type === action.cardType) {
          // Revealed, so faceup (CR 1.21.6, 4.4.6b).
          trashCard(state, id, { by: "runner" });
          trashed += 1;
          log(state, `Embezzle — trash ${c.title}.`);
        }
      }
      if (trashed > 0) {
        state.runner.credits += trashed * 4;
        log(state, `Embezzle — gain ${trashed * 4}¢.`);
      }
      return { ok: true };
    }

    case "trash_named_type": {
      // Ibrahim Salem: "Look at the Runner's grip and trash 1 card in it of
      // the named type." The Corp looks; nothing is revealed (CR 1.21.2).
      lookAtCards(state, [...state.runner.hand], sourceId, "corp");
      const matches = state.runner.hand.filter(
        (id) => state.cards[id]?.type === action.cardType,
      );
      if (matches.length === 0) {
        log(state, `Ibrahim Salem — no ${action.cardType} in grip.`);
        return { ok: true };
      }
      if (matches.length === 1) {
        trashCard(state, matches[0]!, { by: "corp" });
        log(state, `Ibrahim Salem — trash ${state.cards[matches[0]!]!.title}.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: matches.map((id) => ({
          id: `ibrahim-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "trash_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "trash_resolve": {
      if (!state.runner.hand.includes(action.cardId)) return { ok: true };
      trashCard(state, action.cardId, { by: "corp" });
      log(state, `Ibrahim Salem — trash ${state.cards[action.cardId]!.title}.`);
      return { ok: true };
    }

    case "trash_rezzed_gain_trash_cost": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          const c = state.cards[id];
          if (c?.rezzed && (c.type === "asset" || c.type === "upgrade")) {
            targets.push(id);
          }
        }
      }
      if (targets.length === 0) {
        log(state, `Product Recall — no rezzed asset/upgrade.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        const id = targets[0]!;
        const card = state.cards[id]!;
        const gainAmt = card.trashCost ?? 0;
        trashCard(state, id, { by: controllerOf(state, sourceId) });
        state.corp.credits += gainAmt;
        log(state, `Product Recall — trash ${card.title}; gain ${gainAmt}¢.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => {
          const card = state.cards[id]!;
          const gainAmt = card.trashCost ?? 0;
          return {
            id: `recall:${id}`,
            label: `Trash ${card.title} → gain ${gainAmt}¢`,
            effect: fx.do({
              kind: "resolve_product_recall",
              cardId: id,
            }),
          };
        }),
      });
      return { ok: true };
    }

    case "resolve_product_recall": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!card?.rezzed) return { ok: true };
      const gainAmt = card.trashCost ?? 0;
      trashCard(state, id, { by: controllerOf(state, sourceId) });
      state.corp.credits += gainAmt;
      log(state, `Product Recall — trash ${card.title}; gain ${gainAmt}¢.`);
      return { ok: true };
    }

    case "trash_any_rezzed_gain_3_each": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (c?.rezzed) targets.push(id);
        }
      }
      const trashed = bmCounter(source, "bmLiquidated");
      if (targets.length === 0) {
        log(state, `Liquidation — no rezzed cards.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...targets.map((id) => ({
            id: `liq:${id}`,
            label: `Trash ${state.cards[id]!.title} (+3¢)`,
            effect: fx.do({
              kind: "trash_rezzed_card",
              cardId: id,
            }),
          })),
          {
            id: "done",
            label: `Done (gained ${trashed * 3}¢)`,
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "trash_rezzed_card": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card?.rezzed) return { ok: true };
      trashCard(state, cardId, { by: controllerOf(state, sourceId) });
      state.corp.credits += 3;
      setBmCounter(
        source,
        "bmLiquidated",
        bmCounter(source, "bmLiquidated") + 1,
      );
      log(state, `Liquidation — trash ${card.title}; gain 3¢.`);
      return evalEffect(ctx, fx.do({ kind: "trash_any_rezzed_gain_3_each" }));
    }

    case "trash_rezzed_copy": {
      const defId = action.defId;
      const rezzed = Object.values(state.cards).filter(
        (c) =>
          c &&
          c.defId === defId &&
          c.type === "ice" &&
          c.rezzed &&
          (c.zone?.includes(":ice") ||
            Object.values(state.servers).some((s) => s.ice.includes(c.id))),
      );
      const ids = rezzed.map((c) => c!.id);
      if (ids.length === 0) {
        log(state, `Immolation Script — no rezzed copy of ${defId}.`);
        return { ok: true };
      }
      if (ids.length === 1) {
        state.turn.ccImmolationScriptUsedThisRun = true;
        return evalEffect(ctx, {
          op: "do",
          action: { kind: "trash_corp_card", cardId: ids[0]! },
        });
      }
      state.turn.ccImmolationScriptUsedThisRun = true;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: ids.map((id) => ({
          id: `imm:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "trash_corp_card" as const, cardId: id },
          },
        })),
      });
      return { ok: true };
    }
    case "trash_installed_corp_card": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!card || card.side !== "corp") return { ok: true };
      // A card the ability revealed goes to Archives faceup (CR 1.21.6, 4.4.6b).
      trashCard(state, id, {
        by: controllerOf(state, sourceId),
        faceup: action.revealed ? true : undefined,
      });
      log(state, `Trash installed ${card.title}.`);
      return { ok: true };
    }

    case "resolve_trash": {
      const amount = Math.max(0, action.amount ?? 0);
      if (state.runner.deck.length > 0) {
        const top = state.runner.deck.shift()!;
        trashCard(state, top, { by: controllerOf(state, sourceId) });
        log(state, `Persephone — trash ${state.cards[top]?.title} from stack.`);
      }
      for (let i = 0; i < amount; i++) {
        if (state.corp.deck.length === 0) break;
        const top = state.corp.deck.shift()!;
        trashCard(state, top, { by: controllerOf(state, sourceId) });
        log(state, `Persephone — trash ${state.cards[top]?.title} from R&D.`);
      }
      return { ok: true };
    }

    case "trash_aginfusion_approached_unrezzed_redirect": {
      const run = state.run;
      if (!run || run.position === null) {
        log(state, `AgInfusion — no approached ice.`);
        return { ok: true };
      }
      const iceId = iceAtRunnerPosition(state);
      const ice = iceId ? state.cards[iceId] : null;
      if (!ice || ice.rezzed) {
        log(state, `AgInfusion — approached ice must be unrezzed.`);
        return { ok: true };
      }
      trashCard(state, iceId!, { by: controllerOf(state, sourceId) });
      log(state, `AgInfusion — trash approached ${ice.title}.`);
      const attacked = run.attackedServerId;
      const servers = (Object.keys(state.servers) as ServerId[]).filter(
        (sid) => sid !== attacked,
      );
      if (servers.length === 0) {
        log(state, `AgInfusion — no other server.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: servers.map((sid) => ({
          id: `server:${sid}`,
          label: `Move Runner to ${sid}`,
          effect: fx.do({ kind: "redirect_aginfusion_resolve", serverId: sid }),
        })),
      });
      return { ok: true };
    }
    case "trash_rezzed_ice_additional_cost": {
      const rezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (c?.rezzed) rezzed.push(id);
        }
      }
      if (rezzed.length === 0) {
        return {
          ok: false,
          error: "No rezzed ice to trash for Mutate.",
          cites: [],
        };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: rezzed.map((id) => ({
          id: `mutate-trash:${id}`,
          label: `Trash ${state.cards[id]!.title} (additional cost)`,
          effect: fx.do({ kind: "mutate_record_trashed_ice", iceId: id }),
        })),
      });
      return { ok: true };
    }
    default:
      return null;
  }
}

export function applyCorpInstalledTrashKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "trash_remote_root": {
      const targets: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (sid === "hq" || sid === "rd" || sid === "archives") continue;
        for (const id of server.root) {
          if (state.cards[id]) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Back Channels — no remote root card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((cardId) => ({
          id: `back-ch:${cardId}`,
          label: `Trash ${state.cards[cardId]!.title} (3¢ × adv)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "resolve_back_channels" as const,
              cardId,
            },
          },
        })),
      });
      return { ok: true };
    }

    case "resolve_back_channels": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card) return { ok: true };
      const adv = card.advancementCounters ?? 0;
      const gain = 3 * adv;
      state.corp.credits += gain;
      // The Corp's operation trashes the card (CR 1.14.5).
      trashCard(state, cardId, { by: "corp" });
      log(
        state,
        `Back Channels — trash ${card.title} (${adv} adv) → gain ${gain}¢.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
