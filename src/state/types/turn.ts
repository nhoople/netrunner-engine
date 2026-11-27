/** The turn: its phases, and the per-turn flags abilities read (`TurnBookkeeping`). */

import type { Effect } from "../../effects/ir.js";
import type { InstallDestination } from "./actions.js";
import type { StoredConditionalEffectKey } from "./pendingAbilities.js";
import type { ServerId } from "./servers.js";
import type { Side } from "./shared.js";

/** Per-turn flags shared by Gateway continuous / conditional abilities. */
export interface TurnBookkeeping {
  successfulRunThisTurn: boolean;
  /**
   * Count of successful runs declared this turn (Crowdfunding).
   * Reset at turn begin with successfulRunThisTurn.
   */
  successfulRunCountThisTurn: number;
  successfulRunLastTurn: boolean;
  /** True after a run is declared unsuccessful this turn (John Masanori). */
  unsuccessfulRunThisTurn: boolean;
  /** Injection Attack: pending breaker strength bonus for the run started by the event. */
  injectionAttackBreakerBonus?: { breakerId: string; amount: number };
  /** Hyoubu Research Facility used its first-reveal gain this turn. */
  hyoubuSecretSpendGainUsedThisTurn: boolean;
  /** Runner's revealed secret spend from the most recent psi resolution. */
  lastRevealedRunnerSecretSpend?: number;
  /** Khan: first pass ice each turn already used. */
  /**
   * Khan: first ice passed this turn met since previous checkpoint; marked
   * pending at the next 10.3.1a (phase 3).
   */
  firstPassIceMetPending: boolean;
  /** Khan: first pass ice each turn already marked. */
  bmFirstPassIceUsedThisTurn: boolean;
  /** Weyland Builder of Nations: first advanced-ice encounter-end meat used. */
  bmFirstAdvancedIceEncounterEndMeatUsed: boolean;
  /** Obelus: first successful HQ/R&D run-end draw used. */
  esObelusRunEndUsed: boolean;
  /** Runner suffered damage from a Corp card ability this turn (First Responders). */
  esSufferedCorpDamageThisTurn: boolean;
  /** Net Mercur: first stealth spend this run already handled. */
  esNetMercurStealthUsedThisRun: boolean;
  /** Net Mercur pending place-or-draw source after stealth spend. */
  esNetMercurPendingSourceId?: string;
  /** Runner's prior-turn unsuccessful run carried into the Corp turn (Successful Demonstration). */
  unsuccessfulRunLastTurn: boolean;
  /**
   * True after Corp has rezzed an advertisement this turn
   * (Spark Agency first-rez credit loss).
   */
  advertisementRezzedThisTurn: boolean;
  /** TL;DR: duplicate subs on next ice encounter this run/turn. */
  dadDuplicateSubsOnNextIceEncounter?: boolean;
  /** Dr. Lovegood: card ids blanked this turn. */
  dadBlankedCardIds?: string[];
  /** Jak Sinclair / Apex: cannot use programs this run. */
  dadCannotUseProgramsThisRun?: boolean;
  /** Wasteland counter: own installed trashes this turn. */
  dadOwnInstalledTrashedThisTurn?: number;

