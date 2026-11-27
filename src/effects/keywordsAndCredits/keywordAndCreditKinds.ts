/**
 * Primitive kinds for gaining, spending, paying and losing credits, and tags,
 * bad publicity, marks, charge and the other keywords. The kind registry
 * (`applyCoreKinds`) dispatches here.
 */
import {
  stealthHostedCreditsAvailable,
  takeFromStealthHostedCredits,
  subtractRunnerCreditPool,
  emptyRunnerCreditPool,
} from "../../state/keywordsAndCredits/runnerCredits.js";
import { noteCorpSpentAgendaCounters } from "../../state/keywordsAndCredits/costs.js";
import { CR } from "../../timing/labels.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import {
  offerMayChargeCard,
  evalEffect,
  type EffectCtx,
  type EvalResult,
} from "../eval.js";
import { grantAbilityCredits } from "./abilityCreditGain.js";
import {
  chargeCard,
  chargeableInstalledIds,
  offerSabotagePick,
  resolveSabotageAmount,
  identifyMark,
} from "../../state/keywordsAndCredits/keywords.js";
import { type Effect, fx, type Primitive } from "../ir.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { memoryLimit, usedMemory } from "../../state/turnAndActions/turn.js";
import { revealCards } from "../../state/visibility/reveal.js";
import { startPsiGame } from "../../state/turnAndActions/psi.js";
import { agendaPointsFor } from "../../state/turnAndActions/scoring.js";
import { startTrace } from "../../state/turnAndActions/trace.js";
import type { ServerId, GameState } from "../../state/types.js";

function iceProtectingHqCount(state: EffectCtx["state"]): number {
  return state.servers.hq?.ice.length ?? 0;
}

export function syncMauiRecurringCredits(state: EffectCtx["state"]): void {
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!card?.recurringCreditsMaxEqualsIceProtectingHq) continue;
    // Blanked Maui keeps a 0 pool (CR 9.12.1d).
    if (abilitiesSuppressed(state, id)) {
      card.recurringCreditsMax = 0;
      card.recurringCredits = 0;
      continue;
    }
    const max = iceProtectingHqCount(state);
    card.recurringCreditsMax = max;
    card.recurringCredits = max;
  }
}

function remoteServerCount(state: EffectCtx["state"]): number {
  return Object.keys(state.servers).filter((id) => id.startsWith("remote"))
    .length;
}

/** Indian Union Stock Exchange: rez/play out-of-faction → gain credits. */
export function fireSiAfterCorpRezOrPlay(
  state: GameState,
  cardId: string,
): void {
  const played = state.cards[cardId];
  if (!played) return;
  const idFaction = state.cards[state.corp.identityId]?.faction;
  for (const server of Object.values(state.servers)) {
    for (const rid of server.root) {
      const exchange = state.cards[rid];
      if (!exchange?.rezzed) continue;
      const gain = exchange.onRezOrPlayOutOfFactionGainCredits;
      if (typeof gain !== "number") continue;
      const cardFaction = played.faction;
      const isSelf = cardId === rid;
      const isOutOfFaction =
        Boolean(idFaction) && Boolean(cardFaction) && cardFaction !== idFaction;
      if (!isSelf && !isOutOfFaction) continue;
      state.corp.credits += gain;
      log(
        state,
        `${exchange.title} — rez/play ${played.title}: gain ${gain}¢.`,
      );
    }
  }
}

