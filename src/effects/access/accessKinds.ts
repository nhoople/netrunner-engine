/**
 * Primitive kinds for accessing and breaching cards: access restrictions and
 * bonuses, breach replacements. The kind registry (`applyCoreKinds`)
 * dispatches here.
 */
import {
  openCardName,
  openFace,
} from "../../state/visibility/seatVisibility.js";
import { lookAtCards } from "../../state/visibility/reveal.js";
import { setAttackedServer } from "../../state/uninstallAndPosition/runPosition.js";
import {
  type EffectCtx,
  type EvalResult,
  fireOnAccess,
  shuffleCorpRdAfterSearch,
  evalEffect,
  applyPrimitive,
  noteSearchConditionalAbilities,
} from "../eval.js";
import { type Effect, type Primitive, fx } from "../ir.js";
import { chooseCards } from "../triggers/chooseCards.js";
import { applyRunAccessRestrictions } from "../../state/access/accessFilter.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { stealAgenda } from "../../state/turnAndActions/scoring.js";
import { CR } from "../../timing/labels.js";
import { shuffleRunnerStack } from "../install/runnerInstall.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { serverLabel } from "../install/corpAbilityInstall.js";
import type { RuleCite, GameState } from "../../state/types.js";
import { breachAlreadyReplaced } from "../../state/access/breachReplacement.js";
import { shuffleInPlace, random } from "../../state/rng.js";
import { fireOnAgendaAccessedOrScored } from "../../state/triggers/miscConditionalHooks.js";
import { applySpinTcPrimitive } from "../primitives/breachTrashTurn.js";
import { applyRunnerInstallFromGripKinds } from "../install/runnerInstallFromGripKinds.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

/**
 * Quest Completed: "Access 1 installed card (non-ice)." The Runner chooses
 * any card in the root of any server, central or remote; the access goes
 * through the out-of-run access path, so the Runner may trash it by paying
 * its trash cost and must steal an agenda (CR 7.1.5, 7.1.6). A facedown
 * card's title is not in its label: the Runner may not see it until the
 * access (CR 7.1.2, 10.2.2a).
 */
function accessOneInstalledNonIce(ctx: EffectCtx): EvalResult {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  const name = source?.title ?? "Quest Completed";
  const options: { id: string; label: string; effect: Effect }[] = [];
  for (const [sid, server] of Object.entries(state.servers)) {
    let unrezzed = 0;
    for (const id of server.root) {
      const card = state.cards[id];
      if (!card || card.type === "ice") continue;
      const title = openFace(card, "runner").title;
      unrezzed += title === null ? 1 : 0;
      const shown = title ?? `unrezzed card ${unrezzed}`;
      options.push({
        id: `access-installed:${id}`,
        label: `Access ${shown} in the root of ${serverLabel(sid)}`,
        effect: fx.do({
          kind: "access_installed",
          cardId: id,
          onAccess: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
        }),
      });
    }
  }
  if (options.length === 0) {
    log(state, `${name} — no installed non-ice card to access.`);
    return { ok: true };
  }
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options,
    logLine: `${name} — the Runner chooses 1 installed card (non-ice) to access.`,
  });
  return { ok: true };
}

/** Fire Kill Switch-class onAgendaAccessedOrScored from active currents / play area. */
export function fireTdatdOnAgendaAccessedOrScored(state: GameState): void {
  for (const card of Object.values(state.cards)) {
    if (!card?.onAgendaAccessedOrScored) continue;
    const inPlay =
      card.zone === "corp:play-area" ||
      card.zone === "runner:play-area" ||
      (card.rezzed &&
        Object.values(state.servers).some(
          (s) => s.root.includes(card.id) || s.ice.includes(card.id),
        ));
    if (!inPlay) continue;
    fireOnAgendaAccessedOrScored(state, card.id);
    if (state.pendingChoice || state.trace) return;
  }
}

/**
 * CBI Raid: Corp chooses the order of every HQ card onto the top of R&D
 * (printed "in the order of their choice"). One pick at a time; a lone
 * remaining card is placed automatically.
 */
export function offerCbiRaidHqToRd(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const hq = [...state.corp.hand];
  if (hq.length === 0) {
    log(state, `CBI Raid — HQ empty; skip breach.`);
    return { ok: true };
  }
  if (hq.length === 1) {
    const id = hq[0]!;
    state.corp.hand = [];
    state.corp.deck.unshift(id);
    const card = state.cards[id]!;
    card.zone = "corp:rd";
    card.faceup = false;
    log(state, `CBI Raid — ${card.title} to top of R&D.`);
    return { ok: true };
  }
  openPendingChoose(state, {
    sourceId,
    chooser: "corp",
    options: hq.map((id) => ({
      id: `cbi:${id}`,
      label: `Top of R&D: ${state.cards[id]!.title}`,
      effect: fx.do({ kind: "place_hq_on_top_rd_continue", cardId: id }),
    })),
    logLine: `CBI Raid — Corp chooses next HQ card for top of R&D (${hq.length} left).`,
  });
  return { ok: true };
}

