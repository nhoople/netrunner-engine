/** Breaker Bay (bb) SanSan pack primitives. */
import { log } from "../state/createGame.js";
import { recomputeRunnerMaxHandSize } from "../state/handSize.js";
import type { RuleCite } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { evalEffect } from "./eval.js";
import type { Effect, Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function shuffleDeck(deck: string[]): void {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = tmp;
  }
}

export function applySansanBbPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "dorm_computer_run_prevent_all_tags": {
      state.turn.bbPreventAllTagsThisRun = true;
      const r = evalEffect(ctx, {
        op: "do",
        action: { kind: "may_start_run", servers: "any" },
      });
      if (!r.ok) return r;
      log(state, `Dorm Computer — run; prevent all tags this run.`);
      return { ok: true };
    }

    case "hayley_install_same_type_from_grip": {
      const lastId = state.turn.installedThisTurn.at(-1);
      const last = lastId ? state.cards[lastId] : null;
      if (!last?.type) {
        log(state, `Hayley — no install this turn.`);
        return { ok: true };
      }
      const typ = last.type;
      const grip = state.runner.hand.filter((id) => state.cards[id]?.type === typ);
      if (grip.length === 0) {
        log(state, `Hayley — no ${typ} in grip.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        grip.map((id) => ({
          id: `hayley:${id}`,
          label: `Install ${state.cards[id]!.title}`,
          effect: {
            op: "do",
            action: { kind: "hayley_install_grip_card", cardId: id },
          },
        }));
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      log(state, `Hayley — may install another ${typ} from grip.`);
      return { ok: true };
    }

    case "hayley_install_grip_card": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.hand.includes(cardId)) {
        return {
          ok: false,
          error: "Hayley install — card not in grip.",
          cites: [],
        };
      }
      const cost = card.installCost ?? 0;
      if (state.runner.credits < cost) {
        return {
          ok: false,
          error: "Hayley install — insufficient credits.",
          cites: [],
        };
      }
      state.runner.credits -= cost;
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      state.runner.rig.push(cardId);
      card.zone = "runner:rig";
      card.faceup = true;
      state.turn.installedThisTurn.push(cardId);
      log(state, `Hayley — install ${card.title} for ${cost}¢.`);
      return { ok: true };
    }

    case "draw_until_grip_equals_max_hand_size": {
      recomputeRunnerMaxHandSize(state);
      const max = state.runner.maxHandSize;
      while (state.runner.hand.length < max && state.runner.deck.length > 0) {
        const top = state.runner.deck.shift()!;
        state.runner.hand.push(top);
        const c = state.cards[top];
        if (c) c.zone = "runner:grip";
      }
      log(
        state,
        `Game Day — draw until grip equals max hand size (${max}).`,
      );
      return { ok: true };
    }

    case "london_library_host_non_virus_program_ignore_cost": {
      const grip = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "program" && !(c.subtypes ?? []).includes("virus")
        );
      });
      if (grip.length === 0) {
        log(state, `London Library — no non-virus program in grip.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...grip.map((id) => ({
            id: `ll-host:${id}`,
            label: `Host ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "london_library_host_program" as const,
                cardId: id,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
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
      };
      return { ok: true };
    }

    case "london_library_host_program": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.hand.includes(cardId)) {
        return {
          ok: false,
          error: "London Library — program not in grip.",
          cites: [],
        };
      }
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      card.hostId = sourceId;
      card.zone = `hosted:${sourceId}`;
      card.faceup = true;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(cardId);
      // Still counts as installed for MU — add to rig while hosted.
      if (!state.runner.rig.includes(cardId)) state.runner.rig.push(cardId);
      log(state, `London Library — host ${card.title} (ignore install cost).`);
      return { ok: true };
    }

    case "london_library_add_hosted_program_to_grip": {
      const hosted = (source.hostedCardIds ?? []).filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (hosted.length === 0) {
        log(state, `London Library — no hosted program.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...hosted.map((id) => ({
            id: `ll-grip:${id}`,
            label: `Add ${state.cards[id]!.title} to grip`,
            effect: {
              op: "do" as const,
              action: {
                kind: "london_library_return_program" as const,
                cardId: id,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
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
      };
      return { ok: true };
    }

    case "london_library_return_program": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.hostId !== sourceId) {
        return {
          ok: false,
          error: "London Library — program not hosted.",
          cites: [],
        };
      }
      source.hostedCardIds = (source.hostedCardIds ?? []).filter(
        (id) => id !== cardId,
      );
      state.runner.rig = state.runner.rig.filter((id) => id !== cardId);
      card.hostId = undefined;
      card.zone = "runner:grip";
      state.runner.hand.push(cardId);
      log(state, `London Library — add ${card.title} to grip.`);
      return { ok: true };
    }

    case "search_stack_type_add_to_grip": {
      const typ = action.cardType;
      const matches = state.runner.deck.filter(
        (id) => state.cards[id]?.type === typ,
      );
      if (matches.length === 0) {
        shuffleDeck(state.runner.deck);
        log(state, `Search stack for ${typ} — none found; shuffle.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: matches.map((id) => ({
          id: `stack-type:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: {
            op: "do" as const,
            action: {
              kind: "search_stack_type_add_to_grip_pick" as const,
              cardId: id,
            },
          },
        })),
      };
      return { ok: true };
    }

    case "search_stack_type_add_to_grip_pick": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.deck.includes(cardId)) {
        return {
          ok: false,
          error: "Search stack — card not in stack.",
          cites: [],
        };
      }
      state.runner.deck = state.runner.deck.filter((id) => id !== cardId);
      state.runner.hand.push(cardId);
      card.zone = "runner:grip";
      shuffleDeck(state.runner.deck);
      log(state, `Reveal ${card.title}; add to grip; shuffle stack.`);
      return { ok: true };
    }

    case "score_another_installed_copy_of_self": {
      const defId = source.defId;
      const installed = Object.values(state.cards).filter(
        (c) =>
          c &&
          c.defId === defId &&
          c.id !== sourceId &&
          c.type === "agenda" &&
          !state.corp.score.includes(c.id) &&
          (c.zone?.startsWith("server:") ?? false),
      );
      const ids = installed.map((c) => c!.id);
      if (ids.length === 0) {
        log(state, `Research Grant — no other installed copy.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: ids.map((id) => ({
          id: `rg-score:${id}`,
          label: `Score ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "score_installed_agenda_ignore_requirement" as const,
              cardId: id,
            },
          },
        })),
      };
      return { ok: true };
    }

    case "score_installed_agenda_ignore_requirement": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "agenda") {
        return {
          ok: false,
          error: "Not an installed agenda.",
          cites: [],
        };
      }
      // Remove from server root.
      for (const server of Object.values(state.servers)) {
        if (server.root.includes(cardId)) {
          server.root = server.root.filter((id) => id !== cardId);
        }
      }
      state.corp.score.push(cardId);
      card.zone = "corp:score";
      card.faceup = true;
      card.rezzed = true;
      log(
        state,
        `Research Grant — score ${card.title} (ignore advancement requirement).`,
      );
      return { ok: true };
    }

    case "search_rd_up_to_x_subtype_to_hq": {
      const subtype = action.subtype;
      const maxX = state.corp.credits;
      // Prefer explicit lastPlayCostX when set (playCostX path); else choose.
      let x = state.turn.lastPlayCostX;
      if (x === undefined || x === null) {
        // Self-contained: pay X = number of distinct matching titles available, capped by credits.
        const seen = new Set<string>();
        let available = 0;
        for (const id of state.corp.deck) {
          const c = state.cards[id];
          if (!c || !(c.subtypes ?? []).includes(subtype)) continue;
          const key = c.defId ?? c.id;
          if (seen.has(key)) continue;
          seen.add(key);
          available += 1;
        }
        x = Math.min(maxX, available);
        state.corp.credits -= x;
        state.turn.lastPlayCostX = x;
      }
      if (x <= 0) {
        shuffleDeck(state.corp.deck);
        log(state, `Recruiting Trip — X=0; shuffle R&D.`);
        return { ok: true };
      }
      const seen = new Set<string>();
      const matches: string[] = [];
      for (const id of state.corp.deck) {
        const c = state.cards[id];
        if (!c) continue;
        if (!(c.subtypes ?? []).includes(subtype)) continue;
        if (seen.has(c.defId ?? c.id)) continue;
        seen.add(c.defId ?? c.id);
        matches.push(id);
        if (matches.length >= x) break;
      }
      for (const id of matches) {
        state.corp.deck = state.corp.deck.filter((y) => y !== id);
        state.corp.hand.push(id);
        const c = state.cards[id];
        if (c) c.zone = "corp:hq";
        log(state, `Recruiting Trip — reveal ${c?.title ?? id}; add to HQ.`);
      }
      shuffleDeck(state.corp.deck);
      log(state, `Recruiting Trip — shuffle R&D (X=${x}).`);
      return { ok: true };
    }

    default:
      return null;
  }
}
