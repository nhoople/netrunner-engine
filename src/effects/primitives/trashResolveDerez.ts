import {
  iceAtRunnerPosition,
  moveRunnerToOutermost,
} from "../../state/uninstallAndPosition/runPosition.js";
import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite, ServerId } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { getCardDef } from "../../cards/load.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { random } from "../../state/rng.js";
import { controllerOf, trashCard } from "../../state/hostingAndTrash/trash.js";
import { removeCardFromGame } from "../../state/uninstallAndPosition/uninstall.js";
import { fx, type Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

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

export function applyRedsandEasPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "may_trash_stack_top_then_trash_rd_per_resolved": {
      const enc = state.run?.encounter;
      const ice = enc ? state.cards[enc.iceId] : null;
      const isSentry = (ice?.subtypes ?? []).some(
        (s) => s.toLowerCase() === "sentry",
      );
      if (!enc || !ice || !isSentry) {
        log(state, `Persephone — pass was not after encountering a sentry.`);
        return { ok: true };
      }
      const resolved = enc.subroutinesResolved ?? 0;
      if (state.runner.deck.length === 0) {
        log(state, `Persephone — stack empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "accept",
            label: `Trash top of stack; trash ${resolved} from R&D`,
            effect: fx.do({
              kind: "resolve_trash",
              amount: resolved,
            }),
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

    case "resolve_trash": {
      const amount = Math.max(0, action.amount ?? 0);
      if (state.runner.deck.length > 0) {
        const top = state.runner.deck.shift()!;
        trashCard(state, top, { by: controllerOf(state, sourceId) });
        log(state, `Persephone — trash ${state.cards[top]?.title} from stack.`);
      }
      for (let i = 0; i < amount; i++) {
        if (state.corp.deck.length === 0) break;
        const top = state.corp.deck.shift()!;
        trashCard(state, top, { by: controllerOf(state, sourceId) });
        log(state, `Persephone — trash ${state.cards[top]?.title} from R&D.`);
      }
      return { ok: true };
    }

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

    case "install_rosetta_from_stack": {
      const cardId = action.cardId;
      const discount = action.discount ?? 0;
      const card = state.cards[cardId];
      if (!card || !state.runner.deck.includes(cardId)) {
        log(state, `Rosetta 2.0 — install target not in stack.`);
        return { ok: true };
      }
      state.runner.deck = state.runner.deck.filter((id) => id !== cardId);
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      const cost = Math.max(0, (card.installCost ?? 0) - discount);
      if (state.runner.credits < cost) {
        state.runner.hand.push(cardId);
        card.zone = "runner:grip";
        log(
          state,
          `Rosetta 2.0 — cannot pay ${cost}¢; ${card.title} added to grip.`,
        );
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      state.runner.installed.push(cardId);
      card.zone = "runner:installed";
      card.faceup = true;
      log(
        state,
        `Rosetta 2.0 — install ${card.title} for ${cost}¢ (−${discount}).`,
      );
      return { ok: true };
    }

    case "trash_aginfusion_approached_unrezzed_redirect": {
      const run = state.run;
      if (!run || run.position === null) {
        log(state, `AgInfusion — no approached ice.`);
        return { ok: true };
      }
      const iceId = iceAtRunnerPosition(state);
      const ice = iceId ? state.cards[iceId] : null;
      if (!ice || ice.rezzed) {
        log(state, `AgInfusion — approached ice must be unrezzed.`);
        return { ok: true };
      }
      trashCard(state, iceId!, { by: controllerOf(state, sourceId) });
      log(state, `AgInfusion — trash approached ${ice.title}.`);
      const attacked = run.attackedServerId;
      const servers = (Object.keys(state.servers) as ServerId[]).filter(
        (sid) => sid !== attacked,
      );
      if (servers.length === 0) {
        log(state, `AgInfusion — no other server.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: servers.map((sid) => ({
          id: `server:${sid}`,
          label: `Move Runner to ${sid}`,
          effect: fx.do({ kind: "redirect_aginfusion_resolve", serverId: sid }),
        })),
      });
      return { ok: true };
    }

    case "redirect_aginfusion_resolve": {
      const run = state.run;
      const sid = action.serverId as ServerId | undefined;
      if (!run || !sid || !state.servers[sid]) {
        log(state, `AgInfusion — invalid redirect server.`);
        return { ok: true };
      }
      // "The Runner moves to the outermost position of that server and
      // encounters any ice there" (CR 6.2.8b). Index 0 is outermost.
      if (!moveRunnerToOutermost(state, sid)) return { ok: true };
      run.encounter = null;
      const outer = state.servers[sid]!.ice[0];
      if (outer) {
        run.forceEncounterIceId = outer;
        // Unrezzed ice is not named: the log goes to both players (CR 1.21.1).
        const ice = state.cards[outer];
        log(
          state,
          `AgInfusion — Runner moves to outermost of ${sid} (${ice?.rezzed ? ice.title : "unrezzed ice"}).`,
        );
      } else {
        log(state, `AgInfusion — Runner moves to ${sid} (no ice).`);
      }
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

    case "place_one_then_choose": {
      const first = action.cardId;
      if (first && state.cards[first]) {
        state.cards[first]!.advancementCounters =
          (state.cards[first]!.advancementCounters ?? 0) + 1;
        log(
          state,
          `Audacity — place 1 advancement on ${state.cards[first]!.title}.`,
        );
      }
      const advanceable = installedCorpCards(state).filter((id) =>
        canAdvance(state, id),
      );
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: advanceable.map((id) => ({
          id: `adv:${id}`,
          label: `Place 1 advancement on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "move_all_advancements": {
      const withAdv = installedCorpCards(state).filter(
        (id) => (state.cards[id]?.advancementCounters ?? 0) > 0,
      );
      let total = 0;
      for (const id of withAdv) {
        total += state.cards[id]!.advancementCounters ?? 0;
        state.cards[id]!.advancementCounters = 0;
      }
      if (total === 0) {
        log(state, `Red Planet Couriers — no advancement counters.`);
        return { ok: true };
      }
      const targets = installedCorpCards(state).filter((id) =>
        canAdvance(state, id),
      );
      if (targets.length === 0) {
        log(
          state,
          `Red Planet Couriers — no advanceable target; counters lost.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `move:${id}`,
          label: `Move ${total} advancements onto ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: total,
          }),
        })),
      });
      return { ok: true };
    }

    default:
      return null;
  }
}