  /**
   * Server ids the Runner successfully ran this turn (Daily Quest).
   */
  successfulRunServersThisTurn: string[];
  /**
   * Server ids successfully run during the Runner's last turn
   * (rolled at Corp turn begin).
   */
  successfulRunServersLastTurn: string[];
  agendaPointsScoredThisTurn: number;
  /** Agenda instance ids Corp scored this turn (Witch Hunt). */
  scoredCardIdsThisTurn: string[];
  programsInstalledThisTurn: number;
  /** Hardware installs this turn (Masterwork first-install draw). */
  hardwareInstalledThisTurn: number;
  /**
   * Most recently installed hardware instance id this turn (Replicator).
   * Cleared at turn boundaries via emptyTurnBookkeeping.
   */
  lastHardwareInstalledId: string | null;
  /**
   * Program instance ids that received ≥1 virus counter this turn (Surge).
   */
  programsWithVirusPlacedThisTurn: string[];
  /**
   * Az McCaffrey: true after the first job/connection resource or hardware
   * install this turn (discount already consumed).
   */
  jobConnectionOrHardwareInstallDiscountUsedThisTurn: boolean;
  /**
   * Most recently stolen agenda instance id this turn (Divested Trust).
   */
  lastStolenAgendaId: string | null;
  basicDrawsThisTurn: number;
  usedAbilities: string[];
  /** Lakshmi: agenda defIds that cannot be stolen this turn. */
  bfCannotStealAgendaDefIds?: string[];
  /** Councilman: card ids that cannot be rezzed again this turn. */
  dagCannotRezCardIds?: string[];
  /** Nero Severn: jack-out-on-sentry already used this turn. */
  dagNeroSentryJackOutUsedThisTurn?: boolean;
  /** Salsette Slums: RFG-instead-of-Archives ability used this turn. */
  siSalsetteSlumsUsedThisTurn?: boolean;
  /** Jeeves: already gained click from 3+ click spend this turn. */
  siJeevesGainClickUsedThisTurn?: boolean;
  /** Raman Rai: already used once-per-turn draw swap. */
  siRamanRaiUsedThisTurn?: boolean;
  /** Daily Business Show still has to bottom one card from this paused draw. */
  dbsBottomOneDrawn?: boolean;
  /** Making an Entrance look/trash/arrange scratch. */
  siStackLookedCards?: string[];
  siStackArrangePlaced?: string[];
  /** Information Sifting HQ piles. */
  tlmInfoSiftPileA?: string[];
  tlmInfoSiftPileB?: string[];
  /** Information Sifting: HQ cards not yet assigned to a pile. */
  tlmInfoSiftRemaining?: string[];
  /** Dedicated Neural Net: first successful HQ psi used this turn. */
  tlmDedicatedNeuralNetUsedThisTurn?: boolean;
  /** Rigged Results bypass ice id. */
  ftmRiggedResultsBypassIceId?: string;
  /** Subcontract remaining plays. */
  ftmSubcontractRemaining?: number;
  ftmSubcontractPlayCardId?: string;
  /**
   * A search of a hidden or secret zone. The viewer may look while `open` is
   * set. The other player may not. Cleared when the search is complete (CR 8.7.1a).
   */
  hiddenZoneSearch?: {
    viewer: Side;
    hiddenFrom: Side;
    zone: "runner:stack";
    cardIds: string[];
    open: boolean;
  } | null;
  installedThisTurn: string[];
  /** Valley: how many Runner installs have fired first-install genetics/hooks this turn. */
  valInstallTriggerCount: number;
  /** Valley: click-loss trigger count (Chronotype / genetics). */
  valClickLossTriggerCount: number;
  /** Valley: damage trigger count (Synthetic Blood / genetics). */
  valDamageTriggerCount: number;
  /** Valley: basic click-draw trigger count (Symmetrical Visage / genetics). */
  valBasicClickDrawTriggerCount: number;
  /** Valley: successful-run trigger count for genetics (Enhanced Vision). */
  valSuccessfulRunTriggerCount: number;
  /** Breaker Bay: Recruiting Trip — last chosen play cost X. */
  lastPlayCostX?: number;
  /** Chrome City: Analog Dreamers started this R&D run. */
  ccAnalogDreamersRun?: boolean;
  /** Chrome City: Lockdown — Runner cannot draw for remainder of turn. */
  ccRunnerCannotDraw?: boolean;
  /** Chrome City: Immolation Script access-replace used this run. */
  ccImmolationScriptUsedThisRun?: boolean;
  /** The Underway: Defective Brainchips first-core bump used this turn. */
  uwFirstCoreDamageIncreasedThisTurn?: boolean;
  /** Old Hollywood: Trope heap-shuffle remaining picks. */
  ohTropeShuffleRemaining?: number;
  /** Old Hollywood: Rolodex stack look/arrange. */
  ohStackLookedCards?: string[];
  ohStackArrangePlaced?: string[];
  /** Old Hollywood: An Offer forced run. */
  ohForcedRunServerId?: string;
  ohForcedRunCannotJackOut?: boolean;
  /** Old Hollywood: agendas stolen this turn (Haarpsichord). */
  agendasStolenThisTurn?: number;
  /** UOT: Power to the People armed credits on first agenda access. */
  uotFirstAgendaAccessCredits?: number;
  /** UOT: DDoS — cannot rez outermost ice during a run this turn. */
  uotCannotRezOutermostIce?: boolean;
  /** UOT: Bookmark host-remaining capacity this ability. */
  uotBookmarkHostRemaining?: number;
  /** UOT: Genetics Pavilion runner cards drawn this turn. */
  uotRunnerCardsDrawnThisTurn?: number;
  /** UOT: Chronos Protocol first net damage used this turn. */
  uotChronosNetDamageUsedThisTurn?: boolean;
  /** UOT: Chronos remaining grip cards this net-damage instance. The Corp chooses the first; the rest are random. */
  uotChronosTrashRemaining?: number;
  /** UOT: full net-damage amount for the open Chronos choice, including a flatline excess. */
  uotChronosNetAmount?: number;
  /** UOT: the source of the net damage the open Chronos choice finishes. */
  uotChronosSourceId?: string;
  /** True if Corp installed any card from HQ this turn (Holo Man). */
  corpInstalledFromHqThisTurn: boolean;
  /** HB ETF / Asa: first Corp card-install ability already marked this turn. */
  firstCorpCardInstallUsedThisTurn: boolean;
  /**
   * Asa-class: first Corp card install this turn met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3 scanner).
   */
  firstCorpCardInstallMetPending: boolean;
  /** Ice instance ids that were rezzed this turn (Cloud Eater). */
  rezzedThisTurnIds: string[];
  /**
   * Sisyphus: first pass of rezzed code gate/sentry met since previous
   * checkpoint; marked pending at the next 10.3.1a (phase 3).
   */
  sisyphusPassMetPending: boolean;
  /** Sisyphus: first pass CG/sentry offer used this turn. */
  sisyphusPassUsedThisTurn: boolean;
  /**
   * Pass unrezzed ice since previous checkpoint (Runner onPassUnrezzedIce);
   * marked pending at the next 10.3.1a (phase 3).
   */
  passUnrezzedIceMetPending: boolean;
  /**
   * Pass rezzed ice since previous checkpoint (Runner onPassRezzedIce);
   * marked pending at the next 10.3.1a (phase 3).
   */
  passRezzedIceMetPending: boolean;
  /**
   * Ice ids that were passed with onPass since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3).
   */
  passIceOnPassPendingIds: string[];
  /**
   * Host ice ids whose hosted onPassHost met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3).
   */
  passHostPendingIceIds: string[];
  /**
   * Server ids where rezzed ice protecting them was passed since previous
   * checkpoint; marked pending at the next 10.3.1a (phase 3).
   */
  passProtectingServerPendingIds: string[];
  /**
   * Ice ids whose onEncounterEnd met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3).
   */
  encounterEndPendingIds: string[];
  /**
   * Ice ids whose onEncounterEndIfRezzedThisTurn met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3).
   */
  encounterEndRezzedThisTurnPendingIds: string[];
  /**
   * Ice ids whose onEncounterEndIfNotFullyBroken met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3).
   */
  encounterEndNotFullyBrokenPendingIds: string[];
  /**
   * Ice ids whose onEncounterEndIfPrintedSubroutineBroken met since previous
   * checkpoint; marked pending at the next 10.3.1a (phase 3).
   */
  encounterEndPrintedSubBrokenPendingIds: string[];
  /**
   * Host ice ids whose hosted onHostEncounter met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3).
   */
  hostEncounterPendingIceIds: string[];
  /**
   * Runner identity onEncounterRezzedAfterApproach met since previous
   * checkpoint; marked pending at the next 10.3.1a (phase 3).
   */
  encounterRezzedAfterApproachMetPending: boolean;
  /**
   * Root card ids whose onApproachServer met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3).
   */
  approachServerPendingIds: string[];
  /**
   * Server ids where all protecting ice was passed since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3).
   */
  passAllIceProtectingServerPendingIds: string[];
  /**
   * Source ids (ice and/or Runner) whose onBypass met since previous
   * checkpoint; marked pending at the next 10.3.1a (phase 3).
   */
  bypassPendingSourceIds: string[];
  /**
   * Root card ids whose onApproachIce met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3).
   */
  approachIcePendingIds: string[];
  /**
   * First successful R&D run end met since previous checkpoint (Psych Mike);
   * marked pending at the next 10.3.1a (phase 3).
   */
  firstSuccessfulRdRunEndMetPending: boolean;
  /**
   * Runner card ids whose onSuccessfulRunOnRd met since previous checkpoint
   * (Chakana); marked pending at the next 10.3.1a (phase 3).
   */
  successfulRunOnRdPendingIds: string[];
  /**
   * Runner card ids whose onSuccessfulRunEndOncePerTurn met since previous
   * checkpoint (Doppelgänger); marked pending at the next 10.3.1a (phase 3).
   */
  successfulRunEndOncePendingIds: string[];
  /**
   * Rezzed Corp card ids whose onSuccessfulRunEnd met since previous
   * checkpoint (Dedicated Response Team); marked pending at the next 10.3.1a
   * (phase 3).
   */
  successfulRunEndPendingIds: string[];
  /**
   * Root card ids whose onSuccessfulRunOtherServerOncePerTurn met since
   * previous checkpoint (Sacrifice Zone); marked pending at the next 10.3.1a
   * (phase 3).
   */
  otherServerSuccessPendingIds: string[];
  /**
   * Card ids whose onSuccessfulRun met since previous checkpoint; marked
   * pending at the next 10.3.1a (phase 3).
   */
  successfulRunPendingIds: string[];
  /**
   * Corp root successful-run server abilities met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3).
   */
  successfulRunServerPending: Array<{
    cardId: string;
    abilityKey: string;
    effectKey: StoredConditionalEffectKey;
    mandatory: boolean;
    logLine: string;
  }>;
  /**
   * Card ids whose onUnsuccessfulRunOnThisServer met since previous
   * checkpoint; marked pending at the next 10.3.1a (phase 3).
   */
  unsuccessfulRunServerPendingIds: string[];
  /**
   * Access-step conditionals met since previous checkpoint; marked pending
   * at the next 10.3.1a (phase 3).
   */
  accessAbilityPending: Array<{
    cardId: string;
    abilityKey: string;
    effectKey: StoredConditionalEffectKey;
    controller: "corp" | "runner";
    mandatory: boolean;
    logLine: string;
  }>;
  /**
   * Corp action-phase-end conditionals met since previous checkpoint; marked
   * pending at the next 10.3.1a (phase 3).
   */
  corpActionPhaseEndPending: Array<{
    cardId: string;
    abilityKey: string;
    effectKey: StoredConditionalEffectKey;
    controller: "corp" | "runner";
    logLine: string;
  }>;
  /**
   * Runner action-phase-end conditionals met since previous checkpoint; marked
   * pending at the next 10.3.1a (phase 3).
   */
  runnerActionPhaseEndPending: Array<{
    cardId: string;
    abilityKey: string;
    effectKey: StoredConditionalEffectKey;
    controller: "corp" | "runner";
    logLine: string;
  }>;
  /**
   * Encounter-begin conditionals met since previous checkpoint; marked
   * pending at the next 10.3.1a (phase 3).
   */
  encounterAbilityPending: Array<{
    cardId: string;
    abilityKey: string;
    effectKey: StoredConditionalEffectKey;
    mandatory: boolean;
    logLine: string;
  }>;
  /**
   * Outside-pool spend conditionals met since previous checkpoint; marked
   * pending at the next 10.3.1a (phase 3).
   */
  outsidePoolSpendPending: Array<{
    cardId: string;
    abilityKey: string;
    effectKey: StoredConditionalEffectKey;
    logLine: string;
  }>;
  /**
   * Corp identity onBeforeFirstTurn met since previous checkpoint; marked
   * pending at the next 10.3.1a (phase 3).
   */
  beforeFirstTurnPending: Array<{
    cardId: string;
    abilityKey: string;
    effectKey: StoredConditionalEffectKey;
    logLine: string;
  }>;
  /**
   * Host-rez / any-ice-rez / protecting-server conditionals met since previous
   * checkpoint; marked pending at the next 10.3.1a (phase 3).
   */
  iceRezAbilityPending: Array<{
    cardId: string;
    abilityKey: string;
    effectKey: StoredConditionalEffectKey;
    controller: "corp" | "runner";
    mandatory: boolean;
    logLine: string;
  }>;
  /**
   * Synthesized inline Effect conditionals met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3).
   */
  inlineConditionalPending: Array<{
    cardId: string;
    abilityKey: string;
    controller: "corp" | "runner";
    mandatory: boolean;
    effect: Effect;
    logLine: string;
    /** Delayed / persistent abilities that outlive the source (CR 9.6.13c). */
    independentOfSource?: boolean;
  }>;
  /**
   * Off-graph stored Effect-key conditionals met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3).
   */
  storedConditionalPending: Array<{
    cardId: string;
    abilityKey: string;
    effectKey: StoredConditionalEffectKey;
    controller: "corp" | "runner";
    mandatory: boolean;
    logLine: string;
    /** Trash / delayed abilities that outlive the source (CR 9.6.13c). */
    independentOfSource?: boolean;
  }>;
  /**
   * Card ids whose onRunBegin met since previous checkpoint; marked pending
   * at the next 10.3.1a (phase 3).
   */
  runBeginPendingIds: string[];
  /**
   * Card ids whose onCorpTurnEnd met since previous checkpoint; marked
   * pending at the next 10.3.1a (phase 3).
   */
  corpTurnEndPendingIds: string[];
  /**
   * Card ids whose onRunnerTurnEnd met since previous checkpoint; marked
   * pending at the next 10.3.1a (phase 3).
   */
  runnerTurnEndPendingIds: string[];
  /**
   * Card ids whose onScoreTurnEnd met since previous checkpoint; marked
   * pending at the next 10.3.1a (phase 3).
   */
  scoreTurnEndPendingIds: string[];
  /**
   * Corp turn-begin conditionals met since previous checkpoint; marked
   * pending at the next 10.3.1a (phase 3).
   */
  corpTurnBeginPending: Array<{
    cardId: string;
    abilityKey: string;
    effectKey: StoredConditionalEffectKey;
    controller: "corp" | "runner";
    logLine: string;
  }>;
  /**
   * The Corp's turn has begun (appendix 11.2_1_d). Set once, so the step
   * is not resolved again after a turn-begin ability's choice.
   */
  corpTurnBegan?: boolean;
  /**
   * The Runner's turn has begun (appendix 11.3_1_d). Set once, so the step
   * is not resolved again after a turn-begin ability's choice.
   */
  runnerTurnBegan?: boolean;
  /**
   * Runner turn-begin conditionals met since previous checkpoint; marked
   * pending at the next 10.3.1a (phase 3).
   */
  runnerTurnBeginPending: Array<{
    cardId: string;
    abilityKey: string;
    effectKey: StoredConditionalEffectKey;
    controller: "corp" | "runner";
    logLine: string;
  }>;
  /** Nuvem: first R&D trash credit gain used this turn. */
  nuvemFirstRdTrashUsedThisTurn: boolean;
  /** Card ids that received an advancement this turn (Issuaq Adaptics). */
  advancedThisTurn: string[];
  /**
   * Card ids advanced (CR 1.18.1) since the previous checkpoint. Placing
   * advancement counters is not advancing (CR 1.18.2). Built to Last reads
   * it at 10.3.1a and the checkpoint clears it.
   */
  advancedSincePreviousCheckpoint: string[];
  cannotScoreAgendas: boolean;
  /** Efficiency Committee: cannot advance any card for the remainder of this turn. */
  cannotAdvanceCards: boolean;
  /**
   * Card instance ids that cannot be scored or rezzed for the remainder of
   * this turn (Mitosis).
   */
  cannotScoreOrRezCardIds: string[];
  /**
   * Card instance ids the Runner cannot access for the remainder of this turn
   * (Queen's Gambit).
   */
  cannotAccessCardIdsThisTurn: string[];
  /**
   * Replicating Perfection: remotes unlocked until end of turn after a
   * central run this turn.
   */
  remotesUnlockedByCentralRunThisTurn: boolean;
  /** Patchwork once-per-turn discount used. */
  patchworkDiscountUsedThisTurn: boolean;
  /** Credits of Patchwork discount pending for the current play/install. */
  patchworkPendingDiscountThisAction: number;
  /** Sundew: first runner click-spend credit gain fired. */
  sundewFirstClickSpendFiredThisTurn: boolean;
  /** Sundew: server ids that may refund if run begins during this click action. */
  sundewRefundServerIdsThisAction: string[];
  /** Seidr: first click spend/lose during run already marked this turn. */
  seidrClickDuringRunFiredThisTurn: boolean;
  /**
   * Seidr: Runner click spend/lose during a run met since the previous
   * checkpoint; marked pending at the next 10.3.1a (phase 3 scanner).
   */
  seidrClickMetPending: boolean;
  /**
   * True while Corp is resolving an install (suppress Ob Superheavy on
   * region-limit trash during install).
   */
  corpInstallInProgress: boolean;
  /** Ob Superheavy once-per-turn used. */
  obSuperheavyUsedThisTurn: boolean;
  /** Printed rez cost of the most recently trashed rezzed Corp card. */
  lastTrashedRezzedPrintedRezCost: number | null;
  /** Install cost of the program most recently trashed via trash_own_program (Scavenge). */
  lastTrashedOwnProgramInstallCost: number | null;
  /**
   * Excess (trace strength − link) from the most recently resolved trace
   * (Power Grid Overload).
   */
  lastTraceExcess: number | null;
  /** Strength of the most recently resolved trace (Taurus-class). */
  lastResolvedTraceStrength: number | null;
  /** Checkpoint frame paused at CR 10.3.1e until a restriction set is chosen. */
  pausedCheckpointId?: string;
  /**
   * A checkpoint trashed a card with a "when this card is trashed" ability
   * (CR 10.3.1d, 10.3.1e, 10.3.1f, 10.3.1g). The next checkpoint's 10.3.1a
   * marks it pending.
   */
  checkpointTrashNoted?: boolean;
  /**
   * Pending ability instance ids marked at the current checkpoint's 10.3.1a
   * step (CR 10.3.2). Cleared when the post-checkpoint reaction window opens
   * or stays closed. Survives `popCheckpoint` so scoop can use it.
   */
  checkpointNewlyMarkedPendingIds?: string[];
  /**
   * Remote a card is in the process of being installed into (CR 10.3.1h).
   * That server does not cease to exist during the install.
   */
  installDestinationServerId?: ServerId;
  /** Currents whose duration ended and that the next checkpoint trashes (CR 10.3.1b). */
  durationPassedCardIds?: string[];
  /**
   * The turn has ended. The next checkpoint removes lingering effects whose
   * duration was that turn (CR 9.10.1 / 10.3.1b).
   */
  turnDurationsPassed?: "corp" | "runner";
  /**
   * Strength increases whose duration a hosted static replacement stretched
   * (Gebrselassie → turn, Gamedragon Pro → run; CR 9.9.9a). Cleared when that
   * card is no longer hosted on the breaker.
   */
  hostDurationReplacements?: {
    sourceId: string;
    breakerId: string;
    amount: number;
    original: "encounter" | "run";
    /** Bucket the boost was placed in after replacement. Defaults to turn. */
    replacedTo?: "turn" | "run";
  }[];
  /**
   * Monotonic id for imminent effect occurrences (CR 9.9.9c bookkeeping).
   */
  effectIdentitySeq?: number;
  /**
   * Replacement ids already applied to an effect identity this turn
   * (CR 9.9.9c). Cleared at checkpoints.
   */
  appliedReplacements?: Record<string, string[]>;
  /**
   * Those increases whose original duration has already expired. The next
   * checkpoint removes them (CR 9.9.9a).
   */
  revertedHostDurationBoosts?: { breakerId: string; amount: number }[];
  /** A run ended; the next checkpoint expires run-duration lingerings. */
  runDurationPassed?: boolean;
  /**
   * Agendas that left a score area, with the cards hosted on them at that
   * moment (CR 10.3.1f).
   */
  agendasLeftScoreArea?: { agendaId: string; hostedIds: string[] }[];
  /**
   * Installed cards uninstalled since the last checkpoint, with the cards
   * they hosted then. Step 10.3.1g trashes those still hosted on them,
   * wherever the host went, a score area included (CR 8.5.1b, 1.13.13).
   */
  hostsUninstalled?: { hostId: string; hostedIds: string[] }[];
  /** Mutate additional-cost trashed ice slot. */
  reuseTrashedFromHq?: number;
  tradeInCredits?: number;
  mutateTrashedIce?: {
    iceId: string;
    serverId: ServerId;
    index: number;
  };
  /** Social Engineering marked ice id this turn. */
  socialEngineeringMarkedIce?: string;
  /**
   * True after Runner has spent credits from an installed card this turn
   * (The Twinning).
   */
  installedCardCreditSpendThisTurn: boolean;
  /**
   * Keiko: first companion install / companion credit-spend credit gain
   * already fired this turn.
   */
  companionInstallOrSpendCreditsFiredThisTurn: boolean;
  tagsGivenThisTurn: number;
  /**
   * NBN: Reality Plus — first tag(s) given this turn met since previous
   * checkpoint; marked pending at the next 10.3.1a (phase 3).
   */
  firstTagThisTurnMetPending: boolean;
  /** NBN: Reality Plus — first-tag conditional already marked this turn. */
  firstTagThisTurnUsedThisTurn: boolean;
  stealthCreditsOnLastPaidAbility?: number;
  /** Order of Sol: first credit-pool-empty conditional already marked this turn. */
  runnerCreditPoolEmptyFiredThisTurn: boolean;
  /**
   * Order of Sol: first empty credit pool this turn met since previous
   * checkpoint; marked pending at the next 10.3.1a (phase 3).
   */
  firstCreditPoolEmptyMetPending: boolean;
  /**
   * First hardware install this turn met since previous checkpoint; marked
   * pending at the next 10.3.1a (phase 3).
   */
  firstHardwareInstallMetPending: boolean;
  /** First-hardware-install conditional already marked this turn. */
  firstHardwareInstallUsedThisTurn: boolean;
  /**
   * First program install this turn met since previous checkpoint (LilyPAD);
   * marked pending at the next 10.3.1a (phase 3).
   */
  firstProgramInstallMetPending: boolean;
  /** First-program-install conditional already marked this turn. */
  firstProgramInstallUsedThisTurn: boolean;
  /**
   * First virus program install this turn met since previous checkpoint
   * (Avgustina); marked pending at the next 10.3.1a (phase 3).
   */
  firstVirusInstallMetPending: boolean;
  /** First-virus-install conditional already marked this turn. */
  firstVirusInstallUsedThisTurn: boolean;
  /** Amount of bad publicity a replacement trace is standing in for. */
  pendingBadPublicityTake?: number;
  /** Once-per-turn marks for single-card static declarations. */
  mawFiredThisTurn?: boolean;
  hippoFiredThisTurn?: boolean;
  synthDnaFiredThisTurn?: boolean;
  polyhistorFiredThisTurn?: boolean;
  kasiFiredThisTurn?: boolean;
  oberthFiredThisTurn?: boolean;
  betterCitizenFiredThisTurn?: boolean;
  padTapFiredThisTurn?: boolean;
  cometEventPlayedThisTurn?: boolean;
  cometFreeEvent?: boolean;
  briberyCardId?: string;
  briberyX?: number;
  installCostXCardId?: string;
  installCostX?: number;
  /** Destination for the install paused to choose X. */
  installCostXDestination?: InstallDestination;
  operationPaidWindowOpen?: boolean;
  hqRunPaidWindowOpen?: boolean;
  playingEventId?: string;
  /** Clicks the Runner had before paying to play `playingEventId` (CR 9.12.2b.ex1). */
  clicksWhenEventPlayBegan?: number;
  adamDirectivesInstalled?: boolean;
  aylaSetAsideDone?: boolean;
  archivesInterfaceUsedThisBreach?: boolean;
  engoloUsedThisTurn?: boolean;
  mtiApproachFiredThisTurn?: boolean;
  khumaloUsedThisTurn?: boolean;
  bazaarInstallCardId?: string;
  deepRedAbility?: { cardId: string; abilityId: string };
  corpDrawsThisTurn?: number;
  /** Bug: the Corp card just drawn that onCorpDrawCard may reveal. */
  pendingCorpDrawnCardId?: string;
  runnerDrewThisTurn?: boolean;
  hostedCreditsUsedCardIds?: string[];
  runnerInstalledProgramOrHardwareThisTurn?: boolean;
  /** The Runner has installed a card this turn (Housekeeping). */
  runnerInstalledCardThisTurn?: boolean;
  openingBadPublicityApplied?: boolean;
  /** Edward Kim: the Runner has accessed an operation this turn. */
  firstAccessedOperationTrashedFreeThisTurn?: boolean;
  /** Enhanced Login Protocol: the Runner took the basic run action this turn. */
  runnerTookBasicRunActionThisTurn?: boolean;
  ignoredFirstIceInstallCostThisTurn?: boolean;
  /** Core (brain) damage points suffered this turn (Esâ-class triggers). */
  coreDamageSufferedThisTurn: number;
  /** Total damage (net/meat/core) suffered by Runner this turn (Vanadis). */
  damageSufferedThisTurn: number;
  /**
   * Synthetic Blood / Valley genetics: ordinals of damage events since the
   * previous checkpoint (1 = first, 2 = second). Marked at 10.3.1a (phase 3).
   */
  valDamageTriggerPendingCounts: number[];
  /**
   * Hayley / Valley genetics: ordinals of Runner installs since the previous
   * checkpoint. Marked at 10.3.1a (phase 3).
   */
  valInstallTriggerPendingCounts: number[];
  /**
   * Adjusted Chronotype / Valley genetics: ordinals of click-loss events since
   * the previous checkpoint. Marked at 10.3.1a (phase 3).
   */
  valClickLossTriggerPendingCounts: number[];
  /**
   * Symmetrical Visage / Valley genetics: ordinals of basic click-draws since
   * the previous checkpoint. Marked at 10.3.1a (phase 3).
   */
  valBasicClickDrawTriggerPendingCounts: number[];
  /**
   * Pravdivost / DreamNet / Enhanced Vision: ordinals of successful runs since
   * the previous checkpoint. Marked at 10.3.1a (phase 3).
   */
  valSuccessfulRunTriggerPendingCounts: number[];
  /** Lethal damage is already resolving, so grip-trash abilities do not (CR 10.4.3). */
  lethalDamageSkippingTrashTriggers?: boolean;
  /** Salvaged Vanadis: next PAW after damage is armed. */
  vanadisNextPawArmed?: boolean;
  /** Sovereign Sight — By Any Means active for remainder of turn. */
  ssByAnyMeansActive?: boolean;
  /** Sovereign Sight — Cyberdelia first full-break credits fired this turn. */
  ssFirstFullyBreakCreditsFired?: boolean;
  /** Down the White Nile — virus counters removed by the most recent purge. */
  lastVirusCountersPurged?: number;
  /** Down the White Nile — Kabonesa Wu programs to RFG at turn end. */
  dtwnKabonesaTrackedInstallIds?: string[];
  /** Down the White Nile — Jua: Runner cannot install remainder of turn. */
  dtwnRunnerCannotInstall?: boolean;
  /** Down the White Nile — RNG Key first HQ/R&D success fired this turn. */
  dtwnFirstSuccessfulHqOrRdFired?: boolean;
  /** Council of the Crest — Marathon forbidden servers this turn. */
  cotcForbiddenServerIds?: string[];
  /** Council of the Crest — No One Home used this turn. */
  cotcNoOneHomeUsed?: boolean;
  /** Council of the Crest — Azmari named-type trigger fired this turn (the named type itself lives on the identity instance). */
  cotcAzmariNamedTypeFired?: boolean;
  /** The Devil and the Dragon — 419 first Corp install. */
  tdatd419FiredThisTurn?: boolean;
  /** Last agenda scored or stolen (Amani / Human First). */
  lastScoredOrStolenAgendaId?: string;
  /** Falsified Credentials named type. */
  tdatdFalsifiedNamedType?: string;
  /** Council of the Crest — last passed ice id (Code Replicator). */
  cotcLastPassedIceId?: string;
  /** Council of the Crest — first runner install credit loss fired. */
  cotcCorpLoseOnFirstInstallFired?: boolean;
  /** Respirocytes: first empty-grip trigger used this turn. */
  respirocytesEmptyGripFiredThisTurn?: boolean;
  /**
   * Virus programs installed this turn (Avgustina-class first-virus-install triggers).
   */
  virusProgramsInstalledThisTurn: number;
  /**
   * True after the Runner has begun a run on R&D this turn
   * (Padma-class first-R&D-run-begin triggers).
   */
  rdRunBegunThisTurn: boolean;
  /** First Archives run begun this Runner turn (Front Company). */
  archivesRunBegunThisTurn: boolean;
  /**
   * Server id (root) from which the most recent agenda was scored or stolen
   * this turn (Tucana guard).
   */
  lastAgendaScoredOrStolenServerId: ServerId | null;
  /**
   * True after the Runner has made a successful run on their mark this turn
   * (Virtuoso-class first-successful-mark-run triggers).
   */
  successfulMarkRunThisTurn: boolean;
  hqBreachesThisTurn: number;
  /** Servers the Runner has run this turn (Red Team). */
  serversRunThisTurn: ServerId[];
  /** Zahya once-per-turn run-end credit ability used. */
  zahyaRunEndUsed: boolean;
  /** Zahya's optional run-end gain, waiting on the Runner's choice. */
  pendingZahyaRunEnd?: { credits: number; serverId: string };
  /** René once-per-turn access-trash ability used. */
  reneAccessTrashUsed: boolean;
  /** Solidarity Badge-class: first Corp-card trash this turn already fired. */
  firstCorpCardTrashUsedThisTurn: boolean;
  /**
   * Solidarity Badge / Controlling the Message: first Corp card trash this
   * turn met since previous checkpoint; marked pending at the next 10.3.1a
   * (phase 3).
   */
  firstCorpCardTrashMetPending: boolean;
  /**
   * Aggressive Trendsetting / Controlling the Message: the first installed
   * Corp card the Runner trashes this turn already fired (CR 9.6.5c).
   */
  firstInstalledCorpCardTrashUsedThisTurn: boolean;
  /** Installed variant of `firstCorpCardTrashMetPending`. */
  firstInstalledCorpCardTrashMetPending: boolean;
  /** Lago Paranoá-class: first Corp root-install already marked this turn. */
  firstCorpRootInstallUsedThisTurn: boolean;
  /**
   * Lago-class: first Corp root install this turn met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3 scanner).
   */
  firstCorpRootInstallMetPending: boolean;
  /** A Teia: first remote install this turn already noted (blocks swap double-mark). */
  firstRemoteInstallThisTurnUsed: boolean;
  /**
   * A Teia: first remote install (normal path) met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3 scanner). Swap installs still
   * use entered_remote_install / swap_install_trigger (CR 8.8.4b).
   */
  firstRemoteInstallMetPending: boolean;
  /** Server id that triggered onFirstRemoteInstallThisTurn (chain install). */
  triggerRemoteInstallServerId: ServerId | null;
  /**
   * Cumulative expose counts this game (per card id). Checkpoint facts
   * snapshot these so Blackguard can mark from the diff (CR 9.6.4b).
   */
  exposureCounts?: Record<string, number>;
  /** Hold Blackguard pending until an expose-up-to instruction finishes. */
  deferBlackguardCheckpoint?: boolean;
  /** The rest of an expose-up-to instruction, waiting on an expose interrupt. */
  exposeUpToAfter?: { sourceId: string; max: number; remaining: number };
  /**
   * Static-condition abilities that resolved with no effect during this
   * timing step. They stay quiet until a later step (CR 9.6.7d).
   */
  staticConditionNoEffect?: { timingKey: string; sourceIds: string[] };
  /** Credits a swap still has to gain after that install trigger resolves. */
  pendingSwapContinuationCredits?: number;
  /**
   * Server that hosted the Corp card most recently trashed (for onTrash
   * effects that exclude installing into that server's root — Vaporframe).
   */
  onTrashSourceServerId: ServerId | null;
  /**
   * First run begin this turn met since previous checkpoint (Stegodon /
   * Tributary / Prognostic); marked pending at the next 10.3.1a (phase 3).
   */
  firstRunBeginMetPending: boolean;
  /** Stegodon: first run begin this turn already marked. */
  runBeginThisTurnUsed: boolean;
  /**
   * First R&D run begin this turn met since previous checkpoint (Padma);
   * marked pending at the next 10.3.1a (phase 3).
   */
  firstRdRunBeginMetPending: boolean;
  /**
   * First Archives run begin this turn met since previous checkpoint (Front
   * Company); marked pending at the next 10.3.1a (phase 3).
   */
  firstArchivesRunBeginMetPending: boolean;
  /**
   * First unsuccessful run this turn met since previous checkpoint (John
   * Masanori); marked pending at the next 10.3.1a (phase 3).
   */
  firstUnsuccessfulRunMetPending: boolean;
  /**
   * First successful HQ run this turn met since previous checkpoint
   * (PAN-Weave); marked pending at the next 10.3.1a (phase 3).
   */
  firstSuccessfulHqRunMetPending: boolean;
  /**
   * First successful HQ or R&D run this turn met since previous checkpoint
   * (RNG Key); marked pending at the next 10.3.1a (phase 3).
   */
  firstSuccessfulHqOrRdRunMetPending: boolean;
  /**
   * First successful central run this turn met since previous checkpoint
   * (Zenit); marked pending at the next 10.3.1a (phase 3).
   */
  firstSuccessfulCentralRunMetPending: boolean;
  /**
   * First successful mark run this turn met since previous checkpoint
   * (Virtuoso); marked pending at the next 10.3.1a (phase 3).
   */
  firstSuccessfulMarkRunMetPending: boolean;
  /** Carnivore once-per-turn access trash used. */
  carnivoreAccessTrashUsed: boolean;
  /** Neutralize All Threats already checked the first trash-cost access this turn. */
  neutralizeAllThreatsCheckedThisTurn?: boolean;
  /** First ice rezzed this turn (Reina / Los). */
  iceRezzedThisTurn: number;
  /** Möbius: second R&D run armed for +4¢ on success. */
  mobiusSecondRun?: boolean;
  /** CPC Generator: first Runner basic gain-credit this turn already fired. */
  cpcGeneratorFiredThisTurn?: boolean;
  /** System Seizure: first icebreaker pump this turn already applied remainder-of-run. */
  systemSeizureFiredThisTurn?: boolean;
  /** Inversificator: first fully-broke swap already used this turn. */
  inversificatorSwapUsedThisTurn?: boolean;
  /** Bioroid Work Crew: next PAW after playing an operation is armed. */
  bioroidWorkCrewWindowArmed?: boolean;
  /** Keros Mcintyre: first ice derez credit gain used this turn. */
  kerosMcintyreDerezGainUsedThisTurn?: boolean;
  /**
   * Daredevil: first run on a server with ≥N ice met since previous
   * checkpoint; marked pending at the next 10.3.1a (phase 3).
   */
  daredevilDrawMetPending: boolean;
  /** Daredevil: first run draw used this turn. */
  daredevilDrawUsedThisTurn?: boolean;
  /** Mass-Driver: next encounter first N subs do not resolve. */
  massDriverSkipSubsNextEncounter?: number;
  /** Charlatan: armed for first-approach pay-to-bypass this run. */
  charlatanArmed?: boolean;
  /** Careful Planning: card ids that cannot be rezzed this turn. */
  carefulPlanningCannotRezIds?: string[];
  /** First run event played this turn (Ken Express). */
  runEventsPlayedThisTurn: number;
  /** Events played this turn (Touchstone first-event hosted credits). */
  eventsPlayedThisTurn: number;
  /**
   * The events the Runner played this turn. Three Steps Ahead's "When this
   * turn ends" ability exists only for a copy played this turn (CR 9.6.13c).
   */
  eventIdsPlayedThisTurn?: string[];
  /** Sudden Commandment: mandates played this turn (including current). */
  mandatesPlayedThisTurn: number;
  /** First encounter this Runner turn used (Kit). */
  firstEncounterUsedThisTurn: boolean;
  /**
   * Gantulga: ice id of the first encounter this turn with ice protecting
   * the named server — subs resolve as net damage while set.
   */
  gantulgaEncounterIceId: string | null;
  /** First remote server created this Corp turn (NEH). */
  remotesCreatedThisTurn: number;
  /** Agenda points stolen this Runner turn (rolls to last turn for Punitive). */
  agendaPointsStolenThisTurn: number;
  /** Agenda points stolen last Runner turn. */
  agendaPointsStolenLastTurn: number;
  /** Runner stole or trashed a Corp card this Runner turn (Oppo / Epiphany). */
  runnerStoleOrTrashedCorpCardThisTurn: boolean;
  /**
   * The Runner trashed one of their own installed cards this turn
   * (Boi-tatá's "you trashed"). A Corp trash does not set it (CR 1.14.5).
   */
  runnerTrashedOwnInstalledThisTurn: boolean;
  /**
   * An installed program was trashed this turn, by either player
   * (Simulchip's "an installed program has already been trashed").
   */
  installedProgramTrashedThisTurn?: boolean;
  /** Runner stole or trashed a Corp card during their previous turn. */
  runnerStoleOrTrashedCorpCardLastTurn: boolean;
  /** Hangeki: Runner trashed a Corp card this turn (trash-only; not steal). */
  runnerTrashedCorpCardThisTurn: boolean;
  /** Hangeki: Runner trashed a Corp card during their previous turn. */
  runnerTrashedCorpCardLastTurn: boolean;
  /** Epiphany-class: first Runner steal/trash already marked this turn. */
  firstRunnerStoleOrTrashedUsedThisTurn: boolean;
  /**
   * Epiphany-class: first Runner steal/trash of a Corp card this turn met
   * since previous checkpoint; marked pending at the next 10.3.1a (phase 3).
   */
  firstRunnerStoleOrTrashedMetPending: boolean;
  /** Phật Gioan-class: first agenda scored/stolen already marked this turn. */
  firstAgendaScoredOrStolenUsedThisTurn: boolean;
  /**
   * Phật Gioan-class: first agenda scored or stolen this turn met since
   * previous checkpoint; marked pending at the next 10.3.1a (phase 3).
   */
  firstAgendaScoredOrStolenMetPending: boolean;
  /** Biawak: pending rez pays forfeit discount for this ice id. */
  rezIceForfeitDiscountCardId: string | null;
  /** Per Corp action kind counts this Corp turn (Wage Workers). */
  corpActionTypeCounts: Record<string, number>;
  /** Corp basic actions completed this turn (Petty Cash gate). */
  corpActionsCompletedThisTurn: number;
  /**
   * Operations the Corp played this turn, by any means (CR 8.6.1): the basic
   * action, Petty Cash from Archives, Plutus, and other card abilities.
   * Nebula Talent Management reads it. Not an action count (CR 5.2.5b).
   */
  corpOperationsPlayedThisTurn?: number;
  /**
   * Clicks spent by the Runner this turn (priority / playRequiresFirstClick).
   * Losing clicks does not increment this (CR 1.11.4).
   */
  runnerClicksSpentThisTurn: number;
  /** Declining an additional cost satisfied Always Be Running's first click (CR 9.12.3e). */
  firstClickMustSatisfied?: boolean;
  /** Server chosen while the first-run additional cost is still a choice. */
  pendingFirstRunServerId?: ServerId;
  /** The Runner chose to pay the first-run additional cost. */
  payingFirstRunAdditionalCost?: boolean;
  /**
   * In the Groove-class: delayed install conditionals active for the remainder
   * of this Runner turn.
   */
  remainderOfTurnOnInstallPrintedCostGte: Array<{
    min: number;
    effect: import("../../effects/ir.js").Effect;
    sourceId: string;
  }>;
  /**
   * Joshua B.-class delayed tags for the end of this turn. The ability no
   * longer depends on the source card (CR 9.6.13c).
   */
  delayedTurnEndTags: Array<{ sourceId: string; title: string }>;
  /** Nebula flip side: first operation hook fired this turn. */
  corpFlippedIdentityFirstOpUsedThisTurn: boolean;
  /**
   * Nebula-class: first operation play while flipped met since previous
   * checkpoint; marked pending at the next 10.3.1a (phase 3).
   */
  corpFlippedIdentityFirstOpMetPending: boolean;
  /** Runner cards discarded to hand size this discard step (Magdalene). */
  runnerDiscardedToMaxHandIds: string[];
  /**
   * Cards the active player chose to discard in the discard step
   * (CR 5.5.4c). Set when the choice finishes; the step then discards them.
   */
  chosenDiscardIds?: string[];
  /** Petty Cash: current operation play originated outside HQ. */
  operationPlayedFromNonHq: boolean;
  /** Zwicky: first agenda/operation credit-gain draw offered this turn. */
  zwickyCreditsDrawUsedThisTurn: boolean;
  /** Top of R&D temporarily removed for look / arrange effects. */
  rdLookedCards: string[];
  /** Cards already placed during R&D arrange (top-to-bottom order). */
  rdArrangePlaced: string[];
  /** The player arranging the looked R&D cards, when not the source's controller. */
  rdLooker?: Side;
  /** Federal: after arrange, offer may-draw if host server unprotected. */
  rdArrangeThenMayDrawIfUnprotected: boolean;
  /** Successful HQ run this turn (Emergency Shutdown). */
  successfulHqRunThisTurn: boolean;
  /**
   * Successful HQ run during the Runner's previous turn
   * (Digital Rights Management play gate).
   */
  successfulHqRunLastTurn: boolean;
  /** Runner completed access of at least one card this turn (Hoshiko). */
  accessedACardThisTurn: boolean;
  /**
   * Runner accessed a card during their previous turn
   * (Under the Bus play gate).
   */
  accessedACardLastTurn: boolean;
  /** Paule's Café: first hosted-install discount already used this turn. */
  paulesCafeInstallUsedThisTurn: boolean;
  /** Buffer Drive: first grip/stack trash-batch spectator marked this turn. */
  bufferDriveGripStackTrashUsedThisTurn: boolean;
  /**
   * Buffer Drive: first grip/stack trash batch this turn met since previous
   * checkpoint; marked pending at the next 10.3.1a (phase 3). Batch ids stay
   * on `pendingGripOrStackTrashBatchIds` until the effect offers.
   */
  bufferDriveGripStackTrashMetPending: boolean;
  /**
   * The Back: first hardware paid-ability use during a run this turn already
   * noted.
   */
  hardwareUsedDuringRunThisTurn: boolean;
  /** Cards whose counters are paying the cost currently being spent. */
  counterSpendSourceIds?: string[];
  /** Skorpios has removed a trashed Runner card from the game this turn. */
  skorpiosRfgUsedThisTurn?: boolean;
  /** A trashed Runner card is waiting on Skorpios's remove-from-the-game choice. */
  pendingSkorpiosTrash?: {
    cardId: string;
    fromZone: string;
    wasInstalled: boolean;
  };
  /** Nesting depth for simultaneous grip/stack trash batches. */
  gripOrStackTrashBatchDepth: number;
  /** Card ids trashed from grip/stack in the current open batch. */
  pendingGripOrStackTrashBatchIds: string[];
  /**
   * Grip/stack trash abilities waiting until the simultaneous batch ends
   * (CR 10.4.3a).
   */
  deferredGripTrashTriggers?: Array<{ cardId: string; fromZone: string }>;
  /** Successful R&D run this turn (Deep Dive). */
  successfulRdRunThisTurn: boolean;
  /** Successful Archives run this turn (Deep Dive). */
  successfulArchivesRunThisTurn: boolean;
  /** Unrezzed ice ids passed during the most recent successful run (En Passant). */
  lastRunPassedUnrezzedIceIds: string[];
  /** Unrezzed ice passed during the current run (accumulates). */
  currentRunPassedUnrezzedIceIds: string[];
  /** Runner made at least one run this turn (Subliminal recursion). */
  runnerMadeRunThisTurn: boolean;
  /** Runner made a run last turn. */
  runnerMadeRunLastTurn: boolean;
  /** Runner installed a resource during their turn (Hellion Alpha Test gate). */
  runnerInstalledResourceThisTurn: boolean;
  runnerInstalledResourceLastTurn: boolean;
  /** First Subliminal Messaging played this Corp turn. */
  subliminalPlayedThisTurn: boolean;
  /** First successful HQ Steve Cambridge trigger used. */
  steveCambridgeUsedThisTurn: boolean;
  /** First rezzed bioroid pass this turn (HB Architects). */
  bioroidPassedThisTurn: boolean;
  /**
   * Runner cannot use paid abilities printed on bioroid ice this turn
   * (Hákarl 1.0 after may-derez). Gates `break_bioroid_subroutine` and
   * Runner use of paid abilities on bioroid ice.
   */
  bioroidIcePaidAbilitiesForbidden: boolean;
  /**
   * Cortez Chip: additional rez cost on chosen ice until end of turn
   * (cardId → amount).
   */
  iceAdditionalRezCostThisTurn: Record<string, number>;
  /**
   * Last Corp card installed via `install_hq_card_paying_costs` this turn
   * (Greasing the Palm tag-for-advance follow-up).
   */
  lastInstalledFromEffectId: string | null;
  /** HB Architects pending rez discount for next bioroid rez. */
  pendingBioroidRezDiscount: number;
  /** Card instance ids whose once-per-turn onSuccessfulRun already fired. */
  onSuccessfulRunFiredIds: string[];
  /** Project Ares: remaining Runner installs to trash on score. */
  projectAresTrashRemaining?: number;
  projectAresTrashedCount?: number;
  /** Invasion of Privacy: remaining grip cards Corp may trash. */
  invasionPrivacyTrashRemaining?: number;
  /**
   * Card instance ids whose once-per-turn onSuccessfulRunEnd already fired
   * (Doppelgänger).
   */
  onSuccessfulRunEndFiredIds: string[];
  /**
   * Uroboros: Runner cannot initiate another run this turn.
   */
  cannotMakeAnotherRunThisTurn: boolean;
  /** Shoot the Moon: remaining free ice rezzes. */
  shootTheMoonRemaining?: number;
  /** Incubator: virus counters to move after self-trash. */
  incubatorMoveAmount?: number;
  /** Bribery: X paid as play cost this run. */
  briberyXPaid?: number;
  /**
   * Card instance ids whose `onFirstAvoidOrRemoveTagThisTurn` already fired
   * this turn (Thunder Art Gallery).
   */
  onFirstAvoidOrRemoveTagFiredIds: string[];
  /**
   * True after the first successful R&D run end this turn has offered
   * `onFirstSuccessfulRunOnRdEndsThisTurn` (Psych Mike).
   */
  firstSuccessfulRdRunEndUsedThisTurn: boolean;
  /**
   * True after the first program/hardware trash this turn was marked for
   * District 99-class triggers.
   */
  firstProgramOrHardwareTrashUsedThisTurn: boolean;
  /**
   * District 99-class: first program/hardware trash this turn met since
   * previous checkpoint; marked pending at the next 10.3.1a (phase 3).
   */
  firstProgramOrHardwareTrashMetPending: boolean;
  /**
   * True after the first access trash this turn was marked for Mâché-class
   * triggers.
   */
  firstAccessTrashUsedThisTurn: boolean;
  /**
   * Mâché-class: first access trash this turn met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3).
   */
  firstAccessTrashMetPending: boolean;
  /** Trash cost of the card most recently trashed while accessed (Mâché). */
  lastAccessTrashCost: number;
  /**
   * True after the first installed-resource paid ability resolves this turn
   * (Juli Moreira Lee gate).
   */
  firstResourcePaidAbilityThisTurn: boolean;
  /** Card instance ids whose once-per-turn onFullyBreak already fired. */
  onFullyBreakFiredIds: string[];
  /** Mercury: once-per-turn zero-break HQ/R&D breach bonus used. */
  mercuryBreachBonusUsedThisTurn: boolean;
  /** Info Bounty: first mark-run-end-if-breached credit gain used. */
  infoBountyMarkRunEndUsed: boolean;
  /** Hostile Architecture: meat-on-installed-trash used this turn. */
  hostileArchitectureUsedThisTurn: boolean;
  /**
   * Skip the discard step this turn (Midnight-3 Arcology).
   * Consumed when the discard step resolves.
   */
  skipDiscardThisTurn: boolean;
  /**
   * Last card that received advancements via place_advancements this turn
   * (Big Deal may-score target).
   */
  lastAdvancementTargetId: string | null;
  /** Corp cards moved into Archives this turn (Regenesis gate). */
  corpCardsAddedToArchivesThisTurn: number;
  /** Brasília upgrade instance ids that used their once-per-turn ability. */
  brasiliaAbilityUsedIds: string[];
  /**
   * Lightning Laboratory: after spending an agenda counter on run begin,
   * derez up to maxIce protecting serverId at runner.turnEnds.
   */
  lightningPendingDerez: { serverId: ServerId; maxIce: number } | null;
  /**
   * Synapse Global: Corp identity `onRemoveTags` fires at most once per turn.
   */
  firstCorpOnRemoveTagsThisTurn: boolean;
  /** IP Enforcement: tags removed as additional play cost this operation. */
  ipEnforcementTagsRemoved: number;
  /** Ryō Phoenix: first successful-after-sub ability already fired this turn. */
  ryoPhoenixFiredThisTurn: boolean;
  /**
   * Synchrocyclotron: first-double click discount already applied this Corp turn.
   */
  doubleOpClickDiscountUsedThisTurn: boolean;
  /**
   * Tungsten Tailor: gain-credit-on-break-lte-strength already used this turn.
   */
  tungstenBreakCreditUsedThisTurn: boolean;
  /** Stick and Poke: first-encounter gained subroutine already used this turn. */
  stickAndPokeUsedThisTurn: boolean;
  /** Null / Panchatantra: the once-per-turn encounter ability already fired. */
  encounterAnyIceHookFiredThisTurn?: boolean;
  /** The damage trashing grip cards right now (I've Had Worse). */
  gripTrashDamageType?: string;
  /** Scrubbed: the Runner has encountered a piece of ice this turn. */
  iceEncounteredThisTurn?: boolean;
  /** Maya: the once-per-turn R&D access finish already fired. */
  finishAccessRdHookFiredThisTurn?: boolean;
  /** Sipa: outermost full-break swap already used this turn. */
  sipaSwapUsedThisTurn: boolean;
  /** Black Hat: +N access on HQ/R&D breaches remainder of turn. */
  kaBlackHatBonusAccess?: number;
  /** Labor Rights: remaining heap cards to shuffle into stack. */
  moHeapShuffleRemaining?: number;
  /** Sacrifice Zone / Shackleton once-per-turn ability instance ids used. */
  otherServerSuccessAbilityUsedIds: string[];
  outsidePoolSpendAbilityUsedIds: string[];
  /** Editorial: first BP-take ability already marked this turn. */
  firstBadPublicityTakeUsedThisTurn: boolean;
  /**
   * Editorial: first BP take this turn met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3 scanner).
   */
  firstBadPublicityMetPending: boolean;
  /**
   * Number of Corp bad-publicity take events since the previous checkpoint
   * (each call to take BP). Runner onEachCorpBadPublicityTake marks once per
   * event at 10.3.1a (phase 3 scanner).
   */
  corpBadPublicityTakeEventsPending: number;
  /** Unorthodox Predictions: subtypes whose printed subs cannot be broken. */
  forbidBreakIceSubtypesUntilCorpTurnEnd?: string[];
  /** Leverage: Runner prevents all damage until next turn begins. */
  leveragePreventRunnerDamage?: boolean;
  /** Raymond Flint: apply HQ hand-only breach when next run starts. */
  pendingRaymondFlintHandOnlyHqBreach?: boolean;
  /** Aniccam: first event-trash ability already marked this turn. */
  firstEventTrashedUsedThisTurn: boolean;
  /**
   * Aniccam: first event trash this turn met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3 scanner).
   */
  firstEventTrashedMetPending: boolean;
  /** Tranquility-class: upgrade ids that already fired this turn. */
  firstInstallInServerRootUsedIds: string[];
  /**
   * Card instance ids whose once-per-turn onVirusPurge already fired
   * (Cyberdex Sandbox).
   */
  onVirusPurgeOncePerTurnFiredIds: string[];
  /**
   * Climactic Showdown: first HQ or R&D breach this turn gains this many
   * bonus accesses (0 = inactive). Consumed on first HQ/RD breach.
   */
  climacticBonusAccessOnFirstHqRdBreach: number;
  /**
   * Storgotic: first trash this turn of a card matching Runner identity
   * faction already marked.
   */
  firstTrashMatchingRunnerIdentityFactionUsedThisTurn: boolean;
  /**
   * Storgotic: first matching-faction trash this turn met since previous
   * checkpoint; marked pending at the next 10.3.1a (phase 3).
   */
  firstTrashMatchingRunnerIdentityFactionMetPending: boolean;
  /** Reaver: first installed-card trash already drew this turn. */
  mlReaverDrawUsedThisTurn: boolean;
  /**
   * Reaver: first installed-card trash this turn met since previous
   * checkpoint; marked pending at the next 10.3.1a (phase 3).
   */
  firstInstalledTrashMetPending: boolean;
  /** Şifr: once-per-turn zero-strength ability used. */
  sifrUsedThisTurn: boolean;
  /** Şifr: −1 max hand size until next Runner turn begins. */
  sifrHandSizePenaltyActive: boolean;
  /** Sensor Net Activation: bioroid ids to derez at turn end. */
  sensorNetPendingDerezIds: string[];
  /** Net Quarantine: first trace of the turn already applied link=0. */
  netQuarantineFirstTraceUsedThisTurn: boolean;
  /** Corp scored any agenda during their last turn (Peace in Our Time). */
  corpScoredAgendaLastTurn: boolean;
  /** Hyoubu: first reveal credit already gained this turn. */
  firstRevealCreditUsedThisTurn: boolean;
  /**
   * Hyoubu Institute: first reveal this turn met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3).
   */
  firstRevealMetPending: boolean;
  /**
   * Class Act instance ids whose onWouldDrawOncePerTurn already fired
   * this turn.
   */
  onWouldDrawOncePerTurnFiredIds: string[];
  /**
   * Pending Runner draw amount while Class Act interrupt resolves
   * (look top amount+1, bottom 1, then draw remainder).
   */
  pendingWouldDrawAmount: number | null;
  /**
   * Corp action kinds completed this turn in order (MirrorMorph distinct
   * third-action tracking). Values align with Wage Workers vocabulary.
   */
  corpActionKindsInOrderThisTurn: string[];
  /** Every Corp action this turn, including repeats (CR 5.2.5). */
  corpActionSequenceThisTurn: string[];
  /**
   * MirrorMorph can no longer become pending this turn: it already has, or
   * the first three actions are not all different (CR 5.2.5b.ex1).
   */
  mirrormorphThirdDistinctFiredThisTurn: boolean;
  /**
   * MirrorMorph: third distinct Corp action met since previous checkpoint;
   * marked pending at the next 10.3.1a (phase 3 scanner).
   */
  mirrormorphThirdDistinctMetPending: boolean;
  /**
   * MirrorMorph: the Corp is taking another action, paying [click] less. It
   * must be different from each action in `differentFrom` (CR 5.2.5b). Null
   * once that action is taken.
   */
  extraDifferentAction?: { sourceId: string; differentFrom: string[] } | null;
}

export type TurnPhase =
  | "corp_draw"
  | "corp_action"
  | "corp_discard"
  | "runner_action"
  | "runner_discard";
