/** The Underway (uw) SanSan pack primitives. */
import { openCardName } from "../../state/visibility/seatVisibility.js";
import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { exposeLegalTargets } from "../../state/visibility/expose.js";
import type { RuleCite } from "../../state/types.js";
import { fireOnInstall } from "../../state/triggers/cardLifecycleHooks.js";
import type { EffectCtx } from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { hostCard, unhostCard } from "../../state/hostingAndTrash/host.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import type { Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applySansanUwPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;

  switch (action.kind) {
    case "host_top_n_of_stack_facedown": {
      const n = action.amount;
      for (let i = 0; i < n; i++) {
        const top = state.runner.deck[0];
        if (!top) {
          log(state, `${source.title} — stack empty while hosting.`);
          break;
        }
        state.runner.deck.shift();
        const card = state.cards[top]!;
        hostCard(state, card.id, sourceId, { installed: true });
        card.faceup = false;
        card.zone = `hosted:${sourceId}`;
        log(state, `${source.title} hosts a card facedown from stack.`);
      }
      return { ok: true };
    }

    case "install_hosted": {
      const discount = action.discount ?? 1;
      const hosted = (source.hostedCardIds ?? []).filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware" || t === "resource";
      });
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted installable card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: hosted.map((cardId) => ({
          id: `peddler:${cardId}`,
          label: `Install ${state.cards[cardId]!.title} (−${discount}¢)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_street_peddler_hosted_card" as const,
              cardId,
              discount,
            },
          },
        })),
        logLine: `${source.title} — choose a hosted card to install.`,
      });
      return { ok: true };
    }

    case "install_street_peddler_hosted_card": {
      const cardId = action.cardId;
      const discount = action.discount ?? 1;
      const card = state.cards[cardId];
      if (
        !card ||
        !(source.hostedCardIds ?? []).includes(cardId) ||
        (card.type !== "program" &&
          card.type !== "hardware" &&
          card.type !== "resource")
      ) {
        log(state, `Street Peddler — invalid hosted card.`);
        return { ok: true };
      }
      const cost = Math.max(0, (card.installCost ?? 0) - discount);
      if (state.runner.credits < cost) {
        log(state, `Street Peddler — insufficient credits (${cost}¢).`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      state.runner.setAside = (state.runner.setAside ?? []).filter(
        (id) => id !== cardId,
      );
      unhostCard(state, card.id);
      card.zone = "runner:installed";
      card.faceup = true;
      state.runner.installed.push(cardId);
      log(state, `Street Peddler — install ${card.title} for ${cost}¢.`);
      fireOnInstall(state, cardId);
      return { ok: true };
    }

    case "expose_and_trash_remote_root": {
      // Drive By: "Expose 1 card installed in the root of a remote server."
      // Only a card that can be exposed is a target (Underway Grid's
      // server is not, CR 1.21.4).
      const targets = exposeLegalTargets(state).filter((id) => {
        const zone = state.cards[id]?.zone ?? "";
        const m = /^server:([^:]+):root$/.exec(zone);
        const server = m
          ? (state.servers as Record<string, { kind: string } | undefined>)[
              m[1]!
            ]
          : undefined;
        return server?.kind === "remote";
      });
      if (targets.length === 0) {
        log(state, `Drive By — no unrezzed remote root card to expose.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        // Labelled by place: the cards are facedown (CR 10.2.2a).
        options: targets.map((id) => ({
          id: `driveby:${id}`,
          label: `Expose ${openCardName(state, id, "runner")}`,
          // The expose may wait on the Corp (an interrupt, a rez first);
          // the trash follows only once it has happened.
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "expose" as const,
                  pick: "choose" as const,
                  cardId: id,
                },
              },
              {
                op: "do" as const,
                action: {
                  kind: "expose_resolve" as const,
                  cardId: id,
                  exposuresBefore: state.turn.exposureCounts?.[id] ?? 0,
                },
              },
            ],
          },
        })),
        logLine: `Drive By — choose a remote root card to expose.`,
      });
      return { ok: true };
    }

    case "expose_resolve": {
      // "If you do and that card is an asset or upgrade, trash it": only a
      // card this expose exposed, still installed and unrezzed, is trashed.
      // The turn's exposure count tells: a prevented expose adds none, even
      // for a card left faceup by an earlier expose (CR 1.21.4, 9.6.10).
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card) return { ok: true };
      const exposed =
        card.zone.startsWith("server:") &&
        !card.rezzed &&
        (state.turn.exposureCounts?.[cardId] ?? 0) >
          (action.exposuresBefore ?? 0);
      if (!exposed) {
        log(state, `Drive By — ${cardId} was not exposed; nothing to trash.`);
        return { ok: true };
      }
      if (card.type === "asset" || card.type === "upgrade") {
        trashCard(state, cardId, { by: "runner" });
        log(state, `Drive By — trash exposed ${card.title}.`);
      } else {
        log(state, `Drive By — exposed ${card.title} (not asset/upgrade).`);
      }
      return { ok: true };
    }

    case "resolve_subroutine_on_rezzed_ice_protecting_this_server": {
      let serverIce: string[] = [];
      for (const server of Object.values(state.servers)) {
        if (server.root.includes(sourceId)) {
          serverIce = [...server.ice];
          break;
        }
      }
      const picks: Array<{ iceId: string; subIndex: number }> = [];
      for (const id of serverIce) {
        const ice = state.cards[id];
        if (!ice?.rezzed) continue;
        const subs = ice.subroutines ?? [];
        for (let i = 0; i < subs.length; i++) {
          picks.push({ iceId: id, subIndex: i });
        }
      }
      if (picks.length === 0) {
        log(state, `${source.title} — no rezzed protecting ice with subs.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: picks.map((p) => {
          const ice = state.cards[p.iceId]!;
          const sub = ice.subroutines![p.subIndex]!;
          return {
            id: `batty:${p.iceId}:${p.subIndex}`,
            label: `Resolve "${sub.text}" on ${ice.title}`,
            effect: sub.effect,
          };
        }),
        logLine: `${source.title} — resolve 1 subroutine on protecting ice.`,
      });
      return { ok: true };
    }

    default:
      return null;
  }
}
