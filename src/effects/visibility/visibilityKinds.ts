/**
 * Primitive kinds for revealing, exposing and looking at cards, and turning
 * cards faceup or facedown. The kind registry (`applyCoreKinds`) dispatches
 * here.
 */
import { openCardName } from "../../state/visibility/seatVisibility.js";
import { lookAtCards, revealCards } from "../../state/visibility/reveal.js";
import { catalogCardNames } from "./cardNames.js";
import {
  type EffectCtx,
  type EvalResult,
  openExposeUpTo,
  finishExposeUpTo,
  resumeExposeUpTo,
  evalEffect,
  applyPrimitive,
} from "../eval.js";
import { type Effect, type Primitive, fx } from "../ir.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { chooseCards } from "../triggers/chooseCards.js";
import {
  corpInstallCost,
  creditsAvailableForInstall,
  subtractRunnerCreditPool,
} from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import {
  beginExpose,
  exposeLegalTargets,
  openExposeInterruptOrComplete,
} from "../../state/visibility/expose.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { CR } from "../../timing/labels.js";
import { controllerOf, trashCard } from "../../state/hostingAndTrash/trash.js";
import {
  resetEncounterBreaks,
  shiftEncounterBreaks,
} from "../../state/turnAndActions/break.js";
import type { RuleCite, GameState } from "../../state/types.js";
import { uninstallCard } from "../../state/uninstallAndPosition/uninstall.js";
import { random } from "../../state/rng.js";
import { loadCardCatalog } from "../../cards/load.js";
import { effectiveAdvancementRequirement } from "../../state/turnAndActions/scoring.js";
import {
  offerSiStackTrashOrArrange,
  offerStackArrangeChoice,
} from "../searchAndDeck/deckOrderKinds.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

/** Zamba-class: may gain credits when a Corp card is exposed. */
export function maybeOfferGainCreditsOnExpose(state: EffectCtx["state"]): void {
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const c = state.cards[id];
    const n = c?.mayGainCreditsOnCorpCardExposed;
    if (!c || typeof n !== "number" || n <= 0) continue;
    // If a choice is already pending, skip (expose continues).
    if (state.pendingChoice) return;
    openPendingChoose(state, {
      sourceId: id,
      chooser: "runner",
      options: [
        {
          id: "accept",
          label: `Gain ${n}¢`,
          effect: fx.do({ kind: "gain_credits", side: "runner", amount: n }),
        },
        {
          id: "decline",
          label: "Decline",
          effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
        },
      ],
      logLine: `${c.title} — may gain ${n}¢ (Corp card exposed).`,
    });
    return;
  }
}

function exposeIceAndMaybeBounce(
  state: EffectCtx["state"],
  _sourceId: string,
  iceId: string,
  namedSubtype: string,
): PrimResult {
  const ice = state.cards[iceId];
  if (!ice) return { ok: true };
  ice.faceup = true;
  log(state, `Wari — expose ${ice.title}.`);
  const subs = (ice.subtypes ?? []).map((s) => s.toLowerCase());
  if (!subs.includes(namedSubtype.toLowerCase())) {
    log(state, `Wari — ${ice.title} is not ${namedSubtype}; leave installed.`);
    return { ok: true };
  }
  // Bounce to HQ
  uninstallCard(state, iceId, "hand");
  log(state, `Wari — add ${ice.title} to HQ (${namedSubtype}).`);
  return { ok: true };
}

export function installedRunnerIds(state: EffectCtx["state"]): string[] {
  return [...state.runner.installed];
}

/** 419: first Corp install each turn — Runner may expose unless Corp pays. */
export function fireTdatd419OnFirstCorpInstall(
  state: GameState,
  installedId: string,
): void {
  if (state.turn.tdatd419FiredThisTurn) return;
  const idCard = state.cards[state.runner.identityId];
  const cost = idCard?.mayExposeFirstCorpInstallEachTurnUnlessCorpPays;
  if (!cost || !idCard) return;
  const installed = state.cards[installedId];
  if (!installed || installed.side !== "corp") return;
  state.turn.tdatd419FiredThisTurn = true;
  openPendingChoose(state, {
    sourceId: idCard.id,
    chooser: "runner",
    options: [
      {
        id: "accept",
        label: `Expose ${openCardName(state, installedId, "runner")} unless Corp pays ${cost}¢`,
        effect: fx.do({
          kind: "expose_419_or_pay",
          cardId: installedId,
          credits: cost,
        }),
      },
      {
        id: "decline",
        label: "Decline",
        effect: fx.do({
          kind: "gain_credits",
          side: "runner",
          amount: 0,
        }),
      },
    ],
  });
  log(
    state,
    `419 — first Corp install (${installed.title}); Runner may expose unless Corp pays ${cost}¢.`,
  );
}

function trashTopOfRd(
  state: EffectCtx["state"],
  n: number,
  label: string,
): void {
  let trashed = 0;
  for (let i = 0; i < n; i++) {
    const top = state.corp.deck[0];
    if (!top) break;
    // "Force the Corp to trash": the Corp carries it out (CR 1.14.5).
    // Not visible to the Runner when trashed: facedown (CR 4.4.6b).
    trashCard(state, top, { by: "corp" });
    trashed += 1;
  }
  log(state, `${label} — trash ${trashed} card(s) from top of R&D.`);
}

/** Ask the Corp where the next granted subroutine goes (CR 9.8.2c). */
function offerSubroutineInsertChoice(state: GameState): void {
  const run = state.run;
  const next = run?.pendingSubroutineInserts?.[0];
  const iceId = run?.encounter?.iceId;
  const ice = iceId ? state.cards[iceId] : undefined;
  if (!run || !next || !ice) {
    if (run) run.pendingSubroutineInserts = undefined;
    return;
  }
  const subs = ice.subroutines ?? [];
  openPendingChoose(state, {
    sourceId: ice.id,
    chooser: "corp",
    options: Array.from({ length: subs.length + 1 }, (_, index) => {
      const place =
        index === 0
          ? "before the other subroutines"
          : index === subs.length
            ? "after the other subroutines"
            : `after "${subs[index - 1]!.text}"`;
      return {
        id: `grail-at:${index}`,
        label: `Place "${next.text}" ${place}`,
        effect: fx.do({
          kind: "gain_credits",
          side: "corp",
          amount: 0,
        }),
      };
    }),
  });
  log(
    state,
    `${ice.title} — choose where "${next.text}" is placed (CR ${CR.subroutineOrderChoice.number}).`,
  );
}

