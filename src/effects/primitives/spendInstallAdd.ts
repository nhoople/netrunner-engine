/** Honor and Profit (hap) deluxe primitives. */
import { subtractRunnerCreditPool } from "../../state/costs.js";
import { log } from "../../state/createGame.js";
import { CR } from "../../timing/labels.js";
import { startPsiGame } from "../../state/psi.js";
import { fireOnPlay } from "../../state/cardLifecycleHooks.js";
import {
  agendaPointsFor,
  effectiveAdvancementRequirement,
  removeCardFromCurrentZone,
} from "../../state/scoring.js";
import type { RuleCite, ServerId } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/pendingChoice.js";


type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function offerSparedSubroutineChoice(
  state: EffectCtx["state"],
  sourceId: string,
  leave: number,
): PrimResult {
  const enc = state.run?.encounter;
  const ice = enc ? state.cards[enc.iceId] : undefined;
  const subs = ice?.subroutines ?? [];
  if (!state.run || !enc || !ice || subs.length === 0) {
    log(
      state,
      `No encountered subroutine to leave (CR ${CR.breakAllButChosenSubroutine.number}).`,
    );
    return { ok: true };
  }
  while (enc.broken.length < subs.length) enc.broken.push(false);
  const pick = Math.max(0, Math.min(leave, subs.length));
  if (pick === 0) {
    breakUnbrokenExcept(state, new Set());
    return { ok: true };
  }
  state.run.pendingSpareSubroutines = { remaining: pick, spared: [] };
  openSpareSubroutineChoice(state, sourceId);
  return { ok: true };
}

function openSpareSubroutineChoice(
  state: EffectCtx["state"],
  sourceId: string,
): void {
  const enc = state.run?.encounter;
  const ice = enc ? state.cards[enc.iceId] : undefined;
  const spared = new Set(state.run?.pendingSpareSubroutines?.spared ?? []);
  const subs = ice?.subroutines ?? [];
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: subs.flatMap((sub, index) =>
      spared.has(index)
        ? []
        : [
            {
              id: `spare-sub:${index}`,
              label: sub.text,
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
    ),
  });
}

function breakUnbrokenExcept(
  state: EffectCtx["state"],
  spared: Set<number>,
): number {
  const enc = state.run?.encounter;
  const ice = enc ? state.cards[enc.iceId] : undefined;
  const subs = ice?.subroutines ?? [];
  if (!enc || !ice) return 0;
  while (enc.broken.length < subs.length) enc.broken.push(false);
  let brokenNow = 0;
  for (let i = 0; i < subs.length; i++) {
    if (spared.has(i) || enc.broken[i]) continue;
    enc.broken[i] = true;
    brokenNow += 1;
  }
  const left = [...spared]
    .filter((index) => subs[index])
    .map((index) => `"${subs[index]!.text}"`)
    .join(", ");
  log(
    state,
    `${ice.title} leaves ${left || "no subroutine"} and breaks ${brokenNow} unbroken subroutine(s) (CR ${CR.breakAllButChosenSubroutine.number}).`,
  );
  return brokenNow;
}

/** The Runner chose the subroutine Grappling Hook will not break (CR 9.8.6b). */
export function chooseSparedSubroutine(
  state: EffectCtx["state"],
  index: number,
  sourceId: string,
): PrimResult {
  const pending = state.run?.pendingSpareSubroutines;
  const enc = state.run?.encounter;
  const subs = enc ? (state.cards[enc.iceId]?.subroutines ?? []) : [];
  if (!state.run || !pending || !enc) {
    return {
      ok: false,
      error: "No subroutine choice is waiting.",
      cites: [CR.breakAllButChosenSubroutine],
    };
  }
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= subs.length ||
    pending.spared.includes(index)
  ) {
    return {
      ok: false,
      error: "Choose a subroutine to leave.",
      cites: [CR.breakAllButChosenSubroutine],
    };
  }
  pending.spared.push(index);
  pending.remaining -= 1;
  if (pending.remaining > 0) {
    openSpareSubroutineChoice(state, sourceId);
    return { ok: true };
  }
  const spared = new Set(pending.spared);
  state.run.pendingSpareSubroutines = undefined;
  breakUnbrokenExcept(state, spared);
  return { ok: true };
}

function installedIceIds(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) out.push(id);
  }
  return out;
}