/**
 * Corp assigns each remaining HQ card to pile A or B. When none remain,
 * the Runner chooses which pile to access.
 */
function offerInfoSiftAssign(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const remaining = state.turn.tlmInfoSiftRemaining ?? [];
  if (remaining.length === 0) {
    return offerInfoSiftRunnerPick(ctx);
  }
  const cardId = remaining[0]!;
  const title = state.cards[cardId]?.title ?? cardId;
  openPendingChoose(state, {
    sourceId,
    chooser: "corp",
    options: [
      {
        id: `sift-a:${cardId}`,
        label: `Pile A: ${title}`,
        effect: fx.do({
          kind: "place_info_sift_card_continue",
          cardId,
          pile: "a",
        }),
      },
      {
        id: `sift-b:${cardId}`,
        label: `Pile B: ${title}`,
        effect: fx.do({
          kind: "place_info_sift_card_continue",
          cardId,
          pile: "b",
        }),
      },
    ],
    logLine: `Information Sifting — Corp assigns ${title} (${remaining.length} left).`,
  });
  return { ok: true };
}

function offerInfoSiftRunnerPick(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const pileA = state.turn.tlmInfoSiftPileA ?? [];
  const pileB = state.turn.tlmInfoSiftPileB ?? [];
  state.turn.tlmInfoSiftRemaining = undefined;
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: [
      {
        id: "pile-a",
        label: `Access pile A (${pileA.length} card(s))`,
        effect: fx.do({ kind: "access_pile", pile: "a" }),
      },
      {
        id: "pile-b",
        label: `Access pile B (${pileB.length} card(s))`,
        effect: fx.do({ kind: "access_pile", pile: "b" }),
      },
    ],
    logLine: `Information Sifting — Runner chooses a pile (${pileA.length}/${pileB.length}).`,
  });
  return { ok: true };
}

