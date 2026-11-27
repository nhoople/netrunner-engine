/** The trigger hooks on a card instance: every `CardInstance` field named `on<Event>`. */

import type { Effect } from "../../effects/ir/effect.js";

/**
 * The `CardInstance` fields named `on<Event>`: the card's trigger hooks.
 * `tests/state-types-layout.test.ts` checks the rule.
 */
export interface CardTriggerHooks {
  /**
   * Continuous / on-rez effect IR (e.g. prevent jack-out).
   * Evaluated when the card is rezzed.
   */
  onRez?: Effect;
  /**
   * Legacy play Effect when the card has no play-class ability record.
   * Prefer `playEffectFromCard` / `hasPlayEffect` at call sites.
   */
  onPlay?: Effect;
  /** Effect IR when Corp scores this agenda. */
  onScore?: Effect;
  /** Greenmail-class: when Corp forfeits this scored agenda. */
  onForfeit?: Effect;
  /** Effect IR when Runner steals this agenda. */
  onSteal?: Effect;
  /** Effect IR when this ice is encountered (CR 6.5.1). */
  onEncounter?: Effect;
  /** Effect IR when the Runner passes this ice (Phoneutria). */
  onPass?: Effect;
  /** Effect IR when the Runner bypasses a piece of ice (Capybara). */
  onBypass?: Effect;
  /**
   * Jeitinho-class: while this card is in the heap, after bypassing ice,
   * may spend `clickCost` clicks to install it when Threat ≥ `requiresThreat`.
   */
  onBypassMayInstallFromHeap?: {
    requiresThreat: number;
    clickCost: number;
  };
  /**
   * Effect IR the first time each turn the Runner installs a program
   * (LilyPAD).
   */
  onFirstProgramInstallEachTurn?: Effect;
  /**
   * Effect IR the first time each turn the Runner installs a piece of
   * hardware (Masterwork v37).
   */
  onFirstHardwareInstallEachTurn?: Effect;
  /**
   * Effect IR the first time each run the Runner encounters a piece of ice
   * (Baklan Bochkin).
   */
  onFirstEncounterEachRun?: Effect;
  /**
   * Effect IR the first time each turn the Runner trashes a Corp card
   * (Solidarity Badge).
   */
  onFirstCorpCardTrashEachTurn?: Effect;
  /**
   * Effect IR the first time each turn the Runner trashes an installed Corp
   * card (Aggressive Trendsetting, NBN: Controlling the Message).
   */
  onFirstInstalledCorpCardTrashEachTurn?: Effect;
  /**
   * Corp identity: first time each turn the Runner steals or trashes a Corp
   * card (Epiphany Analytica).
   */
  onFirstRunnerStoleOrTrashedCorpCardThisTurn?: Effect;
  /**
   * Effect IR whenever the Runner trashes a card they are accessing
   * (Audrey v2). Fired at every access-trash site (no once-per-turn gate).
   */
  onAccessTrash?: Effect;
  /**
   * Effect IR the first time each turn the Corp installs a card in a
   * server root (Lago Paranoá Shelter).
   */
  onFirstCorpRootInstallEachTurn?: Effect;
  /**
   * When true, `onAccess` fires only while this card is rezzed
   * (Angelique Garza Correa).
   */
  onAccessRequiresRezzed?: boolean;
  /**
   * Effect IR when the Runner passes the ice hosting this card (Pichação).
   */
  onPassHost?: Effect;
  /**
   * Effect IR when the Runner encounters the ice hosting this card (Chisel).
   */
  onHostEncounter?: Effect;
  /** Effect IR when host ice is rezzed (Saci). */
  onHostRezzed?: Effect;
  /** Effect IR when host ice is derezzed (Saci). */
  onHostDerezzed?: Effect;
  /**
   * Effect IR when the Runner approaches the server this card protects
   * (rezzed upgrade/asset in root; Nanisivik Grid).
   */
  onApproachServer?: Effect;
  /**
   * Letheia Nisei: fire `onApproachServer` at most once per run for this
   * instance (first approach of the attacked server each run).
   */
  onApproachServerOncePerRun?: boolean;
  /**
   * Effect IR when the Runner approaches ice protecting this server
   * (rezzed upgrade in root; Mitra Aman).
   */
  onApproachIce?: Effect;
  /** Midori: fire onApproachIce at most once per run. */
  onApproachIceOncePerRun?: boolean;
  /** Effect IR when this card's controller's turn begins (rezzed/installed). */
  onTurnBegin?: Effect;
  /**
   * Corp identity: fires once, before the first Corp turn begins (setup
   * phase). Host callers invoke `fireOnGameStartSetup` after building the
   * initial GameState (NEXT Design: Guarding the Net).
   */
  onGameStart?: Effect;
  /** Nasir Meidan: encounter ice rezzed during approach this run. */
  onEncounterRezzedAfterApproach?: Effect;
  /** Effect IR when this card is installed. */
  onInstall?: Effect;
  /** Stoke the Embers: install from anywhere except HQ. */
  onInstallFromNonHq?: Effect;
  /** Effect IR when the Runner makes a successful run (installed/rezzed source). */
  onSuccessfulRun?: Effect;
  /** Chakana: fires only when the successful run's attacked server was R&D. */
  onSuccessfulRunOnRd?: Effect;
  /** False Echo-class: fires whenever the Runner passes any unrezzed ice. */
  onPassUnrezzedIce?: Effect;
  /** Copycat-class: fires when the Runner passes rezzed ice. */
  onPassRezzedIce?: Effect;
  /**
   * Gorman Drip v1-class: fires whenever the Corp spends a click on the
   * basic gain-1-credit or draw-1-card action.
   */
  onCorpBasicClickForCreditOrDraw?: Effect;
  /**
   * When true, `onSuccessfulRun` fires at most once per turn for this instance
   * (e.g. Nyusha first successful run on the mark).
   */
  onSuccessfulRunOncePerTurn?: boolean;
  /**
   * Spinal Modem: when Corp succeeds a trace during a run, fire this Effect
   * (Runner identity / installed cards).
   */
  onSuccessfulTraceDuringRun?: Effect;
  /**
   * e3 Feedback Implants: after any subroutine is broken, fire this Effect
   * while installed.
   */
  onBreakSubroutine?: Effect;
  /**
   * e3 Feedback Implants: after any break, may pay `credits` to break another
   * subroutine on the encountered ice.
   */
  onBreakSubroutineMayPayCreditsBreakAnother?: { credits: number };
  /** Effect IR when this card is accessed (ambushes). */
  onAccess?: Effect;
  /** Effect IR when this Corp card is trashed to Archives (Mavirus). */
  onTrash?: Effect;
  /**
   * Director Haas: while trashed and being accessed by the Runner, fire
   * instead of the normal move-to-Archives (add_to_runner_score_as_agenda).
   */
  onTrashWhileAccessed?: Effect;
  /**
   * Identity: when a rezzed Corp card is trashed (not during install),
   * once per turn (Ob Superheavy).
   */
  onRezzedCardTrashed?: Effect;
  /**
   * Effect IR when this Runner card is trashed from grip or stack
   * (Steelskin Scarring — may draw 2).
   */
  onTrashFromGripOrStack?: Effect;
  /** Effect IR the first time the Runner receives a tag each turn (identities). */
  onFirstTagThisTurn?: Effect;
  /**
   * Runner identity: taking tags when the Runner had none at the previous
   * checkpoint (Sebastião; CR 9.6.6a — marked at 10.3.1a).
   */
  onTakeTagsWhenUntagged?: Effect;
  /** Cloud Eater: when encounter ends if rezzed this turn. */
  onEncounterEndIfRezzedThisTurn?: Effect;
  /** Knowledge Seeker: whenever an encounter with this ice ends. */
  onEncounterEnd?: Effect;
  /** Nuvem: after operation or expendable action. */
  onAfterOperationOrExpendable?: Effect;
  /** Sisyphus: first pass of rezzed code gate/sentry each turn. */
  onFirstPassRezzedCodeGateOrSentryThisTurn?: Effect;
  /**
   * Effect IR the first time the Runner suffers core damage each turn
   * (Runner identities; CR §10.4.2b).
   */
  onFirstCoreDamageThisTurn?: Effect;
  /** Exile: whenever the Runner installs a program from the heap, draw 1. */
  onInstallProgramFromHeap?: Effect;
  /**
   * Sentinel Defense Program: continuous while scored — whenever the Runner
   * suffers core damage, fire this effect (CR §10.4.2b).
   */
  onSufferCoreDamage?: Effect;
  /**
   * Bioroid Efficiency Research: condition counter hosted on ice — fires
   * once when the host ice becomes fully broken during an encounter.
   */
  onHostFullyBrokenThisEncounter?: Effect;
  /**
   * Effect IR the first time the Runner begins a run on R&D each turn
   * (Runner identities; e.g. Padma may charge).
   */
  onFirstRdRunBeginThisTurn?: Effect;
  /**
   * First Archives run begin each turn (rezzed asset/upgrade in server root;
   * e.g. Front Company net damage if host unprotected).
   */
  onFirstArchivesRunBeginThisTurn?: Effect;
  /** First run begin each turn (scored agenda; Stegodon MK IV). */
  onFirstRunBeginThisTurn?: Effect;
  /** Barry Wong: whenever Corp rezzes ice. */
  onAnyIceRez?: Effect;
  /** Corp identity: first remote install each turn (A Teia). */
  onFirstRemoteInstallThisTurn?: Effect;
  /**
   * Effect IR the first time the Runner installs a virus program each turn
   * (installed continuous, e.g. Avgustina → sabotage).
   */
  onFirstVirusInstallThisTurn?: Effect;
  /**
   * Effect IR the first time each turn the Runner makes a successful run on
   * their mark (installed continuous / identity; e.g. Virtuoso HQ bonus).
   */
  onFirstSuccessfulMarkRunThisTurn?: Effect;
  /**
   * Effect IR the first time each turn the Runner makes a successful run on HQ
   * (installed continuous; e.g. PAN-Weave Corp loses 1¢ / Runner gains 1¢).
   */
  onFirstSuccessfulHqRunThisTurn?: Effect;
  /**
   * Effect IR the first time each turn the Runner makes a successful run on a
   * central server (HQ / R&D / Archives; installed continuous; e.g. Zenit Chip).
   */
  onFirstSuccessfulCentralRunThisTurn?: Effect;
  /**
   * Effect IR the first time each turn the Runner makes a successful run
   * (any server; e.g. Pravdivost may place 1 advancement).
   */
  onFirstSuccessfulRunThisTurn?: Effect;
  /** Paige Piper: first install each turn. */
  onFirstInstallEachTurn?: Effect;
  /** Adjusted Chronotype: first click-loss except paid ability cost. */
  onFirstClickLossEachTurnExceptPaidAbility?: Effect;
  /** Synthetic Blood: first damage each turn. */
  onFirstDamageEachTurn?: Effect;
  /** Symmetrical Visage: first basic click-draw. */
  onFirstBasicClickDrawEachTurn?: Effect;
  /** Valley Grid: fully break protecting ice. */
  onFullyBreakProtectingIce?: Effect;
  /** Comet. */
  onFirstEventEachTurnMayPlayAnother?: boolean;
  /** Muertos: effect when uninstalled. */
  onUninstall?: Effect;
  /** Drug Dealer. */
  onCorpTurnBegin?: Effect;
  /** Agenda: tags given when accessed (Casting Call). */
  onAccessGiveTags?: number;
  onFinishAccessRdOncePerTurn?: Effect;
  onEncounterAnyIceOncePerTurn?: Effect;
  onPassIceProtectingThisServerMaySwap?: boolean;
  onAdvance?: Effect;
  /** Councilman */
  onCorpRezAssetOrUpgradeMayPayRezCostTrashSelfDerez?: boolean;
  /** Political Dealings */
  onDrawAgendaMayRevealAndInstall?: boolean;
  /** Surat City Grid */
  onRezOtherCardInRootOrProtectingMayRezDiscount?: number;
  /** Bazaar */
  onInstallHardwareFromGripMayInstallAnotherCopy?: boolean;
  /** Personality Profiles */
  onRunnerSearchStackOrInstallFromHeapTrashRandomFromGrip?: boolean;
  /** Raman Rai */
  onDrawMayLoseClickRevealSwapArchivesSameTypeOncePerTurn?: boolean;
  /** Aryabhata Tech */
  onAnySuccessfulTraceGainAndRunnerLose?: { gain: number; lose: number };
  /** Indian Union Stock Exchange */
  onRezOrPlayOutOfFactionGainCredits?: number;
  /** Puppet Master */
  onSuccessfulRunMayPlaceAdvancementOnCanBeAdvanced?: boolean;
  onSuccessfulRdRunMayReplaceSpentRecurringCredit?: boolean;
  onUnsuccessfulRunOnThisServer?: import("../../effects/ir/effect.js").Effect;
  onTurnBeginIfRunnerTagged?: import("../../effects/ir/effect.js").Effect;
  onFirstPassIceEachTurn?: import("../../effects/ir/effect.js").Effect;
  onRunDeclaredOnThisServerIfTagged?: import("../../effects/ir/effect.js").Effect;
  onSuccessfulRunThisServer?: import("../../effects/ir/effect.js").Effect;
  onTrashWhileRezzedTakeBadPublicity?: number;
  onTurnEndIfGripEmptyDrawPerPowerThenTrash?: boolean;
  onRunnerTrashFromThisServerRootOrProtecting?: Effect;
  onEncounterEndIfPrintedSubroutineBroken?: Effect;
  onRezIceProtectingThisServer?: Effect;
  onFirstEmptyGripEachTurn?: Effect;
  /** Down the White Nile (dtwn) */
  onFirstSuccessfulHqOrRdRunThisTurn?: Effect;
  onTurnBeginFromRunnerScoreOnCorpTurn?: boolean;
  onDrawIceMayRevealAndInstallProtectingThisServerPayingLess?: number;
  onEncounterEndIfNotFullyBroken?: Effect;
  /** Faerie: whenever an encounter ends, if this program broke a subroutine during it (CR 9.6). */
  onEncounterEndIfBroke?: Effect;
  onAgendaAccessedOrScored?: Effect;
  onEncounterMayPayCreditsGrantIceSubtype?: {
    credits: number;
    subtype: string;
    oncePerTurn?: boolean;
  };
  onAgendaAddedToRunnerScore?: Effect;
  onScoreTurnEnd?: Effect;
  onAccessWhileInstalled?: Effect;
  onAccessWhileUninstalled?: Effect;
  onAccessNotFromRd?: Effect;
  onCorpDrawCard?: Effect;
  onExposeWhileInstalled?: Effect;
  onFirstAdvancementOnServerThisTurn?: Effect;
  onTurnBeginIfNoRunnerSuccessfulRunLastTurn?: Effect;
  onPsiCreditsRevealed?: Effect;
  onApproachServerOncePerTurn?: boolean;