export function applySpinHapPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "tennin_place_advancement_on_installed": {
      // Printed: place 1 advancement counter on an installed card (includes
      // unrezzed; CR 1.2.1).
      const cands: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c?.side === "corp") cands.push(id);
        }
      }
      if (cands.length === 0) {
        log(state, `Tennin — no installed Corp cards.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `tennin:${id}`,
          label: `Place 1 advancement on ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "place_advancements_on", cardId: id, amount: 1 }),
        })),
      });
      return { ok: true };
    }
    case "spend_shi_kyu_for_net_damage": {
      // Printed: spend any number of credits; Runner suffers that much net
      // unless they add this asset to their score area as −1 AP (CR 1.2.1).
      const max = state.corp.credits;
      const opts: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 0; n <= Math.min(max, 20); n++) {
        if (n === 0) {
          opts.push({
            id: "shi:0",
            label: "Spend 0¢",
            effect: fx.gainCredits("corp", 0),
          });
          continue;
        }
        opts.push({
          id: `shi:${n}`,
          label: `Spend ${n}¢`,
          effect: fx.seq(
            fx.do({ kind: "corp_pay_credits", amount: n }),
            fx.choose("runner", [
              {
                id: "shi-net",
                label: `Suffer ${n} net damage`,
                effect: fx.do({ kind: "net_damage", amount: n }),
              },
              {
                id: "shi-score",
                label: "Add to score area as −1 agenda",
                effect: fx.do({
                  kind: "add_to_runner_score_as_agenda",
                  agendaPoints: -1,
                }),
              },
            ]),
          ),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options: opts });
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
      const sid =
        `remote-${state.nextRemoteNumber++}` as ServerId;
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
    case "add_net_subs_for_rezzed_ice": {
      const sid = state.run?.attackedServerId;
      if (!sid) return { ok: true };
      // Printed: X is the number of cards in the Runner's grip.
      const n = state.runner.hand.length;
      const ice = state.cards[sourceId]!;
      if (!ice.baseSubroutines) {
        ice.baseSubroutines = structuredClone(ice.subroutines ?? []);
      }
      const base = ice.baseSubroutines ?? [];
      const extras = Array.from({ length: n }, (_, i) => ({
        id: `${ice.defId}-komainu-${i}`,
        text: "Do 1 net damage.",
        effect: fx.do({ kind: "net_damage", amount: 1 }),
      }));
      ice.subroutines = [...base, ...extras];
      if (state.run?.encounter?.iceId === sourceId) {
        state.run.encounter.broken = ice.subroutines.map(() => false);
      }
      log(state, `Komainu — gains ${n} net damage subroutine(s).`);
      return { ok: true };
    }
    case "pay_or_net": {
      const amt = action.amount ?? 1;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "pup-pay",
            label: `Pay ${amt}¢`,
            effect: fx.do({ kind: "runner_pay_credits", amount: amt }),
          },
          {
            id: "pup-net",
            label: `Take ${amt} net damage`,
            effect: fx.do({ kind: "net_damage", amount: amt }),
          },
        ],
      });
      return { ok: true };
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
        return applySpinHapPrimitive(ctx, {
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
    case "inazuma_lock_breaking_next_encounter": {
      if (state.run) state.run.inazumaLockNextEncounter = true;
      log(state, `Inazuma — next encounter cannot break subroutines on encountered ice.`);
      return { ok: true };
    }
    case "forbid_jack_out_until_next_encounter": {
      if (!state.run) return { ok: true };
      state.run.cannotJackOut = true;
      state.run.clearCannotJackOutOnNextEncounterBegin = true;
      log(
        state,
        `Inazuma — Runner cannot jack out this run until after their next ice encounter begins.`,
      );
      return { ok: true };
    }
    case "redirect_susanoo_to_archives": {
      if (!state.run || state.run.attackedServerId === "archives") {
        return { ok: true };
      }
      state.run.attackedServerId = "archives";
      log(state, `Susanoo-no-Mikoto — Runner moves to outermost Archives.`);
      return { ok: true };
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
        state.cards[id]!.faceup = true;
      }
      if (taken.length === 0) return { ok: true };
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
    case "express_delivery_finish": {
      const { pickId, restIds } = action;
      state.runner.hand.push(pickId);
      state.cards[pickId]!.zone = "runner:grip";
      state.cards[pickId]!.faceup = true;
      for (const id of restIds ?? []) {
        state.runner.deck.push(id);
        state.cards[id]!.faceup = false;
      }
      // shuffle
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.runner.deck[i], state.runner.deck[j]] = [
          state.runner.deck[j]!,
          state.runner.deck[i]!,
        ];
      }
      log(state, `Express Delivery — took 1 card; shuffled stack.`);
      return { ok: true };
    }
    case "play_run_event_from_stack": {
      const cands = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        return c?.type === "event" && (c.subtypes ?? []).includes("run");
      });
      if (cands.length === 0) {
        log(state, `Planned Assault — no run events in stack.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `pa:${id}`,
          label: `Play ${state.cards[id]!.title} ignoring cost`,
          effect: fx.do({ kind: "play_heap_event_ignore_cost", cardId: id }),
        })),
      });
      return { ok: true };
    }
    case "play_heap_event_ignore_cost": {
      // Planned Assault leaf: play the chosen run event from stack, paying its
      // play cost (additional costs ignored), then shuffle (CR 1.2.1).
      const cardId = action.cardId;
      const card = state.cards[cardId];
      const idx = state.runner.deck.indexOf(cardId);
      if (!card || idx < 0) return { ok: true };
      const cost = card.playCost ?? 0;
      if (state.runner.credits < cost) {
        log(state, `Cannot afford ${card.title} (${cost}¢).`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      state.runner.deck.splice(idx, 1);
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.runner.deck[i], state.runner.deck[j]] = [
          state.runner.deck[j]!,
          state.runner.deck[i]!,
        ];
      }
      card.zone = "runner:play-area";
      card.faceup = true;
      log(
        state,
        `Planned Assault — play ${card.title} from stack for ${cost}¢; shuffle stack.`,
      );
      fireOnPlay(state, cardId);
      return { ok: true };
    }
    case "search_stack_take_to_grip": {
      const cands = [...state.runner.deck];
      if (cands.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.slice(0, 20).map((id) => ({
          id: `st:${id}`,
          label: `Take ${state.cards[id]!.title} to grip`,
          effect: fx.do({ kind: "take_runner_deck_card_to_grip", cardId: id }),
        })),
      });
      return { ok: true };
    }
    case "take_runner_deck_card_to_grip": {
      const cardId = action.cardId;
      const idx = state.runner.deck.indexOf(cardId);
      if (idx < 0) return { ok: true };
      state.runner.deck.splice(idx, 1);
      state.runner.hand.push(cardId);
      state.cards[cardId]!.zone = "runner:grip";
      log(state, `Search stack — ${state.cards[cardId]!.title} to grip.`);
      return { ok: true };
    }
    case "draw_from_stack_bottom": {
      const side = action.side === "corp" ? "corp" : "runner";
      const p = side === "corp" ? state.corp : state.runner;
      const amount = action.amount ?? 1;
      for (let i = 0; i < amount && p.deck.length > 0; i++) {
        const id = p.deck.pop()!;
        p.hand.push(id);
        state.cards[id]!.zone = side === "corp" ? "corp:hq" : "runner:grip";
      }
      log(state, `Draw ${amount} from bottom of stack.`);
      return { ok: true };
    }
    case "break_all_but_n_subroutines_on_encounter": {
      return offerSparedSubroutineChoice(state, sourceId, action.leave ?? 1);
    }
    case "may_pay_reveal_top": {
      // Printed Bug: whenever the Corp draws a card, you may pay 2¢ to
      // reveal that card (CR 1.2.1). The drawn id is on the turn bookkeeping.
      const drawnId = state.turn.pendingCorpDrawnCardId;
      const title = drawnId
        ? (state.cards[drawnId]?.title ?? "the drawn card")
        : "the drawn card";
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
        log(state, `Bug — reveal ${state.cards[id]!.title}.`);
      } else {
        log(state, `Bug — no drawn Corp card to reveal.`);
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
    case "choose_type_reveal_install": {
      const types = ["event", "program", "resource", "hardware"];
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: types.map((t) => ({
          id: `om:${t}`,
          label: `Choose ${t}`,
          effect: fx.do({ kind: "reveal_oracle_top_match", cardType: t }),
        })),
      });
      return { ok: true };
    }
    case "reveal_oracle_top_match": {
      const top = state.runner.deck[0]; // deck top is index 0 (commitDraw shifts)
      if (!top) return { ok: true };
      state.cards[top]!.faceup = true;
      const match = state.cards[top]!.type === action.cardType;
      log(
        state,
        `Oracle May — reveal ${state.cards[top]!.title} (${match ? "match" : "no match"}).`,
      );
      // Printed Oracle May: on a match, draw the card and gain 2¢; on a
      // miss, trash it. (Card text wins, CR 1.2.1.)
      state.runner.deck.shift();
      if (match) {
        state.runner.hand.push(top);
        state.cards[top]!.zone = "runner:grip";
        state.runner.credits += 2;
        log(
          state,
          `Oracle May — draw ${state.cards[top]!.title} and gain 2¢ → ${state.runner.credits}¢.`,
        );
      } else {
        state.runner.discardPile.push(top);
        state.cards[top]!.zone = "runner:heap";
        log(state, `Oracle May — trash ${state.cards[top]!.title}.`);
      }
      return { ok: true };
    }
    case "reveal_score_from_hq": {
      // Printed: score an HQ agenda whose advancement requirement is ≤ the
      // number of advancement tokens on Plan B (CR 1.2.1: card text wins).
      const planBAdv =
        state.cards[sourceId]?.advancementCounters ?? 0;
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
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: agendas.map((id) => ({
          id: `pb:${id}`,
          label: `Score ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "score_agenda_from_hq", cardId: id }),
        })),
      });
      return { ok: true };
    }
    case "score_agenda_from_hq": {
      const cardId = action.cardId;
      const idx = state.corp.hand.indexOf(cardId);
      if (idx < 0) return { ok: true };
      state.corp.hand.splice(idx, 1);
      state.corp.scoreArea.push(cardId);
      const card = state.cards[cardId]!;
      card.zone = "corp:score";
      card.faceup = true;
      log(state, `Plan B — score ${card.title} from HQ.`);
      return { ok: true };
    }
    case "trash_unregistered_rezzed_ice_gain_per_strength": {
      const ice = installedIceIds(state).filter((id) => state.cards[id]?.rezzed);
      if (ice.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: ice.map((id) => ({
          id: `unreg:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_unregistered_ice_gain", iceId: id }),
        })),
      });
      return { ok: true };
    }
    case "trash_unregistered_ice_gain": {
      const iceId = action.iceId;
      const ice = state.cards[iceId];
      if (!ice?.rezzed) return { ok: true };
      const str = ice.strength ?? 0;
      removeCardFromCurrentZone(state, iceId);
      state.corp.discardPile.push(iceId);
      ice.zone = "corp:archives";
      state.runner.credits += 2 * str;
      log(state, `Unregistered S&W — trash ice; gain ${2 * str}¢.`);
      return { ok: true };
    }
    case "pay_tori_hanzo_instead_net": {
      // Printed: you may pay 2¢ to do 1 core instead. The may/pay is the
      // damage_interrupt paid ability (creditCost 2); this leaf only replaces
      // the imminent expected effect (CR 9.9.10 / 1.2.1).
      const pending = state.pendingDamage;
      if (
        state.run?.netDamageWould !== 1 ||
        pending?.type !== "net" ||
        pending.remaining <= 0
      ) {
        log(
          state,
          `Tori Hanzō — not the first time the Corp would do net damage this run (CR ${CR.ordinalWould.number}).`,
        );
        return { ok: true };
      }
      pending.type = "core";
      pending.remaining = 1;
      log(
        state,
        `Tori Hanzō — replace net damage with 1 core damage (CR ${CR.ordinalWould.number}).`,
      );
      return { ok: true };
    }
    case "may_swap_two_installed_ice": {
      const ice = installedIceIds(state);
      if (ice.length < 2) {
        log(state, `Tenma Line — need 2 installed ice.`);
        return { ok: true };
      }
      const opts: { id: string; label: string; effect: Effect }[] = [];
      for (let i = 0; i < ice.length; i++) {
        for (let j = i + 1; j < ice.length; j++) {
          const a = ice[i]!;
          const b = ice[j]!;
          opts.push({
            id: `swap:${a}:${b}`,
            label: `Swap ${state.cards[a]!.title} and ${state.cards[b]!.title}`,
            effect: fx.do({
              kind: "swap_two_installed_ice",
              iceId: a,
              otherIceId: b,
            }),
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options: opts.slice(0, 12) });
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
    default:
      return null;
  }
}
