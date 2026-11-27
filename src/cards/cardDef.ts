/** CardDef: what a card's rules file in the cards dataset may declare, as the loader reads it (cards/load.ts) and instantiateCard copies it onto a card. */
import type { CardType, Side } from "../state/types/shared.js";
import type { BreakerAbility, PaidAbility } from "../state/types/abilities.js";
import type { Effect } from "../effects/ir/effect.js";
import type { AbilityRecord } from "../effects/abilityRecord.js";

export interface CardDef {
  id: string;
  title: string;
  type: CardType;
  side: Side;
  installCost?: number;
  rezCost?: number;
  playCost?: number;
  trashCost?: number;
  strength?: number;
  subtypes?: string[];
  agendaPoints?: number;
  advancementRequirement?: number;
  /** Blood in the Water: requirement equals Runner grip size. */
  advancementRequirementEqualsRunnerGrip?: boolean;
  /** Freedom of Information: −per × Runner tags. */
  advancementRequirementReductionPerTag?: number;
  /** Ontological Dependence: −per × core damage this game. */
  advancementRequirementReductionPerCoreDamageThisGame?: number;
  /** Regulatory Capture: −per × bad publicity (optional max counted). */
  advancementRequirementReductionPerBadPublicity?: {
    per: number;
    max?: number;
  };
  advancementRequirementIncreasePerCorpBadPublicity?: number;
  recurringCreditsMax?: number;
  link?: number;
  /** Identity minimum deck size (CR 2.11.1). Deckbuilding only (CR 3.1.2). */
  minimumDeckSize?: number;
  /** Identity influence limit (CR 2.12.1). Deckbuilding only (CR 3.1.2). */
  influenceLimit?: number;
  /** Printed influence cost (CR 2.14.1). Absent when the card has no influence bar. */
  influence?: number;
  subroutines?: Array<{
    id: string;
    text: string;
    effect: Effect;
    /** Zed 1.0: requires a lost click to break earlier this run. */
    requireLostClickToBreakThisRun?: boolean;
  }>;
  breaker?: BreakerAbility;
  paidAbilities?: PaidAbility[];
  /**
   * Printed abilities in Comprehensive Rules 9.3 form.
   * When present, load copies each record onto the hook the rules evaluate.
   */
  abilities?: AbilityRecord[];
  onRez?: Effect;
  onPlay?: Effect;
  /** Additional cost Effect IR when playing (e.g. suffer core damage). */
  playAdditionalCost?: Effect;
  onScore?: Effect;
  /** Effect IR when Corp forfeits this scored agenda (Greenmail). */
  onForfeit?: Effect;
  /** Additional cost Effect IR paid before scoring (e.g. Azef must_trash). */
  scoreAdditionalCost?: Effect;
  /** Additional cost Effect IR paid before stealing (e.g. SDS trash program). */
  stealAdditionalCost?: Effect;
  trashAdditionalCost?: Effect;
  stealAdditionalCostFromProtectingServer?: Effect;
  /**
   * Additional clicks the Runner must spend to steal this agenda
   * (Méliès City Luxury Line).
   */
  stealAdditionalClicks?: number;
  /** Bellona-class: additional credits to steal this agenda. */
  stealAdditionalCredits?: number;
  /**
   * While this lockdown is active, Runner pays base + perAdvancement ×
   * advancementCounters to steal an agenda (NAPD Cordon).
   */
  stealAdditionalCreditsFormula?: { base: number; perAdvancement: number };
  /**
   * While rezzed, Runner must pay this many credits as an additional cost to
   * steal any agenda (Magistrate Revontulet).
   */
  stealAdditionalCreditsWhileRezzed?: number;
  /**
   * While rezzed (or Persistent), additional credits to steal an agenda from
   * this server or its root (Red Herrings).
   */
  stealAdditionalCreditsFromProtectingServer?: number;
  /** Gold Farmer-class: Runner loses N¢ whenever they break a printed sub. */
  runnerLoseCreditsOnBreakPrintedSubroutine?: number;
  /**
   * Reduce play cost by 1 per ice protecting this server (Tailgate: "hq").
   */
  playCostDiscountPerIceProtectingServer?: "hq" | "rd" | "archives";
  /**
   * While rezzed, the first double operation each turn costs this many clicks
   * less to play (Synchrocyclotron).
   */
  firstDoubleOperationClickDiscount?: number;
  onSteal?: Effect;
  onEncounter?: Effect;
  /** Effect IR when the Runner passes this ice (Phoneutria). */
  onPass?: Effect;
  /** Effect IR when the Runner bypasses a piece of ice (Capybara). */
  onBypass?: Effect;
  /**
   * Jeitinho-class: heap install-on-bypass when Threat met.
   */
  onBypassMayInstallFromHeap?: {
    requiresThreat: number;
    clickCost: number;
  };
  onFirstProgramInstallEachTurn?: Effect;
  /** Masterwork: first hardware install each turn. */
  onFirstHardwareInstallEachTurn?: Effect;
  /** Baklan: first ice encounter each run. */
  onFirstEncounterEachRun?: Effect;
  onFirstCorpCardTrashEachTurn?: Effect;
  onFirstInstalledCorpCardTrashEachTurn?: Effect;
  onFirstRunnerStoleOrTrashedCorpCardThisTurn?: Effect;
  onAccessTrash?: Effect;
  onFirstCorpRootInstallEachTurn?: Effect;
  onAccessRequiresRezzed?: boolean;
  onPassHost?: Effect;
  hostedCreditsOnAnyIceRez?: number;
  hostedCreditsSpendForInstallTypes?: Array<
    "program" | "hardware" | "resource"
  >;
  /** Kati Jones: at most one paid ability on this card each turn. */
  paidAbilitiesOncePerTurn?: boolean;
  hostedCreditsSpendFor?: Array<"install" | "trash" | "play_event">;
  /** Open Market: hosted install credits only for resources with these subtypes. */
  hostedCreditsSpendForInstallSubtypes?: string[];
  /**
   * Paladin Poemu: hosted install credits cannot be spent on cards with these
   * subtypes (e.g. connection).
   */
  hostedCreditsSpendForInstallExcludeSubtypes?: string[];
  /** Gourmand: access → trash self to trash accessed non-agenda, then draw. */
  accessTrashSelfNonAgendaThenDraw?: boolean;
  rezAdditionalCost?: Effect;
  onHostRezzed?: Effect;
  onHostDerezzed?: Effect;
  /** Chisel: when Runner encounters the ice hosting this card. */
  onHostEncounter?: Effect;
  /**
   * Threat N → Runner cannot spend credits while subroutines on this ice
   * are resolving (Attini).
   */
  threatCannotSpendCreditsDuringSubs?: number;
  /**
   * Effect IR when the Runner approaches the server this card protects
   * (rezzed in attacked-server root; Nanisivik Grid).
   */
  onApproachServer?: Effect;
  /**
   * Letheia Nisei: fire `onApproachServer` at most once per run.
   */
  onApproachServerOncePerRun?: boolean;
  /** Mitra Aman: when Runner approaches ice protecting this server. */
  onApproachIce?: Effect;
  /** Midori: fire onApproachIce at most once per run. */
  onApproachIceOncePerRun?: boolean;
  /** Nebula-class dual identity back-side hooks. */
  identityFlippedHooks?: {
    onFirstOperationPlayThisTurn?: Effect;
    onSuccessfulHqOrRdRun?: Effect;
    onSuccessfulHqRun?: Effect;
    onFlipToBackIfRunMatchesFace?: Effect;
    onRunnerDiscardPhaseEnd?: Effect;
  };
  additionalRunInitiateCredits?: {
    hqUnflipped?: number;
    remoteFlipped?: number;
  };
  /**
   * Reduced Service / Cold Site: per power counter, additional credits/clicks
   * to initiate a run on this server.
   */
  additionalRunInitiatePerPowerCounter?: {
    credits?: number;
    clicks?: number;
  };
  /** Ruhr Valley: flat additional clicks to initiate a run on this server. */
  additionalRunInitiateClicks?: number;
  /**
   * Reduced Service: on rez, may spend up to `max` credits for that many
   * power counters.
   */
  rezSpendCreditsForPowerCounters?: { max: number };
  vacheronStealReplacement?: boolean;
  worthZeroAgendaPointsWhileHasAgendaCounters?: boolean;
  onFirstHardwareUseDuringRunEachTurn?: Effect;
  onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun?: Effect;
  /** Méliès U: flip identity on successful central run. */
  flipIdentityOnSuccessfulCentralRun?: boolean;
  /** Magdalene: install from among cards discarded to hand size. */
  onRunnerDiscardOverMaxHand?: Effect;
  /** Zwicky: first credit gain via agenda/operation ability each turn. */
  onCreditsGainedFromAgendaOrOperationAbility?: Effect;
  /** Install only on a remote server (ZATO City Grid). */
  remoteOnly?: boolean;
  /**
   * Derived at load from any ability with `flag: persistent` (CR 9.3.6e).
   * Not a card-declaration field.
   */
  persistent?: boolean;
  /** Rez only during Corp turn (Front Company). */
  rezOnlyDuringCorpTurn?: boolean;
  /** While rezzed: first run each turn cannot target remotes (Front Company). */
  firstRunCannotTargetRemote?: boolean;
  /**
   * While rezzed: ice protecting this server gains encounter may-trash-to-
   * resolve-chosen-sub (ZATO City Grid).
   */
  iceGainsTrashToResolveChosenSubOnEncounter?: boolean;
  /**
   * Gantulga: during first encounter each turn with ice protecting the
   * named server, each subroutine becomes Do N net damage instead.
   */
  firstEncounterSubsBecomeNetDamage?: number;
  /** Trash this card when hostedCardIds becomes empty (Asmund). */
  trashWhenNoHostedCards?: boolean;
  /** Instance ids hosted on this card (not installed). */
  hostedCardIds?: string[];
  /** Deckbuilding max copies (Matryoshka 6). */
  deckLimit?: number;
  onTurnBegin?: Effect;
  /** Corp identity: fires once, before the first Corp turn begins (setup phase). */
  onGameStart?: Effect;
  onInstall?: Effect;
  /** Stoke the Embers: when installed from anywhere except HQ. */
  onInstallFromNonHq?: Effect;
  onSuccessfulRun?: Effect;
  /** Chakana: fires only when the successful run's attacked server was R&D. */
  onSuccessfulRunOnRd?: Effect;
  /**
   * False Echo-class: fires on the Runner card whenever the Runner passes
   * any unrezzed ice (any server).
   */
  onPassUnrezzedIce?: Effect;
  /** Copycat-class: fires when the Runner passes rezzed ice. */
  onPassRezzedIce?: Effect;
  whileScoredMeatDamageIncrease?: number;
  blocksRunnerRunsOnHostServer?: boolean;
  trashSelfWhenFullyBrokenByRunner?: boolean;
  trashSelfOnCorpSuccessfulHqRun?: boolean;
  gainCreditsWhenRunnerHostsProgramOnSelf?: number;
  /**
   * Gorman Drip v1-class: fires on the Runner card whenever the Corp spends
   * a click to use the basic gain-1-credit or draw-1-card action (not
   * through a card ability).
   */
  onCorpBasicClickForCreditOrDraw?: Effect;
  /** Fire onSuccessfulRun at most once per turn for this instance. */
  onSuccessfulRunOncePerTurn?: boolean;
  /** Spinal Modem: fire when Corp succeeds a trace during a run. */
  onSuccessfulTraceDuringRun?: Effect;
  /** e3 Feedback Implants: fire after any subroutine is broken. */
  onBreakSubroutine?: Effect;
  /** e3: may pay credits to break another sub after each break. */
  onBreakSubroutineMayPayCreditsBreakAnother?: { credits: number };
  /** Snowball: +N strength for run when this breaker breaks a sub. */
  strengthBonusOnBreakSubForRun?: number;
  /** Encryption Protocol: +N trash cost all installed while rezzed. */
  installedCardsTrashCostBonus?: number;
  /** Amazon Industrial Zone: may rez ice on install protecting this server −N. */
  mayImmediatelyRezIceOnInstallProtectingThisServerDiscount?: number;
  onAccess?: Effect;
  onTrash?: Effect;
  /** Director Haas: while trashed and being accessed, add to Runner score as agenda. */
  onTrashWhileAccessed?: Effect;
  onTrashFromGripOrStack?: Effect;
  /** Identity: when a rezzed Corp card is trashed (Ob Superheavy). */
  onRezzedCardTrashed?: Effect;
  onFirstTagThisTurn?: Effect;
  /** Jesminder Sareen: prevent 1 tag the first time each run the Runner would take tags. */
  preventFirstTagEachRun?: boolean;
  /** Runner identity: taking tags while previously untagged (Sebastião). */
  onTakeTagsWhenUntagged?: Effect;
  connectionBasicTrashAdditionalCostTrashHq?: boolean;
  onEncounterEndIfRezzedThisTurn?: Effect;
  onEncounterEnd?: Effect;
  rezCostDiscountIfAgendaScoredOrStolenThisTurn?: number;
  allIceStrengthPenalty?: number;
  /** NEXT Activation Command: +N strength to all ice while active lockdown. */
  allIceStrengthBonus?: number;
  /**
   * NEXT Activation Command: cannot break with cards lacking icebreaker
   * subtype while active.
   */
  cannotBreakExceptIcebreaker?: boolean;
  gainCreditOnBreakIceStrengthLteOncePerTurn?: number;
  onAfterOperationOrExpendable?: Effect;
  creditsOnFirstRdTrashThisTurn?: number;
  onFirstPassRezzedCodeGateOrSentryThisTurn?: Effect;
  /** First core damage suffered each turn (Runner identities). */
  onFirstCoreDamageThisTurn?: Effect;
  /** Exile: whenever the Runner installs a program from the heap, draw 1. */
  onInstallProgramFromHeap?: Effect;
  /** Sentinel Defense Program: whenever the Runner suffers core damage (continuous while scored). */
  onSufferCoreDamage?: Effect;
  /** Bioroid Efficiency Research: fires once when the host ice becomes fully broken during an encounter. */
  onHostFullyBrokenThisEncounter?: Effect;
  /** First R&D run begin each turn (Runner identities; e.g. Padma). */
  onFirstRdRunBeginThisTurn?: Effect;
  /** First Archives run begin each turn (Front Company). */
  onFirstArchivesRunBeginThisTurn?: Effect;
  onFirstRunBeginThisTurn?: Effect;
  /**
   * Mystic Maemi / Paladin Poemu: whenever the Runner steals an agenda while
   * this card is installed.
   */
  onStealAgenda?: Effect;
  maxRemoteServers?: number;
  loseClickOnProtectingIceEncounterEndIfBroke?: boolean;
  cannotRunRemotesUntilCentralRunThisTurn?: boolean;
  removeVirusOrTrashOnEncounterEndIfBroke?: boolean;
  /** Tycoon: Corp gains N¢ when encounter ends if this breaker broke a sub. */
  corpGainsCreditsOnEncounterEndIfBroke?: number;
  /** Cradle: −N strength per card in grip. */
  strengthPenaltyPerGripCard?: number;
  /** The Outfit: gain N¢ whenever Corp takes ≥1 bad publicity. */
  gainCreditsOnEachBadPublicityTake?: number;
  /** Hijacked Router: Corp loses N¢ whenever they create a server. */
  corpLosesCreditsOnCreateServer?: number;
  hostNonAiIcebreaker?: boolean;
  hostedIcebreakerMemoryDoesNotCount?: boolean;
  hostsAnyProgramMemoryCostLte?: number;
  /** Awakening Center: host bioroid ice free; pass-all-ice rez/encounter/trash. */
  hostsBioroidIceIgnoreInstallCost?: boolean;
  /** Tyr's Hand: break-interrupt rez + trash-prevent-1-break on bioroid. */
  preventSubroutineBreakOnBioroidByTrash?: boolean;
  playOrInstallDiscountByTrashingGripOncePerTurn?: number;
  gainCreditsOnFirstRunnerClickSpendThisTurn?: number;
  refundCreditsIfRunBeginsOnThisServerDuringClickAction?: number;
  onFirstRunnerClickSpendOrLoseDuringRun?: Effect;
  trashHostIfAllSubsBrokenThisEncounter?: boolean;
  onFirstRemoteInstallThisTurn?: Effect;
  whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun?: number;
  /** First virus program install each turn (installed continuous; e.g. Avgustina). */
  onFirstVirusInstallThisTurn?: Effect;
  /** First successful run on the mark each turn (e.g. Virtuoso HQ bonus / post-run breach). */
  onFirstSuccessfulMarkRunThisTurn?: Effect;
  /** First successful HQ run each turn (e.g. PAN-Weave credit transfer). */
  onFirstSuccessfulHqRunThisTurn?: Effect;
  /** First successful central run each turn (e.g. Zenit Chip draw). */
  onFirstSuccessfulCentralRunThisTurn?: Effect;
  /** First successful run each turn any server (e.g. Pravdivost place adv). */
  onFirstSuccessfulRunThisTurn?: Effect;
  /** First unsuccessful run each turn (e.g. John Masanori take 1 tag). */
  onFirstUnsuccessfulRunThisTurn?: Effect;
  /**
   * Spark Agency: first advertisement rez each turn, Runner loses this many ¢.
   */
  loseCreditsOnFirstAdvertisementRezThisTurn?: number;
  onFirstEventTrashedThisTurn?: Effect;
  icebreakerInstallStrengthBonusThisTurn?: {
    amount: number;
    nonAiOnly?: boolean;
  };
  onFirstInstallInThisServerRootThisTurn?: Effect;
  additionalTagsDuringOutermostIceEncounter?: number;
  /** Whenever Runner installs a program or hardware (e.g. Environmental Testing). */
  onProgramOrHardwareInstall?: Effect;
  onHardwareInstallOrTrash?: Effect;
  /** Replicator: whenever any hardware is installed (including self). */
  onHardwareInstall?: Effect;
  installServers?: Array<"hq" | "rd" | "archives">;
  /**
   * When hosted power counters ≥ amount, evaluate effect
   * (e.g. Environmental Testing trash self + gain 9¢).
   */
  onPowerCountersGte?: { amount: number; effect: Effect };
  onHostedCreditsGte?: { amount: number; effect: Effect };
  onAgendaScored?: Effect;
  onAgendaScoredOrStolen?: Effect;
  /** Corp identity: whenever the Runner steals an agenda (Thule Subsea). */
  onAgendaStolen?: Effect;
  /** Scored Corp agenda: whenever the Runner steals another agenda. */
  onOtherAgendaStolen?: Effect;
  /** First time each turn this program fully breaks ice (Orca, Abaasy). */
  onFullyBreakOncePerTurn?: Effect;
  onFullyBreak?: Effect;
  hostedCreditsOnRunEventPlay?: number;
  hostedCreditsOnFirstEventPlayOncePerTurn?: number;
  spendHostedCreditsDuringRuns?: boolean;
  /**
   * Trickster Taka: hosted credits may be spent to use programs during runs
   * (breaker / program ability costs).
   */
  spendHostedCreditsToUseProgramsDuringRuns?: boolean;
  maxAccessOtherThanSelf?: number;
  firstEncounterGainsSubroutine?: { text: string; effect: Effect };
  mayTakeTagForBonusAccessOnHqRdBreach?: number;
  maySwapOutermostIceOnPassAfterFullyBreakOncePerTurn?: boolean;
  creditsOnFirstAdvanceThisTurn?: number;
  onSuccessfulRunOtherServerOncePerTurn?: Effect;
  onSuccessfulRunEndOncePerTurn?: Effect;
  /** Dedicated Response Team: whenever a successful run ends (while rezzed). */
  onSuccessfulRunEnd?: Effect;
  onSpendCreditsOutsidePoolDuringRunOncePerTurn?: Effect;
  onBreachHqRdIfNoBreaksOncePerTurnMayBonusAccess?: number;
  onBreachRdIfAccessGteMayBonusAccess?: { min: number; amount: number };
  onRemoveTags?: Effect;
  /** Thunder Art Gallery: first avoid/remove tag each turn. */
  onFirstAvoidOrRemoveTagThisTurn?: Effect;
  /** Arella Salvatore: whenever an agenda is scored from this server. */
  onAgendaScoredFromThisServer?: Effect;
  /** Psych Mike: first successful R&D run end each turn. */
  onFirstSuccessfulRunOnRdEndsThisTurn?: Effect;
  /** District 99: first program or hardware trash each turn. */
  onFirstProgramOrHardwareTrashEachTurn?: Effect;
  /** Mâché: first access trash each turn. */
  onFirstAccessTrashEachTurn?: Effect;
  onRunnerTurnEnd?: Effect;
  onRunnerTurnBegin?: Effect;
  onEachCorpBadPublicityTake?: Effect;
  onCorpTurnBeginIfRunnerUntagged?: Effect;
  onTurnBeginIfCorpNoBadPublicity?: Effect;
  ignoreAdditionalCostFirstDoubleEventEachTurn?: boolean;
  strengthBonusIfOutermostOnServer?: number;
  onPowerCountersEmpty?: Effect;
  onFirstResourcePaidAbilityEachTurn?: Effect;
  powerCounterOnAnyCardRez?: number;
  /** Alix T4LB07: place this many power whenever the Corp installs any card. */
  powerCounterOnAnyCorpInstall?: number;
  powerCountersOnPlay?: number;
  /** Info Bounty: credits on first mark run end if breached. */
  gainCreditsOnFirstMarkRunEndIfBreached?: number;
  /**
   * Keiko: gain this many credits the first time each turn the Runner
   * installs a companion or spends credits from an installed companion.
   */
  gainCreditsOnFirstCompanionInstallOrSpendThisTurn?: number;
  /**
   * Týr: when Runner spends a click to break a sub on this bioroid, Corp
   * gets +1 allotted click for their next turn.
   */
  bioroidBreakGivesCorpAllottedClickNextTurn?: boolean;
  /** Bioroid 2.0-class: [click] × N breaks up to N subroutines in one PAW. */
  bioroidBreakMaxSubs?: number;
  /**
   * Mu Safecracker: spend credits only from stealth cards to use this
   * hardware (paid abilities / credit costs).
   */
  paidAbilitiesUseStealthCreditsOnly?: boolean;
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
  meatDamageOnInstalledCorpTrashOncePerTurn?: number;
  maySpendPowerCountersForBonusRdAccess?: { max: number };
  powerOnScoreIfAgendaNotInstalledOrAdvancedThisTurn?: boolean;
  agendaPointsToWinReductionPerPowerCounter?: number;
  creditsOnTrashFromThisServer?: number;
  prevention?: { jackOutForRun?: boolean };
  unsupported?: string[];
  wave?: string;
  nrdbCode?: string;
  hostedCreditsOnInstall?: number;
  strengthBonusProtectingRemote?: number;
  /** +strength while protecting Archives (Bathynomus). */
  strengthBonusProtectingArchives?: number;
  /** Gutenberg: +strength while protecting R&D. */
  strengthBonusProtectingRd?: number;
  /** Meru Mati: +strength while protecting HQ. */
  strengthBonusProtectingHq?: number;
  /** Capacitor: +N strength while the Runner is tagged. */
  strengthBonusWhileTagged?: number;
  /** Hammer: breakers with this subtype ignore printed-sub break limits. */
  maxPrintedSubsBreakExceptSubtype?: string;
  /** Boi-tatá: reduce paid ability credit costs after own installed trash this turn. */
  paidAbilityCreditDiscountIfOwnInstalledTrashedThisTurn?: number;
  /** Sorocaban Blade: max installed Runner trashes this ice can cause per encounter. */
  maxInstalledRunnerTrashesPerEncounter?: number;
  strengthBonusAtAdvancements?: { threshold: number; bonus: number };
  maxPrintedSubsBreakablePerEncounterAtAdvancements?: {
    threshold: number;
    max: number;
  };
  handSizeBonus?: number;
  /** +N max hand size per hosted power counter. */
  handSizePerPowerCounter?: number;
  /** Rezzed Corp: Runner max hand size −N per hosted power counter. */
  runnerHandSizePenaltyPerPowerCounter?: number;
  /** Rezzed Corp: Runner max hand size modifier (Chairman Hiro / Mental Health Clinic). */
  runnerHandSizeBonus?: number;
  agendaPointsToWinModifierBoth?: number;
  onPsiCreditsRevealed?: Effect;
  onTurnBeginIfNoRunnerSuccessfulRunLastTurn?: Effect;
  advancementRequirementReductionPerScoredCopy?: number;
  onAccessWhileUninstalled?: Effect;
  onAccessWhileInstalled?: Effect;
  onExposeWhileInstalled?: Effect;
  onAccessNotFromRd?: Effect;
  onFirstAdvancementOnServerThisTurn?: Effect;
  hapOncePerTurn?: boolean;
  cannotBeBypassed?: boolean;
  onCorpDrawCard?: Effect;
  corpPlayCostIncreaseForRunnerEventsOps?: number;
  trashSelfWhenInstalledProgramTrashed?: boolean;
  powerCountersOnInstallFromUnusedMu?: boolean;
  recurringSpendForPlayEventSubtypes?: string[];
  /** Corp identity: Corp max hand size equals current credit pool. */
  handSizeEqualsCredits?: boolean;
  allottedClicksBonus?: number;
  giveStrengthToInstalledIcebreakers?: {
    amount: number;
    excludeSubtype?: string;
  };
  hostIcebreakerStrengthBonus?: number;
  extendsHostBreakerPumpToRun?: boolean;
  hostedCardsPlayableAsGrip?: boolean;
  onInstallWithoutSpendingCredits?: Effect;
  powerCounterOnDamageOrTrashFromHq?: boolean;
  mayInstallAgendasFaceup?: boolean;
  onAccessFaceupInstalledAgenda?: Effect;
  rfgOnUninstall?: boolean;
  memoryCost?: number;
  /** Key Master cloud: MU is 0 while Runner link ≥ this value. */
  memoryCostZeroIfLinkGte?: number;
  muBonus?: number;
  muBonusOnlyForCaissaPrograms?: boolean;
  triggerCaissaClickAbilityOnCaissaInstall?: boolean;
  strengthBonusPerIcebreaker?: number;
  /** +strength per card of subtype in the heap (Rising Tide). */
  strengthBonusPerHeapSubtype?: { subtype: string; bonus: number };
  /** −install cost per currently installed icebreaker (Principia). */
  installCostDiscountPerInstalledIcebreaker?: number;
  /** +strength per core damage taken this game (Begemot). */
  strengthBonusPerCoreDamageThisGame?: number;
  /** Threat N → strength delta while threat is active (Shibboleth −2). */
  threatStrengthBonus?: { level: number; amount: number };
  installCostDiscountIfSuccessfulRunThisTurn?: number;
  installCostDiscountIfSuccessfulHqRunThisTurn?: number;
  firstProgramInstallDiscount?: number;
  /** Az McCaffrey: first job/connection/hardware install −N¢ each turn. */
  firstJobConnectionOrHardwareInstallDiscount?: number;
  firstProgramOrHardwareInstallDiscount?: number;
  iceProtectingThisServerStrengthBonus?: number;
  trashHostWhenStrengthLte?: number;
  onVirusProgramInstall?: Effect;
  placeVirusCounterOnInstalledVirusProgram?: boolean;
  onFirstCorpCardInstallEachTurn?: Effect;
  playRequiresScoredAgendaThisTurn?: boolean;
  daemonHostMaxMu?: number;
  daemonHostExcludeIcebreaker?: boolean;
  chooseBonusAccessLessThanVirusOnRdBreach?: boolean;
  chooseBonusAccessLessThanVirusOnHqBreach?: boolean;
  mayExposeApproachedUnrezzedIceOncePerRunThenMayJackOut?: boolean;
  personalWorkshop?: boolean;
  onAccessRequiresInstalled?: boolean;
  canAdvanceOnlyWhenRezzed?: boolean;
  mayRezWhenCardWouldBeExposed?: boolean;
  /** Saisentan: amplify net damage on trash of chosen encounter type. */
  amplifyNetDamageOnTrashChosenEncounterType?: boolean;
  drawOnHostedEmpty?: number;
  /** When hosted credits empty and card trashes, gain this many clicks (Otto). */
  clicksOnHostedEmpty?: number;
  /** When Corp scores an agenda from this server root, do N core damage. */
  coreDamageOnAgendaScoredFromThisServer?: number;
  /**
   * Static ability: while accessing this card in R&D, the Runner must reveal it
   * (Nightmare Archive; CR §1.21.7).
   */
  mustRevealWhenAccessedFromRd?: boolean;
  skipOnAccessFromArchives?: boolean;
  playRequiresTagged?: boolean;
  /** Too Big to Fail: play only if side has fewer than N credits. */
  playRequiresCreditsLt?: number;
  /** Office Supplies: reduce play cost by Runner link. */
  playCostReducedByLink?: boolean;
  /** Under the Bus: play only if Runner accessed a card last turn. */
  playRequiresRunnerAccessedCardLastTurn?: boolean;
  /** Game Changer: RFG instead of trashing after play. */
  rfgInsteadOfTrashing?: boolean;
  playRequiresInstalledResource?: boolean;
  /** Spec Work: play only with ≥1 installed program. */
  playRequiresInstalledProgram?: boolean;
  /** Rejig: play only with ≥1 installed program or hardware. */
  playRequiresInstalledProgramOrHardware?: boolean;
  playRequiresUntagged?: boolean;
  /** Play only if Runner has at least this many tags. */
  playRequiresMinTags?: number;
  playRequiresSuccessfulRunLastTurn?: boolean;
  /** Successful Demonstration: play only if Runner's last run was unsuccessful. */
  playRequiresUnsuccessfulRunLastTurn?: boolean;
  /** Play only if Runner did not make a successful HQ run last turn (DRM). */
  playRequiresNoSuccessfulHqRunLastTurn?: boolean;
  /** Buffer Drive: first grip/stack trash batch each turn. */
  onFirstGripOrStackTrashBatchEachTurn?: Effect;
  /** Play only while Threat ≥ N (Measured Response). */
  playRequiresThreat?: number;
  playRequiresAgendaStolenLastTurn?: boolean;
  playRequiresRunnerStoleOrTrashedCorpCardLastTurn?: boolean;
  playRequiresRunnerTrashedCorpCardLastTurn?: boolean;
  playRequiresCorpHasInstalledCard?: boolean;
  playRequiresAgendaStolenThisTurn?: boolean;
  /**
   * In the Groove: play only as the Runner's first click this turn
   * (priority; CR 1.11.4).
   */
  playRequiresFirstClick?: boolean;
  /**
   * In the Groove: for the remainder of this turn after play, whenever the
   * Runner installs a card with printed install cost ≥ min, resolve effect.
   */
  remainderOfTurnOnInstallPrintedCostGte?: { min: number; effect: Effect };
  trashAfterBreakingThisRun?: boolean;
  creditsOnScoreOrSteal?: number;
  creditsPerAccessOnCentralRunEnd?: boolean;
  onAccessTrashGain?: { credits: number; draw: number; oncePerTurn?: boolean };
  runEvent?: import("../state/types/abilities.js").StartsRunSpec;
  /** With runEvent: play without serverId skips the run (Reprise). */
  runEventOptional?: boolean;
  installOnIce?: boolean;
  caissaAdvanceOnSuccessfulRun?: boolean;
  hostStrengthModifier?: number;
  /** Chisel: host ice strength modifier per virus counter on this trojan. */
  hostStrengthPerVirusCounter?: number;
  otherIceProtectingServerStrengthModifier?: number;
  blanksHostAbilities?: boolean;
  chargeOnFirstBreakDuringHostEncounter?: boolean;
  derezHostAtVirus?: number;
  tagsIfAgendaStolenThisRun?: number;
  approachServerTax?: { clicks: number; credits: number };
  /** Cayambe Grid: ETR unless pay N¢ × advanced protecting ice. */
  approachServerEtrUnlessCreditsPerAdvancedIce?: number;
  /** Cyberdex Sandbox: onVirusPurge once per turn. */
  onVirusPurgeOncePerTurn?: boolean;
  /** Swift: gain [click] on first run event each turn. */
  gainClickOnFirstRunEventThisTurn?: boolean;
  /** Moshing: need this many other grip cards to pay trash cost. */
  playRequiresOtherGripCardsGte?: number;
  offerJackOutAfterSub?: number;
  accessTrashFromGrip?: { gripCards: number; oncePerTurn?: boolean };
  mayInstallOnScoreOrSteal?: boolean;
  mayRezIceIgnoringCostsOnScoreOrSteal?: boolean;
  maySwapIceOnAgendaScoredOrStolen?: boolean;
  searchRdNonAgendaOnScoreFromServer?: boolean;
  strengthPerAdvancement?: number;
  /** Sandstone: strength modifier per hosted virus counter (typically −1). */
  strengthPerVirusCounter?: number;
  /**
   * Rime: while rezzed, each ice protecting the same server gets this much
   * strength.
   */
  sameServerIceStrengthBonus?: number;
  /**
   * Rime: during runs against this ice's server, may rez any time non-ice
   * cards could be rezzed.
   */
  rezAsNonIceDuringRunsOnServer?: boolean;
  strengthBonusIfNoInstalledSubtype?: { subtype: string; bonus: number };
  strengthCannotBeLowered?: boolean;
  runnerEncounterIceStrengthModifier?: number;
  firstIceRezCostIncrease?: number;
  iceRezCostIncrease?: number;
  /**
   * While installed: increase rez cost of ice matching `subtype` by `amount`
   * (Cat's Cradle; CR §1.16.2a / §8.1.2d).
   */
  iceRezCostIncreaseBySubtype?: { subtype: string; amount: number };
  /**
   * Rook-class: while hosted on ice, ice protecting that ice's server gets
   * +N rez cost (CR §1.16.2a / §8.1.2d).
   */
  iceRezCostIncreaseProtectingHostedServer?: number;
  /**
   * NEXT Bronze-class: +bonus strength for each rezzed ice (any server,
   * including self) with `subtype`.
   */
  strengthBonusPerRezzedIceWithSubtype?: { subtype: string; bonus: number };
  iceRezCostReductionProtectingThisServer?: number;
  rootRezCostReductionThisServerIfThreat?: { level: number; amount: number };
  /** Braintrust: −N ice rez cost per agenda counter on this scored agenda. */
  iceRezCostReductionPerAgendaCounter?: number;
  onCorpTurnEnd?: Effect;
  onDiscardPhaseEnd?: Effect;
  onCorpActionPhaseEnd?: Effect;
  onRunnerActionPhaseEnd?: Effect;
  onAnyIceRez?: Effect;
  onFirstAgendaScoredOrStolenThisTurn?: Effect;
  onRunBegin?: Effect;
  /** Corp identity: resolve before the Corp's first turn (CR 1.6.7a). */
  onBeforeFirstTurn?: Effect;
  onMovedToServerRoot?: Effect;
  advancedIceProtectingThisServerStrengthBonus?: number;
  /** Lightning Laboratory: on run begin may spend agenda counter to rez ice. */
  onRunBeginMaySpendAgendaCounterRezUpToIceProtectingAttacked?: {
    maxIce: number;
  };
  /** Lightning Laboratory: config for delayed end-of-turn derez (fires runner.turnEnds). */
  onCorpTurnEndDerezUpToIceProtectingLightningServer?: { maxIce: number };
  /** Brasília: once/turn on rez ice protecting this server during a run. */
  oncePerTurnOnRezIceProtectingThisServerDuringRun?: {
    mayDerezOtherIceForStrengthBonus: number;
  };
  /** Thunderbolt identity: on rez AP/destroyer ice during a run. */
  onRezApOrDestroyerIceDuringRun?: {
    strengthBonus: number;
    gainEtrUnlessTrashInstalledSub: boolean;
  };
  /** Lycian: derez at end of any turn while rezzed. */
  derezAtAnyTurnEnd?: boolean;
  powerOnHqRdRunEndIfAccessedGte?: { min: number; amount: number };
  bonusAccessOnHqRdBreachWhileTagged?: number;
  /** Docklands Pass: first HQ breach each turn → +N access. */
  bonusAccessOnFirstHqBreachThisTurn?: number;
  /** HQ Interface: whenever you breach HQ, +N access. */
  bonusAccessOnHqBreach?: number;
  /** R&D Interface: whenever you breach R&D, +N access. */
  bonusAccessOnRdBreach?: number;
  threatBasicTrashAdditionalCostTrashHq?: number;
  wageWorkersTrackActions?: true;
  /**
   * When rezzing this ice: reduce rez cost by `amount` per already-rezzed ice
   * matching `subtype` (Ivik; CR §1.16.2a / §8.1.2d).
   */
  rezCostDiscountPerRezzedSubtype?: { subtype: string; amount: number };
  /**
   * When rezzing this ice: reduce rez cost by this many ¢ per other unrezzed
   * ice (Reverb; CR §1.16.2a / §8.1.2d).
   */
  rezCostDiscountPerOtherUnrezzedIce?: number;
  /** While installed: lower each event’s play cost by this many ¢ (Ghosttongue). */
  eventPlayCostDiscount?: number;
  gainCreditOnFirstRunEvent?: number;
  netDamageOnAgendaScoredOrStolen?: number;
  drawOnFirstRemoteCreated?: number;
  gainCreditOnTransactionPlayed?: number;
  firstEncounterGainsCodeGate?: boolean;
  forbidScoreAgendaInstalledThisTurn?: boolean;
  /** Vulnerability Audit: this agenda cannot be scored if installed this turn. */
  cannotScoreIfInstalledThisTurn?: boolean;
  /** Word on the Street: additional score cost when agenda installed this turn. */
  additionalCostOnScoreAgendaInstalledThisTurn?: Effect;
  /** NRDB uniqueness (♦). */
  unique?: boolean;
  /** Hackerspace: host unique companion/connection resources. */
  hostsUniqueCompanionOrConnectionResources?: { creditDiscount: number };
  /** Hackerspace: hand size bonus while hosting companion + connection. */
  handSizeBonusIfHostingCompanionAndConnection?: number;
  trashOnVirusPurge?: boolean;
  /** Heliamphora-class: Effect when Corp purges virus counters. */
  onVirusPurge?: Effect;
  /** Cupellation: max faceup hosted Corp cards. */
  maxHostedCards?: number;
  /** Cupellation: mid-access pay credits to host non-agenda faceup. */
  accessHostNonAgendaFaceup?: { creditCost: number };
  /** Cupellation: HQ breach may pay+trash for bonus access while hosting Corp. */
  onBreachHqIfHostingCorpCard?: Effect;
  /** Akiko Nisei-class: Effect when breaching R&D. */
  onBreachRd?: Effect;
  /** Heliamphora: interrupt Archives access to host faceup instead. */
  onWouldAccessArchivesHostInstead?: { oncePerArchivesBreach?: boolean };
  powerCountersOnInstall?: number;
  powerCountersOnRez?: number;
  trashWhenPowerEmpty?: boolean;
  /** Server Diagnostics: trash this card when the Corp installs any ice. */
  trashSelfOnCorpIceInstall?: boolean;
  /** Muse-class: hosted programs do not consume MU. */
  daemonHost?: boolean;
  rfgWhenPowerEmpty?: boolean;
  /** Public Support: score as agenda when power counters empty. */
  scoreWhenPowerEmpty?: { agendaPoints: number };
  /** Hosted BP loaded on rez (Superdeep Borehole); not player BP until taken. */
  badPublicityCountersOnRez?: number;
  /** Corp wins when hosted BP counters reach 0 while rezzed. */
  winWhenBadPublicityCountersEmpty?: boolean;
  etrSubroutinesPerPowerCounter?: boolean;
  powerCounterOnHarmonicIceRez?: boolean;
  powerOnFirstInstalledCardCreditSpendThisTurn?: boolean;
  removePowerForBonusAccessOnHqRdBreach?: number;
  playRequiresSuccessfulRunThisTurn?: boolean;
  /** Install only after a successful central run this turn (Time Bomb). */
  installRequiresSuccessfulCentralRunThisTurn?: boolean;
  agendaPointsPerAgendaCounter?: number;
  /** Domestic Sleepers: worth this many more agenda points while it has at least 1 agenda counter. */
  agendaPointsWhileHasAgendaCounter?: number;
  cannotBreakWithAi?: boolean;
  cannotBreakWithAiAtAdvancements?: number;
  /** Semak-samun: only breakers with this subtype may break printed subs. */
  cannotBreakExceptSubtype?: string;
  /** Kessleroid: Runner cannot trash while rezzed. */
  cannotBeTrashedByRunnerWhileRezzed?: boolean;
  /** Scatter Field: +N strength when sole ice protecting server. */
  strengthBonusIfSoleIceProtectingServer?: number;
  /** Gatekeeper: +N strength while this ice was rezzed this turn. */
  strengthBonusIfRezzedThisTurn?: number;
  /** Sang Kancil: paid ability credit discount while a run event is active. */
  paidAbilityCreditDiscountIfRunEventActive?: number;
  /** Public Access Plaza: Threat N → give tags when Runner trashes while rezzed. */
  threatGiveTagsOnRezzedTrash?: { level: number; tags: number };
  cannotBreakWithRunnerCardAbilities?: boolean;
  installFaceup?: boolean;
  creditsOnAdvance?: { default: number; atOrAbove?: number; bonus?: number };
  advancementRequirementReduction?: number;
  /** Runner resource: +N to every agenda's advancement requirement while installed (The Source). */
  agendaAdvancementRequirementBonus?: number;
  /** Runner resource: +bonus to every agenda's advancement requirement while ≥ threshold virus counters (Chakana). */
  agendaAdvancementRequirementBonusIfVirusCountersGte?: {
    threshold: number;
    bonus: number;
  };
  runsCannotBeSuccessful?: boolean;
  /**
   * Continuous subtype grants (S6 / L1).
   */
  continuousSubtypeGrants?: Array<
    | { kind: "host_grant_bcs" }
    | { kind: "host_grant_barrier" }
    | { kind: "copy_other_rezzed_ice_subtypes" }
  >;
  /**
   * Continuous gained-sub declarations (M6 / L2).
   */
  continuousGainedSubDecls?: import("../state/types/abilities.js").ContinuousGainedSubDecl[];
  recurringSpendFor?: Array<
    | "trash"
    | "trash_asset"
    | "play_event"
    | "run_central"
    | "rez_host_server"
    | "rez_ice"
    /** Mumba Temple: spend recurring credits to rez any card. */
    | "rez"
    | "use_program"
    | "use_decoder"
    | "use_fracter"
    | "use_killer"
    | "use_hardware"
    | "trace"
    | "install_virus"
    | "install_hardware"
    /** Sahasrara: spend recurring credits to install programs. */
    | "install_program"
    | "basic_remove_tag"
    | "advance_ice"
    /** Pheromones: spend recurring credits during runs on HQ. */
    | "run_hq"
    /** Simone Diego: spend recurring to advance cards in root/protecting this server. */
    | "advance_cards_this_server"
  >;
  /** Net Police: recurring max equals Runner link on refill/rez. */
  recurringCreditsMaxEqualsRunnerLink?: boolean;
  /** Pheromones: recurring max equals virus counters on this card. */
  recurringCreditsMaxEqualsVirusCounters?: boolean;
  /** Khondi Plaza: recurring max equals number of remote servers. */
  recurringCreditsMaxEqualsRemoteServers?: boolean;
  /** Andromeda: starting hand size (default 5). */
  startingHandSize?: number;
  /** Surge: play only if a virus counter was placed on a program this turn. */
  playRequiresVirusCounterPlacedOnProgramThisTurn?: boolean;
  /** Neural EMP: play only if the Runner made a run last turn. */
  playRequiresRunnerMadeRunLastTurn?: boolean;
  playRequiresRunnerInstalledResourceLastTurn?: boolean;
  /**
   * Stronger Together-class: while active, ice with `subtype` gets +bonus
   * strength (Corp identity).
   */
  iceStrengthBonusForSubtype?: { subtype: string; bonus: number };
  /** Mahkota: +N trash cost for assets in this server's root while installed. */
  serverRootAssetTrashCostBonus?: number;
  /** Demolisher: −N to trash cost of each Corp card while installed. */
  corpCardTrashCostReduction?: number;
  /** Petty Cash: play only before any Corp action completes. */
  playRequiresNoCorpActionFinished?: boolean;
  /** Lockdown: play only if no active lockdown in corp:play-area. */
  playRequiresNoActiveLockdown?: boolean;
  /**
   * Lockdown: linger in corp:play-area until Corp next turn begins
   * (CR 8.6.6c).
   */
  lingerUntilCorpNextTurnBegins?: boolean;
  lingerAsCurrent?: boolean;
  currentTrashOnAgendaStolen?: boolean;
  currentTrashOnAgendaScored?: boolean;
  runnerFirstRunEachTurnAdditionalCost?: number;
  blankRunnerIdentityPrintedAbilities?: boolean;
  onFirstIceRezEachTurn?: Effect;
  limitOnePerServer?: boolean;
  runnerLosesAllCreditsOnClickLossDuringRunOnThisServer?: boolean;
  whileScoredIceSubtypeStrengthBonus?: { subtype: string; bonus: number };
  ignoreInstallCostFirstIceEachTurn?: boolean;
  onSuccessfulRunOnThisServer?: Effect;
  firstEncounteredIceStrengthPenaltyThisRun?: number;
  corpMaxIceInstallsPerTurn?: number;
  strengthPerCorpCardInHq?: number;
  rezCostIncreasePerCorpCardInHq?: number;
  jackOutOnThisServerTrashRunnerProgram?: boolean;
  runnerCannotPlayCurrentEvents?: boolean;
  morphOddAdvancementSubtypeSwap?: { gain: string; lose: string };
  supplierHost?: boolean;
  onFirstRunnerCreditPoolEmptyThisTurn?: Effect;
  onGripArchivesSuccessInstallSelfIgnoringCosts?: boolean;
  trashSelfWhenRunnerTagged?: boolean;
  netDamageWheneverRunnerTrashesCorpCard?: number;
  memoryLimitEqualsGripSize?: boolean;
  onGripHqSuccessInstallSelfIgnoringCosts?: boolean;
  trashCostIncreasePerFacedownArchivesCard?: number;
  gainCreditsOnCreateServer?: number;
  whileScoredStealAdditionalCreditsPerAdvancement?: number;
  gainCreditsWhenCorpLosesCredits?: number;
  drawWhenCorpRezzesIce?: number;
  strengthBonusPerUnusedMu?: number;
  briberyPlayCostX?: boolean;
  gainCreditsOnJackOut?: number;
  /** Gagarin: additional credits to access remote root. */
  additionalCreditsToAccessRemoteRoot?: number;
  /** Space ice: rez cost −N per advancement. */
  rezCostReductionPerAdvancement?: number;
  /** Mark Yale: gain N¢ when spending an agenda counter. */
  gainCreditsOnSpendAgendaCounter?: number;
  /** Checkpoint: take N bad publicity on rez. */
  badPublicityOnRez?: number;
  /** Housekeeping: first Runner install each turn → trash 1 from grip. */
  firstRunnerInstallTrashFromGripEachTurn?: boolean;
  /** Satellite Grid: ice protecting this server +N virtual advancement counters. */
  iceProtectingThisServerAdditionalAdvancementCounters?: number;
  /** Edward Kim: first accessed operation each turn trash free. */
  firstAccessedOperationTrashFreeEachTurn?: boolean;
  /** Valencia: Corp starts with N bad publicity. */
  corpStartsWithBadPublicity?: number;
  /** Itinerant Protesters: Corp hand size += N × bad publicity. */
  corpHandSizeBonusPerBadPublicity?: number;
  /** Investigative Journalism: install requires Corp BP ≥ N. */
  installRequiresCorpBadPublicityGte?: number;
  /** Gravedigger: virus when installed Corp card trashed. */
  placeVirusCounterWhenInstalledCorpCardTrashed?: boolean;
  /** Hivemind: share virus counters with other virus programs. */
  hivemindSharesVirusCounters?: boolean;
  /** Progenitor: daemon hosts virus programs only. */
  daemonHostVirusProgramsOnly?: boolean;
  /** Progenitor: prevent 1 virus purge on hosted program. */
  preventOneVirusPurgeOnHostedProgram?: boolean;
  /** MemStrips: MU only for virus. */
  muBonusOnlyForVirusPrograms?: boolean;
  /** I've Had Worse: its trashed-from-grip ability is met only when net or meat damage trashes it. */
  trashFromGripTriggerOnlyByNetOrMeatDamage?: boolean;
  /** Archives Interface: may RFG instead of access. */
  archivesAccessMayRfgInstead?: { oncePerArchivesBreach: boolean };
  /** The Twins: on pass rezzed ice protecting this server. */
  onPassRezzedIceProtectingThisServer?: Effect;
  /** Paige Piper: first install each turn (including self). */
  onFirstInstallEachTurn?: Effect;
  /** Adjusted Chronotype: first click-loss each turn except paid-ability cost. */
  onFirstClickLossEachTurnExceptPaidAbility?: Effect;
  /** Gene Conditioning Shoppe: Genetics also trigger the second time. */
  geneticsAlsoTriggerSecondTime?: boolean;
  /** Synthetic Blood: first damage each turn. */
  onFirstDamageEachTurn?: Effect;
  /** Traffic Jam: +N advancement requirement per copy in Corp score area. */
  agendaAdvancementRequirementBonusPerCopyInCorpScore?: number;
  /** Symmetrical Visage: first basic click-draw each turn. */
  onFirstBasicClickDrawEachTurn?: Effect;
  /** Brain-Taping Warehouse: bioroid ice rez −N per Runner click remaining. */
  bioroidIceRezCostReductionPerRunnerClickRemaining?: number;
  /** Jinteki Biotech: choose face before first turn. */
  chooseIdentityFaceBeforeFirstTurn?: boolean;
  identityFaceOptions?: Array<{ id: string; label: string; onFlip: Effect }>;
  /** Faces of a double-sided identity, front first (CR 3.1.1a). */
  identityFaces?: Array<{ title: string; subtypes: string[]; link?: number }>;
  /** Valley Grid: when Runner fully breaks protecting ice. */
  onFullyBreakProtectingIce?: Effect;
  /** Hacktivist Meeting: rez non-ice → randomly trash HQ. */
  rezNonIceAdditionalCostRandomTrashHq?: boolean;
  /** Off-Campus Apartment: host any number of connections. */
  hostsConnectionResources?: boolean;
  /** Off-Campus Apartment: draw N when hosting a connection. */
  drawOnHostConnectionInstall?: number;
  /** Comet: first event each turn may play another without a click. */
  onFirstEventEachTurnMayPlayAnother?: boolean;
  /** London Library: trash hosted programs at turn end. */
  trashHostedProgramsOnTurnEnd?: boolean;
  /** Recruiting Trip: play cost is chosen X. */
  playCostX?: boolean;
  /** Blacklist: cards cannot leave Runner heap. */
  cardsCannotLeaveRunnerHeap?: boolean;
  /** Student Loans: extra credits to play event if copy in heap. */
  eventPlayExtraCostIfCopyInHeap?: number;
  /** Breaker Bay Grid: root rez −N. */
  rootRezCostReductionThisServer?: number;
  /** Oaktown Grid: root trash +N. */
  rootTrashCostIncreaseThisServer?: number;
  /** Chrome Parlor: prevent cybernetic install damage. */
  preventCyberneticInstallDamage?: boolean;
  /** Titanium Ribs: Runner chooses grip cards trashed for damage. */
  runnerChoosesDamageTrashFromGrip?: boolean;
  /** Armand Geist: draw N when using a [trash] ability. */
  drawOnUseTrashAbility?: number;
  /** Muertos: effect when uninstalled. */
  onUninstall?: Effect;
  /** Defective Brainchips: first core damage each turn +N. */
  increaseFirstCoreDamagePerTurn?: number;
  /** Underway Renovation: mill Runner stack on advance. */
  trashTopOfStackOnAdvance?: {
    default: number;
    atOrAbove?: number;
    bonus?: number;
  };
  /** Underway Grid: ice protecting this server cannot be bypassed. */
  iceCannotBeBypassedThisServer?: boolean;
  /** Underway Grid: cards in root/protecting this server cannot be exposed. */
  cardsCannotBeExposedThisServer?: boolean;
  /** Drug Dealer: Effect IR when Corp's turn begins. */
  onCorpTurnBegin?: Effect;
  /** Film Critic: max agendas this card may host. */
  hostAgendaCapacity?: number;
  /** Film Critic: may host accessed agenda instead of continuing access. */
  mayHostAccessedAgenda?: boolean;
  /** Paparazzi: Runner is considered tagged while installed. */
  countsAsTagged?: boolean;
  /** Paparazzi: prevent all pending meat damage. */
  preventAllMeatDamage?: boolean;
  /** Ronald Five: Runner loses click when trashing a Corp card. */
  runnerLosesClickWhenTrashesCorpCard?: boolean;
  /** Haarpsichord: Runner cannot steal more than one agenda per turn. */
  cannotStealMoreThanOneAgendaPerTurn?: boolean;
  /** Old Hollywood Grid: cannot steal unless copy in Runner score. */
  cannotStealUnlessCopyInRunnerScore?: boolean;
  /** Hollywood Renovation: place advancements on another card when advanced. */
  placeAdvancementOnAnotherOnAdvance?: {
    default: number;
    atOrAbove?: number;
    bonus?: number;
  };
  /** Casting Call condition: give tags when host agenda is accessed. */
  castingCallCondition?: boolean;
  /** Agenda: give this many tags when accessed (Casting Call host). */
  onAccessGiveTags?: number;
  /** Wireless Net Pavilion: additional credit cost to basic trash resource. */
  basicTrashResourceAdditionalCostCredits?: number;
  /** Chronos Protocol: Corp chooses first net damage trash from grip. */
  corpChoosesFirstNetDamageCardEachTurn?: boolean;
  /** Ancestral Imager: net damage on jack out. */
  netDamageOnJackOut?: number;
  /** Genetics Pavilion: Runner draw cap per their turn. */
  runnerCannotDrawMoreThanPerTurn?: number;
  /** Franchise City: must reveal agendas accessed from R&D. */
  mustRevealAgendasAccessedFromRd?: boolean;
  /** Franchise City: score self when Runner accesses an agenda. */
  addSelfToCorpScoreOnAgendaAccess?: { agendaPoints: number };
  /** Worlds Plaza: only host assets. */
  hostAssetsOnly?: boolean;
  /** SYNC front: +N¢ to basic remove-tag while unflipped. */
  basicRemoveTagAdditionalCostCreditsWhileUnflipped?: number;
  /** SYNC back: −N¢ to basic trash-resource while flipped. */
  basicTrashResourceCreditReductionWhileFlipped?: number;
  /** Improved Tracers: +N to subroutine base trace strength. */
  subroutineTraceBaseStrengthBonus?: number;
  /** Rebranding Team: assets gain this subtype. */
  assetsGainSubtype?: string;
  /** Quantum Predictive Model: score on access if Runner tagged. */
  addToCorpScoreOnAccessIfRunnerTagged?: boolean;
  /** Victoria Jenkins: Runner allotted clicks delta while rezzed. */
  runnerAllottedClicksBonus?: number;
  /** News Hound: gains ETR sub while a current is active. */
  gainsEtrSubroutineWhileCurrentActive?: boolean;
  /** Resistor: +N strength per Runner tag. */
  strengthBonusPerRunnerTag?: number;
  /** 24/7 News Cycle: forfeit agenda to play. */
  playAdditionalCostForfeitAgenda?: boolean;
  /** Surveillance Sweep: Runner spends first on traces during runs. */
  runnerSpendsFirstForTracesDuringRun?: boolean;
  /** Rutherford Grid: +N base trace during run on this server. */
  traceBaseStrengthBonusDuringRunOnThisServer?: number;
  /** Apex: cannot install non-virtual resources. */
  cannotInstallNonVirtualResources?: boolean;
  /** Harbinger: facedown instead of heap when trashed. */
  turnFacedownInsteadOfHeapWhenTrashed?: boolean;
  /** Wasteland: gain N on first own installed trash each turn. */
  gainCreditsOnFirstOwnInstalledTrashEachTurn?: number;
  /** Adam: start with N directive cards installed. */
  startWithDirectiveCards?: number;
  /** Brain Chip: MU bonus equals agenda points. */
  muEqualsAgendaPoints?: boolean;
  /** Brain Chip: hand size bonus equals agenda points. */
  handSizeEqualsAgendaPoints?: boolean;
  /** Always Be Running: first click must be run or run event. */
  firstClickMustBeRunOrRunEvent?: boolean;
  /** Neutralize All Threats: must trash first trash-cost access. */
  mustTrashFirstAccessedCardWithTrashCostEachTurn?: boolean;
  /** Safety First: draw N at turn end if grip < max hand. */
  drawAtTurnEndIfGripBelowMaxHandSize?: number;
  /** Globalsec: install requires link ≥ N. */
  installRequiresLinkGte?: number;
  /** Jak Sinclair: −N install cost per link. */
  installCostReductionPerLink?: number;
  /** Employee Strike: blank Corp identity printed abilities. */
  blankCorpIdentityPrintedAbilities?: boolean;
  /** Technical Writer: place N credits on HW/program install. */
  hostedCreditsOnProgramOrHardwareInstall?: number;
  /** Street Magic */
  runnerChoosesUnbrokenSubroutineOrder?: boolean;
  /** Mongoose */
  breakOnAtMostOneIcePerRun?: boolean;
  /** Maya */
  onFinishAccessRdOncePerTurn?: Effect;
  /** Panchatantra */
  onEncounterAnyIceOncePerTurn?: Effect;
  /** Heritage Committee (deckbuilding) */
  zeroInfluenceIfNonAllianceFactionCardsGte?: {
    faction: string;
    threshold: number;
  };
  /** Mumbad City Grid */
  onPassIceProtectingThisServerMaySwap?: boolean;
  /** Mumba Temple (deckbuilding) */
  zeroInfluenceIfIceInDeckLte?: number;
  /** Museum of History (deckbuilding) */
  zeroInfluenceIfCardsInDeckGte?: number;
  /** Diwan */
  chooseServerOnInstall?: boolean;
  additionalCreditCostToInstallInChosenServer?: number;
  /** Tech Trader */
  gainCreditOnTrashAbilityUse?: boolean;
  /** NetChip */
  daemonHostMaxMuFromInstalledCopiesOfSelf?: boolean;
  hostedProgramMemoryDoesNotCount?: boolean;
  /** Corporate Scandal */
  corpAdditionalBadPublicity?: number;
  corpAdditionalBadPublicityCannotBeRemoved?: boolean;
  /** Populist Rally */
  playRequiresInstalledSubtype?: string;
  /** Lakshmi Smartfabrics */
  placePowerCounterOnAnyCardRez?: boolean;
  /** Pālanā Foods */
  gainCreditOnFirstRunnerDrawEachTurn?: boolean;
  /** New Construction */
  onAdvance?: Effect;
  /** PAD Factory (deckbuilding) */
  zeroInfluenceIfCardCopiesGte?: { cardId: string; threshold: number };
  /** Nero Severn */
  mayJackOutOnEncounterSentryOncePerTurn?: boolean;
  /** Reflection */
  revealRandomHqOnJackOut?: boolean;
  /** Political Operative */
  installRequiresSuccessfulHqRunThisTurn?: boolean;
  /** Akshara Sareen */
  corpAllottedClicksBonusWhileInstalled?: number;
  /** Councilman */
  onCorpRezAssetOrUpgradeMayPayRezCostTrashSelfDerez?: boolean;
  /** Political Dealings */
  onDrawAgendaMayRevealAndInstall?: boolean;
  /** Bailiff */
  gainCreditWheneverRunnerBreaksSubroutine?: boolean;
  /** Surat City Grid */
  onRezOtherCardInRootOrProtectingMayRezDiscount?: number;
  /** Political Graffiti */
  hostAgendaPointsModifier?: number;
  /** Salsette Slums */
  accessPayTrashCostRemoveFromGameOncePerTurn?: boolean;
  /** Brahman */
  addInstalledNonVirusProgramToStackTopOnEncounterEndIfBroke?: boolean;
  /** Patron */
  patronChooseServerDrawInsteadOfBreach?: number;
  /** Bazaar */
  onInstallHardwareFromGripMayInstallAnotherCopy?: boolean;
  /** Personality Profiles */
  onRunnerSearchStackOrInstallFromHeapTrashRandomFromGrip?: boolean;
  /** Jeeves */
  gainClickFirstTimeSpendClicksGteOnSameActionEachTurn?: number;
  /** Raman Rai */
  onDrawMayLoseClickRevealSwapArchivesSameTypeOncePerTurn?: boolean;
  /** Aryabhata Tech */
  onAnySuccessfulTraceGainAndRunnerLose?: { gain: number; lose: number };
  /** Indian Union Stock Exchange */
  onRezOrPlayOutOfFactionGainCredits?: number;
  /** Mumbad Virtual Tour */
  zeroInfluenceIfAssetsInDeckGte?: number;
  mustTrashWhenAccessedWhileInstalled?: boolean;
  /** Out of the Ashes */
  heapOnTurnBeginMayRfgSelfToMakeRun?: boolean;
  /** Guru Davinder */
  autoPreventNetOrMeatDamagePayOrTrash?: number;
  /** The Turning Wheel */
  placePowerOnHqOrRdRunEndIfNoAgendaStolen?: boolean;
  /** Dedicated Neural Net */
  firstSuccessfulHqRunEachTurnPsiCorpChoosesAccess?: boolean;
  /** Puppet Master */
  onSuccessfulRunMayPlaceAdvancementOnCanBeAdvanced?: boolean;
  /** The Black File */
  corpCannotWinExceptFlatline?: boolean;
  /** Voter Intimidation */
  playRequiresAgendaInRunnerScoreArea?: boolean;
  /** Harishchandra Ent. */
  revealGripWhileRunnerTagged?: boolean;
  /** Full Immersion RecStudio */
  hostAssetsOrAgendas?: boolean;
  trashCostIncreasePerHostedCard?: number;
  /** Zealous Judge */
  rezRequiresTagged?: boolean;
  /** Navi Mumbai City Grid */
  blockRunnerPaidAbilitiesExceptIcebreakersAndMidAccess?: boolean;
  /** System Outage */
  corpLosesCreditsOnNonFirstDrawThisTurn?: number;
  /** GPI Net Tap */
  mayExposeApproachedIceThenMayTrashSelfToJackOut?: boolean;
  /** Hernando Cortez */
  additionalIceRezCostEqualToSubroutineCountWhenCorpCreditsGte?: number;
  /** Mirror */
  onSuccessfulRdRunMayReplaceSpentRecurringCredit?: boolean;
  /** Hyoubu Research Facility */
  firstRevealSecretlySpentCreditsGainThatManyEachTurn?: boolean;
  /** Georgia Emelyov */
  onUnsuccessfulRunOnThisServer?: Effect;
  /** Watchdog */
  firstIceRezCostReductionPerRunnerTag?: boolean;
  /** Crisis Management */
  onTurnBeginIfRunnerTagged?: Effect;
  /** Sandburg */
  iceStrengthBonusPerFiveCorpCreditsWhenCorpCreditsGte?: {
    threshold: number;
    perCredits: number;
    bonus: number;
  };
  /** Rumor Mill */
  blankUniqueNonRegionAssetUpgradePrintedAbilities?: boolean;
  /** Paperclip */
  mayInstallSelfFromHeapOnEncounterBarrier?: boolean;
  /** Khan */
  onFirstPassIceEachTurn?: Effect;
  /** Financial Collapse */
  playRequiresRunnerCreditsGte?: number;
  /** Weyland Consortium: Builder of Nations */
  firstAdvancedIceEncounterEndMeatDamageEachTurn?: boolean;

