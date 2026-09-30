/** Blood and Water (baw) Red Sand pack primitives — v1.132.0. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";
import { getCardDef } from "../cards/load.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function trashToHeap(state: EffectCtx["state"], cardId: string): void {
  removeCardFromCurrentZone(state, cardId);
  const card = state.cards[cardId];
  if (!card) return;
  card.zone = "runner:heap";
  card.hostId = undefined;
  state.runner.discard.push(cardId);
}

function trashToArchives(state: EffectCtx["state"], cardId: string): void {
  removeCardFromCurrentZone(state, cardId);
  const card = state.cards[cardId];
  if (!card) return;
  card.zone = "corp:archives";
  card.faceup = true;
  card.rezzed = false;
  state.corp.discard.push(cardId);
}

function installedRunnerCards(state: EffectCtx["state"]): string[] {
  return [...state.runner.rig].filter((id) => state.cards[id]);
}

function installedCorpCards(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      if (state.cards[id]) out.push(id);
    }
  }
  return out;
}

function canAdvance(state: EffectCtx["state"], cardId: string): boolean {
  const c = state.cards[cardId];
  if (!c) return false;
  if (c.type === "agenda") return true;
  if (c.canAdvance) return true;
  const def = c.defId ? getCardDef(c.defId) : undefined;
  return Boolean(def?.canAdvance);
}

function serverHostingCard(
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

function iceProtectingHqCount(state: EffectCtx["state"]): number {
  return state.servers.hq?.ice.length ?? 0;
}

export function syncMauiRecurringCredits(state: EffectCtx["state"]): void {
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    if (!card?.recurringCreditsMaxEqualsIceProtectingHq) continue;
    const max = iceProtectingHqCount(state);
    card.recurringCreditsMax = max;
    card.recurringCredits = max;
  }
}

export function applyRedsandBawPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "jarogniew_load_power_equal_tags_plus_3": {
      const source = state.cards[sourceId];
      if (!source) return { ok: true };
      const n = (state.runner.tags ?? 0) + 3;
      source.powerCounters = n;
      log(state, `${source.title} — load ${n} power (tags+3).`);
      return { ok: true };
    }

    case "loki_choose_rezzed_ice_gain_subs_subtypes_for_run": {
      if (!state.run) return { ok: true };
      const self = state.cards[sourceId];
      if (!self) return { ok: true };
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (id === sourceId) continue;
          const ice = state.cards[id];
          if (ice?.rezzed) candidates.push(id);
        }
      }
      if (candidates.length === 0) {
        log(state, `Loki — no other rezzed ice.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: candidates.map((id) => ({
          id: `loki:${id}`,
          label: `Copy ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "loki_gain_from_ice", iceId: id }),
        })),
      };
      return { ok: true };
    }

    case "loki_gain_from_ice": {
      const iceId = (action as { iceId: string }).iceId;
      const self = state.cards[sourceId];
      const other = state.cards[iceId];
      if (!self || !other || !state.run) return { ok: true };
      if (!self.baseSubroutines) {
        self.baseSubroutines = structuredClone(self.subroutines ?? []);
      }
      if (!self.baseSubtypes) {
        self.baseSubtypes = [...(self.subtypes ?? [])];
      }
      const gainedSubs = structuredClone(other.subroutines ?? []).map(
        (sub, i) => ({
          ...sub,
          id: `loki-copy-${iceId}-${i}`,
        }),
      );
      const subtypeSet = new Set(
        [...(self.baseSubtypes ?? []), ...(other.subtypes ?? [])].map((s) =>
          s.toLowerCase(),
        ),
      );
      self.subtypes = [...subtypeSet];
      self.subroutines = [
        ...gainedSubs,
        ...structuredClone(self.baseSubroutines),
      ];
      if (state.run.encounter?.iceId === sourceId) {
        state.run.encounter.broken = (self.subroutines ?? []).map(() => false);
      }
      log(
        state,
        `Loki — gains subtypes/subs of ${other.title} for remainder of run.`,
      );
      return { ok: true };
    }

    case "end_the_run_unless_shuffle_grip_into_stack": {
      if (state.runner.hand.length === 0) {
        // Empty grip: "shuffle all" is free — must shuffle nothing, so may decline ETR by "paying".
        state.pendingChoice = {
          sourceId,
          chooser: "runner",
          options: [
            {
              id: "shuffle",
              label: "Shuffle grip into stack (empty)",
              effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
            },
            {
              id: "etr",
              label: "End the run",
              effect: fx.do({ kind: "end_the_run" }),
            },
          ],
        };
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "shuffle",
            label: "Shuffle all cards from grip into stack",
            effect: fx.do({ kind: "shuffle_all_grip_into_stack" }),
          },
          {
            id: "etr",
            label: "End the run",
            effect: fx.do({ kind: "end_the_run" }),
          },
        ],
      };
      return { ok: true };
    }

    case "shuffle_all_grip_into_stack": {
      const grip = [...state.runner.hand];
      state.runner.hand = [];
      for (const id of grip) {
        const c = state.cards[id];
        if (!c) continue;
        c.zone = "runner:stack";
        state.runner.deck.push(id);
      }
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      log(state, `Runner shuffles grip into stack (${grip.length} card(s)).`);
      return { ok: true };
    }

    case "miraju_move_archives_may_jack_out_derez": {
      const ice = state.cards[sourceId];
      if (ice?.rezzed) {
        ice.rezzed = false;
        log(state, `Mirāju — derez.`);
      }
      if (!state.run) return { ok: true };
      state.run.attackedServerId = "archives";
      const arch = state.servers.archives;
      if (arch.ice.length > 0) {
        state.run.position = 0;
      } else {
        state.run.position = null;
      }
      log(state, `Mirāju — Runner moves to outermost Archives.`);
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "jack-out",
            label: "Jack out",
            effect: fx.do({ kind: "end_the_run" }),
          },
          {
            id: "continue",
            label: "Continue the run",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "warroid_runner_trashes_installed": {
      const amount = Math.max(1, action.amount ?? 2);
      const candidates = installedRunnerCards(state);
      if (candidates.length === 0) {
        log(state, `Warroid Tracker — Runner has no installed cards.`);
        return { ok: true };
      }
      const n = Math.min(amount, candidates.length);
      // Ask Runner to pick n cards (simplified: sequential picks).
      const pickOne = (remaining: number, pool: string[]): Effect => {
        if (remaining <= 0 || pool.length === 0) {
          return fx.do({ kind: "gain_credits", side: "runner", amount: 0 });
        }
        return {
          op: "choose",
          chooser: "runner",
          options: pool.map((id) => ({
            id: `trash:${id}`,
            label: `Trash ${state.cards[id]!.title}`,
            effect: fx.seq(
              fx.do({ kind: "warroid_trash_one", cardId: id }),
              pickOne(
                remaining - 1,
                pool.filter((x) => x !== id),
              ),
            ),
          })),
        };
      };
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: (pickOne(n, candidates) as Extract<Effect, { op: "choose" }>)
          .options,
      };
      return { ok: true };
    }

    case "warroid_trash_one": {
      const cardId = (action as { cardId: string }).cardId;
      if (!state.cards[cardId] || !state.runner.rig.includes(cardId)) {
        return { ok: true };
      }
      trashToHeap(state, cardId);
      log(state, `Warroid Tracker — trash ${state.cards[cardId]?.title}.`);
      return { ok: true };
    }

    case "reeducation_hq_bottom_rd_draw_runner_grip_to_stack": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Reeducation — HQ empty.`);
        return { ok: true };
      }
      // Corp chooses any number (including 0) from HQ to bottom of R&D.
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "none",
          label: "Add 0 cards",
          effect: fx.do({ kind: "reeducation_resolve", cardIds: [] }),
        },
      ];
      // Offer choosing a subset via sequential picks; start by picking first card or done.
      options.push(
        ...hq.map((id) => ({
          id: `add:${id}`,
          label: `Add ${state.cards[id]!.title} (continue selecting)`,
          effect: fx.do({
            kind: "reeducation_pick_continue",
            selected: [id],
            remaining: hq.filter((x) => x !== id),
          }),
        })),
      );
      state.pendingChoice = { sourceId, chooser: "corp", options };
      return { ok: true };
    }

    case "reeducation_pick_continue": {
      const selected = (action as { selected: string[] }).selected ?? [];
      const remaining = (action as { remaining: string[] }).remaining ?? [];
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "done",
          label: `Done (${selected.length} card(s))`,
          effect: fx.do({ kind: "reeducation_resolve", cardIds: selected }),
        },
      ];
      for (const id of remaining) {
        options.push({
          id: `add:${id}`,
          label: `Also add ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "reeducation_pick_continue",
            selected: [...selected, id],
            remaining: remaining.filter((x) => x !== id),
          }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      return { ok: true };
    }

    case "reeducation_resolve": {
      const cardIds = (action as { cardIds: string[] }).cardIds ?? [];
      const x = cardIds.length;
      for (const id of cardIds) {
        if (!state.corp.hand.includes(id)) continue;
        state.corp.hand = state.corp.hand.filter((h) => h !== id);
        const c = state.cards[id]!;
        c.zone = "corp:rd";
        state.corp.deck.push(id);
      }
      for (let i = 0; i < x; i++) {
        if (state.corp.deck.length === 0) break;
        const top = state.corp.deck.shift()!;
        const c = state.cards[top]!;
        c.zone = "corp:hq";
        state.corp.hand.push(top);
      }
      log(state, `Reeducation — Corp adds ${x} to R&D bottom and draws ${x}.`);
      if (x > 0 && state.runner.hand.length >= x) {
        // Runner adds X random grip to bottom of stack.
        const grip = [...state.runner.hand];
        for (let i = grip.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = grip[i]!;
          grip[i] = grip[j]!;
          grip[j] = tmp;
        }
        const picks = grip.slice(0, x);
        for (const id of picks) {
          state.runner.hand = state.runner.hand.filter((h) => h !== id);
          const c = state.cards[id]!;
          c.zone = "runner:stack";
          state.runner.deck.push(id);
        }
        log(
          state,
          `Reeducation — Runner adds ${x} random grip card(s) to stack bottom.`,
        );
      }
      return { ok: true };
    }

    case "meteor_mining_may_gain_7_or_7_meat_if_tagged": {
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
      state.pendingChoice = { sourceId, chooser: "corp", options };
      return { ok: true };
    }

    case "standoff_trash_loop": {
      const runnerInstalled = installedRunnerCards(state);
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "decline",
          label: "Decline — Corp draws 1 and gains 5¢",
          effect: fx.seq(
            fx.do({ kind: "draw", side: "corp", amount: 1 }),
            fx.do({ kind: "gain_credits", side: "corp", amount: 5 }),
          ),
        },
      ];
      for (const id of runnerInstalled) {
        options.push({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "standoff_after_runner_trash", cardId: id }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      return { ok: true };
    }

    case "standoff_after_runner_trash": {
      const cardId = (action as { cardId: string }).cardId;
      if (state.runner.rig.includes(cardId)) {
        trashToHeap(state, cardId);
        log(state, `Standoff — Runner trashes ${state.cards[cardId]?.title}.`);
      }
      const corpInstalled = installedCorpCards(state);
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "decline",
          label: "Decline (end Standoff)",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        },
      ];
      for (const id of corpInstalled) {
        options.push({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title} and repeat`,
          effect: fx.seq(
            fx.do({ kind: "standoff_corp_trash", cardId: id }),
            fx.do({ kind: "standoff_trash_loop" }),
          ),
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      return { ok: true };
    }

    case "standoff_corp_trash": {
      const cardId = (action as { cardId: string }).cardId;
      if (state.cards[cardId]) {
        trashToArchives(state, cardId);
        log(state, `Standoff — Corp trashes ${state.cards[cardId]?.title}.`);
      }
      return { ok: true };
    }

    case "success_advance_equal_forfeit_advancement_requirement": {
      const x = state.lastForfeitedAdvancementRequirement ?? 0;
      if (x <= 0) {
        log(state, `Success — forfeited agenda had no advancement requirement.`);
        return { ok: true };
      }
      const candidates = installedCorpCards(state).filter((id) =>
        canAdvance(state, id),
      );
      if (candidates.length === 0) {
        log(state, `Success — no advanceable card.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: candidates.map((id) => ({
          id: `adv:${id}`,
          label: `Advance ${state.cards[id]!.title} ${x} time(s)`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: x,
          }),
        })),
      };
      return { ok: true };
    }

    case "whampoa_trash_hq_archives_to_rd_bottom": {
      // Cost already trashed from HQ; choose Archives card to R&D bottom.
      const archives = [...state.corp.discard];
      if (archives.length === 0) {
        log(state, `Whampoa Reclamation — Archives empty.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: archives.map((id) => ({
          id: `rd:${id}`,
          label: `Add ${state.cards[id]!.title} to R&D bottom`,
          effect: fx.do({ kind: "whampoa_archives_to_rd_bottom", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "whampoa_archives_to_rd_bottom": {
      const cardId = (action as { cardId: string }).cardId;
      if (!state.corp.discard.includes(cardId)) return { ok: true };
      state.corp.discard = state.corp.discard.filter((id) => id !== cardId);
      const c = state.cards[cardId]!;
      c.zone = "corp:rd";
      c.faceup = false;
      state.corp.deck.push(cardId);
      log(state, `Whampoa Reclamation — ${c.title} to R&D bottom.`);
      return { ok: true };
    }

    case "gain_credits_per_card_with_advancement_tokens": {
      const per = action.per ?? 2;
      let n = 0;
      for (const id of installedCorpCards(state)) {
        if ((state.cards[id]?.advancementTokens ?? 0) >= 1) n += 1;
      }
      const gained = n * per;
      state.corp.credits += gained;
      log(
        state,
        `Mass Commercialization — gain ${gained}¢ (${n} advanced card(s) × ${per}).`,
      );
      return { ok: true };
    }

    case "bug_out_bag_choose_x_and_load_power": {
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
      state.pendingChoice = { sourceId, chooser: "runner", options };
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
      state.runner.credits -= amount;
      source.powerCounters = amount;
      log(
        state,
        `Bug-Out Bag — pay ${amount}¢, load ${amount} power → ${state.runner.credits}¢.`,
      );
      return { ok: true };
    }

    case "bug_out_bag_draw_per_power_then_trash": {
      const source = state.cards[sourceId];
      if (!source) return { ok: true };
      const n = source.powerCounters ?? 0;
      for (let i = 0; i < n; i++) {
        if (state.runner.deck.length === 0) break;
        const top = state.runner.deck.shift()!;
        const c = state.cards[top]!;
        c.zone = "runner:grip";
        state.runner.hand.push(top);
      }
      log(state, `Bug-Out Bag — draw ${n}, then trash.`);
      if (state.runner.rig.includes(sourceId)) {
        trashToHeap(state, sourceId);
      }
      return { ok: true };
    }

    default:
      return null;
  }
}

export function serverOfCard(
  state: EffectCtx["state"],
  cardId: string,
): ServerId | null {
  return serverHostingCard(state, cardId);
}
