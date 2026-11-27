import { log } from "../../state/setupAndEnd/createGame.js";
import type { EffectCtx } from "../eval.js";
import { getCardDef } from "../../cards/load.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { random } from "../../state/rng.js";
import { removeCardFromGame } from "../../state/uninstallAndPosition/uninstall.js";
import { fx, type Primitive } from "../ir.js";
import type { RuleCite } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyRedsandEasPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "search_rosetta_rfg_program_install_non_virus": {
      const programs = state.runner.installed.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Rosetta 2.0 — no installed program to remove.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `rfg:${id}`,
          label: `Remove ${state.cards[id]!.title} from the game`,
          effect: fx.do({ kind: "search_rosetta_rfg_then", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "search_rosetta_rfg_then": {
      const rfgId = (action as { cardId: string }).cardId;
      const rfg = state.cards[rfgId];
      if (!rfg || !state.runner.installed.includes(rfgId)) {
        log(state, `Rosetta 2.0 — RFG target gone.`);
        return { ok: true };
      }
      const discount =
        rfg.installCost ??
        (rfg.defId ? getCardDef(rfg.defId)?.installCost : undefined) ??
        0;
      removeCardFromGame(state, rfgId);
      log(state, `Rosetta 2.0 — remove ${rfg.title} from the game.`);
      const matches = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "program") return false;
        return !(c.subtypes ?? []).some((s) => s.toLowerCase() === "virus");
      });
      // Shuffle after search regardless.
      const shuffle = () => {
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(random(state) * (i + 1));
          const tmp = state.runner.deck[i]!;
          state.runner.deck[i] = state.runner.deck[j]!;
          state.runner.deck[j] = tmp;
        }
      };
      if (matches.length === 0) {
        shuffle();
        log(state, `Rosetta 2.0 — no non-virus program in stack.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: matches.map((id) => ({
          id: `install:${id}`,
          label: `Install ${state.cards[id]!.title} (−${discount}¢)`,
          effect: fx.do({
            kind: "install_rosetta_from_stack",
            cardId: id,
            discount,
          }),
        })),
      });
      return { ok: true };
    }

    case "choose_hq": {
      const cardId = action.cardId;
      const rest = action.restIds ?? [];
      if (!cardId || !state.corp.deck.includes(cardId)) {
        log(state, `Bamboo Dome — chosen card not on R&D.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((id) => id !== cardId);
      state.corp.hand.push(cardId);
      state.cards[cardId]!.zone = "corp:hq";
      state.cards[cardId]!.faceup = false;
      log(state, `Bamboo Dome — add ${state.cards[cardId]!.title} to HQ.`);
      const still = rest.filter((id) => state.corp.deck.includes(id));
      if (still.length <= 1) {
        // Keep relative order; already on top after removing HQ card.
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: still.map((id) => ({
          id: `top:${id}`,
          label: `Top: ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "bamboo_dome_order_rest",
            ordered: [id],
            remaining: still.filter((x) => x !== id),
          }),
        })),
      });
      return { ok: true };
    }

    case "bamboo_dome_order_rest": {
      const ordered = [...(action.ordered ?? [])];
      let remaining = [...(action.remaining ?? [])];
      // Printed: return the others in any order. With one card left the order
      // is fixed — no further choice (CR 1.2.1).
      if (remaining.length === 1) {
        ordered.push(remaining[0]!);
        remaining = [];
      }
      if (remaining.length === 0) {
        // Rebuild deck: ordered (top-first) then the rest of deck without those.
        const set = new Set(ordered);
        state.corp.deck = state.corp.deck.filter((id) => !set.has(id));
        state.corp.deck = [...ordered, ...state.corp.deck];
        log(
          state,
          `Bamboo Dome — return ${ordered.map((id) => state.cards[id]?.title).join(", ")} to top of R&D.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: remaining.map((id) => ({
          id: `next:${id}`,
          label: `Next: ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "bamboo_dome_order_rest",
            ordered: [...ordered, id],
            remaining: remaining.filter((x) => x !== id),
          }),
        })),
      });
      return { ok: true };
    }

    default:
      return null;
  }
}