  /**
   * Effect IR the first time each turn a run is declared unsuccessful
   * (e.g. John Masanori take 1 tag).
   */
  onFirstUnsuccessfulRunThisTurn?: Effect;

  /** Aniccam: first event trashed each turn. */
  onFirstEventTrashedThisTurn?: Effect;
  /** Tranquility Home Grid: first install in this server's root each turn. */
  onFirstInstallInThisServerRootThisTurn?: Effect;

  /**
   * Effect IR whenever the Runner installs a program or piece of hardware
   * (installed continuous; e.g. Environmental Testing place 1 power counter).
   * Does not fire for resource installs or on the newly installed card itself.
   */
  onProgramOrHardwareInstall?: Effect;
  /** Hiram: whenever Runner installs or trashes hardware. */
  onHardwareInstallOrTrash?: Effect;
  /** Replicator: whenever Runner installs any hardware (including self). */
  onHardwareInstall?: Effect;
  /**
   * Static-condition ability: when this card's hosted power counters reach
   * `amount` or more, evaluate `effect` (e.g. Environmental Testing trash + gain).
   * Checked after power counters increase (add_power_counter / charge).
   */
  onPowerCountersGte?: { amount: number; effect: Effect };
  /**
   * When hosted credits ≥ amount, evaluate effect (Side Hustle take/trash/draw).
   */
  onHostedCreditsGte?: { amount: number; effect: Effect };
  /** Effect IR when Corp scores any agenda (identity or installed continuous). */
  onAgendaScored?: Effect;
  /** Effect IR when any agenda is scored or stolen (installed continuous). */
  onAgendaScoredOrStolen?: Effect;
  /** Corp identity: whenever the Runner steals an agenda (Thule Subsea). */
  onAgendaStolen?: Effect;
  /**
   * Scored Corp agenda: whenever the Runner steals another agenda
   * (Divested Trust).
   */
  onOtherAgendaStolen?: Effect;
  /**
   * First time each turn this program fully breaks a piece of ice (Orca, Abaasy).
   */
  onFullyBreakOncePerTurn?: Effect;
  /**
   * Effect IR whenever this card fully breaks a piece of ice (Curupira).
   * Unbounded — fires on every full break, unlike onFullyBreakOncePerTurn.
   */
  onFullyBreak?: Effect;
  /**
   * Once per turn when Runner succeeds on another server, evaluate effect
   * (Sacrifice Zone Expansion).
   */
  onSuccessfulRunOtherServerOncePerTurn?: Effect;
  /**
   * Once per turn when a successful run ends, evaluate this effect
   * (Doppelgänger may_start_run any server).
   */
  onSuccessfulRunEndOncePerTurn?: Effect;
  /**
   * Whenever a successful run ends, evaluate this effect while rezzed
   * (Dedicated Response Team).
   */
  onSuccessfulRunEnd?: Effect;
  /**
   * Once per turn when Runner spends outside their credit pool during a run
   * against this server (Shackleton Grid).
   */
  onSpendCreditsOutsidePoolDuringRunOncePerTurn?: Effect;
  /**
   * Once per turn when breaching HQ/R&D with no breaks this run, may access
   * this many additional cards (Mercury).
   */
  onBreachHqRdIfNoBreaksOncePerTurnMayBonusAccess?: number;
  /**
   * Pretty Mary: when breaching R&D, if already allowed to access ≥ `min`
   * R&D cards this breach, may access `amount` additional.
   */
  onBreachRdIfAccessGteMayBonusAccess?: { min: number; amount: number };
  /** Valentina: effect when 1+ tags are removed while installed. */
  onRemoveTags?: Effect;
  /**
   * Thunder Art Gallery: effect the first time each turn a tag is avoided or
   * removed while this card is installed.
   */
  onFirstAvoidOrRemoveTagThisTurn?: Effect;
  /** Arella Salvatore: whenever an agenda is scored from this server. */
  onAgendaScoredFromThisServer?: Effect;
  /** Psych Mike: first successful R&D run end each turn. */
  onFirstSuccessfulRunOnRdEndsThisTurn?: Effect;
  /** District 99: first program or hardware trash each turn. */
  onFirstProgramOrHardwareTrashEachTurn?: Effect;
  /** Mâché: first access trash each turn. */
  onFirstAccessTrashEachTurn?: Effect;
  /** Amanuensis: effect at the end of the Runner's turn. */
  onRunnerTurnEnd?: Effect;
  /** City Surveillance: when the Runner's turn begins. */
  onRunnerTurnBegin?: Effect;
  /** Raymond Flint: whenever the Corp takes bad publicity. */
  onEachCorpBadPublicityTake?: Effect;
  /** Activist Support: at Corp turn begin if Runner has 0 tags. */
  onCorpTurnBeginIfRunnerUntagged?: Effect;
  /** Activist Support: at Runner turn begin if Corp has 0 bad publicity. */
  onTurnBeginIfCorpNoBadPublicity?: Effect;
  /** Rex Campaign: fire when power counters reach 0. */
  onPowerCountersEmpty?: Effect;
  /**
   * Mystic Maemi / Paladin Poemu: effect whenever the Runner steals an agenda
   * while this card is installed.
   */
  onStealAgenda?: Effect;
  /**
   * Juli Moreira Lee: first time each turn a paid ability on an installed
   * resource resolves, evaluate this effect (sourced on this card).
   */
  onFirstResourcePaidAbilityEachTurn?: Effect;
  /** Bling: Effect IR when the Runner installs a card without spending credits. */
  onInstallWithoutSpendingCredits?: Effect;
  /** Bangun: Effect IR when Runner accesses a faceup installed agenda. */
  onAccessFaceupInstalledAgenda?: Effect;
  /** Mu Safecracker: on successful HQ run, may pay for bonus access. */
  onSuccessfulHqRunMayPayForBonusAccess?: {
    credits: number;
    bonusAccess: number;
  };
  /** Mu Safecracker: on successful R&D run, may pay for bonus access. */
  onSuccessfulRdRunMayPayForBonusAccess?: {
    credits: number;
    bonusAccess: number;
  };
  /** Noise/Grimoire-class: effect whenever a virus program is installed (every time). */
  onVirusProgramInstall?: Effect;
  /** HB ETF-class: Corp identity effect the first time each turn Corp installs any card. */
  onFirstCorpCardInstallEachTurn?: Effect;
  /**
   * Buffer Drive: first grip/stack trash batch each turn while installed.
   */
  onFirstGripOrStackTrashBatchEachTurn?: Effect;
  /** René: on access-trash, gain credits/draw once per turn. */
  onAccessTrashGain?: { credits: number; draw: number; oncePerTurn?: boolean };
  /**
   * Cyberdex Sandbox: `onVirusPurge` fires at most once per turn.
   */
  onVirusPurgeOncePerTurn?: boolean;
  /** Effect IR at end of Corp turn while installed rezzed in a server root. */
  onCorpTurnEnd?: Effect;
  /**
   * Effect IR when Corp or Runner discard phase ends for the owner's side
   * (Corp: Project Ingatan hub; Runner identity: Lat Ethical Freelancer).
   */
  onDiscardPhaseEnd?: Effect;
  /**
   * Class Act: first time each turn Runner would draw any number, look top
   * amount+1 and bottom 1 of those before the draw proceeds.
   */
  onWouldDrawOncePerTurn?: Effect;
  /**
   * Storgotic Resonator: first trash each turn of a card matching the Runner
   * identity's faction → place power.
   */
  onFirstTrashMatchingRunnerIdentityFactionEachTurn?: Effect;
  /**
   * Hyoubu Institute: first reveal each turn → gain credits (etc.).
   */
  onFirstRevealEachTurn?: Effect;
  /** Mercia B4LL4RD: may install ice at Corp action phase end. */
  onCorpActionPhaseEnd?: Effect;
  /**
   * The Back: first hardware paid-ability use during a run each turn.
   */
  onFirstHardwareUseDuringRunEachTurn?: Effect;
  /**
   * GameNET: whenever a Corp card ability causes Runner spend/lose ≥1¢
   * during a run (CR 1.16.2b).
   */
  onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun?: Effect;
  /**
   * Magdalene-class: when discarding to max hand size, may install from
   * among those discarded cards.
   */
  onRunnerDiscardOverMaxHand?: Effect;
  /**
   * Zwicky: first time each turn Corp gains credits via an agenda or
   * operation ability.
   */
  onCreditsGainedFromAgendaOrOperationAbility?: Effect;
  /** Cacophony: sabotage at Runner action phase end. */
  onRunnerActionPhaseEnd?: Effect;
  /** Phật Gioan: first agenda scored/stolen each turn. */
  onFirstAgendaScoredOrStolenThisTurn?: Effect;
  /** Whenever a run begins while installed (Side Hustle). */
  onRunBegin?: Effect;
  /** Corp identity: resolve before the Corp's first turn (CR 1.6.7a). */
  onBeforeFirstTurn?: Effect;
  /** Isaac: fire when this upgrade finishes moving to a server root. */
  onMovedToServerRoot?: Effect;
  /** Lightning Laboratory: on run begin may spend agenda counter to rez ice. */
  onRunBeginMaySpendAgendaCounterRezUpToIceProtectingAttacked?: {
    maxIce: number;
  };
  /** Lightning Laboratory: config for delayed end-of-turn derez (fires runner.turnEnds). */
  onCorpTurnEndDerezUpToIceProtectingLightningServer?: { maxIce: number };
  /** Thunderbolt identity: on rez AP/destroyer ice during a run. */
  onRezApOrDestroyerIceDuringRun?: {
    strengthBonus: number;
    gainEtrUnlessTrashInstalledSub: boolean;
  };
  /** Heliamphora-class: Effect when Corp purges virus counters. */
  onVirusPurge?: Effect;
  /** Cupellation: HQ breach may pay+trash for bonus access while hosting Corp. */
  onBreachHqIfHostingCorpCard?: Effect;
  /** Akiko Nisei-class: Effect when breaching R&D (before access candidates). */
  onBreachRd?: Effect;
  /** Heliamphora: interrupt Archives access to host faceup instead. */
  onWouldAccessArchivesHostInstead?: { oncePerArchivesBreach?: boolean };
  /** Edge of World: onAccess only while installed. */
  onAccessRequiresInstalled?: boolean;
  /** Tallie Perrault: when gray/black ops operation trashed after resolving. */
  onGrayOrBlackOpsTrashedAfterResolve?: Effect;
  /** Caprice Nisei: Runner passed all ice protecting this server. */
  onPassAllIceProtectingServer?: Effect;
  /** Broadcast Square: Corp would take bad publicity. */
  onWouldTakeBadPublicity?: Effect;
  /** Eden Shard: install from grip instead of breaching R&D on success. */
  onGripRdSuccessInstallSelfIgnoringCosts?: boolean;
  /** Market Research: on score while Runner tagged, place 1 agenda counter. */
  onScoreIfRunnerTaggedPlaceAgendaCounter?: boolean;
  onFirstIceRezEachTurn?: Effect;
  onSuccessfulRunOnThisServer?: Effect;
  onFirstRunnerCreditPoolEmptyThisTurn?: Effect;
  onGripArchivesSuccessInstallSelfIgnoringCosts?: boolean;
  /** Utopia Shard: install from grip instead of breaching HQ. */
  onGripHqSuccessInstallSelfIgnoringCosts?: boolean;
  onPassRezzedIceProtectingThisServer?: Effect;
  onCorpRemoteServerCreated?: import("../../effects/ir/effect.js").Effect;
  /** Editorial: first BP take each turn. */
  onFirstBadPublicityTakeEachTurn?: Effect;
  /**
   * Nurse Hạnh: when ≥min facedown Archives cards turn faceup together,
   * evaluate effect.
   */
  onArchivesFacedownTurnedFaceupGte?: { min: number; effect: Effect };
  onFirstRunnerClickSpendOrLoseDuringRun?: Effect;
}