  /** Obelus */
  handSizeBonusPerTag?: number;
  drawPerAccessOnFirstSuccessfulHqOrRdRunEndEachTurn?: boolean;
  /** Black Orchestra */
  mayInstallSelfFromHeapOnEncounterCodeGate?: boolean;
  /** Net Mercur */
  firstStealthSpendEachRunPlaceCreditOrDraw?: boolean;
  spendHostedCreditsForAnything?: boolean;
  /** Find the Truth */
  revealDrawnCards?: boolean;
  /** Observe and Destroy */
  playRequiresRunnerCreditsLt?: number;
  /** Jinteki: Potential Unleashed */
  trashTopOfStackOnRunnerNetDamage?: boolean;
  /** Scarcity of Resources */
  resourceInstallCostIncrease?: number;

  /** The Gauntlet */
  bonusAccessOnHqBreachPerFullyBrokenProtectingIce?: boolean;
  /** Top Hat */
  mayInsteadOfBreachRdAccessOneOfTopN?: number;
  /** Government Investigations */
  secretSpendCannotEqual?: number;
  /** Fumiko Yamamori */
  meatDamageWhenSecretSpendAmountsDiffer?: number;
  /** Drone Screen */
  onRunDeclaredOnThisServerIfTagged?: Effect;
  /** Chief Slee */
  placePowerPerUnbrokenSubOnAnyEncounterEnd?: boolean;

