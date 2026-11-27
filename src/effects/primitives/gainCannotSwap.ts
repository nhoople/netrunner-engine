import {
  resolveChronosFirstNetPick,
  resolveRibsPick,
} from "../../state/damageAndPrevention/damage.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import type { EffectCtx } from "../eval.js";
import type { Primitive } from "../ir.js";
import type { RuleCite, ServerId } from "../../state/types.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import {
  hostCard,
  unhostAllFrom,
  unhostCard,
} from "../../state/hostingAndTrash/host.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applySansanUotPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;

  switch (action.kind) {
    case "gain_arm_credits_on_first_agenda_access": {
      state.turn.uotFirstAgendaAccessCredits = action.amount;
      log(
        state,
        `${source.title} — first agenda access this turn gains ${action.amount}¢.`,
      );
      return { ok: true };
    }

    case "host_up_to_3_from_grip_facedown": {
      // Bookmark: "Host up to 3 cards from your grip" each time it is used;
      // the card has no limit on how many it hosts in all (CR 1.2.1).
      if (state.runner.hand.length === 0) {
        log(state, `${source.title} — no card in the grip to host.`);
        return { ok: true };
      }
      state.turn.uotBookmarkHostRemaining = 3;
      return offerBookmarkHostChoice(ctx);
    }

    case "uot_bookmark_host_one": {
      const cardId = action.cardId;
      if (!state.runner.hand.includes(cardId)) return { ok: true };
      if ((state.turn.uotBookmarkHostRemaining ?? 0) <= 0) return { ok: true };
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      const card = state.cards[cardId]!;
      hostCard(state, card.id, sourceId, { installed: true });
      card.faceup = false;
      card.zone = `hosted:${sourceId}`;
      state.turn.uotBookmarkHostRemaining =
        (state.turn.uotBookmarkHostRemaining ?? 1) - 1;
      log(state, `${source.title} hosts a card facedown from grip.`);
      if (
        (state.turn.uotBookmarkHostRemaining ?? 0) <= 0 ||
        state.runner.hand.length === 0
      ) {
        state.turn.uotBookmarkHostRemaining = undefined;
        return { ok: true };
      }
      return offerBookmarkHostChoice(ctx);
    }

    case "add_all_hosted_to_grip": {
      const hosted = [...(source.hostedCardIds ?? [])];
      unhostAllFrom(state, source.id);
      for (const id of hosted) {
        const card = state.cards[id];
        if (!card) continue;
        // Set aside as the [trash] cost was paid (CR 9.5.5): leave set-aside.
        removeCardFromCurrentZone(state, id);
        unhostCard(state, card.id);
        card.faceup = true;
        card.zone = "runner:grip";
        state.runner.hand.push(id);
      }
      log(
        state,
        `${source.title} — add ${hosted.length} hosted card(s) to grip.`,
      );
      return { ok: true };
    }

    case "gain_if_rezzed_asset_in_root": {
      // Find server hosting this upgrade
      let serverId: ServerId | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.root.includes(sourceId)) {
          serverId = sid as ServerId;
          break;
        }
      }
      if (!serverId) return { ok: true };
      const root = state.servers[serverId]!.root;
      const hasRezzedAsset = root.some((id) => {
        const c = state.cards[id];
        return c?.rezzed && c.type === "asset";
      });
      if (!hasRezzedAsset) {
        log(state, `Expo Grid — no rezzed asset in this server root.`);
        return { ok: true };
      }
      state.corp.credits += 1;
      log(state, `Expo Grid — gain 1¢ → ${state.corp.credits}¢.`);
      return { ok: true };
    }

    case "suffer_chosen_damage": {
      resolveRibsPick(state, {
        type: action.damage,
        amount: action.amount,
        sourceId: action.damageSourceId,
        beforeCore: action.beforeCore,
        count: action.count,
        picked: [...action.picked],
      });
      return { ok: true };
    }

    case "trash_chronos_pick": {
      // An empty id is the Corp selecting no card.
      resolveChronosFirstNetPick(
        state,
        action.cardId === "" ? null : action.cardId,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}

function offerBookmarkHostChoice(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId]!;
  const remaining = state.turn.uotBookmarkHostRemaining ?? 0;
  if (remaining <= 0 || state.runner.hand.length === 0) {
    state.turn.uotBookmarkHostRemaining = undefined;
    return { ok: true };
  }
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: [
      ...state.runner.hand.map((cardId) => ({
        id: `bookmark-host:${cardId}`,
        label: `Host ${state.cards[cardId]!.title} facedown`,
        effect: {
          op: "do" as const,
          action: {
            kind: "uot_bookmark_host_one" as const,
            cardId,
          },
        },
      })),
      {
        id: "bookmark-done",
        label: "Done hosting",
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
    logLine: `${source.title} — host from grip (${remaining} remaining capacity).`,
  });
  return { ok: true };
}