/** Insert the next granted subroutine at the chosen index (CR 9.8.2c). */
export function chooseSubroutinePosition(
  state: GameState,
  index: number,
): void {
  const run = state.run;
  const queue = run?.pendingSubroutineInserts ?? [];
  const sub = queue[0];
  const iceId = run?.encounter?.iceId;
  const ice = iceId ? state.cards[iceId] : undefined;
  if (!run?.encounter || !sub || !ice) {
    if (run) run.pendingSubroutineInserts = undefined;
    return;
  }
  const subs = [...(ice.subroutines ?? [])];
  const at = Math.max(0, Math.min(index, subs.length));
  subs.splice(at, 0, sub);
  ice.subroutines = subs;
  const broken = [...run.encounter.broken];
  broken.splice(at, 0, false);
  run.encounter.broken = broken;
  shiftEncounterBreaks(run.encounter, at, 1);
  const rest = queue.slice(1);
  run.pendingSubroutineInserts = rest.length > 0 ? rest : undefined;
  log(
    state,
    `${ice.title} gains "${sub.text}" at position ${at + 1} (CR ${CR.subroutineOrderChoice.number}).`,
  );
  if (rest.length > 0) offerSubroutineInsertChoice(state);
}

export function applyVisibilityKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "turn_all_archives_facedown": {
      let n = 0;
      for (const id of state.corp.discardPile) {
        const c = state.cards[id];
        if (c && c.faceup) {
          c.faceup = false;
          n += 1;
        }
      }
      log(
        state,
        `${source.title} — turn all Archives cards facedown (${n} flipped).`,
      );
      return { ok: true };
    }

    case "may_turn_facedown_archives_faceup_then": {
      const facedown = state.corp.discardPile.filter(
        (id) => state.cards[id] && !state.cards[id]!.faceup,
      );
      if (facedown.length === 0) {
        log(state, `${source.title} — no facedown Archives cards.`);
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
          ...facedown.map((id) => ({
            id: `faceup:${id}`,
            label: `Turn ${state.cards[id]!.title} faceup`,
            effect: {
              op: "do" as const,
              action: {
                kind: "turn_archives_card_faceup" as const,
                cardId: id,
                then: structuredClone(action.then),
              },
            },
          })),
        ],
        logLine: `${source.title} — may turn a facedown Archives card faceup.`,
      });
      return { ok: true };
    }

    case "turn_archives_card_faceup": {
      const card = state.cards[action.cardId];
      if (!card || !state.corp.discardPile.includes(action.cardId)) {
        log(state, `Turn Archives faceup — card not in Archives.`);
        return { ok: true };
      }
      card.faceup = true;
      log(state, `Turn ${card.title} in Archives faceup.`);
      if (action.then) return evalEffect(ctx, action.then);
      return { ok: true };
    }

    case "turn_hosted_cards_faceup": {
      let n = 0;
      for (const id of source.hostedCardIds ?? []) {
        const c = state.cards[id];
        if (!c) continue;
        if (!c.faceup) {
          c.faceup = true;
          n += 1;
        }
      }
      log(
        state,
        n > 0
          ? `${source.title} — turn ${n} hosted card(s) faceup.`
          : `${source.title} — no facedown hosted cards.`,
      );
      return { ok: true };
    }

    case "invasion_of_privacy": {
      return applyPrimitive(ctx, {
        kind: "trace",
        strength: action.traceStrength ?? 2,
        onSuccess: {
          op: "do",
          action: { kind: "invasion_of_privacy_success" },
        },
        onFailure: {
          op: "do",
          action: { kind: "give_bad_publicity", amount: 1 },
        },
      });
    }

    case "invasion_of_privacy_success": {
      const max = Math.max(0, state.turn.lastTraceExcess ?? 0);
      // "reveal the grip": shown to both players until the ability ends,
      // without turning the cards faceup (CR 1.21.3, 1.21.6).
      revealCards(state, state.runner.hand, sourceId);
      state.turn.invasionPrivacyTrashRemaining = max;
      if (max <= 0) return { ok: true };
      return applyPrimitive(ctx, { kind: "trash_next" });
    }

    case "invasion_of_privacy_finish": {
      state.turn.invasionPrivacyTrashRemaining = 0;
      return { ok: true };
    }

    case "peeping_tom_apply_type": {
      const ice = state.cards[sourceId];
      const run = state.run;
      if (!ice || !run?.encounter || run.encounter.iceId !== sourceId) {
        log(state, `Peeping Tom apply — no encounter.`);
        return { ok: true };
      }
      const grip = [...state.runner.hand];
      revealCards(state, grip, sourceId);
      log(state, `${ice.title} — reveal grip (${grip.length}).`);
      const n = grip.filter(
        (id) => state.cards[id]?.type === action.cardType,
      ).length;
      if (!ice.baseSubroutines) {
        ice.baseSubroutines = ice.subroutines
          ? structuredClone(ice.subroutines)
          : [];
      }
      const subEffect = {
        op: "do" as const,
        action: {
          kind: "unless" as const,
          payer: "runner" as const,
          cost: {
            op: "do" as const,
            action: { kind: "give_tags" as const, amount: 1 },
          },
          instruction: {
            op: "do" as const,
            action: { kind: "end_the_run" as const },
          },
        },
      };
      const gained = Array.from({ length: n }, (_, i) => ({
        id: `${ice.defId}-peeping-${i}`,
        text: "End the run unless the Runner takes 1 tag.",
        effect: structuredClone(subEffect),
      }));
      ice.subroutines = [...gained];
      resetEncounterBreaks(run.encounter, ice.subroutines.length);
      if (!run.peepingTomIceIds) run.peepingTomIceIds = [];
      if (!run.peepingTomIceIds.includes(sourceId)) {
        run.peepingTomIceIds.push(sourceId);
      }
      log(
        state,
        `${ice.title} — gains ${n} ETR-unless-tag subroutine(s) for the remainder of this run (${action.cardType}).`,
      );
      return { ok: true };
    }

    case "peer_review": {
      // "Reveal all but 1 card in HQ": the Corp picks the card that stays
      // hidden (CR 1.15.2).
      if (!action.cardIds && state.corp.hand.length > 1) {
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "corp",
            candidates: [...state.corp.hand],
            count: 1,
            purpose: "resume",
            label: "keep hidden (the rest of HQ is revealed)",
            resume: { kind: "peer_review" },
          }),
        );
      }
      const kept = action.cardIds?.[0] ?? state.corp.hand[0];
      // Revealed cards are shown to both players and stay hidden in HQ
      // afterwards (CR 1.21.3).
      const revealed = state.corp.hand.filter((id) => id !== kept);
      state.corp.credits += 7;
      revealCards(state, revealed, sourceId);
      log(
        state,
        revealed.length > 0
          ? `Peer Review — the rest of HQ is revealed; gain 7¢ → ${state.corp.credits}¢.`
          : `Peer Review — no card in HQ to reveal; gain 7¢ → ${state.corp.credits}¢.`,
      );
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
        log(state, `Peer Review — no affordable root install from HQ.`);
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
            id: `peer-install:${id}`,
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
        logLine: `Peer Review — may install 1 card from HQ in a remote root.`,
      });
      return { ok: true };
    }

    case "expose": {
      if (action.cardId) {
        beginExpose(state, action.cardId);
        return { ok: true };
      }
      const targets = exposeLegalTargets(state);
      if (targets.length === 0) {
        log(
          state,
          `${source.title} — no installed unrezzed Corp cards to expose.`,
        );
        return { ok: true };
      }
      if (targets.length === 1) {
        beginExpose(state, targets[0]!);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: targets.map((id) => ({
          id: `expose:${id}`,
          label: `Expose ${openCardName(state, id, "runner")}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "expose" as const,
              pick: "choose" as const,
              cardId: id,
            },
          },
        })),
        logLine: `${source.title} — choose a card to expose.`,
      });
      return { ok: true };
    }

    case "expose_up_to": {
      const remaining =
        typeof action.remaining === "number" ? action.remaining : action.max;
      openExposeUpTo(state, sourceId, action.max, remaining);
      return { ok: true };
    }

    case "expose_one_of_up_to": {
      state.turn.exposeUpToAfter = {
        sourceId,
        max: action.max,
        remaining: action.remaining,
      };
      const status = beginExpose(state, action.cardId);
      if (status === "done") resumeExposeUpTo(state);
      return { ok: true };
    }

    case "may_expose_after_rez_continue": {
      const pending = state.pendingExpose;
      if (!pending) return { ok: true };
      openExposeInterruptOrComplete(state, pending.cardId);
      resumeExposeUpTo(state);
      return { ok: true };
    }

    case "end_expose_up_to": {
      finishExposeUpTo(state, sourceId);
      return { ok: true };
    }

    case "ayla_set_aside_to_grip": {
      const setAside = state.runner.setAside ?? [];
      if (setAside.length === 0) {
        log(state, `Ayla — set-aside empty.`);
        return { ok: true };
      }
      // Printed: "Add 1 card set aside with this identity to your grip" —
      // the Runner chooses which set-aside card.
      const picked = action.cardId;
      if (!picked) {
        if (setAside.length === 1) {
          return applyPrimitive(ctx, {
            kind: "ayla_set_aside_to_grip",
            cardId: setAside[0]!,
          });
        }
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: setAside.map((id) => ({
            id: `ayla:${id}`,
            label: `Add ${state.cards[id]!.title} to grip`,
            effect: fx.do({ kind: "ayla_set_aside_to_grip", cardId: id }),
          })),
        });
        return { ok: true };
      }
      if (!setAside.includes(picked)) return { ok: true };
      state.runner.setAside = setAside.filter((x) => x !== picked);
      state.runner.hand.push(picked);
      state.cards[picked].zone = "runner:grip";
      state.cards[picked].faceup = true;
      log(
        state,
        `Ayla — add ${state.cards[picked].title} from set-aside to grip.`,
      );
      return { ok: true };
    }

    case "focus_group_after_type": {
      const grip = [...state.runner.hand];
      revealCards(state, grip, sourceId);
      log(state, `${source.title} — reveal grip (${grip.length}).`);
      const count = grip.filter(
        (id) => state.cards[id]?.type === action.cardType,
      ).length;
      if (count <= 0) {
        log(
          state,
          `${source.title} — 0 revealed ${action.cardType} cards; X=0.`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (let x = 0; x <= count; x++) {
        options.push({
          id: `fg-x:${x}`,
          label: `X=${x}`,
          effect: {
            op: "do",
            action: { kind: "may_pay_place", amount: x },
          },
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `${source.title} — choose X ≤ ${count} revealed ${action.cardType}.`,
      });
      return { ok: true };
    }

    case "ss_assimilator_turn_facedown_faceup": {
      const facedown = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        return c && c.faceup === false;
      });
      if (facedown.length === 0) {
        log(
          state,
          `${source?.title ?? "Assimilator"} — no facedown installed cards.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: facedown.map((id) => ({
          id: `faceup:${id}`,
          label: `Turn ${state.cards[id]!.title} faceup`,
          effect: fx.do({ kind: "resolve_assimilator_faceup", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "resolve_assimilator_faceup": {
      const card = state.cards[action.cardId];
      if (!card || !state.runner.installed.includes(action.cardId)) {
        return { ok: true };
      }
      card.faceup = true;
      log(state, `Assimilator — turn ${card.title} faceup.`);
      if (card.type === "event") {
        trashCard(state, action.cardId, { by: controllerOf(state, sourceId) });
        log(state, `Assimilator — trash event ${card.title}.`);
      }
      return { ok: true };
    }

    case "reveal_levy_advanced_research_lab": {
      const top = state.runner.deck.slice(0, 4);
      if (top.length === 0) {
        log(state, `Levy Advanced Research Lab — stack empty.`);
        return { ok: true };
      }
      revealCards(state, top, sourceId);
      const programs = top.filter((id) => state.cards[id]?.type === "program");
      const rest = top.filter((id) => !programs.includes(id));
      // Remove revealed from deck temporarily
      state.runner.deck = state.runner.deck.slice(top.length);
      if (programs.length === 0) {
        // All to bottom in any order — put back
        state.runner.deck.push(...top);
        log(state, `Levy — no programs among top 4; add to bottom.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...programs.map((id) => ({
            id: `take:${id}`,
            label: `Add ${state.cards[id]!.title} to grip`,
            effect: fx.do({
              kind: "levy_take_program_rest_bottom",
              cardId: id,
              restIds: [...programs.filter((x) => x !== id), ...rest],
            }),
          })),
          {
            id: "decline",
            label: "Add all to bottom",
            effect: fx.do({
              kind: "levy_take_program_rest_bottom",
              restIds: top,
            }),
          },
        ],
      });
      return { ok: true };
    }
    case "expose_non_ice_then_run": {
      const candidates = Object.values(state.cards).filter((c) => {
        if (c.side !== "corp" || c.type === "ice") return false;
        // Installed Corp cards live at server:<id>:root (see corpInstall).
        const parts = c.zone.split(":");
        return parts[0] === "server" && parts[2] === "root";
      });
      if (candidates.length === 0) {
        log(state, `Spot the Prey — no non-ice card to expose; still run.`);
        return evalEffect(
          ctx,
          fx.do({ kind: "may_start_run", servers: "any" }),
        );
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((c) => ({
          id: `expose:${c.id}`,
          label: `Expose ${openCardName(state, c.id, "runner")}`,
          effect: {
            op: "seq",
            effects: [
              fx.do({ kind: "expose", pick: "choose", cardId: c.id }),
              fx.do({ kind: "may_start_run", servers: "any" }),
            ],
          },
        })),
      });
      return { ok: true };
    }

    case "reveal_top_rd_to_hq_then_hq_to_rd_top": {
      const top = state.corp.deck.shift();
      if (top) {
        state.corp.hand.push(top);
        const c = state.cards[top];
        if (c) {
          c.zone = "corp:hq";
          c.faceup = false;
        }
        revealCards(state, [top], sourceId);
        log(state, `Open Forum — reveal ${c?.title ?? top} and add to HQ.`);
      }
      if (state.corp.hand.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: state.corp.hand.map((id) => ({
          id: `of:${id}`,
          label: `Add ${state.cards[id]?.title ?? id} to top of R&D`,
          effect: fx.do({ kind: "open_forum_hq_to_rd_top", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "dtwn_wari": {
      // Trash self first, then name subtype + choose ice to expose.
      trashCard(state, sourceId, { by: controllerOf(state, sourceId) });
      const subtypes = ["sentry", "code gate", "barrier"];
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: subtypes.map((sub) => ({
          id: `wari-sub:${sub}`,
          label: `Name ${sub}`,
          effect: fx.do({ kind: "dtwn_wari_name_subtype", subtype: sub }),
        })),
        logLine: `Wari — trash self; name sentry, code gate, or barrier.`,
      });
      return { ok: true };
    }

    case "dtwn_wari_name_subtype": {
      const iceIds: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) iceIds.push(id);
      }
      if (iceIds.length === 0) {
        log(state, `Wari — no ice to expose.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: iceIds.map((id) => ({
          id: `wari-ice:${id}`,
          label: `Expose ${openCardName(state, id, "runner")}`,
          effect: fx.do({
            kind: "expose_wari_resolve",
            iceId: id,
            subtype: action.subtype,
          }),
        })),
      });
      return { ok: true };
    }

    case "expose_wari_resolve": {
      return exposeIceAndMaybeBounce(
        state,
        sourceId,
        action.iceId,
        action.subtype,
      );
    }

    case "look_top_x_stack_arrange": {
      const copies = state.runner.installed.filter(
        (id) => state.cards[id]?.defId === (source?.defId ?? "spy-camera"),
      ).length;
      const n = Math.max(0, copies);
      if (n === 0) {
        log(state, `Spy Camera — no copies installed.`);
        return { ok: true };
      }
      return (
        applyVisibilityKindsWhenSourceExists(ctx, {
          kind: "look_top_n_stack_arrange",
          n,
        }) ?? { ok: true }
      );
    }

    case "look_top_1_rd": {
      const top = state.corp.deck[0];
      if (!top) {
        log(state, `${source?.title ?? "Spy Camera"} — R&D empty.`);
        return { ok: true };
      }
      lookAtCards(state, [top], sourceId);
      return { ok: true };
    }
    case "look_top_install": {
      const n = Math.max(0, action.n ?? 10);
      const discount = Math.max(0, action.discount ?? 5);
      const looked = state.runner.deck.slice(0, n);
      if (looked.length === 0) {
        log(state, `Frantic Coding — stack empty.`);
        return { ok: true };
      }
      lookAtCards(state, looked, sourceId);
      const programs = looked.filter(
        (id) => state.cards[id]?.type === "program",
      );
      const options: { id: string; label: string; effect: Effect }[] =
        programs.map((id) => ({
          id: `frantic-install:${id}`,
          label: `Install ${state.cards[id]!.title} (−${discount}¢)`,
          effect: fx.do({
            kind: "install_resolve",
            cardId: id,
            lookedIds: looked,
            discount,
          }),
        }));
      options.push({
        id: "frantic-decline",
        label: "Decline install (trash looked cards)",
        effect: fx.do({
          kind: "trash_frantic_coding_looked",
          lookedIds: looked,
        }),
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `Frantic Coding — look at top ${looked.length}; ${programs.length} program(s).`,
      });
      return { ok: true };
    }
    case "look_top_n_stack_trash_any_arrange_rest": {
      const n = action.n ?? 6;
      const taken = state.runner.deck.splice(
        0,
        Math.min(n, state.runner.deck.length),
      );
      if (taken.length === 0) {
        log(state, `${source?.title ?? "Making an Entrance"} — stack empty.`);
        return { ok: true };
      }
      state.turn.siStackLookedCards = taken;
      state.turn.siStackArrangePlaced = [];
      lookAtCards(state, taken, sourceId);
      return offerSiStackTrashOrArrange(ctx);
    }

    case "name_reveal_trash_grip_copies": {
      // Salem's Hospitality: "Choose a card name" (CR 1.15.1b). Any Runner
      // card name may be named; the list comes from the catalog, not from the
      // game's cards, which would show the Corp the titles in the Runner's
      // grip and stack (CR 10.2.2a, 10.2.2b).
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: catalogCardNames((def) => def.side === "runner").map(
          (title) => ({
            id: `salem:${title}`,
            label: `Name ${title}`,
            effect: fx.do({ kind: "trash_named", title }),
          }),
        ),
        logLine: `${source?.title ?? "Salem's Hospitality"} — choose a card name.`,
      });
      return { ok: true };
    }

    case "reveal_white_hat": {
      revealCards(state, state.corp.hand, sourceId);
      log(state, `White Hat — reveal all cards in HQ.`);
      const hq = [...state.corp.hand];
      if (hq.length === 0) return { ok: true };
      const opts: { id: string; label: string; effect: Effect }[] = hq.map(
        (id) => ({
          id: `wh-shuffle:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into R&D`,
          effect: fx.do({
            kind: "shuffle_white_hat_one",
            cardId: id,
            remaining: 1,
          }),
        }),
      );
      opts.push({
        id: "wh-done",
        label: "Done (shuffle 0)",
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: opts,
      });
      return { ok: true };
    }

    case "turn_all_installed_runner_cards_facedown": {
      for (const id of installedRunnerIds(state)) {
        const c = state.cards[id];
        if (c) c.faceup = false;
      }
      log(state, `Apocalypse — turn all installed Runner cards facedown.`);
      return { ok: true };
    }

    case "look_top5_may_install_remote": {
      if (state.turn.rdLookedCards.length > 0) {
        return {
          ok: false,
          error: "R&D look already in progress.",
          cites: [],
        };
      }
      const n = 5;
      const taken = state.corp.deck.splice(
        0,
        Math.min(n, state.corp.deck.length),
      );
      state.turn.rdLookedCards = taken;
      lookAtCards(state, taken, sourceId);
      const installable = taken.filter((id) => {
        const t = state.cards[id].type;
        return t === "agenda" || t === "asset" || t === "upgrade";
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline to install",
            effect: fx.do({ kind: "return_looked" }),
          },
          ...installable.map((id) => ({
            id: `psychokinesis-install:${id}`,
            label: `Install ${state.cards[id].title} in a remote`,
            effect: fx.do({
              kind: "install_remote",
              cardId: id,
            }),
          })),
        ],
      });
      return { ok: true };
    }

    case "look_at_top_of_stack": {
      const top = state.runner.deck[0];
      if (!top) {
        log(state, `${source?.title ?? "Look"} — stack empty.`);
        return { ok: true };
      }
      lookAtCards(state, [top], sourceId);
      return { ok: true };
    }
    case "reveal_top_four": {
      // Deck top is index 0 (commitDraw shifts).
      const revealed: string[] = state.runner.deck.splice(0, 4);
      revealCards(state, revealed, sourceId);
      for (const id of revealed) state.cards[id]!.faceup = true;
      let gained = 0;
      const toGrip: string[] = [];
      for (const id of revealed) {
        if (state.cards[id]?.type === "program") {
          trashCard(state, id);
          gained += 1;
        } else {
          toGrip.push(id);
        }
      }
      state.runner.hand.push(...toGrip);
      for (const id of toGrip) state.cards[id]!.zone = "runner:grip";
      state.runner.credits += gained;
      log(
        state,
        `Inject — trash ${gained} program(s), gain ${gained}¢, ${toGrip.length} to grip.`,
      );
      return { ok: true };
    }
    case "reveal_top_may_bottom": {
      if (state.runner.deck.length === 0) {
        log(state, `Angel Arena — stack empty.`);
        return { ok: true };
      }
      const top = state.runner.deck[0]!; // deck top is index 0 (commitDraw shifts)
      revealCards(state, [top], sourceId);
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "angel-keep",
            label: `Keep ${state.cards[top]!.title} on top`,
            effect: fx.gainCredits("runner", 0),
          },
          {
            id: "angel-bottom",
            label: `Add ${state.cards[top]!.title} to bottom of stack`,
            effect: fx.do({ kind: "bottom_top", cardId: top }),
          },
        ],
      });
      return { ok: true };
    }

    case "expose_419_or_pay": {
      const cardId = (action as { cardId: string }).cardId;
      const cost =
        (action as { credits?: number }).credits ??
        state.cards[state.runner.identityId]
          ?.mayExposeFirstCorpInstallEachTurnUnlessCorpPays ??
        1;
      const target = state.cards[cardId];
      if (!target) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "pay",
            label: `Pay ${cost}¢ to prevent expose`,
            effect: fx.do({
              kind: "pay_419",
              credits: cost,
            }),
          },
          {
            id: "expose",
            label: `Allow expose of ${target.title}`,
            effect: fx.do({
              kind: "expose_419",
              cardId,
            }),
          },
        ],
      });
      return { ok: true };
    }

    case "expose_419": {
      const cardId = (action as { cardId: string }).cardId;
      beginExpose(state, cardId);
      log(state, `419 — expose ${state.cards[cardId]?.title}.`);
      return { ok: true };
    }

    case "tdatd_falsified_credentials": {
      const types = ["agenda", "asset", "ice", "upgrade"];
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: types.map((t) => ({
          id: `falsified:${t}`,
          label: `Name ${t}`,
          effect: fx.do({
            kind: "tdatd_falsified_set_type",
            cardType: t,
          }),
        })),
      });
      return { ok: true };
    }

    case "tdatd_falsified_set_type": {
      const cardType = (action as { cardType: string }).cardType;
      state.turn.tdatdFalsifiedNamedType = cardType;
      // Expose a card in a remote server.
      const remotes: string[] = [];
      for (const server of Object.values(state.servers)) {
        if (server.kind !== "remote") continue;
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c && !c.rezzed && !c.faceup) remotes.push(id);
          else if (c && !c.rezzed) remotes.push(id);
        }
      }
      // Also allow faceup/rezzed? Expose typically targets unrezzed. Prefer unrezzed.
      const targets =
        remotes.length > 0
          ? remotes
          : Object.values(state.servers)
              .filter((s) => s.kind === "remote")
              .flatMap((s) => [...s.root, ...s.ice]);
      if (targets.length === 0) {
        log(state, `Falsified Credentials — no remote card to expose.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: targets.map((id) => ({
          id: `falsified-expose:${id}`,
          label: `Expose ${openCardName(state, id, "runner")}`,
          effect: fx.do({
            kind: "expose_falsified",
            cardId: id,
            cardType,
          }),
        })),
      });
      return { ok: true };
    }

    case "expose_falsified": {
      const cardId = (action as { cardId: string }).cardId;
      const cardType = (action as { cardType: string }).cardType;
      beginExpose(state, cardId);
      const c = state.cards[cardId];
      if (c?.type === cardType) {
        state.runner.credits += 5;
        log(
          state,
          `Falsified Credentials — expose ${c.title} (${cardType}); gain 5¢ → ${state.runner.credits}¢.`,
        );
      } else {
        log(
          state,
          `Falsified Credentials — expose ${c?.title}; not ${cardType}.`,
        );
      }
      return { ok: true };
    }

    case "look_sadaka_top_3": {
      const top: string[] = [];
      for (let i = 0; i < 3 && state.corp.deck.length > 0; i++) {
        top.push(state.corp.deck.shift()!);
      }
      if (top.length === 0) {
        log(state, `Sadaka — R&D empty.`);
        return { ok: true };
      }
      lookAtCards(state, top, sourceId);
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "arrange",
            label: "Arrange them in any order",
            effect: fx.do({
              kind: "tdatd_sadaka_arrange",
              cardIds: top,
            }),
          },
          {
            id: "shuffle",
            label: "Shuffle R&D",
            effect: fx.do({
              kind: "shuffle_sadaka",
              cardIds: top,
            }),
          },
        ],
      });
      return { ok: true };
    }
    case "reveal_copies_trash_rd": {
      if (!state.run) return { ok: true };
      state.run.skipBreach = true;
      const copies = state.runner.hand.filter(
        (id) => state.cards[id]?.defId === "fear-the-masses",
      );
      // "Reveal any number of copies": the Runner says how many (CR 1.15.2).
      if (!action.cardIds && copies.length > 0) {
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "runner",
            candidates: copies,
            count: copies.length,
            upTo: true,
            purpose: "resume",
            label: "reveal from the grip",
            resume: { kind: "reveal_copies_trash_rd" },
          }),
        );
      }
      const shown = (action.cardIds ?? []).filter((id) => copies.includes(id));
      const x = 1 + shown.length;
      revealCards(state, shown, sourceId);
      trashTopOfRd(state, x, source?.title ?? "Fear the Masses");
      log(
        state,
        `Fear the Masses — revealed ${shown.length} copy(ies); trash ${x} from R&D.`,
      );
      return { ok: true };
    }

    case "reveal_lakshmi_agenda_resolve": {
      if (!source) return { ok: true };
      const id = action.cardId;
      if (!state.corp.hand.includes(id)) return { ok: true };
      const card = state.cards[id]!;
      const x = card.agendaPoints ?? 0;
      const power = source.powerCounters ?? 0;
      if (power < x) {
        log(state, `Lakshmi Smartfabrics — not enough power counters.`);
        return { ok: true };
      }
      source.powerCounters = power - x;
      const defId = card.defId ?? id;
      state.turn.bfCannotStealAgendaDefIds = [
        ...(state.turn.bfCannotStealAgendaDefIds ?? []),
        defId,
      ];
      revealCards(state, [card.id], sourceId);
      log(
        state,
        `Lakshmi Smartfabrics — reveal ${card.title} (${x}); Runner cannot steal copies this turn.`,
      );
      return { ok: true };
    }

    case "reveal_random_hq_card": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Enhanced Vision — HQ empty.`);
        return { ok: true };
      }
      const pick = hq[Math.floor(random(state) * hq.length)]!;
      const card = state.cards[pick];
      revealCards(state, [pick], sourceId);
      log(
        state,
        `Enhanced Vision — Corp reveals ${card?.title ?? pick} from HQ.`,
      );
      return { ok: true };
    }
    case "name_card": {
      // Printed: "Name a card." Any card in the pool may be named — not
      // just whichever cards happen to be in the game state.
      const defs = [...loadCardCatalog().values()]
        .filter((d) => d.type !== "identity")
        .sort((a, b) => a.title.localeCompare(b.title));
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: defs.map((d) => ({
          id: `tm:${d.id}`,
          label: `Name ${d.title}`,
          effect: fx.do({
            kind: "set_name",
            defId: d.id,
          }),
        })),
      });
      return { ok: true };
    }
    case "set_name": {
      const defId = (action as { defId: string }).defId;
      // The named card is remembered by the current itself, for as long
      // as it remains in the play area — not by turn state.
      const source = state.cards[sourceId];
      if (source) source.namedCardDefId = defId;
      log(state, `Targeted Marketing — named ${defId}.`);
      return { ok: true };
    }

    case "may_reveal_force_draw": {
      if (state.corp.deck.length === 0) {
        log(state, `Equivocation — R&D empty.`);
        return { ok: true };
      }
      // The Runner has not seen the card yet, so the offer does not name it.
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "reveal",
            label: "Reveal the top card of R&D",
            effect: fx.do({ kind: "reveal_then_may_force_draw" }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "reveal_then_may_force_draw": {
      if (state.corp.deck.length === 0) return { ok: true };
      const topId = state.corp.deck[0]!; // deck top is index 0 (commitDraw shifts)
      const top = state.cards[topId]!;
      revealCards(state, [top.id], sourceId);
      log(state, `Equivocation — reveal top of R&D: ${top.title}.`);
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "force-draw",
            label: `Force Corp to draw ${top.title}`,
            effect: fx.do({ kind: "draw", side: "corp", amount: 1 }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "may_look_nihongai_top5_swap_hq": {
      const grip = state.runner.hand.length;
      const credits = state.runner.credits;
      if (grip >= 2 && credits >= 6) {
        log(state, `Nihongai Grid — Runner has ≥2 grip and ≥6¢; no effect.`);
        return { ok: true };
      }
      // Deck top is index 0 (commitDraw shifts). Printed: top 5 of R&D.
      const top = state.corp.deck.slice(0, 5);
      if (top.length === 0 || state.corp.hand.length === 0) {
        log(state, `Nihongai Grid — nothing to swap.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "accept",
            label: "Look at top 5 of R&D and swap 1 with HQ",
            effect: fx.do({
              kind: "look_nihongai_swap_continue",
              lookedIds: top,
            }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "look_nihongai_swap_continue": {
      const lookedIds = action.lookedIds ?? [];
      const hq = [...state.corp.hand];
      if (lookedIds.length === 0 || hq.length === 0) return { ok: true };
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const rdId of lookedIds) {
        for (const hqId of hq) {
          options.push({
            id: `swap:${rdId}:${hqId}`,
            label: `Swap ${state.cards[rdId]?.title} (R&D) ↔ ${state.cards[hqId]?.title} (HQ)`,
            effect: fx.do({
              kind: "swap_nihongai_resolve",
              rdCardId: rdId,
              hqCardId: hqId,
            }),
          });
        }
      }
      options.push({
        id: "decline",
        label: "Decline swap",
        effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `Nihongai Grid — choose R&D↔HQ swap.`,
      });
      return { ok: true };
    }
    case "look_top_n_stack_add_one_to_grip_shuffle": {
      const n = action.n ?? 4;
      const deck = state.runner.deck;
      const taken: string[] = [];
      for (let i = 0; i < Math.min(n, deck.length); i++) {
        taken.push(deck[i]!); // deck top is index 0 (commitDraw shifts)
      }
      for (const id of taken) {
        const idx = deck.lastIndexOf(id);
        if (idx >= 0) deck.splice(idx, 1);
      }
      if (taken.length === 0) return { ok: true };
      lookAtCards(state, taken, sourceId);
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: taken.map((id) => ({
          id: `ed:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: fx.do({
            kind: "express_delivery_finish",
            pickId: id,
            restIds: taken.filter((x) => x !== id),
          }),
        })),
      });
      return { ok: true };
    }
    case "may_pay_reveal_top": {
      // Printed Bug: whenever the Corp draws a card, you may pay 2¢ to
      // reveal that card (CR 1.2.1). The drawn id is on the turn bookkeeping.
      // The Runner has not seen the card yet, so the offer does not name it.
      const title = "the card the Corp drew";
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "bug-pay",
            label: `Pay 2¢ to reveal ${title}`,
            effect: fx.do({ kind: "reveal_top_paid" }),
          },
          {
            id: "bug-skip",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }
    case "reveal_top_paid": {
      if (state.runner.credits < 2) return { ok: true };
      subtractRunnerCreditPool(state, 2);
      const id = state.turn.pendingCorpDrawnCardId;
      if (id && state.cards[id]) {
        state.cards[id]!.faceup = true;
        revealCards(state, [id], sourceId);
        log(state, `Bug — reveal ${state.cards[id]!.title}.`);
      } else {
        log(state, `Bug — no drawn Corp card to reveal.`);
      }
      return { ok: true };
    }
    case "reveal_oracle_top_match": {
      const top = state.runner.deck[0]; // deck top is index 0 (commitDraw shifts)
      if (!top) return { ok: true };
      state.cards[top]!.faceup = true;
      const match = state.cards[top]!.type === action.cardType;
      revealCards(state, [top], sourceId);
      log(
        state,
        `Oracle May — reveal ${state.cards[top]!.title} (${match ? "match" : "no match"}).`,
      );
      // Printed Oracle May: on a match, draw the card and gain 2¢; on a
      // miss, trash it. (Card text wins, CR 1.2.1.) That card is the top
      // of the stack, so the draw procedure draws it (CR 8.4.2).
      if (match) {
        log(state, `Oracle May — draw ${state.cards[top]!.title} and gain 2¢.`);
        const r = evalEffect(
          ctx,
          fx.seq(
            fx.do({ kind: "draw", side: "runner", amount: 1 }),
            fx.do({ kind: "gain_credits", side: "runner", amount: 2 }),
          ),
        );
        // A revealed card goes back to its previous state if it is not
        // drawn (CR 1.21.3).
        if (state.runner.deck.includes(top)) state.cards[top]!.faceup = false;
        return r;
      } else {
        state.runner.deck.shift();
        trashCard(state, top, { by: "runner" });
        log(state, `Oracle May — trash ${state.cards[top]!.title}.`);
      }
      return { ok: true };
    }
    case "may_reveal_score_from_hq": {
      // Printed: score an HQ agenda whose advancement requirement is ≤ the
      // number of advancement tokens on Plan B (CR 1.2.1: card text wins).
      const planBAdv = state.cards[sourceId]?.advancementCounters ?? 0;
      const agendas = state.corp.hand.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "agenda" &&
          effectiveAdvancementRequirement(state, c) <= planBAdv
        );
      });
      if (agendas.length === 0) {
        log(state, `Plan B — no scoreable agenda in HQ.`);
        return { ok: true };
      }
      // "You may reveal and score": the Corp may decline (CR 9.6.9).
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...agendas.map((id) => ({
            id: `pb:${id}`,
            label: `Score ${state.cards[id]!.title}`,
            effect: fx.do({ kind: "score_agenda_from_hq", cardId: id }),
          })),
          {
            id: "decline",
            label: "Decline",
            effect: fx.gainCredits("corp", 0),
          },
        ],
      });
      return { ok: true };
    }

    case "reveal_host_programs": {
      const top: string[] = [];
      for (let i = 0; i < 5 && state.runner.deck.length > 0; i++) {
        top.push(state.runner.deck.shift()!);
      }
      revealCards(state, top, sourceId);
      const programs = top.filter((id) => state.cards[id]?.type === "program");
      const rest = top.filter((id) => !programs.includes(id));
      // Return non-programs to stack temporarily; host choice for programs.
      for (const id of rest) {
        state.runner.deck.unshift(id);
      }
      if (programs.length === 0) {
        // shuffle remaining
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(random(state) * (i + 1));
          [state.runner.deck[i], state.runner.deck[j]] = [
            state.runner.deck[j]!,
            state.runner.deck[i]!,
          ];
        }
        log(state, `Customized Secretary — no programs; shuffle stack.`);
        return { ok: true };
      }
      return evalEffect(
        ctx,
        fx.do({
          kind: "host_continue",
          cardIds: programs,
        }),
      );
    }

    case "expose_then_run": {
      return evalEffect(ctx, {
        op: "seq",
        effects: [
          fx.do({ kind: "expose", pick: "choose" }),
          fx.do({ kind: "may_start_run", servers: "any" }),
        ],
      });
    }

    case "reveal_grip_trash_cost_lte_excess": {
      const excess = state.turn.lastTraceExcess ?? 0;
      const hand = [...state.runner.hand];
      for (const id of hand) {
        const card = state.cards[id];
        if (!card) continue;
        const cost = card.playCost ?? card.installCost ?? Infinity;
        revealCards(state, [card.id], sourceId);
        log(state, `Waiver — reveal ${card.title} (cost ${cost}).`);
        if (typeof cost === "number" && cost <= excess) {
          state.runner.hand = state.runner.hand.filter((x) => x !== id);
          trashCard(state, id);
          log(state, `Waiver — trash ${card.title} (cost ≤ ${excess}).`);
        }
      }
      return { ok: true };
    }

    case "reveal_top_3": {
      const top = state.corp.deck.slice(0, 3);
      if (top.length === 0) {
        log(state, `Bamboo Dome — R&D empty.`);
        return { ok: true };
      }
      revealCards(state, top, sourceId);
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: top.map((id) => ({
          id: `hq:${id}`,
          label: `Add ${state.cards[id]!.title} to HQ`,
          effect: fx.do({
            kind: "choose_hq",
            cardId: id,
            restIds: top.filter((x) => x !== id),
          }),
        })),
      });
      return { ok: true };
    }

    case "may_reveal_aeneas_gain_one": {
      const cardId = action.cardId;
      const card = cardId ? state.cards[cardId] : null;
      if (!card) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "accept",
            label: `Reveal ${card.title} and gain 1¢`,
            effect: fx.do({
              kind: "reveal_aeneas_gain_resolve",
              cardId,
            }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "reveal_aeneas_gain_resolve": {
      const cardId = action.cardId;
      const card = cardId ? state.cards[cardId] : null;
      if (card) {
        card.faceup = true;
        revealCards(state, [card.id], sourceId);
        log(state, `Aeneas Informant — reveal ${card.title}.`);
      }
      state.runner.credits += 1;
      log(state, `Aeneas Informant — gain 1¢ → ${state.runner.credits}¢.`);
      return { ok: true };
    }
    case "reveal_grail_gain_subroutines": {
      const max = (action as { maxReveal?: number }).maxReveal ?? 2;
      const hq = state.corp.hand.filter(
        (id) =>
          (state.cards[id]?.subtypes ?? []).some((s) =>
            s.toLowerCase().includes("grail"),
          ) && state.cards[id]?.type === "ice",
      );
      if (hq.length === 0 || !state.run?.encounter) {
        log(state, `Grail reveal — no grail ice in HQ to reveal.`);
        return { ok: true };
      }
      // "Reveal up to 2 grail ice from HQ": the Corp says which (CR 1.15.2).
      const chosen = (action as { cardIds?: string[] }).cardIds;
      if (!chosen) {
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "corp",
            candidates: hq,
            count: max,
            upTo: true,
            purpose: "resume",
            label: "reveal",
            resume: { kind: "reveal_grail_gain_subroutines", maxReveal: max },
          }),
        );
      }
      const pick = chosen.filter((id) => hq.includes(id)).slice(0, max);
      revealCards(state, pick, sourceId);
      const ice = state.cards[state.run.encounter.iceId];
      if (!ice) return { ok: true };
      const extra = pick.flatMap((id) => {
        const def = state.cards[id]!;
        return (def.subroutines ?? []).map((sub, i) => ({
          id: `${ice.defId}-grail-${id}-${i}`,
          text: sub.text,
          effect: structuredClone(sub.effect!),
        }));
      });
      log(
        state,
        `Grail — ${ice.title} gains subroutines from ${pick.map((id) => state.cards[id]!.title).join(", ")}.`,
      );
      if (extra.length === 0) return { ok: true };
      state.run.pendingSubroutineInserts = extra;
      offerSubroutineInsertChoice(state);
      return { ok: true };
    }
    default:
      return null;
  }
}

