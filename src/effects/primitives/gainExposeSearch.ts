import {
  markSubroutineBroken,
  subroutineBreakBlock,
} from "../../state/turnAndActions/break.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { offerRdArrangeChoice } from "../eval.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { random } from "../../state/rng.js";
import { uninstallCard } from "../../state/uninstallAndPosition/uninstall.js";
import type { RuleCite } from "../../state/types.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyKitaraDtwnPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "gain_credits_equal_to_last_purged_viruses": {
      const n = state.turn.lastVirusCountersPurged ?? 0;
      state.runner.credits += n;
      log(
        state,
        `${source?.title ?? "Acacia"} — gain ${n}¢ (virus counters purged) → ${state.runner.credits}¢.`,
      );
      return { ok: true };
    }

    case "search_kabonesa_install": {
      const matches = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        return c?.type === "program" && !(c.subtypes ?? []).includes("virus");
      });
      if (matches.length === 0) {
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(random(state) * (i + 1));
          const tmp = state.runner.deck[i]!;
          state.runner.deck[i] = state.runner.deck[j]!;
          state.runner.deck[j] = tmp;
        }
        log(state, `${source?.title ?? "Kabonesa Wu"} — no non-virus program.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: matches.map((id) => ({
          id: `kabonesa:${id}`,
          label: `Install ${state.cards[id]!.title} (−1¢)`,
          effect: fx.do({
            kind: "install_kabonesa_resolve",
            cardId: id,
          }),
        })),
        logLine: `${source?.title ?? "Kabonesa Wu"} — search stack.`,
      });
      return { ok: true };
    }

    case "break_first_subroutine": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `${source?.title ?? "Kongamato"} — no encounter.`);
        return { ok: true };
      }
      const idx = enc.broken.findIndex((b) => !b);
      if (idx < 0) {
        log(state, `${source?.title ?? "Kongamato"} — no unbroken subroutine.`);
        return { ok: true };
      }
      const blocked = subroutineBreakBlock(state, sourceId, idx);
      if (blocked) {
        log(state, `${source?.title ?? "Kongamato"} — ${blocked.error}`);
        return { ok: true };
      }
      markSubroutineBroken(state, sourceId, idx);
      log(
        state,
        `${source?.title ?? "Kongamato"} — break first subroutine (index ${idx}).`,
      );
      return { ok: true };
    }

    case "search_emergent_install": {
      const matches = state.runner.deck.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware";
      });
      if (matches.length === 0) {
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(random(state) * (i + 1));
          const tmp = state.runner.deck[i]!;
          state.runner.deck[i] = state.runner.deck[j]!;
          state.runner.deck[j] = tmp;
        }
        log(state, `Emergent Creativity — no program/hardware in stack.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: matches.map((id) => ({
          id: `emergent:${id}`,
          label: `Install ${state.cards[id]!.title} (−${action.discount}¢)`,
          effect: fx.do({
            kind: "install_emergent_resolve",
            cardId: id,
            discount: action.discount,
          }),
        })),
      });
      return { ok: true };
    }

    case "corp_additional_click_next_turn": {
      state.corpAllottedClicksDeltaNextTurn =
        (state.corpAllottedClicksDeltaNextTurn ?? 0) + 1;
      log(
        state,
        `Nightdancer — Corp +1 click next turn (pending ${state.corpAllottedClicksDeltaNextTurn}).`,
      );
      return { ok: true };
    }

    case "dtwn_bacterial_programming": {
      const n = Math.min(7, state.corp.deck.length);
      if (n === 0) {
        log(state, `Bacterial Programming — R&D empty.`);
        return { ok: true };
      }
      const looked = state.corp.deck.slice(0, n);
      state.corp.deck = state.corp.deck.slice(n);
      // Stage looked cards on the source for multi-step choice.
      (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked =
        looked;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "begin",
            label: `Looked at ${n} — choose cards to add to HQ / trash / arrange`,
            effect: fx.do({ kind: "dtwn_bacterial_partition" }),
          },
        ],
        logLine: `Bacterial Programming — look at top ${n} of R&D.`,
      });
      return { ok: true };
    }

    case "dtwn_bacterial_partition": {
      const looked =
        (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked ??
        [];
      if (looked.length === 0) {
        log(state, `Bacterial Programming — nothing left to arrange.`);
        return { ok: true };
      }
      // Each card may go to HQ or be trashed; "Done" then arranges the rest
      // on top of R&D in the order the Corp picks.
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "keep-order",
          label: "Done — arrange the rest on top of R&D",
          effect: fx.do({
            kind: "dtwn_bacterial_finish",
            toHq: [],
            toTrash: [],
            arrange: looked,
          }),
        },
      ];
      for (const id of looked) {
        options.push({
          id: `hq:${id}`,
          label: `Add ${state.cards[id]!.title} to HQ`,
          effect: fx.do({
            kind: "dtwn_bacterial_take_hq",
            cardId: id,
          }),
        });
        options.push({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "trash_bacterial_one",
            cardId: id,
          }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "dtwn_bacterial_take_hq": {
      const looked =
        (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked ??
        [];
      const id = action.cardId;
      (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked =
        looked.filter((x) => x !== id);
      state.corp.hand.push(id);
      state.cards[id]!.zone = "corp:hq";
      state.cards[id]!.faceup = false;
      log(state, `Bacterial Programming — add 1 card to HQ.`);
      return (
        applyKitaraDtwnPrimitive(ctx, {
          kind: "dtwn_bacterial_partition",
        }) ?? { ok: true }
      );
    }

    case "dtwn_bacterial_finish": {
      for (const id of action.toHq) {
        state.corp.hand.push(id);
        state.cards[id]!.zone = "corp:hq";
      }
      for (const id of action.toTrash) {
        // Not visible to the Runner when trashed: facedown (CR 4.4.6b).
        trashCard(state, id, { by: "corp", faceup: false });
      }
      // "arrange the rest in any order": with more than one card left the
      // Corp picks the order (CR 1.15.2).
      if (action.arrange.length > 1 && state.turn.rdLookedCards.length === 0) {
        delete (source as { dtwnBacterialLooked?: string[] })
          .dtwnBacterialLooked;
        state.turn.rdLookedCards = [...action.arrange];
        state.turn.rdArrangePlaced = [];
        return offerRdArrangeChoice(state, sourceId);
      }
      // arrange: bottom-to-top → unshift in reverse so first is top
      for (let i = action.arrange.length - 1; i >= 0; i--) {
        const id = action.arrange[i]!;
        state.corp.deck.unshift(id);
        state.cards[id]!.zone = "corp:rd";
        state.cards[id]!.faceup = false;
      }
      delete (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked;
      log(state, `Bacterial Programming — finish arrange.`);
      return { ok: true };
    }

    case "choose_jua_two_bounce_one": {
      const installed = [...state.runner.installed];
      if (installed.length === 0) {
        log(state, `Jua — Runner has no installed cards.`);
        return { ok: true };
      }
      if (installed.length === 1) {
        // Choose the only card; Runner must bounce it.
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: [
            {
              id: `bounce:${installed[0]}`,
              label: `Add ${state.cards[installed[0]!]!.title} to top of stack`,
              effect: fx.do({
                kind: "resolve_jua_bounce",
                cardId: installed[0]!,
              }),
            },
          ],
        });
        return { ok: true };
      }
      // Corp chooses 2; then Runner picks which to bounce.
      const pairs: [string, string][] = [];
      for (let i = 0; i < installed.length; i++) {
        for (let j = i + 1; j < installed.length; j++) {
          pairs.push([installed[i]!, installed[j]!]);
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: pairs.map(([a, b]) => ({
          id: `pair:${a}:${b}`,
          label: `Choose ${state.cards[a]!.title} and ${state.cards[b]!.title}`,
          effect: fx.do({
            kind: "dtwn_jua_runner_pick_bounce",
            cardIds: [a, b],
          }),
        })),
      });
      return { ok: true };
    }

    case "dtwn_jua_runner_pick_bounce": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: action.cardIds.map((id) => ({
          id: `bounce:${id}`,
          label: `Add ${state.cards[id]!.title} to top of stack`,
          effect: fx.do({ kind: "resolve_jua_bounce", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "resolve_jua_bounce": {
      const id = action.cardId;
      if (!state.runner.installed.includes(id)) return { ok: true };
      const card = state.cards[id]!;
      uninstallCard(state, id, "deck-top", {
        logLine: `Jua — add ${card.title} to top of the stack.`,
      });
      return { ok: true };
    }

    case "dtwn_threat_assessment": {
      const installed = [...state.runner.installed];
      if (installed.length === 0) {
        log(state, `Threat Assessment — no installed Runner cards.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: installed.map((id) => ({
          id: `threat:${id}`,
          label: `Choose ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "resolve_threat_assessment", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "resolve_threat_assessment": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "tags",
            label: "Take 2 tags",
            effect: fx.do({ kind: "give_tags", amount: 2 }),
          },
          {
            id: "bounce",
            label: `Add ${state.cards[action.cardId]?.title ?? "card"} to top of stack`,
            effect: fx.do({
              kind: "resolve_jua_bounce",
              cardId: action.cardId,
            }),
          },
        ],
      });
      return { ok: true };
    }

    case "shuffle_distract_archives": {
      const arch = [...state.corp.discardPile];
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "shuffle-0",
          label: "Shuffle 0 from Archives into R&D",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        },
      ];
      for (const id of arch) {
        options.push({
          id: `sh1:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into R&D`,
          effect: fx.do({
            kind: "shuffle_distract_one",
            cardId: id,
            remainingAfter: action.remaining - 1,
          }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "shuffle_distract_one": {
      const id = action.cardId;
      if (state.corp.discardPile.includes(id)) {
        state.corp.discardPile = state.corp.discardPile.filter((x) => x !== id);
        state.corp.deck.push(id);
        state.cards[id]!.zone = "corp:rd";
        state.cards[id]!.faceup = false;
        log(
          state,
          `Distract the Masses — shuffle ${state.cards[id]!.title} into R&D.`,
        );
      }
      // Shuffle deck after adds
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      if (action.remainingAfter > 0) {
        return (
          applyKitaraDtwnPrimitive(ctx, {
            kind: "shuffle_distract_archives",
            remaining: action.remainingAfter,
          }) ?? { ok: true }
        );
      }
      return { ok: true };
    }

    default:
      return null;
  }
}
