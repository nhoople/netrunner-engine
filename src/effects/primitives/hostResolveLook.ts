import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import { CR } from "../../timing/labels.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { controllerOf, trashCard } from "../../state/hostingAndTrash/trash.js";
import { hostCard } from "../../state/hostingAndTrash/host.js";
import { revealCards } from "../../state/visibility/reveal.js";
import type { RuleCite } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyMumbadDagPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "host_on_scored_agenda": {
      if (!state.run) return { ok: true };
      state.run.skipBreach = true;
      const agendas = state.corp.scoreArea.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (agendas.length === 0) {
        log(state, `Political Graffiti — no agenda in Corp score area.`);
        return { ok: true };
      }
      if (agendas.length === 1) {
        return applyMumbadDagPrimitive(ctx, {
          kind: "resolve_political_graffiti_host",
          agendaId: agendas[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: agendas.map((agendaId) => {
          const a = state.cards[agendaId]!;
          return {
            id: `pg:${agendaId}`,
            label: `Host on ${a.title}`,
            effect: fx.do({
              kind: "resolve_political_graffiti_host",
              agendaId,
            }),
          };
        }),
      });
      return { ok: true };
    }

    case "resolve_political_graffiti_host": {
      const agendaId = action.agendaId;
      const agenda = state.cards[agendaId];
      if (!agenda || !state.corp.scoreArea.includes(agendaId)) {
        log(state, `Political Graffiti — agenda no longer in score area.`);
        return { ok: true };
      }
      if (!source) return { ok: true };
      removeCardFromCurrentZone(state, sourceId);
      hostCard(state, source.id, agendaId, { installed: true });
      source.zone = `hosted:${agendaId}`;
      source.faceup = true;
      log(
        state,
        `Political Graffiti — host on ${agenda.title} (−1 agenda point while hosted; trash on virus purge).`,
      );
      return { ok: true };
    }

    case "trash_rezzed_paying_trash_cost": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (!c?.rezzed) continue;
          if (typeof c.trashCost !== "number") continue;
          if (state.runner.credits < c.trashCost) continue;
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Political Operative — no eligible rezzed card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...targets.map((cardId) => {
            const c = state.cards[cardId]!;
            const x = c.trashCost ?? 0;
            return {
              id: `po:${cardId}`,
              label: `Pay ${x}¢: trash ${c.title}`,
              effect: fx.do({
                kind: "trash_political_operative_resolve",
                cardId,
              }),
            };
          }),
          {
            id: "po:decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "trash_political_operative_resolve": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card?.rezzed) return { ok: true };
      const x = card.trashCost ?? 0;
      if (state.runner.credits < x) {
        log(state, `Political Operative — insufficient credits.`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, x);
      trashCard(state, cardId, { by: controllerOf(state, sourceId) });
      log(state, `Political Operative — pay ${x}¢; trash ${card.title}.`);
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

    case "may_add_operation_from_archives_to_hq": {
      const ops = state.corp.discardPile.filter(
        (id) => state.cards[id]?.type === "operation",
      );
      if (ops.length === 0) {
        log(state, `Clone Suffrage Movement — no operation in Archives.`);
        return { ok: true };
      }
      if (ops.length === 1) {
        return applyMumbadDagPrimitive(ctx, {
          kind: "add_operation_from_archives_to_hq_resolve",
          cardId: ops[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: ops.map((cardId) => ({
          id: `csm:${cardId}`,
          label: `Add ${state.cards[cardId]!.title} to HQ`,
          effect: fx.do({
            kind: "add_operation_from_archives_to_hq_resolve",
            cardId,
          }),
        })),
      });
      return { ok: true };
    }

    case "add_operation_from_archives_to_hq_resolve": {
      const cardId = action.cardId;
      if (!state.corp.discardPile.includes(cardId)) return { ok: true };
      const card = state.cards[cardId]!;
      if (!card.faceup) {
        revealCards(state, [card.id], sourceId);
        log(state, `Reveal ${card.title} (CR ${CR.revealFromHidden.number}).`);
      }
      state.corp.discardPile = state.corp.discardPile.filter(
        (id) => id !== cardId,
      );
      state.corp.hand.push(cardId);
      card.zone = "corp:hq";
      card.faceup = false;
      log(
        state,
        `Clone Suffrage Movement — add ${card.title} from Archives to HQ.`,
      );
      return { ok: true };
    }

    case "sensie_add_one_hq_to_bottom_rd": {
      if (state.corp.hand.length === 0) {
        log(state, `Sensie Actors Union — HQ empty.`);
        return { ok: true };
      }
      if (state.corp.hand.length === 1) {
        return applyMumbadDagPrimitive(ctx, {
          kind: "resolve_sensie_add_hq_to_bottom_rd",
          cardId: state.corp.hand[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: state.corp.hand.map((cardId) => ({
          id: `sensie:${cardId}`,
          label: `Add ${state.cards[cardId]!.title} to bottom of R&D`,
          effect: fx.do({
            kind: "resolve_sensie_add_hq_to_bottom_rd",
            cardId,
          }),
        })),
      });
      return { ok: true };
    }

    case "resolve_sensie_add_hq_to_bottom_rd": {
      const cardId = action.cardId;
      if (!state.corp.hand.includes(cardId)) return { ok: true };
      const card = state.cards[cardId]!;
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      state.corp.deck.push(cardId);
      card.zone = "corp:rd";
      card.faceup = false;
      log(
        state,
        `Sensie Actors Union — add ${card.title} from HQ to bottom of R&D.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