  /** MKUltra */
  mayInstallSelfFromHeapOnEncounterSentry?: boolean;
  /** Reaver */
  drawOnFirstTrashInstalledEachTurn?: boolean;
  /** Interdiction */
  cannotRezNonIceDuringRunnerTurn?: boolean;
  /** Baba Yaga */
  gainsPaidAbilitiesOfHostedIcebreakers?: boolean;
  /** Manta Grid */
  additionalClickNextTurnOnSuccessfulRunEndIfRunnerLt6cOrNoClicks?: boolean;
  /** Anson Rose */
  mayMoveAnyAdvancementsFromSelfToRezzedIce?: boolean;
  /** Şifr */
  sifrMayZeroEncounterIceStrengthOncePerTurn?: boolean;
  /** Peace in Our Time */
  playRequiresCorpScoredNoAgendasLastTurn?: boolean;
  /** Chiyashi */
  trashTopOfStackOnBreakSubIfRunnerHasAi?: number;
  /** Net Quarantine */
  firstTraceEachTurnRunnerLinkTreatedAs0?: boolean;
  gainCreditsWhenRunnerSpendsForLinkPer2Spent?: boolean;
  /** Bryan Stinson */
  bryanStinsonPlayArchivesTransactionWhileRunnerLt6c?: boolean;
  /** NASX */
  nasxMaySpendUpTo2OnAbilityCreditGainToPlacePower?: boolean;
  /** Maw */
  mawFirstAccessNotArchivesNoStealOrTrashForceCorpTrashHq?: boolean;
  /** The Archivist */
  archivistOnCorpScoresInitiativeOrSecurityTrace?: number;
  /** Network Exchange */
  iceNotInnermostInstallCostIncrease?: number;
  /** Synth DNA Modification */
  synthDnaFirstApSubBrokenEachTurnNetDamage?: number;
  /** Net Analytics */
  netAnalyticsMayDrawWhenRunnerAvoidsOrRemovesTags?: boolean;
  /** Jemison Astronautics */
  jemisonOnForfeitPlaceAdvancementsEqualAgendaPointsPlus1?: boolean;
  /** Oberth Protocol */
  oberthFirstAdvanceThisServerAdditionalAdvancement?: number;
  /** Clan Vengeance */
  placePowerCounterOnSufferAnyDamage?: boolean;
  /** Seidr Adaptive Barrier */
  strengthBonusPerIceProtectingThisServer?: number;
  /** System Seizure */
  systemSeizureFirstPumpStrengthLastsRemainderOfRun?: boolean;
  /** CPC Generator */
  corpGainsOnFirstRunnerBasicGainCreditEachTurn?: number;
  /** MCA Informant (hosted condition) */
  additionalTagsWhileHosted?: number;
  mcaInformantCondition?: boolean;
  mcaInformantHosted?: boolean;
  /** Terminal Directive (td) */
  daemonHostInstallCreditDiscount?: number;
  basicDrawBonus?: number;
  /** First basic draw each turn draws this many additional cards (Verbal Plasticity). */
  additionalCardsOnFirstBasicDrawEachTurn?: number;
  /** Corp turn end: gain this many credits if Archives has a facedown card. */
  gainCreditOnCorpTurnEndIfArchivesHasFacedown?: number;
  polyhistorPassAllHqIceMayDrawForceCorpDraw?: boolean;
  maxwellJamesRequireAfterSuccessfulHqRunPaidWindow?: boolean;
  placePowerCounterOnInstallCardInRemoteRoot?: boolean;
  onSuccessfulRunThisServer?: Effect;
  skorpiosRfgOneTrashedRunnerCardOncePerTurn?: boolean;
  onTrashWhileRezzedTakeBadPublicity?: number;
  meatDamageWhenRunnerTakesTags?: number;
  playOnlyIfRunnerStoleAgendaLastTurn?: boolean;
  longTermInvestmentGainAbilityAtHostedCredits?: number;
  /** Earth's Scion (eas) */
  strengthBonusPerSubroutineOnEncounteredBarrier?: number;
  aeneasInformantRevealGainOnAccessWithoutTrash?: boolean;
  hostGainsAiSubtype?: boolean;
  hostGainsLoseClickBreakAnySubroutine?: boolean;
  hostGainsPumpAbility?: { credits: number; strength: number };
  inversificatorSwapIceAfterFullyBrokeOncePerTurn?: boolean;
  trashSelfAndMeatDamageWhenCreditsZero?: number;
  bioroidWorkCrewRequireAfterOperationPaidWindow?: boolean;
  mayTakeTagToBypassOnEncounter?: boolean;
  gainCreditsOnBreakSubThisServerIfTagged?: number;
  playRequiresOtherCardsInHq?: number;
  /** Blood and Water (baw) */
  trashSelfWhenNoPowerCounters?: boolean;
  corpCannotTrashWhileOtherResourceInstalled?: boolean;
  recurringCreditsMaxEqualsIceProtectingHq?: boolean;
  installCostX?: boolean;
  powerCountersOnInstallEqualPaidX?: boolean;
  onTurnEndIfGripEmptyDrawPerPowerThenTrash?: boolean;
  gainCreditsOnFirstDerezIceEachTurn?: number;
  drawOnFirstRunEachTurnIfServerIceGte?: { ice: number; draw: number };
  fullyBreakNextEncounterFirstNSubsDoNotResolve?: number;
  onRunnerTrashFromThisServerRootOrProtecting?: Effect;
  onEncounterEndIfPrintedSubroutineBroken?: Effect;
  playRequiresNoSuccessfulRunLastTurn?: boolean;
  onRezIceProtectingThisServer?: Effect;
  /** Free Mars (fm) */
  ripDealHeapInsteadOfHqAccess?: boolean;
  rfgSelfOnRunEnd?: boolean;
  strengthBonusPerInstalledProgram?: number;
  strengthBonusPerIceProtectingAttackedServerDuringRun?: number;
  nonVirtualResourceInstallCostIncrease?: number;
  cannotHostCards?: boolean;
  afterMandatoryDraw?: Effect;
  hostAgendaGainsPublic?: boolean;
  hostStrengthPerPowerCounter?: number;
  /** Crimson Dust (cd) */
  playRequiresSuccessfulCentralRunThisTurn?: boolean;
  onFirstEmptyGripEachTurn?: Effect;
  placeVirusCounterOnExposeAnyCard?: boolean;
  placeVirusCounterOnFinishBreachIfNoStealOrTrash?: boolean;
  revealCorpBasicActionDraws?: boolean;
  operationAndEventPlayCostIncrease?: number;
  corpGainsCreditsOnFirstRunnerEventEachTurn?: number;
  trashTopOfStackWhenAllSubsBrokenOnProtectingIce?: number;
  strengthBonusIfInstalledSubtype?: { subtype: string; bonus: number };
  /** Sovereign Sight (ss) */
  mayGainCreditsOnCorpCardExposed?: number;
  memoryCostPerPowerCounter?: number;
  corpHandSizeBonusWhileInstalled?: number;
  gainCreditsOnFirstFullyBreakEachTurn?: number;
  placeAdvancementOnSufferMeatDamage?: boolean;
  playRequiresRunnerHasInstalledHardwareOrNonVirtualResource?: boolean;
  /** Down the White Nile (dtwn) */
  onFirstSuccessfulHqOrRdRunThisTurn?: Effect;
  playRequiresRunnerHasInstalledCard?: boolean;
  onTurnBeginFromRunnerScoreOnCorpTurn?: boolean;
  onDrawIceMayRevealAndInstallProtectingThisServerPayingLess?: number;
  /** Council of the Crest (cotc) */
  mayPlaceVirusCounterWhenCorpCardTrashed?: boolean;
  corpLosesCreditsOnFirstRunnerInstallEachTurn?: number;
  onEncounterEndIfNotFullyBroken?: Effect;
  /** Faerie: whenever an encounter ends, if this program broke a subroutine during it. */
  onEncounterEndIfBroke?: Effect;
  gainCreditsOnFirstRunnerPlayOrInstallNamedType?: number;
  mayGainCreditWhenRunnerInstallsOrTrashesInstalled?: boolean;
  programInstallCostIncrease?: number;
  hardwareInstallCostIncrease?: number;
  virtualResourceInstallCostIncrease?: number;
  mayGainCreditWhenRunnerInstallsProgramHardwareOrVirtual?: boolean;
  /** The Devil and the Dragon (tdatd) */
  mayExposeFirstCorpInstallEachTurnUnlessCorpPays?: number;
  onAgendaAccessedOrScored?: Effect;
  /** Whispers in Nalubaale (win) */
  accessTrashNonAgendaWithVirusEqualPrintedCost?: boolean;
  trashHostAtVirus?: number;
  onEncounterMayPayCreditsGrantIceSubtype?: {
    credits: number;
    subtype: string;
    oncePerTurn?: boolean;
  };
  hostIcebreakerStrengthIncreasesLastRemainderOfTurn?: boolean;
  onAgendaAddedToRunnerScore?: Effect;
  onScoreTurnEnd?: Effect;
  hqOrRdRootOnly?: boolean;
  gainCreditsPerCardAccessedDuringBreach?: number;
  mayPayCreditsToTagWhenRunnerTrashesFromThisServerOrRoot?: {
    credits: number;
    tags: number;
  };
  /** Kampala Ascendent (ka) */
  mayRfgSelfToTrashOutermostIceOnFirstFullBreakEachTurn?: boolean;
  mayGainCreditOnFirstCorpCardAbilityCreditGainEachTurn?: boolean;
  spendHostedCreditsToUseHostedProgram?: boolean;
  trashHostedProgramAtEndOfTurnIfHostedCreditsUsed?: boolean;
  placePowerOnFirstSuccessfulRemoteRunEndIfBreachedNoSteal?: boolean;
  scoreWhenPowerGte?: { threshold: number; agendaPoints: number };
  onApproachServerOncePerTurn?: boolean;
  mayTagOnFirstRunEventOrIcebreakerInstallEachTurn?: boolean;

