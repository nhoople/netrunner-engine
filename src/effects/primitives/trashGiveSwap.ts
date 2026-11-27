import { log } from "../../state/setupAndEnd/createGame.js";
import { startPsiGame } from "../../state/turnAndActions/psi.js";
import { startTrace } from "../../state/turnAndActions/trace.js";
import { preventPendingInstalledTrash } from "../../state/hostingAndTrash/trashPrevent.js";
import { evalEffect, type EffectCtx } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { applySpinTcPrimitive } from "./breachTrashTurn.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { shuffleInPlace } from "../../state/rng.js";
import { controllerOf, trashCard } from "../../state/hostingAndTrash/trash.js";
import type { RuleCite } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applySpinFalDtPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  switch (action.kind) {
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
    case "trash_exec_sysop_clone_remove_bp": {
      const subtypes = new Set(["sysop", "executive", "clone"]);
      const cands: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id]!;
          if ((c.subtypes ?? []).some((s) => subtypes.has(s))) cands.push(id);
        }
      }
      if (cands.length === 0) {
        log(state, `Restoring Face — no sysop/executive/clone to trash.`);
        return { ok: true };
      }
      if (cands.length === 1) {
        const id = cands[0]!;
        // "Reveal and trash": revealed, so faceup (CR 1.21.6, 4.4.6b).
        trashCard(state, id, { by: "corp", faceup: true });
        log(state, `Restoring Face — trash ${state.cards[id]!.title}.`);
        return applySpinTcPrimitive(ctx, {
          kind: "remove_bad_publicity_up_to",
          max: 2,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `restoring-face:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.seq(
            fx.do({
              kind: "trash_installed_corp_card",
              cardId: id,
              revealed: true,
            }),
            fx.do({ kind: "remove_bad_publicity_up_to", max: 2 }),
          ),
        })),
        logLine: `Restoring Face — choose sysop/executive/clone to trash.`,
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
    case "install_program_from_grip": {
      const programs = state.runner.hand.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Savoir-faire — no program in grip.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `savoir-faire:${id}`,
          label: `Install ${state.cards[id]!.title} from grip`,
          effect: fx.do({
            kind: "install_program_from_grip_paying_cost",
            cardId: id,
          }),
        })),
        logLine: `Savoir-faire — install a program from grip (pay install cost).`,
      });
      return { ok: true };
    }
    case "prevent_trash_resource": {
      preventPendingInstalledTrash(state);
      log(state, `Fall Guy — prevent trash of another resource.`);
      return { ok: true };
    }
    case "reclamation_order_archives_to_hq": {
      // Printed: name a card, then add any number of copies of it from
      // Archives to HQ — not the whole Archives.
      const byDef = new Map<string, string[]>();
      for (const id of state.corp.discardPile) {
        const c = state.cards[id];
        if (!c?.defId || c.defId === state.cards[sourceId]?.defId) continue;
        const list = byDef.get(c.defId) ?? [];
        list.push(id);
        byDef.set(c.defId, list);
      }
      if (byDef.size === 0) {
        log(state, `Reclamation Order — no nameable card in Archives.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const [defId, ids] of byDef) {
        for (let k = 1; k <= ids.length; k++) {
          options.push({
            id: `reclaim:${defId}:${k}`,
            label: `Add ${k}× ${state.cards[ids[0]!]!.title} to HQ`,
            effect: fx.do({
              kind: "take_reclamation_copies_to_hq",
              defId,
              amount: k,
            }),
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }
    case "take_reclamation_copies_to_hq": {
      const copies = state.corp.discardPile.filter(
        (id) => state.cards[id]?.defId === action.defId,
      );
      const take = copies.slice(0, Math.max(0, action.amount ?? 0));
      for (const id of take) {
        state.corp.discardPile = state.corp.discardPile.filter((x) => x !== id);
        state.corp.hand.push(id);
        state.cards[id]!.zone = "corp:hq";
        state.cards[id]!.faceup = true; // revealed
      }
      log(
        state,
        `Reclamation Order — ${take.length} cop${take.length === 1 ? "y" : "ies"} from Archives to HQ.`,
      );
      return { ok: true };
    }
    case "trace_prevent_bad_publicity": {
      // Printed: Trace[3]; if successful, prevent all of that bad publicity
      // (CR 1.2.1).
      const amount = state.turn.pendingBadPublicityTake ?? 1;
      const noop: Effect = {
        op: "do",
        action: { kind: "gain_credits", side: "corp", amount: 0 },
      };
      startTrace(
        state,
        sourceId,
        3,
        noop,
        fx.do({ kind: "suffer_bad_publicity", amount }),
      );
      log(
        state,
        `Broadcast Square — trace (base 3) instead of bad publicity; BP only if trace fails.`,
      );
      return { ok: true };
    }
    case "shuffle_corporate_hq_to_rd_draw": {
      const n = state.corp.hand.length;
      for (let i = 0; i < n; i++) {
        const id = state.corp.hand.pop()!;
        state.corp.deck.push(id);
        state.cards[id]!.zone = "corp:rd";
        state.cards[id]!.faceup = false;
      }
      if (n > 0) shuffleInPlace(state, state.corp.deck);
      log(state, `Corporate Shuffle — shuffle ${n} from HQ into R&D.`);
      // The draw goes through the draw procedure, from the top of R&D
      // (CR 8.4.2). The Corp loses if R&D is empty when it must draw
      // (CR 1.7.2c).
      return evalEffect(
        ctx,
        fx.do({ kind: "draw", side: "corp", amount: action.draw }),
      );
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
    default:
      return null;
  }
}
