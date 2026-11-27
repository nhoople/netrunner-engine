/**
 * Primitive kinds for trashing and discarding Corp cards from HQ and R&D. The
 * kind registry (`applyCoreKinds`) dispatches here.
 */
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../../timing/labels.js";
import { pickRandomSubset, random } from "../../state/rng.js";
import {
  trashCard,
  controllerOf,
  discardCard,
} from "../../state/hostingAndTrash/trash.js";
import {
  evalEffect,
  type EvalResult,
  applyPrimitive,
  type EffectCtx,
} from "../eval.js";
import { offerCultivateHqChoice } from "../searchAndDeck/searchAndArrange.js";
import { chooseCards } from "../triggers/chooseCards.js";
import { type Effect, fx, type Primitive } from "../ir.js";
import { iceAtRunnerPosition } from "../../state/uninstallAndPosition/runPosition.js";
import { syncCorpHandSizeSubroutines } from "../../state/continuous/handSizeSubroutines.js";
import type { RuleCite } from "../../state/types.js";
import { installedCorpCards, canAdvance } from "../counters/counterKinds.js";
import { applySearchAndShuffleKinds } from "../searchAndDeck/searchAndShuffleKinds.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function trashTopOfRd(
  state: EffectCtx["state"],
  n: number,
  label: string,
): void {
  for (let i = 0; i < n; i++) {
    const top = state.corp.deck[0];
    if (!top) break;
    const c = state.cards[top];
    // "Force the Corp to trash": the Corp carries it out (CR 1.14.5).
    // Not visible to the Runner when trashed: facedown (CR 4.4.6b).
    trashCard(state, top, { by: "corp" });
    log(state, `${label} — trash ${c?.title ?? top} from R&D.`);
  }
}

function applyTrashAnyHqThenGainPerCard(
  ctx: EffectCtx,
  _per: number,
  finalizeKind: string,
): PrimResult {
  const { state, sourceId } = ctx;
  const hq = [...state.corp.hand];
  if (hq.length === 0) {
    const fin = applyCorpHandAndDeckTrashKinds(ctx, {
      kind: finalizeKind,
    } as Primitive);
    return fin ?? { ok: true };
  }
  openPendingChoose(state, {
    sourceId,
    chooser: "corp",
    options: [
      ...hq.map((id) => ({
        id: `reuse-trash:${id}`,
        label: `Trash ${state.cards[id]!.title}`,
        effect: {
          op: "seq" as const,
          effects: [
            fx.do({ kind: "trash_hq_card", cardId: id }),
            fx.do({ kind: "trash_hq_tick" }),
            fx.do({ kind: "trash_hq_gain_credits" }),
          ],
        },
      })),
      {
        id: "reuse-done",
        label: "Done trashing",
        effect: {
          op: "do",
          action: { kind: finalizeKind as "trash_hq_gain_credits_finalize" },
        },
      },
    ],
  });
  return { ok: true };
}

export function applyCorpHandAndDeckTrashKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "power_shutdown": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "trash-0",
            label: "Trash 0 from top of R&D",
            effect: {
              op: "do" as const,
              action: { kind: "trash_rd", amount: 0 },
            },
          },
          // Printed: "Trash any number of cards from the top of R&D" —
          // any number up to the whole deck, not a capped range.
          ...Array.from({ length: state.corp.deck.length }, (_, i) => {
            const amount = i + 1;
            return {
              id: `trash-${amount}`,
              label: `Trash ${amount} from top of R&D`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "trash_rd" as const,
                  amount,
                },
              },
            };
          }),
        ],
        logLine: `${source.title} — choose how many cards to trash from top of R&D.`,
      });
      return { ok: true };
    }

    case "trash_hq": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Trash from HQ — HQ empty (CR ${CR.trashing.number}).`);
        return { ok: true };
      }
      const amount = Math.max(1, action.amount ?? 1);
      if (action.pick === "random") {
        const picks = pickRandomSubset(state, hq, Math.min(amount, hq.length));
        for (const id of picks) {
          trashCard(state, id, { by: "corp" });
          log(
            state,
            `Trash ${state.cards[id].title} from HQ at random (CR ${CR.trashing.number}).`,
          );
        }
        if (action.then) {
          return evalEffect(ctx, action.then);
        }
        return { ok: true };
      }
      // The Corp chooses which of its cards to trash (CR 1.15.2).
      return evalEffect(
        ctx,
        chooseCards({
          chooser: "corp",
          candidates: hq,
          count: amount,
          upTo: action.upTo,
          purpose: action.reveal ? "reveal_trash_hq" : "trash_hq",
          then: action.then,
        }),
      );
    }

    case "trash_hq_card": {
      if (!state.corp.hand.includes(action.cardId)) {
        log(state, `Trash HQ card — not in HQ.`);
        return { ok: true };
      }
      const title = state.cards[action.cardId]!.title;
      trashCard(state, action.cardId, { by: action.by ?? source.side });
      log(state, `Trash ${title} from HQ (CR ${CR.trashing.number}).`);
      return { ok: true };
    }

    case "trash_any_number_from_hq": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `${source.title} — trash any from HQ: HQ empty.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        hq.map((id) => {
          const title = state.cards[id]!.title;
          return {
            id: `trash-hq:${id}`,
            label: `Trash ${title}`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: { kind: "trash_hq_card" as const, cardId: id },
                },
                {
                  op: "do" as const,
                  action: { kind: "trash_any_number_from_hq" as const },
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
        logLine: `${source.title} — trash any number of cards from HQ (CR ${CR.trashing.number}).`,
      });
      return { ok: true };
    }

    case "trash_then_corp_rez_or_hq": {
      const iceId =
        state.run?.lastPassedUnrezzedIceId ??
        state.turn.currentRunPassedUnrezzedIceIds?.at(-1);
      if (!iceId) {
        log(state, `False Echo — no passed ice.`);
        return { ok: true };
      }
      trashCard(state, sourceId, { by: controllerOf(state, sourceId) });
      const ice = state.cards[iceId];
      if (!ice || ice.type !== "ice") return { ok: true };
      const cost = ice.rezCost ?? 0;
      const agendaId = state.corp.scoreArea.find(
        (id) => !state.cards[id]?.cannotForfeit,
      );
      const canRez =
        state.corp.credits >= cost &&
        (!ice.rezAdditionalCostForfeitAgenda || Boolean(agendaId));
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (canRez) {
        options.push({
          id: "rez",
          label: ice.rezAdditionalCostForfeitAgenda
            ? `Pay ${cost}¢ and forfeit an agenda to rez ${ice.title}`
            : `Rez ${ice.title}`,
          effect: {
            op: "do",
            action: { kind: "rez_ice_by_id", iceId },
          },
        });
      }
      options.push({
        id: "hq",
        label: `Add ${ice.title} to HQ`,
        effect: {
          op: "do",
          action: { kind: "move_unrezzed_ice_to_hq", iceId },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `False Echo — Corp must rez ${ice.title} by paying its costs, or add it to HQ (CR ${CR.mustNotForceAdditionalCost.number}).`,
      });
      return { ok: true };
    }

    case "trash_cultivate_looked": {
      const cardId = action.cardId;
      const idx = state.turn.rdLookedCards.indexOf(cardId);
      if (idx < 0) {
        log(state, `Cultivate trash — card not in look zone.`);
        return { ok: true };
      }
      state.turn.rdLookedCards.splice(idx, 1);
      trashCard(state, cardId, { by: source.side });
      log(state, `Cultivate — trash a looked card.`);
      if (state.turn.rdLookedCards.length === 0) {
        return { ok: true };
      }
      return offerCultivateHqChoice(state, sourceId);
    }

    case "may_trash_hq_then": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `${source.title} — may trash HQ: HQ empty.`);
        return { ok: true };
      }
      const chooseOpts: Array<{ id: string; label: string; effect: Effect }> =
        hq.map((id) => ({
          id: `trash-hq:${id}`,
          label: `Trash ${state.cards[id]!.title} from HQ`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: { kind: "trash_hq_card" as const, cardId: id },
              },
              structuredClone(action.then),
            ],
          },
        }));
      chooseOpts.push({
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
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: chooseOpts,
        logLine: `${source.title} — may trash 1 card from HQ.`,
      });
      return { ok: true };
    }

    case "trash_looked": {
      const id = action.cardId;
      if (!state.turn.rdLookedCards.includes(id)) return { ok: true };
      state.turn.rdLookedCards = state.turn.rdLookedCards.filter(
        (x) => x !== id,
      );
      trashCard(state, id, { by: source.side });
      log(state, `ABT — trash ${state.cards[id]!.title}.`);
      return { ok: true };
    }

    case "trash_co_looked_rd_card": {
      const top = state.corp.deck.slice(0, 3);
      if (!top.includes(action.cardId)) {
        log(state, `au_co_trash_looked_rd_card — card not in looked set.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((id) => !top.includes(id));
      for (const id of top) {
        const card = state.cards[id]!;
        if (id === action.cardId) {
          trashCard(state, id, { by: source.side });
          log(state, `${source.title} — trash ${card.title} from R&D.`);
        } else {
          card.zone = "corp:hq";
          card.faceup = false;
          state.corp.hand.push(id);
          log(state, `${card.title} added to HQ from R&D look.`);
        }
      }
      return { ok: true };
    }

    case "trash_top_of_rd": {
      if (state.corp.deck.length === 0) {
        log(state, `${source.title} — trash top of R&D: R&D empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck[0]!;
      // Whichever card asks for it ("the Corp trashes", Spoilers' "they
      // trash"), the Corp is the player who does this (CR 1.14.5).
      const by = "corp" as const;
      // Not visible to the Runner when trashed: facedown (CR 4.4.6b).
      trashCard(state, topId, { by });
      log(
        state,
        `${source.title} — trash top of R&D (${state.cards[topId]?.title ?? topId}).`,
      );
      return { ok: true };
    }

    case "trash_hq_reencounter_passed_ice": {
      // Sisyphus Protocol: Corp chooses which HQ card to trash (CR 1.2.1).
      if (!state.run?.pendingReencounterIceId) {
        log(state, `Reencounter — no pending ice.`);
        return { ok: true };
      }
      if (state.corp.hand.length < 1) {
        log(state, `Reencounter — HQ empty.`);
        state.run.pendingReencounterIceId = undefined;
        return { ok: true };
      }
      const iceId = state.run.pendingReencounterIceId;
      const apply = (hqId: string): EvalResult => {
        if (!state.corp.hand.includes(hqId)) return { ok: true };
        const hqCard = state.cards[hqId]!;
        // Not visible to the Runner when trashed: facedown (CR 4.4.6b).
        trashCard(state, hqId, { by: "corp", cause: "cost" });
        if (state.run) {
          state.run.reencounterIceId = iceId;
          state.run.pendingReencounterIceId = undefined;
        }
        log(
          state,
          `Trash ${hqCard.title} from HQ — Runner will encounter ice again.`,
        );
        return { ok: true };
      };
      if (state.corp.hand.length === 1) return apply(state.corp.hand[0]!);
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: state.corp.hand.map((id) => ({
          id: `sisyphus-hq:${id}`,
          label: `Trash ${state.cards[id]!.title} from HQ; re-encounter`,
          effect: fx.do({
            kind: "trash_hq_reencounter_passed_ice_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "trash_hq_reencounter_passed_ice_resolve": {
      if (!state.run?.pendingReencounterIceId) {
        log(state, `Reencounter — no pending ice.`);
        return { ok: true };
      }
      const hqId = action.cardId;
      if (!state.corp.hand.includes(hqId)) {
        log(state, `Reencounter — card no longer in HQ.`);
        return { ok: true };
      }
      const hqCard = state.cards[hqId]!;
      // Not visible to the Runner when trashed: facedown (CR 4.4.6b).
      trashCard(state, hqId, { by: "corp", cause: "cost" });
      state.run.reencounterIceId = state.run.pendingReencounterIceId;
      state.run.pendingReencounterIceId = undefined;
      log(
        state,
        `Trash ${hqCard.title} from HQ — Runner will encounter ice again.`,
      );
      return { ok: true };
    }

    case "trash_rd": {
      let trashed = 0;
      for (let i = 0; i < action.amount && state.corp.deck.length > 0; i++) {
        const id = state.corp.deck.shift()!; // top of R&D is index 0
        trashCard(state, id, { by: source.side });
        trashed++;
      }
      log(state, `Power Shutdown — trash ${trashed} from top of R&D.`);
      return applyPrimitive(ctx, {
        kind: "trash_runner_install_lte",
        maxInstallCost: trashed,
      });
    }

    case "trash_whampoa_hq_archives_to_rd_bottom": {
      // Cost already trashed from HQ; choose Archives card to R&D bottom.
      const archives = [...state.corp.discardPile];
      if (archives.length === 0) {
        log(state, `Whampoa Reclamation — Archives empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: archives.map((id) => ({
          id: `rd:${id}`,
          label: `Add ${state.cards[id]!.title} to R&D bottom`,
          effect: fx.do({ kind: "whampoa_archives_to_rd_bottom", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "choose_syn_attack_discard": {
      // Printed: "The Corp must either discard 2 cards or draw 4 cards."
      // Discarding from their own HQ is the Corp's choice of cards — not
      // random (that is Utopia Shard / Officer Frank, a different text).
      const picked = action.cardId;
      if (picked) {
        if (!state.corp.hand.includes(picked)) return { ok: true };
        // A discard, not a trash (CR 1.19.3); facedown from HQ (CR 4.4.6b).
        discardCard(state, picked);
        log(state, `SYN Attack — Corp discards ${state.cards[picked]!.title}.`);
        const left = (action.remaining ?? 1) - 1;
        if (left <= 0 || state.corp.hand.length === 0) return { ok: true };
        return applyCorpHandAndDeckTrashKinds(ctx, {
          kind: "choose_syn_attack_discard",
          remaining: left,
        });
      }
      const remaining = action.remaining ?? 2;
      if (remaining <= 0 || state.corp.hand.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: state.corp.hand.map((id) => ({
          id: `syn-discard:${id}`,
          label: `Discard ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "choose_syn_attack_discard",
            remaining,
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "trash_distract_hq_shuffle_archives": {
      // Offer trash 0-2 from HQ, then shuffle 0-2 from Archives.
      const hq = [...state.corp.hand];
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "trash-0",
          label: "Trash 0 from HQ",
          effect: fx.do({
            kind: "shuffle_distract_archives",
            remaining: 2,
          }),
        },
      ];
      for (const id of hq) {
        options.push({
          id: `trash1:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "trash_distract_hq_one",
            cardId: id,
            remainingAfter: 1,
          }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "trash_distract_hq_one": {
      const id = action.cardId;
      if (state.corp.hand.includes(id)) {
        // Facedown from HQ (CR 4.4.6b).
        trashCard(state, id, { by: controllerOf(state, sourceId) });
        log(
          state,
          `Distract the Masses — trash ${state.cards[id]!.title} from HQ.`,
        );
      }
      if (action.remainingAfter > 0) {
        const hq = [...state.corp.hand];
        const options: { id: string; label: string; effect: Effect }[] = [
          {
            id: "done-hq",
            label: "Done trashing from HQ",
            effect: fx.do({
              kind: "shuffle_distract_archives",
              remaining: 2,
            }),
          },
        ];
        for (const hid of hq) {
          options.push({
            id: `trash2:${hid}`,
            label: `Trash ${state.cards[hid]!.title}`,
            effect: fx.do({
              kind: "trash_distract_hq_one",
              cardId: hid,
              remainingAfter: 0,
            }),
          });
        }
        openPendingChoose(state, { sourceId, chooser: "corp", options });
        return { ok: true };
      }
      return (
        applySearchAndShuffleKinds(ctx, {
          kind: "shuffle_distract_archives",
          remaining: 2,
        }) ?? { ok: true }
      );
    }

    case "trash_twins_hq_copy_reencounter": {
      const atPosition = iceAtRunnerPosition(state);
      const iceId = state.run?.encounter?.iceId ?? atPosition;
      if (!iceId) {
        log(state, `The Twins — no passed ice.`);
        return { ok: true };
      }
      const title = state.cards[iceId]?.title;
      const copies = state.corp.hand.filter(
        (id) => state.cards[id]?.title === title,
      );
      if (copies.length === 0) {
        log(state, `The Twins — no HQ copy of ${title}.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: copies.map((id) => ({
          id: `twins:${id}`,
          label: `Trash ${state.cards[id]!.title} from HQ; re-encounter`,
          effect: fx.do({
            kind: "twins_apply_reencounter",
            trashId: id,
            iceId,
          }),
        })),
      });
      return { ok: true };
    }

    case "trash_top_rd_equal_damage_suffered_this_turn": {
      const x = state.turn.damageSufferedThisTurn ?? 0;
      trashTopOfRd(state, x, source?.title ?? "Salvaged Vanadis Armory");
      state.turn.vanadisNextPawArmed = false;
      return { ok: true };
    }
    case "trash_hq_tick": {
      state.turn.reuseTrashedFromHq = (state.turn.reuseTrashedFromHq ?? 0) + 1;
      return { ok: true };
    }
    case "trash_hq_gain_credits": {
      // Printed: trash any number, then gain 2¢ each. Only seed the counter
      // on first entry — re-entry after trash_hq_tick must keep the tally (CR 1.2.1).
      if (state.turn.reuseTrashedFromHq === undefined) {
        state.turn.reuseTrashedFromHq = 0;
      }
      return applyTrashAnyHqThenGainPerCard(
        ctx,
        2,
        "trash_hq_gain_credits_finalize",
      );
    }
    case "trash_hq_gain_credits_finalize": {
      const n = state.turn.reuseTrashedFromHq ?? 0;
      state.corp.credits += n * 2;
      log(state, `Reuse — gain ${n * 2}¢ for ${n} trashed HQ card(s).`);
      state.turn.reuseTrashedFromHq = undefined;
      return { ok: true };
    }

    case "trash_sadaka_hq_resolve": {
      const cardId = (action as { cardId: string }).cardId;
      const idx = state.corp.hand.indexOf(cardId);
      if (idx < 0) return { ok: true };
      const c = state.cards[cardId]!;
      // Not visible to the Runner when trashed: facedown (CR 4.4.6b).
      trashCard(state, cardId, { by: "corp" });
      log(state, `Sadaka — trash ${c.title} from HQ.`);
      const resources = state.runner.installed.filter(
        (id) => state.cards[id]?.type === "resource",
      );
      if (resources.length === 0) {
        log(state, `Sadaka — no resource to trash.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: resources.map((id) => ({
          id: `sadaka-res:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "trash_sadaka_resource",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "trash_hq_draw": {
      const hq = [...state.corp.hand];
      if (hq.length < 1) {
        return {
          ok: false,
          error: "Election Day requires at least 1 card in HQ.",
          cites: [],
        };
      }
      for (const id of hq) {
        trashCard(state, id, { by: "corp" });
      }
      log(state, `Election Day — trash ${hq.length} card(s) from HQ.`);
      // The draw procedure: cards are set aside, draw triggers act on them,
      // then they go to HQ; an empty R&D at the draw loses (CR 8.4.2, 1.7.2c).
      return evalEffect(ctx, fx.draw("corp", action.amount ?? 5));
    }
    case "corp_discard_random_from_hq": {
      const amount = Math.max(0, (action as { amount?: number }).amount ?? 2);
      const hq = [...state.corp.hand];
      if (hq.length === 0 || amount <= 0) {
        log(state, `Corp discard random from HQ — nothing to discard.`);
        return { ok: true };
      }
      for (let i = hq.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        [hq[i], hq[j]] = [hq[j]!, hq[i]!];
      }
      const pick = hq.slice(0, Math.min(amount, hq.length));
      for (const id of pick) {
        // A discard, not a trash (CR 1.19.3); facedown from HQ (CR 4.4.6b).
        discardCard(state, id);
        log(
          state,
          `Corp discards ${state.cards[id]!.title} from HQ at random.`,
        );
      }
      const encounterIceId = state.run?.encounter?.iceId;
      if (
        encounterIceId &&
        state.cards[encounterIceId]?.dynamicEtrSubroutineCountFromCorpHandSize
      ) {
        syncCorpHandSizeSubroutines(state, encounterIceId);
      }
      return { ok: true };
    }

    case "trash_random_hq_per_power_on_self": {
      const n = source?.powerCounters ?? 0;
      if (n <= 0 || state.corp.hand.length === 0) {
        log(state, `Clan Vengeance — no power / empty HQ.`);
        return { ok: true };
      }
      let trashed = 0;
      for (let i = 0; i < n && state.corp.hand.length > 0; i++) {
        const idx = Math.floor(random(state) * state.corp.hand.length);
        const id = state.corp.hand[idx]!;
        trashCard(state, id, { by: controllerOf(state, sourceId) });
        trashed += 1;
      }
      log(state, `Clan Vengeance — trash ${trashed} from HQ at random.`);
      return { ok: true };
    }
    case "corp_trash_from_hq": {
      // "The Corp trashes 1 card from HQ" — the Corp chooses which card.
      if (state.corp.hand.length === 0) {
        log(state, `Hemorrhage — Corp HQ empty.`);
        return { ok: true };
      }
      // The text names the Corp, so the Corp trashes the card although the
      // ability is the Runner's (CR 1.14.5a).
      if (state.corp.hand.length === 1) {
        return evalEffect(
          ctx,
          fx.do({
            kind: "trash_hq_card",
            cardId: state.corp.hand[0]!,
            by: "corp",
          }),
        );
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: state.corp.hand.map((id) => ({
          id: `hemorrhage:${id}`,
          label: `Trash ${state.cards[id]!.title} from HQ`,
          effect: fx.do({ kind: "trash_hq_card", cardId: id, by: "corp" }),
        })),
      });
      return { ok: true };
    }

    case "trash_hq_place_total_2_advancements": {
      const hq = [...state.corp.hand];
      for (const id of hq) {
        trashCard(state, id, { by: controllerOf(state, sourceId) });
      }
      log(state, `Audacity — trash all cards from HQ (${hq.length}).`);
      const advanceable = installedCorpCards(state).filter((id) =>
        canAdvance(state, id),
      );
      if (advanceable.length === 0) {
        log(state, `Audacity — no advanceable installed cards.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: advanceable.flatMap((id) => {
          const title = state.cards[id]!.title;
          return [
            {
              id: `adv2:${id}`,
              label: `Place 2 advancements on ${title}`,
              effect: fx.do({
                kind: "place_advancements_on",
                cardId: id,
                amount: 2,
              }),
            },
            {
              id: `adv1:${id}`,
              label: `Place 1 advancement on ${title} (split)`,
              effect: fx.do({
                kind: "place_one_then_choose",
                cardId: id,
              }),
            },
          ];
        }),
      });
      return { ok: true };
    }
    default:
      return null;
  }
}
