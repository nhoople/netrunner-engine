/** Install choices the effect kinds share: Muse installing a non-daemon program from the stack, heap or grip, and dividing an install-and-rez discount (CR 1.16.2f). */
import type { GameState } from "../../state/types.js";
import { CR } from "../../timing/labels.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import {
  shuffleRunnerStack,
  gripInstallCostAfterDiscount,
} from "./runnerInstall.js";
import {
  memoryNeededToInstall,
  usedMemory,
  memoryLimit,
} from "../../state/turnAndActions/turn.js";
import { creditsAvailableForInstall } from "../../state/keywordsAndCredits/runnerCredits.js";
import {
  payInstallCost,
  installAndRezPaid,
} from "../../state/keywordsAndCredits/costs.js";
import { hostCard } from "../../state/hostingAndTrash/host.js";
import {
  noteInstalledThisTurn,
  noteProgramOrHardwareInstalled,
} from "../../state/install/programHardwareInstall.js";
import { fireOnInstall } from "../../state/triggers/cardLifecycleHooks.js";
import { noteVirusProgramInstalled } from "../../state/install/virusInstall.js";
import type { EvalResult } from "../eval.js";
import type { Effect } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";

export function museZoneCards(
  state: GameState,
  zone: "stack" | "heap" | "grip",
): string[] {
  if (zone === "stack") return state.runner.deck;
  if (zone === "heap") return state.runner.discardPile;
  return state.runner.hand;
}

export function museEligiblePrograms(
  state: GameState,
  zone: "stack" | "heap" | "grip",
): string[] {
  return museZoneCards(state, zone).filter((id) => {
    const c = state.cards[id];
    if (!c || c.type !== "program") return false;
    return !(c.subtypes ?? []).includes("daemon");
  });
}

function removeMuseProgramFromZone(
  state: GameState,
  cardId: string,
  from: "stack" | "heap" | "grip",
): void {
  if (from === "stack") {
    state.runner.deck = state.runner.deck.filter((x) => x !== cardId);
  } else if (from === "heap") {
    state.runner.discardPile = state.runner.discardPile.filter(
      (x) => x !== cardId,
    );
  } else {
    state.runner.hand = state.runner.hand.filter((x) => x !== cardId);
  }
}

export function finishMuseInstall(
  state: GameState,
  cardId: string,
  from: "stack" | "heap" | "grip",
  sourceId: string,
  hostId: string | undefined,
  onIce: boolean,
): EvalResult {
  const card = state.cards[cardId];
  if (!card) {
    return {
      ok: false,
      error: `muse install: missing ${cardId}`,
      cites: [CR.runnerBasicInstall],
    };
  }
  const inZone = museZoneCards(state, from).includes(cardId);
  if (!inZone) {
    log(state, `Muse — ${card.title} no longer in ${from}.`);
    if (from === "stack") shuffleRunnerStack(state);
    return { ok: true };
  }
  const cost = gripInstallCostAfterDiscount(state, card, 0);
  const hostOnDaemon =
    hostId !== undefined && Boolean(state.cards[hostId]?.daemonHost);
  if (!onIce && !hostOnDaemon && card.type === "program") {
    const need = memoryNeededToInstall(state, cardId);
    if (usedMemory(state) + need > memoryLimit(state)) {
      log(state, `Muse — insufficient MU for ${card.title}.`);
      if (from === "stack") shuffleRunnerStack(state);
      return { ok: true };
    }
  }
  if (creditsAvailableForInstall(state, "runner") < cost) {
    log(state, `Muse — cannot afford ${card.title} (${cost}¢).`);
    if (from === "stack") shuffleRunnerStack(state);
    return { ok: true };
  }
  payInstallCost(state, "runner", cost);
  removeMuseProgramFromZone(state, cardId, from);
  state.runner.installed.push(cardId);
  card.zone = "runner:installed";
  card.faceup = true;
  if (hostId) hostCard(state, card.id, hostId, { installed: true });
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.hostedCreditsOnInstall ?? 0) > 0) {
    card.hostedCredits = card.hostedCreditsOnInstall;
  }
  if ((card.powerCountersOnInstall ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnInstall;
  }
  noteInstalledThisTurn(state, cardId);
  state.turn.programsInstalledThisTurn += 1;
  if (from === "stack") shuffleRunnerStack(state);
  const hostTitle = hostId
    ? (state.cards[hostId]?.title ?? hostId)
    : "installed";
  log(
    state,
    `Muse (${state.cards[sourceId]?.title ?? sourceId}) — install ${card.title} for ${cost}¢ hosted on ${hostTitle}.`,
  );
  fireOnInstall(state, cardId);
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}

/** Corp divides a total install-and-rez discount before the costs are calculated (CR 1.16.2f). */
export function offerInstallRezSplit(
  state: GameState,
  sourceId: string,
  discount: number,
  installCost: number,
  rezCost: number,
  chosenInstallDiscount: number | undefined,
  effectFor: (installDiscount: number) => Effect,
): { offered: true } | { offered: false; pay: number } {
  if (discount > 0 && chosenInstallDiscount === undefined) {
    openPendingChoose(state, {
      sourceId,
      chooser: "corp",
      options: Array.from({ length: discount + 1 }, (_, installDiscount) => {
        const rezDiscount = discount - installDiscount;
        const pay = installAndRezPaid(
          installCost,
          rezCost,
          installDiscount,
          rezDiscount,
        );
        return {
          id: `split-install:${installDiscount}`,
          label: `−${installDiscount}¢ install, −${rezDiscount}¢ rez (pay ${pay}¢)`,
          effect: effectFor(installDiscount),
        };
      }),
      logLine: `Divide ${discount}¢ between the install cost and the rez cost (CR ${CR.totalInstallRez.number}).`,
    });
    return { offered: true };
  }
  const installDiscount = chosenInstallDiscount ?? 0;
  return {
    offered: false,
    pay: installAndRezPaid(
      installCost,
      rezCost,
      installDiscount,
      Math.max(0, discount - installDiscount),
    ),
  };
}