export function applyVisibilityKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "expose_and_trash_remote_root": {
      // Drive By: "Expose 1 card installed in the root of a remote server."
      // Only a card that can be exposed is a target (Underway Grid's
      // server is not, CR 1.21.4).
      const targets = exposeLegalTargets(state).filter((id) => {
        const zone = state.cards[id]?.zone ?? "";
        const m = /^server:([^:]+):root$/.exec(zone);
        const server = m
          ? (state.servers as Record<string, { kind: string } | undefined>)[
              m[1]!
            ]
          : undefined;
        return server?.kind === "remote";
      });
      if (targets.length === 0) {
        log(state, `Drive By — no unrezzed remote root card to expose.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        // Labelled by place: the cards are facedown (CR 10.2.2a).
        options: targets.map((id) => ({
          id: `driveby:${id}`,
          label: `Expose ${openCardName(state, id, "runner")}`,
          // The expose may wait on the Corp (an interrupt, a rez first);
          // the trash follows only once it has happened.
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "expose" as const,
                  pick: "choose" as const,
                  cardId: id,
                },
              },
              {
                op: "do" as const,
                action: {
                  kind: "expose_resolve" as const,
                  cardId: id,
                  exposuresBefore: state.turn.exposureCounts?.[id] ?? 0,
                },
              },
            ],
          },
        })),
        logLine: `Drive By — choose a remote root card to expose.`,
      });
      return { ok: true };
    }

    case "expose_resolve": {
      // "If you do and that card is an asset or upgrade, trash it": only a
      // card this expose exposed, still installed and unrezzed, is trashed.
      // The turn's exposure count tells: a prevented expose adds none, even
      // for a card left faceup by an earlier expose (CR 1.21.4, 9.6.10).
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card) return { ok: true };
      const exposed =
        card.zone.startsWith("server:") &&
        !card.rezzed &&
        (state.turn.exposureCounts?.[cardId] ?? 0) >
          (action.exposuresBefore ?? 0);
      if (!exposed) {
        log(state, `Drive By — ${cardId} was not exposed; nothing to trash.`);
        return { ok: true };
      }
      if (card.type === "asset" || card.type === "upgrade") {
        trashCard(state, cardId, { by: "runner" });
        log(state, `Drive By — trash exposed ${card.title}.`);
      } else {
        log(state, `Drive By — exposed ${card.title} (not asset/upgrade).`);
      }
      return { ok: true };
    }

    case "look_top_n_stack_arrange": {
      const n = action.n ?? 5;
      const taken = state.runner.deck.splice(
        0,
        Math.min(n, state.runner.deck.length),
      );
      if (taken.length === 0) {
        log(state, `${source.title} — stack empty.`);
        return { ok: true };
      }
      state.turn.ohStackLookedCards = taken;
      state.turn.ohStackArrangePlaced = [];
      lookAtCards(state, taken, sourceId);
      return offerStackArrangeChoice(ctx);
    }
    default:
      return null;
  }
}