export function applyKeywordAndCreditKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "spend_stealth_credits": {
      const need = action.amount;
      if (need <= 0) return { ok: true };
      if (stealthHostedCreditsAvailable(state) < need) {
        return {
          ok: false,
          error: "Insufficient stealth credits.",
          cites: [CR.paidAbility],
        };
      }
      const left = takeFromStealthHostedCredits(state, need);
      if (left > 0) {
        return {
          ok: false,
          error: "Insufficient stealth credits.",
          cites: [CR.paidAbility],
        };
      }
      return { ok: true };
    }

    case "spend_enable_hosted_credits_for": {
      source.hostedCreditsSpendFor = [...action.purposes];
      log(
        state,
        `${source.title} — hosted credits spendable for ${action.purposes.join(", ")}.`,
      );
      return { ok: true };
    }

    case "may_give_runner_credits_then": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "give-credits",
            label: `Runner gains ${action.amount}¢`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "gain_credits" as const,
                    side: "runner" as const,
                    amount: action.amount,
                  },
                },
                structuredClone(action.then),
              ],
            },
          },
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
        logLine: `${source.title} — may have the Runner gain ${action.amount}¢.`,
      });
      return { ok: true };
    }

    case "dividends": {
      // CR 10.13.1 / 10.13.2 — use score-begin snapshot when present.
      const adv =
        source.scoreBeginAdvancementCounters ?? source.advancementCounters ?? 0;
      const req =
        source.scoreBeginAdvancementRequirement ??
        source.advancementRequirement ??
        0;
      const excess = Math.max(0, adv - req);
      const n = excess * action.n;
      source.agendaCounters = (source.agendaCounters ?? 0) + n;
      log(
        state,
        `Dividends ${action.n} — place ${n} agenda counter(s) (${adv}−${req}) → ${source.agendaCounters} (CR ${CR.dividends.number}).`,
      );
      return { ok: true };
    }

    case "may_charge_card": {
      return offerMayChargeCard(state, action.cardId, sourceId);
    }

    case "charge": {
      if (action.pick === "self") {
        return chargeCard(state, sourceId, sourceId);
      }
      if (action.pick === "card") {
        if (!action.cardId) {
          return {
            ok: false,
            error: "charge pick=card requires cardId.",
            cites: [CR.charge],
          };
        }
        return chargeCard(state, action.cardId, sourceId);
      }
      // choose among controller's installed chargeable cards
      const side = source.side;
      const cands = chargeableInstalledIds(state, side);
      if (cands.length === 0) {
        log(
          state,
          `Charge — no installed card with power counters (CR ${CR.chargeTargets.number}).`,
        );
        return { ok: true };
      }
      if (cands.length === 1) {
        return chargeCard(state, cands[0]!, sourceId);
      }
      openPendingChoose(state, {
        sourceId,
        chooser: side,
        options: cands.map((id) => ({
          id: `charge-${id}`,
          label: `Charge ${state.cards[id].title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "charge" as const,
              pick: "card" as const,
              cardId: id,
            },
          },
        })),
        logLine: `Charge — ${side} chooses among ${cands.length} cards (CR ${CR.chargeTargets.number}).`,
      });
      return { ok: true };
    }

    case "store_ip_enforcement_tags_removed": {
      state.turn.ipEnforcementTagsRemoved = action.amount;
      return { ok: true };
    }

    case "sabotage": {
      // The Corp chooses which HQ cards go (CR 10.12.2). With nothing in
      // HQ, or fewer than N cards in HQ and R&D together (CR 10.12.3b),
      // there is nothing to choose.
      const total = state.corp.hand.length + state.corp.deck.length;
      const forced =
        action.amount <= 0 ||
        state.corp.hand.length === 0 ||
        total < action.amount;
      if (action.interactive || !forced) {
        state.pendingSabotage = { sourceId, amount: action.amount, picked: [] };
        log(
          state,
          `Sabotage ${action.amount} pending — Corp chooses HQ cards (CR ${CR.sabotageResolution.number}).`,
        );
        offerSabotagePick(state);
        return { ok: true };
      }
      return resolveSabotageAmount(state, sourceId, action.amount);
    }

    case "identify_mark": {
      identifyMark(state, sourceId);
      return { ok: true };
    }

    case "fully_operational_step": {
      const remaining = Math.max(0, action.remaining ?? 0);
      if (remaining <= 0) return { ok: true };
      const nextRemaining = remaining - 1;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: `fo-gain:${remaining}`,
            label: "Gain 2¢",
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "gain_credits" as const,
                    side: "corp" as const,
                    amount: 2,
                  },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "fully_operational_step" as const,
                    remaining: nextRemaining,
                  },
                },
              ],
            },
          },
          {
            id: `fo-draw:${remaining}`,
            label: "Draw 2 cards",
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "draw" as const,
                    side: "corp" as const,
                    amount: 2,
                  },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "fully_operational_step" as const,
                    remaining: nextRemaining,
                  },
                },
              ],
            },
          },
        ],
        logLine: `${source.title} — choose gain 2¢ or draw 2 (${remaining} remaining).`,
      });
      return { ok: true };
    }

    case "may_take_bad_publicity_then_add_agenda_counters_equal_to_bad_publicity": {
      const amount = Math.max(0, action.amount);
      const continueFx: Effect = {
        op: "do",
        action: { kind: "add_agenda_counters_equal_to_bad_publicity" },
      };
      if (amount <= 0) return evalEffect(ctx, continueFx);
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "take-bp",
            label: `Take ${amount} bad publicity`,
            effect: {
              op: "seq",
              effects: [
                {
                  op: "do",
                  action: { kind: "give_bad_publicity", amount },
                },
                continueFx,
              ],
            },
          },
          {
            id: "decline-bp",
            label: "Decline",
            effect: continueFx,
          },
        ],
        logLine: `${source.title} — may take ${amount} bad publicity, then place agenda counters equal to bad publicity.`,
      });
      return { ok: true };
    }
    case "resolve_diversion_of_funds": {
      if (state.run) state.run.skipBreach = true;
      const lose = Math.min(action.loseAmount, state.corp.credits);
      state.corp.credits -= lose;
      state.runner.credits += lose;
      log(
        state,
        `Diversion of Funds — Corp loses ${lose}¢; Runner gains ${lose}¢.`,
      );
      return { ok: true };
    }

    case "ka_market_forces": {
      const tags = state.runner.tags;
      const want = tags * 3;
      const lost = Math.min(want, state.runner.credits);
      subtractRunnerCreditPool(state, lost);
      state.corp.credits += lost;
      log(
        state,
        `Market Forces — Runner loses ${lost}¢ (${tags} tag(s) × 3); Corp gains ${lost}¢.`,
      );
      return { ok: true };
    }

    case "give_tags_per_two_advancements": {
      const adv = source?.advancementCounters ?? 0;
      const amount = Math.floor(adv / 2);
      if (amount <= 0) {
        log(state, `False Flag — 0 tags (advancements=${adv}).`);
        return { ok: true };
      }
      return evalEffect(ctx, fx.do({ kind: "give_tags", amount }));
    }
    case "pay_shattered_remains": {
      const n = (action as { hardwareCount: number }).hardwareCount;
      if (state.corp.credits < 1) {
        return {
          ok: false,
          error: "Cannot pay 1¢ for Shattered Remains.",
          cites: [],
        };
      }
      state.corp.credits -= 1;
      const hw = state.runner.installed.filter(
        (id) => state.cards[id]?.type === "hardware",
      );
      for (let i = 0; i < n && hw.length > 0; i++) {
        const id = hw.shift()!;
        trashCard(state, id);
        log(state, `Shattered Remains — trash ${state.cards[id]!.title}.`);
      }
      return { ok: true };
    }
    case "lawyer_up": {
      const max = Math.min(2, state.runner.tags);
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (let n = 0; n <= max; n++) {
        options.push({
          id: `lawyer-tags-${n}`,
          label: n === 0 ? "Remove 0 tags" : `Remove ${n} tag(s)`,
          effect: fx.seq(
            fx.do({ kind: "remove_tags", amount: n }),
            fx.draw("runner", 3),
          ),
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `Lawyer Up — remove up to ${max} tag(s), draw 3.`,
      });
      return { ok: true };
    }
    case "remove_bad_publicity_up_to": {
      const max = action.max ?? 0;
      const have = state.corp.badPublicity ?? 0;
      const cap = Math.min(max, have);
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (let n = 0; n <= cap; n++) {
        options.push({
          id: `rbp-${n}`,
          label: `Remove ${n} bad publicity`,
          effect: fx.do({ kind: "remove_bad_publicity", amount: n }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }
    case "jarogniew_load_power_equal_tags_plus_3": {
      const source = state.cards[sourceId];
      if (!source) return { ok: true };
      const n = (state.runner.tags ?? 0) + 3;
      source.powerCounters = n;
      log(state, `${source.title} — load ${n} power (tags+3).`);
      return { ok: true };
    }

    case "may_gain_7_or_7_meat_if_tagged": {
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "gain7",
          label: "Gain 7¢",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 7 }),
        },
        {
          id: "decline",
          label: "Decline",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        },
      ];
      if ((state.runner.tags ?? 0) >= 2) {
        options.unshift({
          id: "meat7",
          label: "Do 7 meat damage (instead of gaining 7¢)",
          effect: fx.do({ kind: "meat_damage", amount: 7 }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "choose_x_and_load_power": {
      const source = state.cards[sourceId];
      if (!source) return { ok: true };
      const max = state.runner.credits;
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let x = 0; x <= max; x++) {
        options.push({
          id: `x:${x}`,
          label: `Pay ${x}¢: place ${x} power`,
          effect: fx.do({ kind: "bug_out_bag_load_power", amount: x }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "bug_out_bag_load_power": {
      const source = state.cards[sourceId];
      const amount = Math.max(0, action.amount ?? 0);
      if (!source) return { ok: true };
      if (state.runner.credits < amount) {
        return {
          ok: false,
          error: "Not enough credits for Bug-Out Bag X.",
          cites: [],
        };
      }
      subtractRunnerCreditPool(state, amount);
      source.powerCounters = amount;
      log(
        state,
        `Bug-Out Bag — pay ${amount}¢, load ${amount} power → ${state.runner.credits}¢.`,
      );
      return { ok: true };
    }

    case "tag_or_end_the_run": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "tag",
            label: "Take 1 tag",
            effect: fx.do({ kind: "give_tags", amount: 1 }),
          },
          {
            id: "etr",
            label: "End the run",
            effect: fx.etr(),
          },
        ],
      });
      return { ok: true };
    }

    case "take_any_hosted_credits": {
      const hosted = source?.hostedCredits ?? 0;
      if (!source || hosted < 8) {
        log(state, `Long-Term Investment — need ≥8 hosted credits.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 1; n <= hosted; n++) {
        options.push({
          id: `take:${n}`,
          label: `Take ${n}¢`,
          effect: fx.do({ kind: "take_hosted_credits", amount: n }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }
    case "refresh_khondi_plaza_recurring": {
      if (!source.recurringCreditsMaxEqualsRemoteServers) {
        return { ok: true };
      }
      // Blanked Khondi keeps a 0 pool (CR 9.12.1d).
      if (abilitiesSuppressed(state, sourceId)) {
        source.recurringCreditsMax = 0;
        source.recurringCredits = 0;
        return { ok: true };
      }
      const n = remoteServerCount(state);
      source.recurringCreditsMax = n;
      source.recurringCredits = n;
      log(
        state,
        `Khondi Plaza — recurring credits set to ${n} (remote servers).`,
      );
      return { ok: true };
    }
    case "o2_shortage_runner_may_trash_random_grip_or_corp_gains_clicks": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "o2-trash",
            label: "Trash 1 card from grip at random",
            effect: fx.do({ kind: "trash_shortage_random_grip" }),
          },
          {
            id: "o2-decline",
            label: "Decline (Corp gains [click][click])",
            effect: fx.do({ kind: "o2_shortage_corp_gains_clicks" }),
          },
        ],
      });
      return { ok: true };
    }

    case "o2_shortage_corp_gains_clicks": {
      state.corp.clicks = (state.corp.clicks ?? 0) + 2;
      log(
        state,
        `O₂ Shortage — Corp gains [click][click] → ${state.corp.clicks}.`,
      );
      return { ok: true };
    }

    case "choose_type": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: (["resource", "hardware", "program"] as const).map((t) => ({
          id: `br:${t}`,
          label: `Choose ${t}`,
          effect: fx.do({ kind: "resolve_biased_reporting", cardType: t }),
        })),
      });
      return { ok: true };
    }

    case "resolve_biased_reporting": {
      const t = action.cardType;
      const installed = state.runner.installed.filter(
        (id) => state.cards[id]?.type === t,
      );
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "br:trash-none",
            label: "Trash none",
            effect: fx.do({
              kind: "corp_gain",
              cardType: t,
              trashed: [],
            }),
          },
          ...installed.map((id) => ({
            id: `br:trash:${id}`,
            label: `Trash ${state.cards[id]?.title ?? id} (and continue)`,
            effect: fx.do({
              kind: "runner_trash_continue",
              cardType: t,
              trashed: [id],
              remaining: installed.filter((x) => x !== id),
            }),
          })),
        ],
      });
      return { ok: true };
    }

    case "corp_gain": {
      const t = action.cardType;
      const remaining = state.runner.installed.filter(
        (id) => state.cards[id]?.type === t,
      ).length;
      const gainAmt = remaining * 2;
      state.corp.credits += gainAmt;
      log(
        state,
        `Biased Reporting — Corp gains ${gainAmt}¢ (${remaining} ${t}(s) remain) → ${state.corp.credits}¢.`,
      );
      return { ok: true };
    }
    case "gain_credits_equal_to_last_purged_viruses": {
      const n = state.turn.lastVirusCountersPurged ?? 0;
      state.runner.credits += n;
      log(
        state,
        `${source?.title ?? "Acacia"} — gain ${n}¢ (virus counters purged) → ${state.runner.credits}¢.`,
      );
      return { ok: true };
    }
    case "gain_credits_equal_to_runner_credits": {
      const n = state.runner.credits;
      return grantAbilityCredits(ctx, "corp", n);
    }

    case "mark_yale_spend_any_agenda_counter_gain_2": {
      const cands = [
        ...state.corp.scoreArea,
        ...Object.values(state.cards)
          .filter(
            (c) =>
              c.side === "corp" &&
              (c.agendaCounters ?? 0) > 0 &&
              c.zone.startsWith("server:"),
          )
          .map((c) => c.id),
      ].filter((id) => (state.cards[id]?.agendaCounters ?? 0) > 0);
      if (cands.length === 0) {
        log(state, `Mark Yale — no agenda counters.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `yale:${id}`,
          label: `Spend agenda counter on ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "mark_yale_spend_counter_on", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "mark_yale_spend_counter_on": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || (card.agendaCounters ?? 0) < 1) {
        return { ok: false, error: "No agenda counter to spend.", cites: [] };
      }
      card.agendaCounters = (card.agendaCounters ?? 0) - 1;
      state.corp.credits += 2;
      noteCorpSpentAgendaCounters(state, 1);
      log(state, `Mark Yale — spend agenda counter on ${card.title}; gain 2¢.`);
      return { ok: true };
    }

    case "gain_credits_equal_to_agenda_points_of_trigger": {
      const agendaId = (state.turn as { lastScoredOrStolenAgendaId?: string })
        .lastScoredOrStolenAgendaId;
      const pts = agendaId ? (state.cards[agendaId]?.agendaPoints ?? 0) : 0;
      return grantAbilityCredits(ctx, "runner", pts);
    }

    case "lose_qianju_click_prevent_tag_until_next_turn": {
      if (state.runner.clicks < 1) {
        log(state, `Qianju PT — no click to lose.`);
        return { ok: true };
      }
      state.runner.clicks -= 1;
      (
        state.runner as { qianjuPreventTagUntilNextTurn?: boolean }
      ).qianjuPreventTagUntilNextTurn = true;
      log(state, `Qianju PT — lose [click]; prevent 1 tag until next turn.`);
      return { ok: true };
    }

    case "gain_if_unused_mu_gte": {
      const threshold = (action as { threshold: number }).threshold;
      const amount = (action as { amount: number }).amount;
      const unused = memoryLimit(state) - usedMemory(state);
      if (unused >= threshold) {
        state.runner.credits += amount;
        log(state, `Data Folding — gain ${amount}¢ (${unused} unused MU).`);
      }
      return { ok: true };
    }
    case "give_bad_publicity_unless_corp_pays": {
      const amount = action.amount ?? 1;
      const credits = action.credits ?? 5;
      const options: { id: string; label: string; effect: Effect }[] = [];
      if (state.corp.credits >= credits) {
        options.push({
          id: "pay",
          label: `Pay ${credits}¢ to prevent`,
          effect: fx.do({
            kind: "corp_pay_credits_to_prevent",
            amount: credits,
          }),
        });
      }
      options.push({
        id: "take-bp",
        label: `Take ${amount} bad publicity`,
        effect: fx.do({ kind: "give_bad_publicity", amount }),
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `${source?.title ?? "Mining Accident"} — Corp may pay ${credits}¢ or take ${amount} bad publicity.`,
      });
      return { ok: true };
    }

    case "corp_pay_credits_to_prevent": {
      const n = Math.min(action.amount ?? 0, state.corp.credits);
      state.corp.credits -= n;
      log(state, `Corp pays ${n}¢ → ${state.corp.credits}¢.`);
      return { ok: true };
    }

    case "give_tags_equal_to_runner_tags_min_1": {
      const n = Math.max(1, state.runner.tags ?? 0);
      state.runner.tags = (state.runner.tags ?? 0) + n;
      state.turn.tagsGivenThisTurn = (state.turn.tagsGivenThisTurn ?? 0) + n;
      log(
        state,
        `${source?.title ?? "Threat Level Alpha"} — give ${n} tag(s) → ${state.runner.tags}.`,
      );
      return { ok: true };
    }
    case "may_spend_voting_machine_lose_click": {
      if (!source) return { ok: true };
      const counters = source.agendaCounters ?? 0;
      if (counters < 1) {
        log(state, `Voting Machine Initiative — no agenda counters.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "vmi:spend",
            label: "Spend 1 agenda counter: Runner loses [click], if able",
            effect: fx.do({ kind: "spend_voting_machine_lose_click" }),
          },
          {
            id: "vmi:decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "spend_voting_machine_lose_click": {
      if (!source) return { ok: true };
      const counters = source.agendaCounters ?? 0;
      if (counters < 1) return { ok: true };
      source.agendaCounters = counters - 1;
      if (state.runner.clicks > 0) {
        state.runner.clicks -= 1;
        log(
          state,
          `Voting Machine Initiative — spend counter; Runner loses [click] → ${state.runner.clicks}.`,
        );
      } else {
        log(
          state,
          `Voting Machine Initiative — spend counter; Runner has no click to lose.`,
        );
      }
      return { ok: true };
    }
    case "gain_credits_if_runner_has_installed_subtype": {
      const subtype = (action.subtype ?? "ai").toLowerCase();
      const amount = action.amount ?? 2;
      const side = action.side ?? "corp";
      const has = state.runner.installed.some((id) =>
        (state.cards[id]?.subtypes ?? [])
          .map((s) => s.toLowerCase())
          .includes(subtype),
      );
      if (!has) {
        log(
          state,
          `${source?.title ?? "Bulwark"} — no installed ${subtype} program.`,
        );
        return { ok: true };
      }
      return grantAbilityCredits(ctx, side, amount);
    }

    case "cotc_azmari_name_card_type": {
      const types = ["event", "hardware", "program", "resource"];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: types.map((t) => ({
          id: `azmari:${t}`,
          label: `Name ${t}`,
          effect: fx.do({ kind: "cotc_azmari_set_named_type", cardType: t }),
        })),
      });
      return { ok: true };
    }

    case "cotc_azmari_set_named_type": {
      const cardType = (action as { cardType: string }).cardType;
      // Printed text pays on "the type you last named this way" — the name
      // persists across turns until renamed, so it lives on the identity
      // instance, not turn bookkeeping (which resets each turn).
      if (source) source.azmariNamedType = cardType;
      state.turn.cotcAzmariNamedTypeFired = false;
      log(state, `${source?.title ?? "Azmari EdTech"} — name ${cardType}.`);
      return { ok: true };
    }

    case "gain_personalized_portal": {
      const grip = state.runner.hand.length;
      const n = Math.floor(grip / 2);
      state.corp.credits += n;
      log(
        state,
        `${source?.title ?? "Personalized Portal"} — gain ${n}¢ (${grip} in grip).`,
      );
      return { ok: true };
    }

    case "gain_reality_threedee_credits": {
      const tagged = (state.runner.tags ?? 0) > 0;
      const amount = tagged ? 2 : 1;
      state.corp.credits += amount;
      log(
        state,
        `Reality Threedee — gain ${amount}¢ (${tagged ? "tagged" : "untagged"}).`,
      );
      return { ok: true };
    }

    case "remove_bad_publicity_instead": {
      state.corp.badPublicity = Math.max(
        0,
        (state.corp.badPublicity ?? 0) - action.amount,
      );
      log(state, `Remove ${action.amount} bad publicity.`);
      return { ok: true };
    }
    case "gain_credits_per_corp_credits": {
      const gainAmt = Math.floor((state.corp.credits ?? 0) / 5);
      if (gainAmt <= 0) {
        log(state, `Tapwrm — Corp has <5¢; gain 0.`);
        return { ok: true };
      }
      state.runner.credits += gainAmt;
      log(
        state,
        `Tapwrm — gain ${gainAmt}¢ (Corp has ${state.corp.credits}¢).`,
      );
      return { ok: true };
    }
    case "universal_connectivity_fee_sub": {
      if (state.runner.tags > 0) {
        emptyRunnerCreditPool(state);
        log(state, `UCF — tagged Runner loses all credits; trash ice.`);
        if (source?.type === "ice") {
          // The ice's own subroutine trashes it (CR 1.14.5); the encounter
          // then ends (CR 6.2.7c).
          trashCard(state, sourceId, { by: "corp" });
        }
      } else if (state.runner.credits > 0) {
        subtractRunnerCreditPool(state, 1);
        log(state, `UCF — Runner loses 1¢.`);
      }
      return { ok: true };
    }
    case "corp_lose_two_if_can": {
      if (state.corp.credits >= 2) {
        state.corp.credits -= 2;
        log(state, `Fester — Corp loses 2¢.`);
      }
      return { ok: true };
    }

    case "net_mercur_place_or_draw": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "place",
            label: "Place 1¢ on Net Mercur",
            effect: fx.do({ kind: "net_mercur_place_credit" }),
          },
          {
            id: "draw",
            label: "Draw 1 card",
            effect: fx.do({ kind: "draw", side: "runner", amount: 1 }),
          },
        ],
      });
      return { ok: true };
    }

    case "net_mercur_place_credit": {
      source.hostedCredits = (source.hostedCredits ?? 0) + 1;
      log(state, `Net Mercur — place 1¢ → ${source.hostedCredits} hosted.`);
      return { ok: true };
    }
    case "pay_419": {
      const credits = (action as { credits?: number }).credits ?? 1;
      if (state.corp.credits < credits) {
        return {
          ok: false,
          error: `Corp cannot pay ${credits}¢.`,
          cites: [],
        };
      }
      state.corp.credits -= credits;
      log(
        state,
        `419 — Corp pays ${credits}¢ to prevent expose → ${state.corp.credits}¢.`,
      );
      return { ok: true };
    }

    case "win_jackpot_place_credit": {
      if (!source) return { ok: true };
      source.hostedCredits = (source.hostedCredits ?? 0) + 1;
      log(state, `Jackpot! — place 1¢ → ${source.hostedCredits}.`);
      return { ok: true };
    }

    case "win_jackpot_take_credits": {
      if (!source) return { ok: true };
      const n = source.hostedCredits ?? 0;
      if (n <= 0) {
        log(state, `Jackpot! — no credits.`);
        return { ok: true };
      }
      // Printed: "take any number of credits from Jackpot!. If you do,
      // trash Jackpot!" — the Runner chooses how many.
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: Array.from({ length: n }, (_, i) => i + 1).map((x) => ({
          id: `jackpot-take:${x}`,
          label: `Take ${x}¢ from Jackpot! and trash it`,
          effect: fx.do({ kind: "take_jackpot_credits_resolve", amount: x }),
        })),
      });
      return { ok: true };
    }

    case "take_jackpot_credits_resolve": {
      if (!source) return { ok: true };
      const take = Math.min(action.amount, source.hostedCredits ?? 0);
      if (take <= 0) return { ok: true };
      state.runner.credits += take;
      source.hostedCredits = 0;
      trashCard(state, sourceId);
      log(state, `Jackpot! — take ${take}¢ and trash.`);
      return { ok: true };
    }

    case "win_standard_procedure": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: ["event", "hardware", "program", "resource", "identity"].map(
          (t) => ({
            id: `sp:${t}`,
            label: `Name ${t}`,
            effect: fx.do({
              kind: "win_standard_procedure_named",
              cardType: t,
            }),
          }),
        ),
      });
      return { ok: true };
    }

    case "win_standard_procedure_named": {
      let n = 0;
      for (const id of state.runner.hand) {
        const c = state.cards[id];
        if (c?.type === action.cardType) n += 1;
        if (c) revealCards(state, [c.id], sourceId);
        log(state, `Standard Procedure — reveal ${c.title}.`);
      }
      const gainAmt = n * 2;
      state.corp.credits += gainAmt;
      log(
        state,
        `Standard Procedure — gain ${gainAmt}¢ (${n} ${action.cardType}).`,
      );
      return { ok: true };
    }
    case "spend_rigged_results_secret_guess": {
      // Psi-style: Runner bid 0–2; Corp guesses. Differ → choose ice + run + bypass.
      startPsiGame(
        state,
        sourceId,
        2,
        fx.do({ kind: "rigged_results_corp_guessed_wrong" }),
        fx.do({ kind: "rigged_results_corp_guessed_right" }),
        { corpGuess: "amount" }, // Corp guesses the amount; spends nothing
      );
      return { ok: true };
    }

    case "give_tag_remove_if_successful": {
      // Bandwidth: the tag goes through the tag procedure, so prevention
      // and avoidance apply to it (CR 9.9.6a). "If this run is successful,
      // the Runner removes 1 tag" is a separate instruction and does not
      // depend on the tag being taken.
      if (state.run) {
        state.run.bandwidthTagsToRemoveOnSuccess =
          (state.run.bandwidthTagsToRemoveOnSuccess ?? 0) + 1;
      }
      log(state, `Bandwidth — give Runner 1 tag (remove 1 if run successful).`);
      return evalEffect(ctx, fx.do({ kind: "give_tags", amount: 1 }));
    }
    case "sealed_vault_store_from_pool": {
      // Printed: move *any number* of credits from the pool to this asset.
      const pool = state.corp.credits;
      if (pool <= 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: Array.from({ length: pool }, (_, i) => i + 1).map((n) => ({
          id: `sealed-store:${n}`,
          label: `Store ${n}¢ on Sealed Vault`,
          effect: fx.do({ kind: "move_credits_to_sealed_vault", amount: n }),
        })),
      });
      return { ok: true };
    }
    case "move_credits_to_sealed_vault": {
      const card = state.cards[sourceId];
      const n = Math.min(action.amount ?? 0, state.corp.credits);
      if (!card || n <= 0) return { ok: true };
      state.corp.credits -= n;
      card.hostedCredits = (card.hostedCredits ?? 0) + n;
      log(state, `Sealed Vault — store ${n}¢ → ${card.hostedCredits}.`);
      return { ok: true };
    }
    case "take_to_pool": {
      // Printed: take *any number* of credits from this asset.
      const card = state.cards[sourceId];
      const hosted = card?.hostedCredits ?? 0;
      if (!card || hosted <= 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: Array.from({ length: hosted }, (_, i) => i + 1).map((n) => ({
          id: `sealed-take:${n}`,
          label: `Take ${n}¢ from Sealed Vault`,
          effect: fx.do({ kind: "move_credits_from_sealed_vault", amount: n }),
        })),
      });
      return { ok: true };
    }
    case "move_credits_from_sealed_vault": {
      const card = state.cards[sourceId];
      const n = Math.min(action.amount ?? 0, card?.hostedCredits ?? 0);
      if (!card || n <= 0) return { ok: true };
      card.hostedCredits = (card.hostedCredits ?? 0) - n;
      state.corp.credits += n;
      log(
        state,
        `Sealed Vault — take ${n}¢ to pool (${card.hostedCredits} hosted).`,
      );
      return { ok: true };
    }
    case "three_steps_ahead_payout": {
      // Per successful run, not per distinct server (printed text).
      const runs = state.turn.successfulRunCountThisTurn ?? 0;
      const gain = runs * 2;
      if (gain > 0) {
        state.runner.credits += gain;
        log(
          state,
          `Three Steps Ahead — gain ${gain}¢ (${runs} successful runs).`,
        );
      }
      return { ok: true };
    }
    case "mo_slot_machine_if_shared_type_gte": {
      const have = state.run?.encounterSlotMachineSharedTypeMax ?? 0;
      if (have < action.threshold) {
        log(
          state,
          `Slot Machine — shared-type max ${have} < ${action.threshold}; skip.`,
        );
        return { ok: true };
      }
      return evalEffect(ctx, action.then);
    }

    case "spend_x_remove_tags": {
      const tags = state.runner.tags;
      const credits = state.runner.credits;
      if (tags <= 0 || credits <= 0) {
        log(state, `Misdirection — no tags or credits.`);
        return { ok: true };
      }
      const maxX = Math.min(tags, credits);
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let x = 1; x <= maxX; x++) {
        options.push({
          id: `misdirection-x:${x}`,
          label: `Spend ${x}¢: remove ${x} tag(s)`,
          effect: fx.do({
            kind: "spend_x_remove_tags_resolve",
            amount: x,
          }),
        });
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      });
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "spend_x_remove_tags_resolve": {
      const x = action.amount ?? 0;
      if (x <= 0 || state.runner.credits < x) {
        log(state, `Misdirection — cannot afford ${x}¢.`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, x);
      const removed = Math.min(x, state.runner.tags);
      state.runner.tags -= removed;
      log(
        state,
        `Misdirection — spend ${x}¢ → remove ${removed} tag(s) (${state.runner.tags} remain).`,
      );
      return { ok: true };
    }

    case "give_tags_if_runner_has_installed_subtype": {
      const subtype = (action.subtype ?? "ai").toLowerCase();
      const amount = action.amount ?? 1;
      const has = state.runner.installed.some((id) =>
        (state.cards[id]?.subtypes ?? [])
          .map((s) => s.toLowerCase())
          .includes(subtype),
      );
      if (!has) {
        log(state, `IP Block — no installed ${subtype}; no tag.`);
        return { ok: true };
      }
      return evalEffect(ctx, fx.do({ kind: "give_tags", amount }));
    }
    case "corp_gain_iain_if_ahead_on_agenda": {
      const corp = agendaPointsFor(state, "corp");
      const run = agendaPointsFor(state, "runner");
      if (corp > run) {
        state.runner.credits += 2;
        log(state, `Iain Stirling — gain 2¢ (Corp ahead on agenda).`);
      }
      return { ok: true };
    }
    case "spend_push_your_luck_secret_guess": {
      // Printed: Runner secretly spends any number of credits; the Corp
      // guesses even or odd. Wrong guess → Runner gains twice the spend.
      // The Corp's psi bid is a parity guess (0=even, 1=odd), not a spend.
      startPsiGame(
        state,
        sourceId,
        999,
        fx.do({ kind: "gain_credits_twice_secret_spend" }),
        fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
        { corpGuess: "parity" },
      );
      return { ok: true };
    }
    case "gain_credits_twice_secret_spend": {
      const spent = state.turn.lastRevealedRunnerSecretSpend ?? 0;
      state.runner.credits += 2 * spent;
      log(state, `Push Your Luck — Corp guessed wrong; gain ${2 * spent}¢.`);
      return { ok: true };
    }
    case "corp_pay_credits": {
      const n = Math.min(action.amount ?? 0, state.corp.credits);
      state.corp.credits -= n;
      return { ok: true };
    }
    case "runner_pay_credits": {
      const n = Math.min(action.amount ?? 0, state.runner.credits);
      subtractRunnerCreditPool(state, n);
      return { ok: true };
    }

    case "may_move_up_to_credits_from_pool_to_self": {
      const max = action.amount ?? 3;
      const side = source.side;
      const pool = side === "corp" ? state.corp : state.runner;
      const available = Math.min(max, pool.credits);
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "decline",
          label: "Decline",
          effect: fx.do({ kind: "gain_credits", side, amount: 0 }),
        },
      ];
      for (let n = 1; n <= available; n++) {
        options.push({
          id: `move:${n}`,
          label: `Move ${n}¢ onto ${source.title}`,
          effect: fx.do({
            kind: "move_credits_from_pool_to_self_resolve",
            amount: n,
          }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: side, options });
      return { ok: true };
    }

    case "move_credits_from_pool_to_self_resolve": {
      const n = action.amount ?? 0;
      const side = source.side;
      const pool = side === "corp" ? state.corp : state.runner;
      const taken = Math.min(n, pool.credits);
      pool.credits -= taken;
      source.hostedCredits = (source.hostedCredits ?? 0) + taken;
      log(
        state,
        `Move ${taken}¢ from ${side} pool onto ${source.title} → ${source.hostedCredits}.`,
      );
      return { ok: true };
    }

    case "beth_kilrain_corp_credit_tiers": {
      const c = state.corp.credits;
      if (c >= 5 && c <= 9) {
        return evalEffect(
          ctx,
          fx.do({ kind: "gain_credits", side: "runner", amount: 1 }),
        );
      }
      if (c >= 10 && c <= 14) {
        return evalEffect(
          ctx,
          fx.do({ kind: "draw", side: "runner", amount: 1 }),
        );
      }
      if (c >= 15) {
        state.runner.clicks += 1;
        log(state, `Beth Kilrain-Chang — Corp ≥15¢: gain [click].`);
        return { ok: true };
      }
      log(state, `Beth Kilrain-Chang — Corp ${c}¢: no effect.`);
      return { ok: true };
    }

    case "lose_2_per_resource_or_trash": {
      const resources = state.runner.installed.filter(
        (id) => state.cards[id]?.type === "resource",
      );
      const lose = resources.length * 2;
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "lose",
          label: `Lose ${lose}¢ (${resources.length} resources × 2)`,
          effect: fx.do({
            kind: "lose_credits",
            side: "runner",
            amount: lose,
          }),
        },
      ];
      for (const id of resources) {
        options.push({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title} to prevent`,
          effect: fx.do({
            kind: "trash_installed_runner_card",
            cardId: id,
          }),
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `Financial Collapse — Runner loses ${lose}¢ or trashes a resource to prevent.`,
      });
      return { ok: true };
    }
    case "pay_or_trash_top_stack": {
      const options: { id: string; label: string; effect: Effect }[] = [];
      if (state.runner.credits >= 1) {
        options.push({
          id: "pay",
          label: "Pay 1¢",
          effect: fx.do({ kind: "lose_credits", side: "runner", amount: 1 }),
        });
      }
      options.push({
        id: "trash-top",
        label: "Trash the top card of the stack",
        effect: fx.do({ kind: "trash_top_of_stack" }),
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `Clyde Van Rite — Runner must pay 1¢ or trash top of stack.`,
      });
      return { ok: true };
    }

    case "remove_bp_equal_forfeited_ap_gain_credits": {
      const x = Math.min(
        state.lastForfeitedAgendaPoints ?? 0,
        state.corp.badPublicity ?? 0,
      );
      if (x > 0) {
        state.corp.badPublicity = (state.corp.badPublicity ?? 0) - x;
        state.corp.credits += x;
        log(state, `Sacrifice — remove ${x} bad publicity; gain ${x}¢.`);
      } else {
        log(state, `Sacrifice — no bad publicity to remove.`);
      }
      return { ok: true };
    }
    case "force_trace_then_gain_credits": {
      startTrace(
        state,
        sourceId,
        0,
        fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
        fx.do({
          kind: "gain_credits_equal_to_agenda_points_both_score_areas",
          side: "runner",
        }),
      );
      log(state, `Another Day, Another Paycheck — force Corp Trace[0].`);
      return { ok: true };
    }

    case "gain_credits_equal_to_agenda_points_both_score_areas": {
      let ap = 0;
      for (const id of [...state.runner.scoreArea, ...state.corp.scoreArea]) {
        ap += state.cards[id]?.agendaPoints ?? 0;
      }
      const side = action.side ?? "runner";
      return grantAbilityCredits(ctx, side, ap);
    }

    case "resolve_two": {
      const effects: { id: string; label: string; effect: Effect }[] = [
        {
          id: "gain3",
          label: "Gain 3¢",
          effect: fx.do({ kind: "gain_credits", side: "runner", amount: 3 }),
        },
        {
          id: "draw2",
          label: "Draw 2 cards",
          effect: fx.do({ kind: "draw", side: "runner", amount: 2 }),
        },
        {
          id: "untag",
          label: "Remove 1 tag",
          effect: fx.do({ kind: "remove_tags", amount: 1 }),
        },
        {
          id: "expose-run",
          label: "Expose 1 ice, then make a run",
          effect: fx.do({ kind: "expose_then_run" }),
        },
      ];
      const pairs: { id: string; label: string; effect: Effect }[] = [];
      for (let i = 0; i < effects.length; i++) {
        for (let j = 0; j < effects.length; j++) {
          if (i === j) continue;
          const a = effects[i]!;
          const b = effects[j]!;
          pairs.push({
            id: `deuces:${a.id}+${b.id}`,
            label: `${a.label}; then ${b.label}`,
            effect: { op: "seq", effects: [a.effect, b.effect] },
          });
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: pairs,
      });
      return { ok: true };
    }

    case "pay_credits_or_trash_installed": {
      const amount = action.amount ?? 1;
      const side = action.side ?? "runner";
      const credits =
        side === "runner" ? state.runner.credits : state.corp.credits;
      const installed = side === "runner" ? state.runner.installed.length : 0;
      const options: { id: string; label: string; effect: Effect }[] = [];
      if (credits >= amount) {
        options.push({
          id: "pay",
          label: `Pay ${amount}¢`,
          effect: fx.do({ kind: "lose_credits", side, amount }),
        });
      }
      if (installed > 0) {
        options.push({
          id: "trash",
          label: "Trash 1 installed card",
          effect: fx.do({ kind: "runner_trashes_one_installed" }),
        });
      }
      if (options.length === 0) {
        log(
          state,
          `No way to pay ${amount}¢ or trash an installed card (CR ${CR.mustChoice.number}).`,
        );
        return { ok: true };
      }
      if (options.length === 1) {
        return evalEffect(ctx, options[0]!.effect);
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
      });
      return { ok: true };
    }
    case "tallie_perrault_on_ops_trashed": {
      // Printed text is a "may": the Runner chooses.
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "tallie-apply",
            label: "Give the Corp 1 bad publicity and take 1 tag",
            effect: fx.do({ kind: "give_bad_publicity_and_tag" }),
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
    case "give_bad_publicity_and_tag": {
      state.corp.badPublicity = (state.corp.badPublicity ?? 0) + 1;
      state.runner.tags = (state.runner.tags ?? 0) + 1;
      log(
        state,
        `Tallie Perrault — Corp takes 1 bad publicity; Runner takes 1 tag.`,
      );
      return { ok: true };
    }
    case "spend_caprice_nisei_secret": {
      // Printed: both players secretly spend 0, 1, or 2 credits; if they
      // spent a different number, end the run. (No advancement condition.)
      if (!state.run) {
        log(state, `Caprice Nisei — no run.`);
        return { ok: true };
      }
      const noop: Effect = {
        op: "do",
        action: { kind: "gain_credits", side: "corp", amount: 0 },
      };
      startPsiGame(state, sourceId, 2, fx.do({ kind: "end_the_run" }), noop);
      log(state, `Caprice Nisei — secret spend / psi.`);
      return { ok: true };
    }
    case "lose_nasir_all_credits": {
      emptyRunnerCreditPool(state);
      log(state, `Nasir Meidan — Runner loses all credits in pool.`);
      // "Gain credits equal to the rez cost of that ice": the ice being
      // encountered. Its printed rez cost: the rez procedure's modified
      // value is not exposed outside a rez yet (area 7).
      const iceId = state.run?.encounter?.iceId;
      const gain = iceId ? (state.cards[iceId]?.rezCost ?? 0) : 0;
      if (gain > 0) {
        state.runner.credits += gain;
        log(state, `Nasir Meidan — Runner gains ${gain}¢.`);
      }
      return { ok: true };
    }
    default:
      return null;
  }
}

export function applyKeywordAndCreditKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "gain_arm_credits_on_first_agenda_access": {
      state.turn.uotFirstAgendaAccessCredits = action.amount;
      log(
        state,
        `${source.title} — first agenda access this turn gains ${action.amount}¢.`,
      );
      return { ok: true };
    }

    case "gain_if_rezzed_asset_in_root": {
      // Find server hosting this upgrade
      let serverId: ServerId | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.root.includes(sourceId)) {
          serverId = sid as ServerId;
          break;
        }
      }
      if (!serverId) return { ok: true };
      const root = state.servers[serverId]!.root;
      const hasRezzedAsset = root.some((id) => {
        const c = state.cards[id];
        return c?.rezzed && c.type === "asset";
      });
      if (!hasRezzedAsset) {
        log(state, `Expo Grid — no rezzed asset in this server root.`);
        return { ok: true };
      }
      state.corp.credits += 1;
      log(state, `Expo Grid — gain 1¢ → ${state.corp.credits}¢.`);
      return { ok: true };
    }
    default:
      return null;
  }
}
