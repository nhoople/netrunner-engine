import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
/** The Devil and the Dragon (tdatd) Kitara pack primitives — v1.139.0. */
import { log } from "../../state/setupAndEnd/createGame.js";
import type { EffectCtx } from "../eval.js";
import { evalEffect } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { pickRandomSubset, shuffleInPlace } from "../../state/rng.js";
import { chooseCards } from "../triggers/chooseCards.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { uninstallCard } from "../../state/uninstallAndPosition/uninstall.js";
import type { RuleCite } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function lastAgendaAdvancementRequirement(state: EffectCtx["state"]): number {
  const id = state.turn.lastScoredOrStolenAgendaId;
  if (id) {
    const c = state.cards[id];
    if (c?.advancementRequirement != null) return c.advancementRequirement;
  }
  return 0;
}

export function applyKitaraTdatdPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "tdatd_glut_cipher": {
      const archives = state.corp.discardPile;
      if (archives.length < 5) {
        log(
          state,
          `Glut Cipher — Archives has ${archives.length} cards (need 5); no effect.`,
        );
        return { ok: true };
      }
      // "the Corp adds exactly 5 cards from Archives to HQ": the Corp picks
      // them (CR 1.15.2).
      if (!action.cardIds) {
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "corp",
            candidates: [...archives],
            count: 5,
            purpose: "resume",
            label: "add to HQ from Archives",
            resume: { kind: "tdatd_glut_cipher" },
          }),
        );
      }
      const moved = action.cardIds.filter((id) => archives.includes(id));
      for (const id of moved) {
        state.corp.discardPile = state.corp.discardPile.filter((x) => x !== id);
        const c = state.cards[id]!;
        c.zone = "corp:hq";
        c.faceup = false;
        c.rezzed = false;
        state.corp.hand.push(id);
      }
      log(
        state,
        `Glut Cipher — Corp adds ${moved.length} from Archives to HQ.`,
      );
      if (moved.length < 5) return { ok: true };
      // Trash 5 at random from HQ. They enter Archives facedown, so the
      // log does not name them (CR 4.4.6b).
      const trash = pickRandomSubset(state, state.corp.hand, 5);
      for (const id of trash) {
        // "They trash": the Corp carries it out (CR 1.14.5).
        // Not visible to the Runner when trashed: facedown (CR 4.4.6b).
        trashCard(state, id, { by: "corp" });
      }
      log(state, `Glut Cipher — trash ${trash.length} from HQ at random.`);
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

    case "shuffle_because_i_can_root": {
      const serverId = state.run?.attackedServerId;
      if (!serverId) {
        log(state, `Because I Can — no attacked server.`);
        return { ok: true };
      }
      const server = state.servers[serverId];
      if (!server) return { ok: true };
      const root = [...server.root];
      for (const id of root) uninstallCard(state, id, "deck-bottom");
      shuffleInPlace(state, state.corp.deck);
      log(
        state,
        `Because I Can — shuffle ${root.length} card(s) from ${serverId} root into R&D.`,
      );
      return { ok: true };
    }

    case "lose_tempus_clicks": {
      const lose = Math.min(2, state.runner.clicks);
      state.runner.clicks -= lose;
      log(
        state,
        `Tempus — Runner loses ${lose} click(s) → ${state.runner.clicks}.`,
      );
      return { ok: true };
    }

    case "tdatd_sadaka_arrange": {
      // Printed: arrange the looked-at cards in any order (CR 1.2.1).
      // Reuse the shared pick_rd_arrange flow.
      const cardIds = (action as { cardIds: string[] }).cardIds ?? [];
      if (cardIds.length === 0) return { ok: true };
      if (state.turn.rdLookedCards.length > 0) {
        return {
          ok: false,
          error: "R&D look already in progress.",
          cites: [],
        };
      }
      state.turn.rdLookedCards = [...cardIds];
      state.turn.rdArrangePlaced = [];
      for (const id of cardIds) {
        state.cards[id]!.faceup = true;
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cardIds.map((id) => ({
          id: `rd-arrange:${id}`,
          label: `Place ${state.cards[id]!.title} on top next`,
          effect: fx.do({ kind: "pick_rd_arrange", cardId: id }),
        })),
        logLine: `Sadaka — arrange top of R&D.`,
      });
      return { ok: true };
    }

    case "shuffle_sadaka": {
      const cardIds = (action as { cardIds: string[] }).cardIds;
      state.corp.deck = [...cardIds, ...state.corp.deck];
      shuffleInPlace(state, state.corp.deck);
      log(state, `Sadaka — shuffle R&D.`);
      return { ok: true };
    }

    case "trace_amani": {
      const x = lastAgendaAdvancementRequirement(state);
      log(state, `Amani Senai — Trace[${x}].`);
      return evalEffect(ctx, {
        op: "do",
        action: {
          kind: "trace",
          strength: x,
          onSuccess: fx.do({ kind: "tdatd_amani_bounce" }),
        },
      });
    }

    default:
      return null;
  }
}