export function applyAccessKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "spend_power_for_bonus_access": {
      const have = source.powerCounters ?? 0;
      const n = Math.min(action.amount, have);
      if (n <= 0 || !state.run) return { ok: true };
      source.powerCounters = have - n;
      state.run.bonusAccess = (state.run.bonusAccess ?? 0) + n;
      log(state, `${source.title} — spend ${n} power → +${n} bonus access.`);
      return { ok: true };
    }

    case "hangeki_runner_may_access": {
      const card = state.cards[action.cardId];
      if (!card) {
        log(state, `Hangeki — chosen card missing.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "hangeki-access",
            label: `Access ${openCardName(state, action.cardId, "runner")}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "access_installed" as const,
                cardId: action.cardId,
                onAccess: action.onAccess,
              },
            },
          },
          {
            id: "hangeki-decline",
            label: "Decline",
            effect: action.onDecline,
          },
        ],
        logLine: `${source.title} — Runner may access ${card.title}.`,
      });
      return { ok: true };
    }

    case "access_installed": {
      const rfg = evalEffect({ state, sourceId }, action.onAccess);
      if (!rfg.ok) return rfg;
      const card = state.cards[action.cardId];
      if (!card) {
        log(state, `${source.title} access — card missing.`);
        return { ok: true };
      }
      let serverId: import("../../state/types.js").ServerId | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (
          server.root.includes(action.cardId) ||
          server.ice.includes(action.cardId)
        ) {
          serverId = sid as import("../../state/types.js").ServerId;
          break;
        }
      }
      if (!serverId) {
        log(state, `${source.title} access — card no longer installed.`);
        return { ok: true };
      }
      if (state.run && !state.run.isPostRunBreach) {
        return applyPrimitive(ctx, {
          kind: "access_installed_card",
          cardId: action.cardId,
        });
      }
      state.pendingStandaloneCardAccess = {
        sourceId,
        cardId: action.cardId,
        serverId,
      };
      log(
        state,
        // A facedown card's title waits for the access (CR 7.1.2, 10.2.2a).
        `${source.title} — pending out-of-run access of ${openFace(card, "runner").title ?? "an unrezzed card"}.`,
      );
      return { ok: true };
    }

    case "access_one_root_other_server": {
      if (!state.run) {
        // Quest Completed shares this kind but is played outside a run:
        // "Access 1 installed card (non-ice)" names no server and no steal
        // or trash restriction, so the access follows CR 7.1.5 and 7.1.6.
        return accessOneInstalledNonIce(ctx);
      }
      const attacked = state.run.attackedServerId;
      const cands: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (sid === attacked) continue;
        for (const id of server.root) {
          cands.push(id);
        }
      }
      // "If that card is an agenda, you cannot steal or trash it": only an
      // agenda is protected; an asset or upgrade can still be trashed.
      state.run.cannotStealOrTrashAgendas = true;
      state.run.accessCandidates = cands;
      state.run.randomAccessLimit = cands.length > 0 ? 1 : 0;
      state.run.accessCandidatesPreset = true;
      state.run.accessedCardIds = state.run.accessedCardIds ?? [];
      if (cands.length > 0) {
        // Enter breach instead of ending the run after skipBreach replace.
        state.run.skipBreach = false;
        log(
          state,
          `${source.title} — instead of breach, access 1 root card among ${cands.length} other-server candidate(s) (cannot steal/trash).`,
        );
      } else {
        log(state, `${source.title} — no other-server root cards to access.`);
      }
      return { ok: true };
    }

    case "access_set_aside": {
      const aside = [...(state.corp.corpSetAside ?? [])];
      const pick = action.cardId;
      if (!aside.includes(pick)) {
        log(state, `${source.title} — Khusyuk access: card not set aside.`);
        return { ok: true };
      }
      const card = state.cards[pick]!;
      log(state, `${source.title} — access ${card.title} from set-aside.`);
      if (card.type === "agenda") {
        stealAgenda(state, pick);
      }
      // Shuffle remaining set-aside (and unstolen pick if still set-aside) into R&D.
      const remaining = aside.filter(
        (id) => id !== pick || state.cards[id]?.zone === "corp:set-aside",
      );
      for (const id of remaining) {
        if (state.cards[id]?.zone !== "corp:set-aside") continue;
        state.corp.deck.push(id);
        state.cards[id]!.zone = "corp:rd";
        state.cards[id]!.faceup = false;
      }
      state.corp.corpSetAside = [];
      shuffleCorpRdAfterSearch(state);
      log(state, `${source.title} — shuffle set-aside into R&D.`);
      return { ok: true };
    }

    case "access_random_hq": {
      const hq = state.corp.hand;
      if (hq.length === 0) {
        log(state, `Access random HQ — HQ empty.`);
        return { ok: true };
      }
      const cardId = hq[hq.length - 1]!;
      const card = state.cards[cardId]!;
      card.faceup = true;
      log(state, `Accessed ${card.title} in HQ at random (Detente).`);
      fireOnAccess(state, cardId);
      return { ok: true };
    }

    case "access_installed_card": {
      if (!state.run) {
        log(state, `Access installed card — no active run.`);
        return { ok: true };
      }
      const card = state.cards[action.cardId];
      if (!card || !card.zone.includes(":root")) {
        log(state, `Access installed card — not in a server root.`);
        return { ok: true };
      }
      state.run.accessCandidates = [action.cardId];
      state.run.randomAccessLimit = 1;
      state.run.accessCandidatesPreset = true;
      state.run.skipBreach = false;
      log(state, `${source.title} — Runner accesses ${card.title}.`);
      return { ok: true };
    }

    case "climactic_register_bonus_access": {
      const amount = Math.max(0, action.amount ?? 2);
      state.turn.climacticBonusAccessOnFirstHqRdBreach = amount;
      log(
        state,
        `${source.title} — first HQ or R&D breach this turn: access +${amount}.`,
      );
      return { ok: true };
    }

    case "name_agenda": {
      if (!state.run) {
        log(state, `Whistleblower name — no run.`);
        return { ok: true };
      }
      state.run.whistleblowerNamedTitle = action.title;
      log(
        state,
        `${source.title} — name ${action.title}; next access of that agenda this run is stolen ignoring costs.`,
      );
      return { ok: true };
    }

    case "queue_breaches_after_current": {
      if (!state.run) {
        log(state, `queue_breaches_after_current — no active run.`);
        return { ok: true };
      }
      if (!state.run.queuedBreachesAfterCurrent) {
        state.run.queuedBreachesAfterCurrent = [];
      }
      for (const server of action.servers) {
        state.run.queuedBreachesAfterCurrent.push({
          server: server as import("../../state/types.js").ServerId,
          ...(action.cannotAccessRoot ? { cannotAccessRoot: true } : {}),
        });
      }
      log(
        state,
        `${source.title} — queue breaches after current: ${action.servers.join(
          ", ",
        )}${action.cannotAccessRoot ? " (cannot access root)" : ""}.`,
      );
      return { ok: true };
    }

    case "bonus_access": {
      if (!state.run) {
        return {
          ok: false,
          error: "bonus_access requires an active run.",
          cites: [CR.breach],
        };
      }
      const n = action.amount;
      if (action.oncePerTurn === "mercury") {
        state.turn.mercuryBreachBonusUsedThisTurn = true;
      }
      if (n <= 0) return { ok: true };
      state.run.bonusAccess = (state.run.bonusAccess ?? 0) + n;
      log(
        state,
        `${source.title} — +${n} bonus access (CR ${CR.breach.number}).`,
      );
      return { ok: true };
    }

    case "restrict_run_access": {
      if (!state.run) {
        log(state, `restrict_run_access — no active run.`);
        return { ok: true };
      }
      const ids = action.cardIdsFromSource
        ? [sourceId]
        : (action.cardIds ?? []);
      if (action.mode === "only_source") {
        state.run.accessOnlyCardIds = [
          ...(state.run.accessOnlyCardIds ?? []),
          ...ids,
        ];
      } else {
        state.run.forbiddenAccessCardIds = [
          ...(state.run.forbiddenAccessCardIds ?? []),
          ...ids,
        ];
      }
      applyRunAccessRestrictions(state);
      log(
        state,
        `Run access restricted (${action.mode}) for ${ids.join(", ")}.`,
      );
      return { ok: true };
    }

    case "begin_replace_breach_hq_hand_only": {
      if (!state.run) {
        log(
          state,
          `${source.title} — breach HQ (hand only) deferred until a run begins.`,
        );
        state.turn.pendingRaymondFlintHandOnlyHqBreach = true;
        return { ok: true };
      }
      if (state.run.phase === "breach" || state.run.breached) {
        state.run.queuedBreachesAfterCurrent = [
          ...(state.run.queuedBreachesAfterCurrent ?? []),
          { server: "hq", cannotAccessRoot: true },
        ];
        log(
          state,
          `${source.title} — HQ breach waits until the current breach ends (CR ${CR.consecutiveBreaches.number}).`,
        );
        return { ok: true };
      }
      setAttackedServer(state.run, "hq");
      state.run.skipBreach = false;
      state.run.accessCandidates = [...state.corp.hand];
      state.run.randomAccessLimit =
        state.run.accessCandidates.length > 0 ? 1 : 0;
      state.run.accessCandidatesPreset = true;
      state.run.forbiddenAccessCardIds = [...(state.servers.hq?.root ?? [])];
      log(state, `${source.title} — breach HQ (hand only; root inaccessible).`);
      return { ok: true };
    }

    case "cap_run_access_remaining": {
      if (!state.run) return { ok: true };
      const max = action.max;
      const room = Math.max(0, max - state.run.accessedCardIds.length);
      if (state.run.randomAccessLimit === null) {
        state.run.randomAccessLimit = room;
      } else {
        state.run.randomAccessLimit = Math.min(
          state.run.randomAccessLimit,
          room,
        );
      }
      log(
        state,
        `${source.title} — access capped at ${state.run.randomAccessLimit} card(s) this run.`,
      );
      return { ok: true };
    }
    case "ss_activate_by_any_means": {
      state.turn.ssByAnyMeansActive = true;
      log(
        state,
        `${source?.title ?? "By Any Means"} — remainder of turn: access not in Archives → trash + 1 meat.`,
      );
      return { ok: true };
    }
    case "may_breach_instead_code_siphon": {
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "code-siphon-decline",
            label: "Breach R&D normally",
            effect: fx.gainCredits("runner", 0),
          },
          {
            id: "code-siphon-search",
            label: "Instead of breaching: search stack for a program",
            effect: fx.do({ kind: "breach_instead_code_siphon" }),
          },
        ],
      });
      return { ok: true };
    }
    case "breach_instead_code_siphon": {
      // "Search your stack for 1 program. Install it, paying 3[credit] less
      // for each piece of ice protecting R&D, and then take 1 tag." Only a
      // program the Runner can pay for can be found (CR 8.7.2b); the search
      // may find nothing (CR 8.7.2e); the stack is shuffled once the search
      // is complete, before the install (CR 8.7.3). The install itself is
      // inline (area 6).
      const discount = (state.servers.rd?.ice.length ?? 0) * 3;
      if (!action.cardIds) {
        if (state.run) state.run.skipBreach = true;
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "runner",
            candidates: state.runner.deck.filter((id) => {
              const c = state.cards[id];
              return (
                c?.type === "program" &&
                state.runner.credits >=
                  Math.max(0, (c.installCost ?? 0) - discount)
              );
            }),
            count: 1,
            search: true,
            purpose: "resume",
            label: "install",
            resume: { kind: "breach_instead_code_siphon" },
          }),
        );
      }
      const id = action.cardIds.find((cid) => state.runner.deck.includes(cid));
      if (id) state.runner.deck = state.runner.deck.filter((x) => x !== id);
      shuffleRunnerStack(state);
      noteSearchConditionalAbilities(state);
      if (!id) {
        // "Install it ... and then take 1 tag" has no "if able": with no
        // program found the install is skipped and the tag is still taken
        // (CR 1.2.4).
        log(state, `Code Siphon — no program found; shuffle the stack.`);
        return evalEffect(ctx, fx.do({ kind: "give_tags", amount: 1 }));
      }
      return applyRunnerInstallFromGripKinds(ctx, {
        kind: "install_program",
        cardId: id,
        discount,
      });
    }
    case "may_breach_instead_diversion_funds_ka": {
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
      if (!state.run || state.run.attackedServerId !== "hq") {
        log(state, `Diversion of Funds — not a successful HQ run.`);
        return { ok: true };
      }
      const maxLose = Math.min(5, state.corp.credits);
      const options: Array<{
        id: string;
        label: string;
        effect: ReturnType<typeof fx.do>;
      }> = [
        {
          id: "breach",
          label: "Breach HQ",
          effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
        },
      ];
      for (let n = 0; n <= maxLose; n++) {
        options.push({
          id: `divert:${n}`,
          label:
            n === 0
              ? "Force Corp to lose 0¢"
              : `Force Corp to lose ${n}¢; gain ${n}¢`,
          effect: fx.do({
            kind: "resolve_diversion_of_funds",
            loseAmount: n,
          }),
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `Diversion of Funds — may instead of breaching HQ.`,
      });
      return { ok: true };
    }

    case "ka_black_hat_bonus_access": {
      state.turn.kaBlackHatBonusAccess = 2;
      log(
        state,
        `Black Hat — +2 access whenever you breach HQ or R&D remainder of turn.`,
      );
      return { ok: true };
    }
    case "breach_hq": {
      const hq = [...state.corp.hand];
      if (hq.length === 0 || !state.run) {
        log(state, `Kitsune — no cards in HQ.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Do not breach HQ",
            effect: fx.gainCredits("corp", 0),
          },
          ...hq.map((id) => ({
            id: `kitsune:${id}`,
            label: `Choose ${state.cards[id]!.title} — breach HQ`,
            effect: fx.do({ kind: "breach_hq_resolve", cardId: id }),
          })),
        ],
      });
      return { ok: true };
    }
    case "breach_hq_resolve": {
      const cardId = (action as { cardId: string }).cardId;
      if (!state.run) return { ok: true };
      setAttackedServer(state.run, "hq");
      state.run.cannotAccessRoot = true;
      state.run.accessCandidates = [cardId];
      state.run.randomAccessLimit = 1;
      state.run.accessCandidatesPreset = true;
      state.run.kitsuneIceToTrashAtBreachEnd = sourceId;
      log(
        state,
        `Kitsune — breach HQ; first access ${state.cards[cardId]!.title}.`,
      );
      return { ok: true };
    }
    case "shattered_remains_access": {
      const adv = source?.advancementCounters ?? 0;
      if (adv <= 0) {
        log(state, `Shattered Remains — no advancement counters.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Do not pay 1¢",
            effect: fx.gainCredits("corp", 0),
          },
          {
            id: "pay",
            label: `Pay 1¢ — trash ${adv} hardware`,
            effect: fx.do({
              kind: "pay_shattered_remains",
              hardwareCount: adv,
            }),
          },
        ],
      });
      return { ok: true };
    }
    case "breach_archives": {
      if (!state.run) {
        log(state, `Hades Shard — breach Archives outside a run (stub).`);
        return { ok: true };
      }
      setAttackedServer(state.run, "archives");
      state.run.cannotAccessRoot = true;
      state.run.accessCandidatesPreset = false;
      log(state, `Hades Shard — breach Archives (no root access).`);
      return { ok: true };
    }
    case "may_breach_instead_keyhole": {
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
      // Printed: "If successful, instead of breaching R&D, look at the top
      // 3 cards of R&D." There is no "may": the Runner does not breach.
      if (!state.run || state.run.attackedServerId !== "rd") {
        log(state, `Keyhole — not a successful R&D run.`);
        return { ok: true };
      }
      return (
        applyAccessKinds(ctx, { kind: "breach_instead_keyhole" }) ?? {
          ok: true,
        }
      );
    }
    case "breach_instead_keyhole": {
      if (state.run) state.run.skipBreach = true;
      // Deck top is index 0 (commitDraw shifts).
      const looked: string[] = state.corp.deck.splice(0, 3);
      // Only the Runner looks (CR 1.21.2): the cards are not turned faceup,
      // and the log does not name them.
      lookAtCards(state, looked, sourceId, "runner");
      state.turn.rdLookedCards = looked;
      log(
        state,
        `Keyhole — the Runner looks at the top ${looked.length} card(s) of R&D instead of breaching.`,
      );
      // The Runner trashes 1 of the looked cards, whatever its type, then
      // R&D is shuffled.
      if (looked.length === 0) {
        state.turn.rdLookedCards = [];
        shuffleInPlace(state, state.corp.deck);
        log(state, `Keyhole — R&D is empty; shuffle R&D.`);
        return { ok: true };
      }
      if (looked.length === 1) {
        return (
          applySpinTcPrimitive(ctx, {
            kind: "trash_looked_program",
            cardId: looked[0]!,
          }) ?? { ok: true }
        );
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: looked.map((id) => ({
          id: `keyhole-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_looked_program", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "breach_reduce_access_remainder_of_run": {
      const amount = action.amount ?? 1;
      if (!state.run) {
        log(state, `SYNC BRE — no active run.`);
        return { ok: true };
      }
      state.run.breachAccessReduction =
        (state.run.breachAccessReduction ?? 0) + amount;
      log(
        state,
        `SYNC BRE — Runner accesses ${amount} fewer card(s) on each breach this run.`,
      );
      return { ok: true };
    }

    case "dtwn_rng_key": {
      // Name a number 0..20 (practical bound).
      const options = Array.from({ length: 21 }, (_, n) => ({
        id: `rng:${n}`,
        label: `Name ${n}`,
        effect: fx.do({ kind: "dtwn_rng_key_set_number", named: n }),
      }));
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `RNG Key — name a number.`,
      });
      return { ok: true };
    }

    case "dtwn_rng_key_set_number": {
      if (!state.run) return { ok: true };
      state.run.dtwnRngKeyNamedNumber = action.named;
      state.run.dtwnRngKeySourceId = sourceId;
      state.run.dtwnRngKeyPendingReveal = true;
      log(
        state,
        `RNG Key — named ${action.named}; reveal next access this run.`,
      );
      return { ok: true };
    }

    case "dtwn_rng_key_reward": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "credits",
            label: "Gain 3¢",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 3 }),
          },
          {
            id: "draw",
            label: "Draw 2 cards",
            effect: fx.do({ kind: "draw", side: "runner", amount: 2 }),
          },
        ],
      });
      return { ok: true };
    }

    case "breach_instead_wanton_destruction": {
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
      const clicks = state.runner.clicks;
      // "You may": declining leaves the breach of HQ as normal; only the
      // replacement skips it (CR 6.7.4c, 9.6.9).
      const opts: { id: string; label: string; effect: Effect }[] = [
        {
          id: "wanton-decline",
          label: "Breach HQ",
          effect: fx.gainCredits("runner", 0),
        },
      ];
      for (let n = 1; n <= clicks; n++) {
        opts.push({
          id: `wanton:${n}`,
          label: `Instead of breaching: spend ${n} [click], the Corp trashes ${n} from HQ at random`,
          effect: fx.seq(
            fx.do({ kind: "set_skip_breach" }),
            fx.do({ kind: "spend_wanton_clicks_trash_hq", amount: n }),
          ),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options: opts });
      return { ok: true };
    }

    case "spend_wanton_clicks_trash_hq": {
      const amount = (action as { amount: number }).amount;
      if (state.runner.clicks < amount) {
        return { ok: false, error: "Not enough clicks.", cites: [] };
      }
      state.runner.clicks -= amount;
      const hq = [...state.corp.hand];
      for (let i = 0; i < amount && hq.length > 0; i++) {
        const idx = Math.floor(random(state) * hq.length);
        const id = hq.splice(idx, 1)[0]!;
        const card = state.cards[id]!;
        // "Force the Corp to trash": the Corp carries it out (CR 1.14.5).
        // Not visible to the Runner when trashed: facedown (CR 4.4.6b).
        trashCard(state, id, { by: "corp" });
        log(state, `Wanton Destruction — trash ${card.title} from HQ.`);
      }
      return { ok: true };
    }

    case "top_hat_may_instead_of_breach": {
      const n = Math.max(1, action.n ?? 5);
      if (!state.run || state.run.attackedServerId !== "rd") {
        log(state, `Top Hat — no successful R&D run.`);
        return { ok: true };
      }
      const ordered = state.corp.deck.slice(0, n);
      if (ordered.length === 0) {
        log(state, `Top Hat — R&D empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...ordered.map((id) => ({
            id: `top-hat-access:${id}`,
            label: `Access ${openCardName(state, id, "runner")}`,
            effect: fx.do({
              kind: "top_hat_access_instead_of_breach",
              cardId: id,
            }),
          })),
          {
            id: "top-hat-decline",
            label: "Breach R&D normally",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
        logLine: `Top Hat — may access 1 of top ${ordered.length} instead of breach.`,
      });
      return { ok: true };
    }

    case "top_hat_access_instead_of_breach": {
      const cardId = action.cardId;
      if (!state.run || !cardId || !state.corp.deck.includes(cardId)) {
        log(state, `Top Hat — chosen card not on R&D.`);
        return { ok: true };
      }
      state.run.skipBreach = true;
      state.pendingStandaloneCardAccess = {
        sourceId,
        cardId,
        serverId: "rd",
      };
      log(
        state,
        `Top Hat — access ${state.cards[cardId]!.title} instead of breaching R&D.`,
      );
      return { ok: true };
    }

    case "force_encounter_accessed_ice": {
      const iceId = state.run?.accessingCardId ?? sourceId;
      const ice = state.cards[iceId];
      if (!ice || ice.type !== "ice") {
        log(state, `force_encounter — no ice to encounter.`);
        return { ok: true };
      }
      ice.rezzed = true;
      ice.faceup = true;
      if (state.run) {
        const parent = state.run.encounter;
        if (parent && parent.iceId !== iceId) {
          state.run.suspendedEncounter = structuredClone(parent);
          state.run.resumeEncounterIceId = parent.iceId;
          log(
            state,
            `After ${ice.title}, return to ${state.cards[parent.iceId]?.title ?? parent.iceId}'s subroutines (CR ${CR.forcedEncounter.number}).`,
          );
        } else {
          state.run.resumeAccessAfterReencounter = true;
        }
        state.run.forceEncounterIceId = iceId;
        state.run.reencounterIceId = iceId;
        state.run.pendingReencounterIceId = undefined;
        state.run.encounter = null;
      }
      log(state, `Runner encounters ${ice.title} (Archangel access).`);
      return { ok: true };
    }

    case "breach_instead_cbi_raid": {
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
      // Printed: instead of breaching HQ, the Corp adds all cards in HQ to
      // the top of R&D in the order of their choice (CR 1.2.1).
      if (!state.run) return { ok: true };
      state.run.skipBreach = true;
      return offerCbiRaidHqToRd(ctx);
    }
    case "may_corp_pay_credits_else_breach": {
      const credits = action.credits ?? 1;
      const server = action.server ?? "rd";
      const cannotAccessRoot = action.cannotAccessRoot ?? true;
      const breach = fx.do({
        kind: "breach_server_during_encounter" as const,
        server,
        cannotAccessRoot,
      });
      if (state.corp.credits < credits) {
        return applyAccessKinds(ctx, {
          kind: "breach_server_during_encounter",
          server,
          cannotAccessRoot,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "pay",
            label: `Pay ${credits}¢`,
            effect: fx.do({ kind: "corp_pay_credits", amount: credits }),
          },
          {
            id: "breach",
            label: `Do not pay — Runner breaches ${server}${
              cannotAccessRoot ? " (no root)" : ""
            }`,
            effect: breach,
          },
        ],
        logLine: `Corp may pay ${credits}¢ or the Runner breaches ${server}${
          cannotAccessRoot ? " without root access" : ""
        }.`,
      });
      return { ok: true };
    }
    case "breach_server_during_encounter": {
      const server = action.server ?? "rd";
      const cannotAccessRoot = action.cannotAccessRoot ?? true;
      if (!state.run) {
        state.pendingStandaloneBreach = {
          sourceId,
          serverId: server,
          ...(cannotAccessRoot ? { cannotAccessRoot: true } : {}),
        };
        log(
          state,
          `${state.cards[sourceId]?.title ?? sourceId} — pending standalone breach of ${server}.`,
        );
        return { ok: true };
      }
      if (state.run.phase === "breach" || state.run.breached) {
        state.run.queuedBreachesAfterCurrent = [
          ...(state.run.queuedBreachesAfterCurrent ?? []),
          { server, ...(cannotAccessRoot ? { cannotAccessRoot: true } : {}) },
        ];
        log(
          state,
          `${state.cards[sourceId]?.title ?? sourceId} — ${server} breach waits until the current breach ends (CR ${CR.consecutiveBreaches.number}).`,
        );
        return { ok: true };
      }
      state.run.pendingNestedBreach = {
        server,
        cannotAccessRoot,
        resumeIceId: state.run.encounter?.iceId ?? sourceId,
      };
      log(
        state,
        `${state.cards[sourceId]?.title ?? sourceId} — Runner will breach ${server}${
          cannotAccessRoot ? " (cannot access root)" : ""
        } mid-encounter.`,
      );
      return { ok: true };
    }

    case "analog_dreamers_run_rd": {
      state.turn.ccAnalogDreamersRun = true;
      state.pendingStartRun = { sourceId, serverId: "rd" };
      log(state, `Analog Dreamers — run R&D.`);
      return { ok: true };
    }

    case "may_breach_instead_analog_dreamers": {
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
      if (!state.run || state.run.attackedServerId !== "rd") {
        log(state, `Analog Dreamers — not a successful R&D run.`);
        return { ok: true };
      }
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          const c = state.cards[id];
          if (!c) continue;
          if (c.rezzed) continue;
          if (c.type === "ice") continue;
          if ((c.advancementCounters ?? 0) > 0) continue;
          candidates.push(id);
        }
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "breach",
          label: "Breach R&D",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      for (const id of candidates) {
        options.push({
          id: `ad-shuffle:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into R&D`,
          effect: {
            op: "do" as const,
            action: {
              kind: "shuffle_into_rd" as const,
              cardId: id,
            },
          },
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `Analog Dreamers — may instead of breaching R&D.`,
      });
      return { ok: true };
    }

    case "access_n": {
      const amount = action.amount ?? 0;
      if (amount <= 0 || !state.run) {
        log(state, `Counter Surveillance — access 0.`);
        return { ok: true };
      }
      state.run.bonusAccess = Math.max(0, amount - 1);
      state.run.skipBreach = false;
      log(
        state,
        `Counter Surveillance — access ${amount} in/at attacked server.`,
      );
      // Re-arm breach via clearing skipBreach; host will breach normally with bonus.
      // For exact X access, set bonus so HQ/RD base+bonus ≈ amount.
      if (state.run.attackedServerId === "archives") {
        state.run.bonusAccess = amount;
      } else {
        // HQ/RD base access is 1; bonusAccess adds (amount - 1).
        state.run.bonusAccess = Math.max(0, amount - 1);
      }
      state.pendingStandaloneBreach = {
        sourceId,
        serverId: state.run.attackedServerId,
      };
      return { ok: true };
    }
    case "breach_instead_singularity_trash_root": {
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
      if (!state.run) {
        log(state, `Singularity — no active run.`);
        return { ok: true };
      }
      // The printed replacement of the breach has no "may", so it is not
      // optional (CR 6.7.4c).
      log(
        state,
        `Singularity — instead of breaching, trash all cards in the server root.`,
      );
      return evalEffect(
        ctx,
        fx.seq(
          fx.do({ kind: "set_run_skip_breach" }),
          fx.do({ kind: "trash_attacked_server_root" }),
        ),
      );
    }

    case "information_sifting_corp_split_hq": {
      // Printed: the Corp separates all cards in HQ into 2 facedown piles;
      // the Runner then chooses one pile to access (CR 1.2.1).
      if (!state.run) return { ok: true };
      state.run.skipBreach = true;
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Information Sifting — HQ empty.`);
        return { ok: true };
      }
      state.turn.tlmInfoSiftPileA = [];
      state.turn.tlmInfoSiftPileB = [];
      state.turn.tlmInfoSiftRemaining = hq;
      return offerInfoSiftAssign(ctx);
    }

    case "place_info_sift_card_continue": {
      const remaining = state.turn.tlmInfoSiftRemaining ?? [];
      const cardId = action.cardId;
      if (!remaining.includes(cardId)) return { ok: true };
      state.turn.tlmInfoSiftRemaining = remaining.filter((id) => id !== cardId);
      if (action.pile === "b") {
        state.turn.tlmInfoSiftPileB = [
          ...(state.turn.tlmInfoSiftPileB ?? []),
          cardId,
        ];
      } else {
        state.turn.tlmInfoSiftPileA = [
          ...(state.turn.tlmInfoSiftPileA ?? []),
          cardId,
        ];
      }
      log(
        state,
        `Information Sifting — ${state.cards[cardId]?.title ?? cardId} → pile ${action.pile.toUpperCase()}.`,
      );
      return offerInfoSiftAssign(ctx);
    }

    case "access_pile": {
      const pile =
        action.pile === "b"
          ? (state.turn.tlmInfoSiftPileB ?? [])
          : (state.turn.tlmInfoSiftPileA ?? []);
      state.turn.tlmInfoSiftPileA = undefined;
      state.turn.tlmInfoSiftPileB = undefined;
      if (!state.run) return { ok: true };
      state.run.accessCandidates = [...pile];
      state.run.randomAccessLimit = pile.length;
      state.run.skipBreach = false;
      log(
        state,
        `Information Sifting — access ${pile.length} card(s) from chosen pile.`,
      );
      return { ok: true };
    }

    case "choose_turning_wheel_central_bonus_access": {
      if (!state.run) {
        log(state, `The Turning Wheel — no active run.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "hq",
            label: "HQ — +1 access when breaching HQ this run",
            effect: fx.do({
              kind: "turning_wheel_set_bonus_access",
              server: "hq",
            }),
          },
          {
            id: "rd",
            label: "R&D — +1 access when breaching R&D this run",
            effect: fx.do({
              kind: "turning_wheel_set_bonus_access",
              server: "rd",
            }),
          },
        ],
      });
      return { ok: true };
    }

    case "turning_wheel_set_bonus_access": {
      if (!state.run) return { ok: true };
      const server = action.server === "rd" ? "rd" : "hq";
      state.run.tlmTurningWheelBonusServer = server;
      state.run.bonusAccess = (state.run.bonusAccess ?? 0) + 1;
      log(
        state,
        `The Turning Wheel — +1 access when breaching ${server.toUpperCase()} this run.`,
      );
      return { ok: true };
    }
    case "may_breach_instead_eden_shard": {
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
      if (!state.run || state.run.attackedServerId !== "rd")
        return { ok: true };
      const inGrip = state.runner.hand.includes(sourceId);
      if (!inGrip) {
        log(state, `Eden Shard — not in grip; breach R&D.`);
        return { ok: true };
      }
      if (
        !openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: [
            {
              id: "breach",
              label: "Breach R&D",
              effect: fx.gainCredits("runner", 0),
            },
            {
              id: "eden",
              label: "Install Eden Shard from grip ignoring all costs",
              effect: fx.do({ kind: "install_instead" }),
            },
          ],
        })
      )
        return { ok: true };
      state.run.skipBreach = true;
      return { ok: true };
    }
    default:
      return null;
  }
}