  playersCannotTrashThisIce?: boolean;
  dynamicEtrSubroutineCountFromCorpHandSize?: boolean;
  runnerFirstInstallCostIncreasePerPowerCounterOnThis?: number;
  handSizeBonusPerInstalledCopyWithSameDefId?: number;
  trashSelfOnUnsuccessfulRunThisTurn?: boolean;
  onCorpRemoteServerCreated?: Effect;
  trashWhenHostedCreditsEmpty?: boolean;
  accessTrashWithVirus?: boolean;
  /**
   * Lampades: mid-access spend 1 power + pay printed rez/play cost from
   * stealth credits to trash the accessed card.
   */
  accessTrashPayingPrintedCostFromStealth?: boolean;
  returnHostedBadPublicityOnUninstall?: boolean;
  /** DJ Fenris: gains hosted identity ability text (CR 1.5.4). */
  gainsTextOfHostedIdentity?: boolean;
  /** DJ Fenris: return hosted identity to outside-game on uninstall (CR 1.5.4b). */
  returnHostedIdentityToOutsideGameOnUninstall?: boolean;
  agendaPointsModifierInRunnerScoreArea?: number;
  /** The Board: while active, each agenda in the Runner's score area is worth this many more points. */
  runnerScoredAgendaPointsModifier?: number;
  onFirstBadPublicityTakeEachTurn?: Effect;
  onArchivesFacedownTurnedFaceupGte?: { min: number; effect: Effect };
  powerCounterOnAgendaScoredOrStolenFromThisServer?: number;
  canAdvance?: boolean | "unrezzed";
  playRequiresSuccessfulHqRunThisTurn?: boolean;
  playRequiresSuccessfulAllCentralsThisTurn?: boolean;
  playRequiresCorpBadPublicityGte?: number;
  onGrayOrBlackOpsTrashedAfterResolve?: Effect;
  onPassAllIceProtectingServer?: Effect;
  onWouldTakeBadPublicity?: Effect;
  dynamicEtrSubroutineCountFromCorpAgendaPoints?: boolean;
  dynamicEtrSubroutineCountFromRezzedIceSubtype?: string;
  runnerIcebreakerAbilityAdditionalCostOnThisServer?: number;
  gainCreditsOnTraceInitiated?: number;
  onGripRdSuccessInstallSelfIgnoringCosts?: boolean;
  onEncounterRezzedAfterApproach?: Effect;
  blackguardForceRezOnExpose?: boolean;
  breakerOnlyOutermostIce?: boolean;
  breakerOnlyInnermostIce?: boolean;
  onScoreIfRunnerTaggedPlaceAgendaCounter?: boolean;
  playRequiresScoredAgendaNotInstalledThisTurn?: boolean;
  rezAdditionalCostForfeitAgenda?: boolean;
  rezCostCreditDiscountOnForfeitAgenda?: number;
  /** As an additional rez cost, derez another rezzed ice with this subtype (Bloop). */
  rezAdditionalCostDerezSubtype?: string;
  playAdditionalClick?: boolean;
  /** Extra clicks beyond the first (triples = 2). Overrides playAdditionalClick. */
  playAdditionalClicks?: number;
  /** Terminal operation: end action phase after play (Big Deal). */
  endsActionPhase?: boolean;
  /** Embolus: remove 1 power counter when Runner makes any successful run. */
  removePowerCounterOnAnySuccessfulRun?: boolean;
  /**
   * Hired Help: additional cost to run this server — forfeit a scored agenda
   * unless the Runner made a successful HQ run this turn.
   */
  additionalRunCostTrashAgendaFromScoreUnlessSuccessfulHqThisTurn?: boolean;
  mayShuffleIntoRdWhenTrashed?: boolean;
  badPublicityOnScore?: number;
  playCostXMaxRunnerTags?: boolean;
  installSpendCreditsForPowerCounters?: boolean;
  strengthPerPowerCounter?: boolean;
  interfaceRequiresEqualStrength?: boolean;
  interfaceRequiresTrojanHost?: boolean;
  /** May only interface ice protecting the server chosen on install (Cyber-Cypher). */
  interfaceRequiresChosenServer?: boolean;
  chooseBreakerSubtypeOnInstall?: boolean;
  returnToGripAtDiscardPhase?: boolean;
  chooseIceOnInstallForBypass?: boolean;
  /**
   * Boomerang: on install choose ice → chosenIceId (no bypass semantics).
   */
  chooseIceOnInstall?: boolean;
  hostedProgramsLoseAbilities?: boolean;
  securityTesting?: boolean;
  rezBioroidDiscountOnFirstPass?: number;
  interruptFirstDrawBottomOne?: boolean;
  subliminalMessaging?: boolean;
  aylaSetAside?: boolean;
  steveCambridge?: boolean;
  aesopPawnshop?: boolean;
  /** Targeted Marketing: gain 10¢ when the Runner plays/installs the named card. */
  targetedMarketing?: boolean;
  /** NRDB faction_code; optional; never invented. */
  faction?: string;
  /** Direct Access: blank both identities while resolving (incl. run). */
  blankIdentitiesWhileResolving?: boolean;
  /** Storgotic Resonator: first matching-faction trash each turn. */
  onFirstTrashMatchingRunnerIdentityFactionEachTurn?: Effect;
  /** Hyoubu Institute: first reveal each turn. */
  onFirstRevealEachTurn?: Effect;
  /** Class Act: interrupt first would-draw each turn. */
  onWouldDrawOncePerTurn?: Effect;
  /** Complete Image: Runner agenda points gate. */
  playRequiresRunnerAgendaPointsGte?: number;
  /** MirrorMorph: third distinct Corp action this turn. */
  mirrormorphOnThirdDistinctAction?: Effect;
}
