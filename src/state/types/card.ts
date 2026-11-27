/** A card in a game: `CardInstance`, with its trigger hooks and its costs and requirements in their own files. */

import type { AbilityRecord } from "../../effects/abilityRecord.js";
import type { Effect } from "../../effects/ir/effect.js";
import type {
  BreakerAbility,
  ContinuousGainedSubDecl,
  PaidAbility,
  RecurringSpendPurpose,
  StartsRunSpec,
  Subroutine,
} from "./abilities.js";
import type { CardCostsAndRequirements } from "./cardCosts.js";
import type { CardTriggerHooks } from "./cardHooks.js";
import type { ServerId } from "./servers.js";
import type { CardType, Side, ZoneId } from "./shared.js";

export interface CardInstance
  extends CardTriggerHooks, CardCostsAndRequirements {
  id: string;
  /** Definition id from card data (stable across instances). */
  defId?: string;
  title: string;
  type: CardType;
  side: Side;
  /**
   * NRDB `faction_code` (e.g. `jinteki`, `criminal`). Optional; never invented.
   * Used by Storgotic Resonator faction-match trash triggers.
   */
  faction?: string;
  strength?: number;
  subtypes?: string[];
  subroutines?: Subroutine[];
  breaker?: BreakerAbility;
  /** Paid abilities usable in matching PAW windows (CR 9.5). */
  paidAbilities?: PaidAbility[];
  /**
   * Printed CR 9.3 ability records (kept on the instance so play resolves
   * from records without dual-writing `onPlay`).
   */
  abilities?: AbilityRecord[];
  /**
   * Additional clicks the Runner must spend to steal this agenda
   * (Méliès City Luxury Line).
   */
  stealAdditionalClicks?: number;
  /**
   * Additional credits the Runner must pay to steal this agenda (Bellona).
   */
  stealAdditionalCredits?: number;
  /**
   * While rezzed, Runner must pay this many credits as an additional cost to
   * steal any agenda (Magistrate Revontulet).
   */
  stealAdditionalCreditsWhileRezzed?: number;
  /**
   * While rezzed (or Persistent), Runner must pay this many credits as an
   * additional cost to steal an agenda from this server or its root (Red
   * Herrings).
   */
  stealAdditionalCreditsFromProtectingServer?: number;
  /**
   * While this lockdown is active in corp:play-area, Runner pays
   * base + perAdvancement×advancementCounters as an additional cost to steal
   * an agenda (NAPD Cordon).
   */
  stealAdditionalCreditsFormula?: { base: number; perAdvancement: number };
  /**
   * Whenever the Runner breaks a printed subroutine on this ice, they lose
   * this many credits (Gold Farmer).
   */
  runnerLoseCreditsOnBreakPrintedSubroutine?: number;
  /**
   * Place this many hosted credits whenever any ice is rezzed
   * (Cybersand Harvester).
   */
  hostedCreditsOnAnyIceRez?: number;
  /**
   * Spend non-recurring hosted credits for these purposes
   * (Cybersand / Urban Art Vernissage).
   */
  hostedCreditsSpendFor?: Array<"install" | "trash" | "play_event">;
  /**
   * Ice Analyzer-class: when spending hosted credits for install, only these
   * card types are eligible.
   */
  hostedCreditsSpendForInstallTypes?: Array<
    "program" | "hardware" | "resource"
  >;
  /** Kati Jones: at most one paid ability on this card each turn. */
  paidAbilitiesOncePerTurn?: boolean;
  /** Open Market: hosted install credits only for resources with these subtypes. */
  hostedCreditsSpendForInstallSubtypes?: string[];
  /**
   * Paladin Poemu: hosted install credits cannot be spent on cards with these
   * subtypes (e.g. connection).
   */
  hostedCreditsSpendForInstallExcludeSubtypes?: string[];
  /** Gourmand: access → trash self to trash accessed non-agenda, then draw. */
  accessTrashSelfNonAgendaThenDraw?: boolean;
  /**
   * Threat N → Runner cannot spend credits while subroutines on this ice
   * are resolving (Attini).
   */
  threatCannotSpendCreditsDuringSubs?: number;
  /** Corp may only install this card in a remote (ZATO City Grid). */
  remoteOnly?: boolean;
  /**
   * Derived from any ability with `flag: persistent` (CR 9.3.6e).
   * Not a card-declaration field — set at load from ability records.
   */
  persistent?: boolean;
  /**
   * Facedown set-aside group id shared by cards set aside by the same effect
   * (CR 4.8.7). Undefined when faceup or not set aside.
   */
  setAsideGroupId?: string;
  /** Rez only during Corp turn, not during a Runner run PAW (Front Company). */
  rezOnlyDuringCorpTurn?: boolean;
  /**
   * While rezzed: the first run the Runner makes each turn cannot target a
   * remote server (Front Company).
   */
  firstRunCannotTargetRemote?: boolean;
  /**
   * While rezzed: each ice protecting this server gains encounter ability —
   * choose 1 subroutine; may trash the ice to resolve it (ZATO).
   */
  iceGainsTrashToResolveChosenSubOnEncounter?: boolean;
  /**
   * Gantulga: during the first encounter each turn with ice protecting
   * `namedServerId`, each subroutine resolves as Do N net damage instead.
   */
  firstEncounterSubsBecomeNetDamage?: number;
  /** Trash this card when it has no hosted cards (Asmund Pudlat). */
  trashWhenNoHostedCards?: boolean;
  /**
   * Cards hosted on this card without being installed (Asmund / Matryoshka).
   * Hosted instances keep `hostId` pointing here and are not in the installed area.
   */
  hostedCardIds?: string[];
  /** Deckbuilding max copies (Matryoshka). */
  deckLimit?: number;
  /** The Cleaners: while scored, increase meat damage dealt by 1. */
  whileScoredMeatDamageIncrease?: number;
  /** Off the Grid: Runner cannot initiate runs on this upgrade's server. */
  blocksRunnerRunsOnHostServer?: boolean;
  trashSelfWhenFullyBrokenByRunner?: boolean;
  /** Off the Grid: trash when Corp makes a successful HQ run. */
  trashSelfOnCorpSuccessfulHqRun?: boolean;
  /** Scheherazade: gain 1¢ when Runner installs a program hosted here. */
  gainCreditsWhenRunnerHostsProgramOnSelf?: number;
  /**
   * Snowball: when this breaker breaks a subroutine, +N strength for remainder
   * of the run.
   */
  strengthBonusOnBreakSubForRun?: number;
  /**
   * Hardcoded prevention while this card is rezzed during a run.
   * Prefer onRez prevent IR; kept for back-compat with Lockdown tests.
   */
  prevention?: {
    jackOutForRun?: boolean;
  };
  /**
   * Jesminder Sareen: the first time each run you would take tags, prevent
   * 1 tag. Also makes nested costs that require taking that tag unpayable
   * (CR 1.16.1b).
   */
  preventFirstTagEachRun?: boolean;
  /** Tungsten Tailor: each ice gets −N strength while this is installed. */
  allIceStrengthPenalty?: number;
  /**
   * NEXT Activation Command: each ice gets +N strength while this lockdown
   * is active in corp:play-area (inverse of allIceStrengthPenalty).
   */
  allIceStrengthBonus?: number;
  /**
   * NEXT Activation Command: while active, Runner cannot break subroutines
   * using cards that lack the icebreaker subtype.
   */
  cannotBreakExceptIcebreaker?: boolean;
  /**
   * Tungsten Tailor: first break each turn on ice with strength ≤ this value
   * gains 1¢ (typically 0).
   */
  gainCreditOnBreakIceStrengthLteOncePerTurn?: number;
  /** Nuvem: gain N¢ first R&D trash each Corp turn. */
  creditsOnFirstRdTrashThisTurn?: number;
  /** Corp identity: maximum remote servers (A Teia). */
  maxRemoteServers?: number;
  /**
   * While in score area: −N breaker strength if ice derezzed this run
   * (Stegodon MK IV).
   */
  whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun?: number;
  /** Gene Conditioning Shoppe. */
  geneticsAlsoTriggerSecondTime?: boolean;
  /** Traffic Jam current: +N adv req per copy in Corp score. */
  agendaAdvancementRequirementBonusPerCopyInCorpScore?: number;
  /** Jinteki Biotech faces. */
  chooseIdentityFaceBeforeFirstTurn?: boolean;
  identityFaceOptions?: Array<{ id: string; label: string; onFlip: Effect }>;
  chosenIdentityFaceId?: string;
  /**
   * Faces of a double-sided identity, front face first (CR 3.1.1a). Only the
   * faceup face is active, so its title, subtypes, and base link are the
   * identity's while that face is up.
   */
  identityFaces?: Array<{ title: string; subtypes: string[]; link?: number }>;
  /** Off-Campus Apartment. */
  hostsConnectionResources?: boolean;
  drawOnHostConnectionInstall?: number;
  /** London Library. */
  trashHostedProgramsOnTurnEnd?: boolean;
  /** Blacklist. */
  cardsCannotLeaveRunnerHeap?: boolean;
  /** Chrome Parlor: prevent cybernetic install damage. */
  preventCyberneticInstallDamage?: boolean;
  /** Titanium Ribs: Runner chooses grip cards for damage. */
  runnerChoosesDamageTrashFromGrip?: boolean;
  /** Armand Geist: draw N when using a [trash] ability. */
  drawOnUseTrashAbility?: number;
  /** Defective Brainchips: first core damage each turn +N. */
  increaseFirstCoreDamagePerTurn?: number;
  /** Underway Renovation: mill Runner stack on advance. */
  trashTopOfStackOnAdvance?: {
    default: number;
    atOrAbove?: number;
    bonus?: number;
  };
  /** Underway Grid. */
  iceCannotBeBypassedThisServer?: boolean;
  cardsCannotBeExposedThisServer?: boolean;
  /** Film Critic. */
  hostAgendaCapacity?: number;
  mayHostAccessedAgenda?: boolean;
  /** Paparazzi. */
  countsAsTagged?: boolean;
  preventAllMeatDamage?: boolean;
  /** Ronald Five. */
  runnerLosesClickWhenTrashesCorpCard?: boolean;
  /** Haarpsichord Studios. */
  cannotStealMoreThanOneAgendaPerTurn?: boolean;
  /** Old Hollywood Grid. */
  cannotStealUnlessCopyInRunnerScore?: boolean;
  /** Hollywood Renovation. */
  placeAdvancementOnAnotherOnAdvance?: {
    default: number;
    atOrAbove?: number;
    bonus?: number;
  };
  /** Casting Call condition counter. */
  castingCallCondition?: boolean;
  /** Chronos Protocol. */
  corpChoosesFirstNetDamageCardEachTurn?: boolean;
  /** Ancestral Imager. */
  netDamageOnJackOut?: number;
  /** Genetics Pavilion. */
  runnerCannotDrawMoreThanPerTurn?: number;
  /** Franchise City. */
  mustRevealAgendasAccessedFromRd?: boolean;
  addSelfToCorpScoreOnAgendaAccess?: { agendaPoints: number };
  /** Worlds Plaza. */
  hostAssetsOnly?: boolean;
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
  /** Safety First: draw N at turn end if grip < max hand. */
  drawAtTurnEndIfGripBelowMaxHandSize?: number;
  /** Employee Strike: blank Corp identity printed abilities. */
  blankCorpIdentityPrintedAbilities?: boolean;
  /** Technical Writer: place N credits on HW/program install. */
  hostedCreditsOnProgramOrHardwareInstall?: number;
  runnerChoosesUnbrokenSubroutineOrder?: boolean;
  breakOnAtMostOneIcePerRun?: boolean;
  zeroInfluenceIfNonAllianceFactionCardsGte?: {
    faction: string;
    threshold: number;
  };
  zeroInfluenceIfIceInDeckLte?: number;
  zeroInfluenceIfCardsInDeckGte?: number;
  chooseServerOnInstall?: boolean;
  gainCreditOnTrashAbilityUse?: boolean;
  daemonHostMaxMuFromInstalledCopiesOfSelf?: boolean;
  hostedProgramMemoryDoesNotCount?: boolean;
  corpAdditionalBadPublicity?: number;
  corpAdditionalBadPublicityCannotBeRemoved?: boolean;
  placePowerCounterOnAnyCardRez?: boolean;
  gainCreditOnFirstRunnerDrawEachTurn?: boolean;
  zeroInfluenceIfCardCopiesGte?: { cardId: string; threshold: number };
  /** Nero Severn */
  mayJackOutOnEncounterSentryOncePerTurn?: boolean;
  /** Reflection */
  revealRandomHqOnJackOut?: boolean;
  /** Akshara Sareen */
  corpAllottedClicksBonusWhileInstalled?: number;
  /** Bailiff */
  gainCreditWheneverRunnerBreaksSubroutine?: boolean;
  /** Political Graffiti condition */
  hostAgendaPointsModifier?: number;
  /** Brahman */
  addInstalledNonVirusProgramToStackTopOnEncounterEndIfBroke?: boolean;
  /** Patron: draw N instead of breach on first successful run on named server */
  patronChooseServerDrawInsteadOfBreach?: number;
  /** Jeeves Model Bioroids */
  gainClickFirstTimeSpendClicksGteOnSameActionEachTurn?: number;
  /** Mumbad Virtual Tour */
  zeroInfluenceIfAssetsInDeckGte?: number;
  mustTrashWhenAccessedWhileInstalled?: boolean;
  /** Out of the Ashes */
  heapOnTurnBeginMayRfgSelfToMakeRun?: boolean;
  /** Guru Davinder: pay N or trash when preventing net/meat */
  autoPreventNetOrMeatDamagePayOrTrash?: number;
  /** The Turning Wheel */
  placePowerOnHqOrRdRunEndIfNoAgendaStolen?: boolean;
  /** Dedicated Neural Net */
  firstSuccessfulHqRunEachTurnPsiCorpChoosesAccess?: boolean;
  /** The Black File */
  corpCannotWinExceptFlatline?: boolean;
  /** Harishchandra Ent. */
  revealGripWhileRunnerTagged?: boolean;
  /** Full Immersion RecStudio */
  hostAssetsOrAgendas?: boolean;
  /** Navi Mumbai City Grid */
  blockRunnerPaidAbilitiesExceptIcebreakersAndMidAccess?: boolean;
  corpLosesCreditsOnNonFirstDrawThisTurn?: number;
  mayExposeApproachedIceThenMayTrashSelfToJackOut?: boolean;
  firstRevealSecretlySpentCreditsGainThatManyEachTurn?: boolean;
  iceStrengthBonusPerFiveCorpCreditsWhenCorpCreditsGte?: {
    threshold: number;
    perCredits: number;
    bonus: number;
  };
  blankUniqueNonRegionAssetUpgradePrintedAbilities?: boolean;
  mayInstallSelfFromHeapOnEncounterBarrier?: boolean;
  firstAdvancedIceEncounterEndMeatDamageEachTurn?: boolean;
  handSizeBonusPerTag?: number;
  drawPerAccessOnFirstSuccessfulHqOrRdRunEndEachTurn?: boolean;
  mayInstallSelfFromHeapOnEncounterCodeGate?: boolean;
  firstStealthSpendEachRunPlaceCreditOrDraw?: boolean;
  spendHostedCreditsForAnything?: boolean;
  revealDrawnCards?: boolean;
  trashTopOfStackOnRunnerNetDamage?: boolean;
  bonusAccessOnHqBreachPerFullyBrokenProtectingIce?: boolean;
  mayInsteadOfBreachRdAccessOneOfTopN?: number;
  secretSpendCannotEqual?: number;
  meatDamageWhenSecretSpendAmountsDiffer?: number;
  placePowerPerUnbrokenSubOnAnyEncounterEnd?: boolean;
  mayInstallSelfFromHeapOnEncounterSentry?: boolean;
  drawOnFirstTrashInstalledEachTurn?: boolean;
  cannotRezNonIceDuringRunnerTurn?: boolean;
  gainsPaidAbilitiesOfHostedIcebreakers?: boolean;
  additionalClickNextTurnOnSuccessfulRunEndIfRunnerLt6cOrNoClicks?: boolean;
  mayMoveAnyAdvancementsFromSelfToRezzedIce?: boolean;
  sifrMayZeroEncounterIceStrengthOncePerTurn?: boolean;
  trashTopOfStackOnBreakSubIfRunnerHasAi?: number;
  firstTraceEachTurnRunnerLinkTreatedAs0?: boolean;
  gainCreditsWhenRunnerSpendsForLinkPer2Spent?: boolean;
  bryanStinsonPlayArchivesTransactionWhileRunnerLt6c?: boolean;
  nasxMaySpendUpTo2OnAbilityCreditGainToPlacePower?: boolean;
  mawFirstAccessNotArchivesNoStealOrTrashForceCorpTrashHq?: boolean;
  archivistOnCorpScoresInitiativeOrSecurityTrace?: number;
  synthDnaFirstApSubBrokenEachTurnNetDamage?: number;
  netAnalyticsMayDrawWhenRunnerAvoidsOrRemovesTags?: boolean;
  jemisonOnForfeitPlaceAdvancementsEqualAgendaPointsPlus1?: boolean;
  oberthFirstAdvanceThisServerAdditionalAdvancement?: number;
  placePowerCounterOnSufferAnyDamage?: boolean;
  strengthBonusPerIceProtectingThisServer?: number;
  systemSeizureFirstPumpStrengthLastsRemainderOfRun?: boolean;
  corpGainsOnFirstRunnerBasicGainCreditEachTurn?: number;
  additionalTagsWhileHosted?: number;
  mcaInformantCondition?: boolean;
  mcaInformantHosted?: boolean;
  basicDrawBonus?: number;
  /** First basic draw each turn draws this many additional cards (Verbal Plasticity). */
  additionalCardsOnFirstBasicDrawEachTurn?: number;
  /** Corp turn end: gain this many credits if Archives has a facedown card. */
  gainCreditOnCorpTurnEndIfArchivesHasFacedown?: number;
  polyhistorPassAllHqIceMayDrawForceCorpDraw?: boolean;
  maxwellJamesRequireAfterSuccessfulHqRunPaidWindow?: boolean;
  placePowerCounterOnInstallCardInRemoteRoot?: boolean;
  skorpiosRfgOneTrashedRunnerCardOncePerTurn?: boolean;
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
  /** Blood and Water (baw) */
  trashSelfWhenNoPowerCounters?: boolean;
  corpCannotTrashWhileOtherResourceInstalled?: boolean;
  recurringCreditsMaxEqualsIceProtectingHq?: boolean;
  powerCountersOnInstallEqualPaidX?: boolean;
  gainCreditsOnFirstDerezIceEachTurn?: number;
  drawOnFirstRunEachTurnIfServerIceGte?: { ice: number; draw: number };
  fullyBreakNextEncounterFirstNSubsDoNotResolve?: number;
  /** Free Mars (fm) */
  ripDealHeapInsteadOfHqAccess?: boolean;
  rfgSelfOnRunEnd?: boolean;
  strengthBonusPerInstalledProgram?: number;
  strengthBonusPerIceProtectingAttackedServerDuringRun?: number;
  cannotHostCards?: boolean;
  afterMandatoryDraw?: Effect;
  hostAgendaGainsPublic?: boolean;
  hostStrengthPerPowerCounter?: number;
  gainCreditsOnAdvance?: number;
  placeVirusCounterOnExposeAnyCard?: boolean;
  placeVirusCounterOnFinishBreachIfNoStealOrTrash?: boolean;
  revealCorpBasicActionDraws?: boolean;
  corpGainsCreditsOnFirstRunnerEventEachTurn?: number;
  trashTopOfStackWhenAllSubsBrokenOnProtectingIce?: number;
  strengthBonusIfInstalledSubtype?: { subtype: string; bonus: number };
  /** Sovereign Sight (ss) */
  mayGainCreditsOnCorpCardExposed?: number;
  corpHandSizeBonusWhileInstalled?: number;
  gainCreditsOnFirstFullyBreakEachTurn?: number;
  placeAdvancementOnSufferMeatDamage?: boolean;
  /** Council of the Crest (cotc) */
  mayPlaceVirusCounterWhenCorpCardTrashed?: boolean;
  corpLosesCreditsOnFirstRunnerInstallEachTurn?: number;
  gainCreditsOnFirstRunnerPlayOrInstallNamedType?: number;
  mayGainCreditWhenRunnerInstallsOrTrashesInstalled?: boolean;
  mayGainCreditWhenRunnerInstallsProgramHardwareOrVirtual?: boolean;
  /** The Devil and the Dragon (tdatd) */
  mayExposeFirstCorpInstallEachTurnUnlessCorpPays?: number;
  /** Malia: blanked resource id while this asset is rezzed. */
  tdatdMaliaBlankTargetId?: string;
  /**
   * Trieste Model Bioroids: the ice chosen when it was rezzed. Runner card
   * abilities cannot break that ice's subroutines while Trieste is active
   * (CR 9.4.1); cleared when either card becomes a new object (CR 1.12.2).
   */
  triesteChosenIceId?: string;
  trashHostAtVirus?: number;
  hostIcebreakerStrengthIncreasesLastRemainderOfTurn?: boolean;
  /** Set when the Corp scores this agenda; cleared when the next Corp turn begins. */
  scoredThisTurn?: boolean;
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
  mayTagOnFirstRunEventOrIcebreakerInstallEachTurn?: boolean;
  baseSubtypes?: string[];
  /**
   * Spark Agency: the first time each turn Corp rezzes an advertisement,
   * the Runner loses this many credits (Corp identity).
   */
  loseCreditsOnFirstAdvertisementRezThisTurn?: number;
  /**
   * +`amount` strength until the end of the turn for each icebreaker
   * installed while this card is active: LLDS Processor any icebreaker,
   * Cybertrooper Talut only a non-AI one (`nonAiOnly`).
   */
  icebreakerInstallStrengthBonusThisTurn?: {
    amount: number;
    nonAiOnly?: boolean;
  };
  /**
   * Acme Consulting: Runner is considered to have this many additional tags
   * during encounters with outermost ice (even at 0 physical tags).
   */
  additionalTagsDuringOutermostIceEncounter?: number;
  /** Central-only install destinations (Red Room / Flagship). */
  installServers?: Array<"hq" | "rd" | "archives">;
  /** Place this many hosted credits whenever the Runner plays a run event (Debbie). */
  hostedCreditsOnRunEventPlay?: number;
  /**
   * First time each turn the Runner plays an event, place this many hosted
   * credits (Touchstone).
   */
  hostedCreditsOnFirstEventPlayOncePerTurn?: number;
  /** Hosted credits may be spent during runs (Touchstone). */
  spendHostedCreditsDuringRuns?: boolean;
  /**
   * Trickster Taka: hosted credits may be spent to use programs during runs.
   */
  spendHostedCreditsToUseProgramsDuringRuns?: boolean;
  /**
   * Stick and Poke: first encounter each turn, ice gains this subroutine
   * before printed ones for the remainder of that encounter.
   */
  firstEncounterGainsSubroutine?: { text: string; effect: Effect };
  /** Rotary: on HQ/R&D breach, may take 1 tag to access this many more. */
  mayTakeTagForBonusAccessOnHqRdBreach?: number;
  /**
   * Sipa: once per turn when passing outermost ice after fully breaking it,
   * may swap that ice with another installed ice.
   */
  maySwapOutermostIceOnPassAfterFullyBreakOncePerTurn?: boolean;
  /** First advance each turn: gain this many credits (Sacrifice Zone). */
  creditsOnFirstAdvanceThisTurn?: number;
  /**
   * Algernon: trash at Runner turn end unless a successful run was made this
   * turn (set when the turn-begin click-gain is taken).
   */
  trashAtTurnEndUnlessSuccessfulRun?: boolean;
  /** Curtain Wall: +N strength while outermost on server. */
  strengthBonusIfOutermostOnServer?: number;
  /** Working Prototype: place this many power whenever any card is rezzed. */
  powerCounterOnAnyCardRez?: number;
  /** Alix T4LB07: place this many power whenever the Corp installs any card. */
  powerCounterOnAnyCorpInstall?: number;
  /** Spree: power counters placed when the event is played. */
  powerCountersOnPlay?: number;
  /**
   * Gain this many credits the first time each turn a run on your mark ends
   * if you breached (Info Bounty).
   */
  gainCreditsOnFirstMarkRunEndIfBreached?: number;
  /**
   * Do this much meat damage the first time each turn an installed Corp card
   * is trashed (Hostile Architecture). Requires the asset rezzed.
   */
  meatDamageOnInstalledCorpTrashOncePerTurn?: number;
  /**
   * When breaching R&D, may remove up to `max` hosted power counters for that
   * many bonus accesses (Wake Implant).
   */
  maySpendPowerCountersForBonusRdAccess?: { max: number };
  /**
   * Place 1 power when scoring an agenda not installed or advanced this turn
   * (Issuaq Adaptics).
   */
  powerOnScoreIfAgendaNotInstalledOrAdvancedThisTurn?: boolean;
  /** Reduce agenda points to win by this × hosted power counters (Issuaq). */
  agendaPointsToWinReductionPerPowerCounter?: number;
  /**
   * Gain this many credits when a card is trashed from this server's root or
   * ice, except during install (Yakov).
   */
  creditsOnTrashFromThisServer?: number;
  /** Agenda points when scored/stolen. */
  agendaPoints?: number;
  /** Advancement requirement to score. */
  advancementRequirement?: number;
  /**
   * When true, advancement requirement equals the number of cards in the
   * Runner's grip (Blood in the Water).
   */
  advancementRequirementEqualsRunnerGrip?: boolean;
  /**
   * Reduce this agenda's advancement requirement by `per` × Runner tags
   * (Freedom of Information).
   */
  advancementRequirementReductionPerTag?: number;
  /**
   * Reduce this agenda's advancement requirement by `per` × core damage
   * taken this game (`runner.coreDamage`; Ontological Dependence).
   */
  advancementRequirementReductionPerCoreDamageThisGame?: number;
  /**
   * Reduce this agenda's advancement requirement by `per` × Corp bad
   * publicity, counting at most `max` BP (Regulatory Capture).
   */
  advancementRequirementReductionPerBadPublicity?: {
    per: number;
    max?: number;
  };
  /** NAPD Contract: increase requirement by N per Corp bad publicity. */
  advancementRequirementIncreasePerCorpBadPublicity?: number;
  /** Current advancement counters. */
  advancementCounters?: number;
  /**
   * Snapshot at the start of scoring (CR 10.13.2). Dividends and overadvance
   * score abilities read these after advancements are cleared on the move.
   */
  scoreBeginAdvancementCounters?: number;
  scoreBeginAdvancementRequirement?: number;
  /** Max recurring credits on this card. */
  recurringCreditsMax?: number;
  /**
   * Net Police: when refilled/rezzed, set recurringCreditsMax to the Runner's
   * current link.
   */
  recurringCreditsMaxEqualsRunnerLink?: boolean;
  /**
   * Pheromones: when refilled / virus changes, set recurringCreditsMax to
   * virus counters on this card.
   */
  recurringCreditsMaxEqualsVirusCounters?: boolean;
  /** Khondi Plaza: recurring max equals number of remote servers. */
  recurringCreditsMaxEqualsRemoteServers?: boolean;
  /** Andromeda: starting hand size (default 5 when unset). */
  startingHandSize?: number;
  /** Current recurring credit pool. */
  recurringCredits?: number;
  /** Hosted credit pool (e.g. Armitage). Not refilled. */
  hostedCredits?: number;
  /** Credits placed on this card when installed. */
  hostedCreditsOnInstall?: number;
  /** Hosted virus counters. */
  virusCounters?: number;
  /** +strength while protecting a remote (Palisade). */
  strengthBonusProtectingRemote?: number;
  /** +strength while protecting Archives (Bathynomus). */
  strengthBonusProtectingArchives?: number;
  strengthBonusProtectingRd?: number;
  strengthBonusProtectingHq?: number;
  /** Capacitor: +N strength while the Runner is tagged. */
  strengthBonusWhileTagged?: number;
  /** Hammer: breakers with this subtype ignore printed-sub break limits. */
  maxPrintedSubsBreakExceptSubtype?: string;
  /** Sorocaban Blade: max installed Runner trashes per encounter from this ice. */
  maxInstalledRunnerTrashesPerEncounter?: number;
  /** +strength while advancementCounters >= threshold (Pharos). */
  strengthBonusAtAdvancements?: { threshold: number; bonus: number };
  /** Akhet: while ≥threshold advancements, max printed breaks per encounter. */
  maxPrintedSubsBreakablePerEncounterAtAdvancements?: {
    threshold: number;
    max: number;
  };
  /** Hand-size modifier applied while installed / scored. */
  handSizeBonus?: number;
  /**
   * +N maximum hand size per hosted power counter (Hippocampic Mechanocytes).
   */
  handSizePerPowerCounter?: number;
  /**
   * While rezzed: Runner max hand size −N per hosted power counter
   * (Dr. Vientiane Keeling).
   */
  runnerHandSizePenaltyPerPowerCounter?: number;
  runnerHandSizeBonus?: number;
  agendaPointsToWinModifierBoth?: number;
  advancementRequirementReductionPerScoredCopy?: number;
  cannotBeBypassed?: boolean;
  trashSelfWhenInstalledProgramTrashed?: boolean;
  powerCountersOnInstallFromUnusedMu?: boolean;
  recurringSpendForPlayEventSubtypes?: string[];
  /**
   * Corp identity: Corp max hand size equals current credit pool, recomputed
   * before the discard step (Cerebral Imaging: Infinite Frontiers).
   */
  handSizeEqualsCredits?: boolean;
  /** Allotted-click modifier each of controller's turns while installed (Basilar). */
  allottedClicksBonus?: number;
  /**
   * Aura: grant +amount strength to other installed icebreakers
   * (K2CP Turbine; optional excludeSubtype e.g. "ai").
   */
  giveStrengthToInstalledIcebreakers?: {
    amount: number;
    excludeSubtype?: string;
  };
  /** GAMEDRAGON Pro: +strength to the icebreaker this hardware is hosted on. */
  hostIcebreakerStrengthBonus?: number;
  /** While hosted on an icebreaker, that breaker's pumps last for the run. */
  extendsHostBreakerPumpToRun?: boolean;
  /** Bling: play/install hosted cards as if they were in the grip. */
  hostedCardsPlayableAsGrip?: boolean;
  /** Au Co: place 1 power whenever Corp deals damage or trashes ≥1 from HQ. */
  powerCounterOnDamageOrTrashFromHq?: boolean;
  /** Bangun: Corp may install agendas faceup (abilities inactive). */
  mayInstallAgendasFaceup?: boolean;
  /** Bangun: agenda installed faceup; abilities inactive until scored. */
  faceupInstalledInactive?: boolean;
  /** When uninstalled from play, RFG instead of heap (Nanuq). */
  rfgOnUninstall?: boolean;
  /** Bonus to Runner memory limit while installed (consoles / chips). */
  muBonus?: number;
  /** Deep Red: MU counts only toward Caïssa programs. */
  muBonusOnlyForCaissaPrograms?: boolean;
  triggerCaissaClickAbilityOnCaissaInstall?: boolean;
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
  /**
   * Bioroid 2.0-class: [click] × N breaks up to N subroutines on this ice
   * in one paid ability (Heimdall/Ichi/Viktor 2.0).
   */
  bioroidBreakMaxSubs?: number;
  /**
   * Mu Safecracker: spend credits only from stealth cards to use this
   * hardware (paid abilities / credit costs).
   */
  paidAbilitiesUseStealthCreditsOnly?: boolean;
  /** +strength per installed icebreaker (Echelon); ice may use negative (Hagen). */
  strengthBonusPerIcebreaker?: number;
  /** Rising Tide: +strength per heap card of subtype. */
  strengthBonusPerHeapSubtype?: { subtype: string; bonus: number };
  /**
   * +strength per core damage the Runner has taken this game (Begemot).
   * Uses the permanent core-damage counter (`runner.coreDamage`, CR §10.4.2b).
   */
  strengthBonusPerCoreDamageThisGame?: number;
  /** Threat N → strength delta while threat is active (Shibboleth −2). */
  threatStrengthBonus?: { level: number; amount: number };
  /** Experiential Data-class: rezzed upgrade gives +N strength to ice protecting its server. */
  iceProtectingThisServerStrengthBonus?: number;
  /** Parasite-class: auto-trash host ice when its effective strength ≤ this. */
  trashHostWhenStrengthLte?: number;
  /** Place 1 virus counter on the virus program that just installed (Grimoire). */
  placeVirusCounterOnInstalledVirusProgram?: boolean;

  /**
   * Saisentan: during encounter, after choose_card_type_for_encounter, whenever
   * net damage from a subroutine on this ice trashes a card of the chosen type,
   * do 1 net damage.
   */
  amplifyNetDamageOnTrashChosenEncounterType?: boolean;
  /** When hosted credits empty and card trashes, draw this many (Nico). */
  drawOnHostedEmpty?: number;
  /** Otto Campaign: gain clicks when hosted credits empty-trash. */
  clicksOnHostedEmpty?: number;
  /** Play restriction: Runner must be tagged. */
  /** When Corp scores an agenda from this server root, do N core damage. */
  coreDamageOnAgendaScoredFromThisServer?: number;
  /**
   * Static ability: while accessing this card in R&D, the Runner must reveal it
   * (Nightmare Archive; CR §1.21.7).
   */
  mustRevealWhenAccessedFromRd?: boolean;
  /** When true, onAccess does not fire if accessed from Archives. */
  skipOnAccessFromArchives?: boolean;
  /** Game Changer: RFG instead of trashing after play. */
  rfgInsteadOfTrashing?: boolean;
  /**
   * Stronger Together: while this card is active, ice with subtype gets +bonus
   * strength.
   */
  iceStrengthBonusForSubtype?: { subtype: string; bonus: number };
  /** Trash this card when the run ends if it broke a sub this run (Mayfly). */
  trashAfterBreakingThisRun?: boolean;
  /** Gain this many credits when any agenda is scored or stolen (Pantograph). */
  creditsOnScoreOrSteal?: number;
  /** Zahya: gain 1¢ per access when HQ/R&D run ends (once per turn). */
  creditsPerAccessOnCentralRunEnd?: boolean;
  /** Run event metadata (played events that start a run). */
  runEvent?: StartsRunSpec;
  /** With runEvent: playing without a server skips the run (Reprise may-run). */
  runEventOptional?: boolean;
  /** Trojan: must install hosted on a piece of ice. */
  installOnIce?: boolean;
  /** Pawn-class Caïssa advance after successful run while hosted. */
  caissaAdvanceOnSuccessfulRun?: boolean;
  /** Ice instance this card is hosted on (trojans). */
  hostId?: string;
  /** While hosted on ice, modify host ice strength (Monkeywrench). */
  hostStrengthModifier?: number;
  /**
   * While hosted on ice, modify host strength by this × virus counters on
   * this card (Chisel).
   */
  hostStrengthPerVirusCounter?: number;
  /**
   * While hosted on ice, modify strength of each other ice protecting the
   * same server (Monkeywrench).
   */
  otherIceProtectingServerStrengthModifier?: number;
  /** Hush: while hosted, host ice loses abilities (not printed subs). */
  blanksHostAbilities?: boolean;
  /**
   * Flux Capacitor: first break during an encounter with host ice → may charge
   * an installed card.
   */
  chargeOnFirstBreakDuringHostEncounter?: boolean;
  /** Tranquilizer: derez host when virus counters reach this threshold. */
  derezHostAtVirus?: number;
  /** Amaze: give this many tags at run end if an agenda was stolen (persistent). */
  tagsIfAgendaStolenThisRun?: number;
  /** Manegarm: approach-server tax alternatives (Runner must pay one or ETR). */
  approachServerTax?: { clicks: number; credits: number };
  /**
   * Cayambe Grid: end the run unless Runner pays `N` credits × count of
   * advanced ice protecting this server.
   */
  approachServerEtrUnlessCreditsPerAdvancedIce?: number;
  /**
   * Swift: gain [click] the first time each turn a run event is played.
   */
  gainClickOnFirstRunEventThisTurn?: boolean;
  /** Karunā: after this 0-based sub index resolves, Runner may jack out. */
  offerJackOutAfterSub?: number;
  /** Carnivore: once per turn, trash N from grip to trash the accessed card. */
  accessTrashFromGrip?: { gripCards: number; oncePerTurn?: boolean };
  /** Pantograph: after ¢ on score/steal, may install from grip. */
  mayInstallOnScoreOrSteal?: boolean;
  /** Tāo: when agenda scored/stolen, may swap two installed ice. */
  maySwapIceOnAgendaScoredOrStolen?: boolean;
  /** Malapert: when agenda scored from this server, search R&D for non-agenda. */
  searchRdNonAgendaOnScoreFromServer?: boolean;
  /** +1 strength per hosted advancement (Ice Wall). */
  strengthPerAdvancement?: number;
  /** Sandstone: strength modifier per hosted virus counter. */
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
  /** Wraparound: +bonus unless Runner has an installed program of subtype. */
  strengthBonusIfNoInstalledSubtype?: { subtype: string; bonus: number };
  /** Lotus Field: ice strength cannot be lowered. */
  strengthCannotBeLowered?: boolean;
  /** Ice Carver: while encountering ice, modify ice strength. */
  runnerEncounterIceStrengthModifier?: number;
  /**
   * NEXT Bronze-class: +bonus strength for each rezzed ice (any server,
   * including self) with `subtype`.
   */
  strengthBonusPerRezzedIceWithSubtype?: { subtype: string; bonus: number };
  /**
   * MirrorMorph: when the third distinct Corp action this turn completes.
   */
  mirrormorphOnThirdDistinctAction?: Effect;
  /**
   * Direct Access: while resolving (including the run), blank both identities.
   */
  blankIdentitiesWhileResolving?: boolean;
  /** Nebula-class dual identity: runtime flipped state. */
  identityFlipped?: boolean;
  /**
   * Méliès U: secretly chosen back face (hq / rd / archives) while still
   * showing Only the Brightest.
   */
  meliesChosenBackFace?: "hq" | "rd" | "archives";
  /** Méliès U: flip on successful Runner central run. */
  flipIdentityOnSuccessfulCentralRun?: boolean;
  /** Nebula / Méliès / Earth Station: effects while `identityFlipped` is true. */
  identityFlippedHooks?: {
    onFirstOperationPlayThisTurn?: Effect;
    onSuccessfulHqOrRdRun?: Effect;
    /** Earth Station: successful HQ run while flipped → unflip. */
    onSuccessfulHqRun?: Effect;
    onFlipToBackIfRunMatchesFace?: Effect;
    onRunnerDiscardPhaseEnd?: Effect;
  };
  /**
   * Earth Station: additional credits to initiate a run, gated by face
   * (CR 1.16.1b / 4.6.8f).
   */
  additionalRunInitiateCredits?: {
    hqUnflipped?: number;
    remoteFlipped?: number;
  };
  /**
   * Reduced Service / Cold Site Server: per hosted power counter, additional
   * credits and/or clicks to initiate a run on this server (rezzed root).
   */
  additionalRunInitiatePerPowerCounter?: {
    credits?: number;
    clicks?: number;
  };
  /** Ruhr Valley: flat additional clicks to initiate a run on this server. */
  additionalRunInitiateClicks?: number;
  /**
   * Reduced Service: when rezzed, may spend up to `max` credits to place that
   * many power counters.
   */
  rezSpendCreditsForPowerCounters?: { max: number };
  /**
   * Project Vacheron: when added to Runner score from anywhere except
   * Archives, instead add with 4 agenda counters (CR 9.9.9c).
   */
  vacheronStealReplacement?: boolean;
  /**
   * While in Runner score with ≥1 agenda counters, contribute 0 AP
   * (Project Vacheron).
   */
  worthZeroAgendaPointsWhileHasAgendaCounters?: boolean;
  /** Isaac: each advanced ice protecting this server gets +N strength. */
  advancedIceProtectingThisServerStrengthBonus?: number;
  /** Brasília: once/turn on rez ice protecting this server during a run. */
  oncePerTurnOnRezIceProtectingThisServerDuringRun?: {
    mayDerezOtherIceForStrengthBonus: number;
  };
  /** Lycian: derez at end of any turn while rezzed. */
  derezAtAnyTurnEnd?: boolean;
  /** Server this agenda was scored from (Lightning). */
  scoredFromServerId?: ServerId;
  /** Subtypes gained via Lycian choose while rezzed. */
  lycianGainedSubtypes?: string[];
  /** Amelia: on HQ/R&D run end if accessed ≥ min, place amount power. */
  powerOnHqRdRunEndIfAccessedGte?: { min: number; amount: number };
  /** Manuel: +N access on HQ/R&D breach while tagged. */
  bonusAccessOnHqRdBreachWhileTagged?: number;
  /** Docklands Pass: first HQ breach each turn → +N access. */
  bonusAccessOnFirstHqBreachThisTurn?: number;
  /** HQ Interface: whenever you breach HQ, +N access. */
  bonusAccessOnHqBreach?: number;
  /** R&D Interface: whenever you breach R&D, +N access. */
  bonusAccessOnRdBreach?: number;
  /**
   * While rezzed: after each Corp action of a given type, if that type's
   * count this turn is exactly 3, gain 1 click (Wage Workers).
   */
  wageWorkersTrackActions?: true;
  /**
   * MirrorMorph: track distinct Corp action kinds; fire
   * `mirrormorphOnThirdDistinctAction` after the third distinct completes.
   */
  mirrormorphTrackDistinctActions?: true;
  /** Ken Express: gain this many credits on first run event each turn. */
  gainCreditOnFirstRunEvent?: number;
  /** Jinteki PE: net damage on agenda score/steal. */
  netDamageOnAgendaScoredOrStolen?: number;
  /** NEH: draw when creating first remote each turn. */
  drawOnFirstRemoteCreated?: number;
  /** Weyland BABW: gain credit when playing a transaction. */
  gainCreditOnTransactionPlayed?: number;
  /** Kit: first encounter each turn, ice gains code gate. */
  firstEncounterGainsCodeGate?: boolean;
  /** Clot: Corp cannot score agendas installed this turn. */
  forbidScoreAgendaInstalledThisTurn?: boolean;
  /** Vulnerability Audit: this agenda cannot be scored if installed this turn. */
  cannotScoreIfInstalledThisTurn?: boolean;
  /** Pseudo-agenda in a score area that cannot be forfeited (Word on the Street). */
  cannotForfeit?: boolean;
  /** NRDB uniqueness (♦). */
  unique?: boolean;
  /** Limit 1 console. Also enforced by the console subtype. */
  maxConsole?: boolean;
  /**
   * Hackerspace: may host unique companion/connection resources at a credit
   * discount.
   */
  hostsUniqueCompanionOrConnectionResources?: { creditDiscount: number };
  /**
   * Hackerspace: +N max hand size while hosting both a companion and a
   * connection.
   */
  handSizeBonusIfHostingCompanionAndConnection?: number;
  /** Clot: trash when Corp purges viruses (flag only until purge exists). */
  trashOnVirusPurge?: boolean;
  /** Cupellation: max faceup hosted Corp cards. */
  maxHostedCards?: number;
  /** Cupellation: mid-access pay credits to host non-agenda faceup. */
  accessHostNonAgendaFaceup?: { creditCost: number };
  /** Power counters (Earthrise). */
  powerCounters?: number;
  /** Power was hosted, so reaching 0 can trash the card. */
  powerHosted?: boolean;
  powerCountersOnInstall?: number;
  /** Perfect Recall: load power counters when rezzed. */
  powerCountersOnRez?: number;
  trashWhenPowerEmpty?: boolean;
  trashWhenPowerCountersEmpty?: boolean;
  /** Server Diagnostics: trash this card when the Corp installs any ice. */
  trashSelfOnCorpIceInstall?: boolean;
  /**
   * Muse-class daemon: programs hosted on this card (via hostId) do not
   * count toward used memory.
   */
  daemonHost?: boolean;
  /** Djinn: max total MU of hosted programs. */
  daemonHostMaxMu?: number;
  /** Djinn: exclude icebreakers from hosting. */
  daemonHostExcludeIcebreaker?: boolean;
  /** Medium: choose bonus access < virus on R&D breach. */
  chooseBonusAccessLessThanVirusOnRdBreach?: boolean;
  /** Nerve Agent: choose bonus access < virus on HQ breach. */
  chooseBonusAccessLessThanVirusOnHqBreach?: boolean;
  /**
   * Snitch: once per run when approaching unrezzed ice, may expose then
   * may jack out.
   */
  mayExposeApproachedUnrezzedIceOncePerRunThenMayJackOut?: boolean;
  /** Personal Workshop host resource. */
  personalWorkshop?: boolean;
  /** Woodcutter: canAdvance only while rezzed. */
  canAdvanceOnlyWhenRezzed?: boolean;
  /** Joshua B.: take 1 tag at Runner turn end after gaining the click. */
  tagAtTurnEnd?: boolean;
  mayRezWhenCardWouldBeExposed?: boolean;
  /** Malandragem: RFG when hosted power counters reach 0. */
  rfgWhenPowerEmpty?: boolean;
  /** Public Support: score as agenda when hosted power counters reach 0. */
  scoreWhenPowerEmpty?: { agendaPoints: number };
  /**
   * Hosted bad publicity counters (Superdeep Borehole). Not player BP until
   * taken via take_hosted_bad_publicity (CR §1.13.3).
   */
  badPublicityCounters?: number;
  /** Load this many hosted BP counters when rezzed. */
  badPublicityCountersOnRez?: number;
  /** While rezzed, Corp wins when hosted BP counters reach 0. */
  winWhenBadPublicityCountersEmpty?: boolean;
  /**
   * Ice gains an ETR subroutine before printed ones per hosted power
   * counter (Envelopment).
   */
  etrSubroutinesPerPowerCounter?: boolean;
  /** When any harmonic ice is rezzed, place 1 power counter on this ice (Echo). */
  powerCounterOnHarmonicIceRez?: boolean;
  /**
   * First spend of credits from an installed card each turn places 1 power
   * on this card (The Twinning).
   */
  powerOnFirstInstalledCardCreditSpendThisTurn?: boolean;
  /**
   * When breaching HQ/R&D, remove up to this many power counters for that many
   * bonus accesses (The Twinning).
   */
  removePowerForBonusAccessOnHqRdBreach?: number;
  /** Printed subroutines before dynamic ETR expansion (runtime). */
  baseSubroutines?: Subroutine[];
  /** Hive: lose one printed subroutine per Corp agenda point, from the last. */
  dynamicEtrSubroutineCountFromCorpAgendaPoints?: boolean;
  /** NEXT Silver-class: gain N ETR subs per rezzed ice with subtype. */
  dynamicEtrSubroutineCountFromRezzedIceSubtype?: string;
  /** Power Tap: gain N credits whenever a trace is initiated. */
  gainCreditsOnTraceInitiated?: number;
  /** Blackguard: force Corp rez on expose when able. */
  blackguardForceRezOnExpose?: boolean;
  /** Alpha: only interface with outermost ice on server. */
  breakerOnlyOutermostIce?: boolean;
  /** Omega: only interface with innermost ice on server. */
  breakerOnlyInnermostIce?: boolean;
  /**
   * Lockdown: after play, remain faceup in corp:play-area until Corp's next
   * turn begins; trash at that turn-begin checkpoint before pending
   * conditionals (CR 8.6.6c / 3.5.1c).
   */
  lingerUntilCorpNextTurnBegins?: boolean;
  lingerAsCurrent?: boolean;
  currentTrashOnAgendaStolen?: boolean;
  /**
   * The card was converted into a counter or an agenda. CR 10.3.1k restores
   * its printed characteristics once it is in a discard pile.
   */
  convertedInto?: "counter" | "agenda";
  currentTrashOnAgendaScored?: boolean;
  blankRunnerIdentityPrintedAbilities?: boolean;
  limitOnePerServer?: boolean;
  runnerLosesAllCreditsOnClickLossDuringRunOnThisServer?: boolean;
  whileScoredIceSubtypeStrengthBonus?: { subtype: string; bonus: number };
  firstEncounteredIceStrengthPenaltyThisRun?: number;
  corpMaxIceInstallsPerTurn?: number;
  strengthPerCorpCardInHq?: number;
  jackOutOnThisServerTrashRunnerProgram?: boolean;
  runnerCannotPlayCurrentEvents?: boolean;
  morphOddAdvancementSubtypeSwap?: { gain: string; lose: string };
  supplierHost?: boolean;
  trashSelfWhenRunnerTagged?: boolean;
  /** Hostile Infrastructure: N net damage whenever Runner trashes a Corp card. */
  netDamageWheneverRunnerTrashesCorpCard?: number;
  /** Ekomind: memory limit equals grip size. */
  memoryLimitEqualsGripSize?: boolean;
  gainCreditsOnCreateServer?: number;
  whileScoredStealAdditionalCreditsPerAdvancement?: number;
  gainCreditsWhenCorpLosesCredits?: number;
  drawWhenCorpRezzesIce?: number;
  strengthBonusPerUnusedMu?: number;
  gainCreditsOnJackOut?: number;
  additionalCreditsToAccessRemoteRoot?: number;
  gainCreditsOnSpendAgendaCounter?: number;
  badPublicityOnRez?: number;
  firstRunnerInstallTrashFromGripEachTurn?: boolean;
  iceProtectingThisServerAdditionalAdvancementCounters?: number;
  firstAccessedOperationTrashFreeEachTurn?: boolean;
  corpStartsWithBadPublicity?: number;
  corpHandSizeBonusPerBadPublicity?: number;
  placeVirusCounterWhenInstalledCorpCardTrashed?: boolean;
  hivemindSharesVirusCounters?: boolean;
  daemonHostVirusProgramsOnly?: boolean;
  preventOneVirusPurgeOnHostedProgram?: boolean;
  muBonusOnlyForVirusPrograms?: boolean;
  /** I've Had Worse: its trashed-from-grip ability is met only when net or meat damage trashes it. */
  trashFromGripTriggerOnlyByNetOrMeatDamage?: boolean;
  archivesAccessMayRfgInstead?: { oncePerArchivesBreach: boolean };
  playersCannotTrashThisIce?: boolean;
  dynamicEtrSubroutineCountFromCorpHandSize?: boolean;
  handSizeBonusPerInstalledCopyWithSameDefId?: number;
  trashSelfOnUnsuccessfulRunThisTurn?: boolean;
  trashWhenHostedCreditsEmpty?: boolean;
  /** Hosted agenda counters (scored agendas). */
  agendaCounters?: number;
  /** +agenda points per hosted agenda counter (Beale). */
  agendaPointsPerAgendaCounter?: number;
  /** Domestic Sleepers: worth this many more agenda points while it has at least 1 agenda counter. */
  agendaPointsWhileHasAgendaCounter?: number;
  /** Ice cannot be broken by AI programs. */
  cannotBreakWithAi?: boolean;
  /** Ice cannot be broken by AI while advancements >= threshold (Hortum). */
  cannotBreakWithAiAtAdvancements?: number;
  /** Semak-samun: only breakers with this subtype may break printed subs. */
  cannotBreakExceptSubtype?: string;
  /** Kessleroid: Runner cannot trash while rezzed. */
  cannotBeTrashedByRunnerWhileRezzed?: boolean;
  /** Scatter Field: +N strength when sole ice protecting server. */
  strengthBonusIfSoleIceProtectingServer?: number;
  /** Gatekeeper: +N strength while this ice was rezzed this turn. */
  strengthBonusIfRezzedThisTurn?: number;
  /** Public Access Plaza: Threat N → give tags when Runner trashes while rezzed. */
  threatGiveTagsOnRezzedTrash?: { level: number; tags: number };
  /** Runner card abilities cannot break this ice's subs (Trieste lock). */
  cannotBreakWithRunnerCardAbilities?: boolean;
  /** Install this agenda faceup (public). */
  installFaceup?: boolean;
  /** Credits gained when this card is advanced. */
  creditsOnAdvance?: { default: number; atOrAbove?: number; bonus?: number };
  /** Reduce agenda advancement requirement in this server (SanSan). */
  advancementRequirementReduction?: number;
  /**
   * Runner resource: increase every agenda's advancement requirement by this
   * amount while installed (The Source).
   */
  agendaAdvancementRequirementBonus?: number;
  /**
   * Runner resource: increase every agenda's advancement requirement while
   * installed with at least `threshold` hosted virus counters (Chakana).
   */
  agendaAdvancementRequirementBonusIfVirusCountersGte?: {
    threshold: number;
    bonus: number;
  };
  /** Runs against this server cannot be declared successful (Crisium). */
  runsCannotBeSuccessful?: boolean;
  /**
   * While rezzed on the attacked server, Runner may access at most this many
   * cards other than this upgrade (Flagship).
   */
  maxAccessOtherThanSelf?: number;
  /**
   * Continuous subtype grants for the 9.12 layer (standardization S6 / L1).
   */
  continuousSubtypeGrants?: Array<
    | { kind: "host_grant_bcs" }
    | { kind: "host_grant_barrier" }
    | { kind: "copy_other_rezzed_ice_subtypes" }
  >;
  /**
   * Static continuous gained-sub declarations (M6 / L2).
   */
  continuousGainedSubDecls?: ContinuousGainedSubDecl[];
  /**
   * Recurring credits may only be spent for these purposes.
   * `run_central` = any credit cost while attacking HQ / R&D / Archives
   * (Cezve-class; CR §1.10.5a / §6.3.4).
   */
  recurringSpendFor?: RecurringSpendPurpose[];
  /** Imp: mid-access trash accessed card by spending a virus counter. */
  accessTrashWithVirus?: boolean;
  /** Luana: return hosted BP to player when uninstalled. */
  returnHostedBadPublicityOnUninstall?: boolean;
  /**
   * DJ Fenris: while hosting an identity, this card gains that identity's
   * ability text (CR 1.5.4).
   */
  gainsTextOfHostedIdentity?: boolean;
  /**
   * DJ Fenris: on uninstall, return hosted identity to outside-game pile
   * (CR 1.5.4b), not the heap.
   */
  returnHostedIdentityToOutsideGameOnUninstall?: boolean;
  /** Let Them Dream: agenda points delta while in Runner score area. */
  agendaPointsModifierInRunnerScoreArea?: number;
  /** The Board: while active, each agenda in the Runner's score area is worth this many more points. */
  runnerScoredAgendaPointsModifier?: number;
  /** Perfect Recall: power on agenda scored/stolen from this server. */
  powerCounterOnAgendaScoredOrStolenFromThisServer?: number;
  /** Card may be advanced (assets/ice). */
  canAdvance?: boolean | "unrezzed";
  /** Double: play costs an additional click (Celebrity Gift). */
  playAdditionalClick?: boolean;
  /**
   * Extra clicks beyond the first when playing (triples = 2). When set,
   * overrides the boolean `playAdditionalClick` count.
   */
  playAdditionalClicks?: number;
  /** Terminal: end the action phase after resolving (Big Deal). */
  endsActionPhase?: boolean;
  /** Embolus: remove 1 power counter on any successful run. */
  removePowerCounterOnAnySuccessfulRun?: boolean;
  /** When this corp card would be trashed, may shuffle into R&D instead (Marilyn). */
  mayShuffleIntoRdWhenTrashed?: boolean;
  /** Bad publicity gained when this agenda is scored (Hostile Takeover). */
  badPublicityOnScore?: number;
  /** Install: spend remaining credits as X for X power counters (Atman). */
  installSpendCreditsForPowerCounters?: boolean;
  /** +1 strength per hosted power counter. */
  strengthPerPowerCounter?: boolean;
  /** On install, choose breaker subtype barrier/code gate/sentry (Chameleon). */
  chooseBreakerSubtypeOnInstall?: boolean;
  /** Return to grip during discard phase (Chameleon). */
  returnToGripAtDiscardPhase?: boolean;
  /** On install choose an ice; may pay to bypass that ice (Femme Fatale). */
  chooseIceOnInstallForBypass?: boolean;
  /**
   * On install choose an ice and store chosenIceId (Boomerang — no bypass;
   * use requireEncounterChosenIce on paid abilities).
   */
  chooseIceOnInstall?: boolean;
  /** Ice id chosen by Femme Fatale / Boomerang (runtime). */
  chosenIceId?: string;
  /** Hosted programs lose abilities while hosted here (Magnet). */
  hostedProgramsLoseAbilities?: boolean;
  /**
   * Hafrún: this Runner card's abilities cannot break subroutines for the
   * remainder of the current run.
   */
  cannotBreakSubsThisRun?: boolean;
  /**
   * Unsmiling Tsarevna: max printed subroutine breaks per encounter with this
   * ice for the remainder of the run.
   */
  maxPrintedSubsBreakablePerEncounter?: number;
  /** Security Testing: name a server at turn begin. */
  securityTesting?: boolean;
  /** Named server for Security Testing (runtime). */
  namedServerId?: ServerId;
  /**
   * Hyoubu Precog Manifold: server chosen on play (`choose_server`); used by
   * `attacking_chosen_server` on successful run.
   */
  chosenServerId?: ServerId;
  /** Daily Business Show: first draw each turn draws +1 then bottoms one. */
  interruptFirstDrawBottomOne?: boolean;
  /** Subliminal: first copy each turn gains [click]; Archives recursion. */
  subliminalMessaging?: boolean;
  /** Ayla: identity uses set-aside zone. */
  aylaSetAside?: boolean;
  /** Steve Cambridge: first successful HQ → heap multi-pick + Corp RFG. */
  steveCambridge?: boolean;
  /** Aesop: on turn begin may trash owned installed for 3¢. */
  aesopPawnshop?: boolean;
  /** Targeted Marketing current: gain 10¢ when the Runner plays/installs the named card. */
  targetedMarketing?: boolean;
  /** Card def id named by an effect (e.g. Targeted Marketing), stored on the source. */
  namedCardDefId?: string;
  /** Azmari EdTech: card type last named at Corp turn end (persists until renamed). */
  azmariNamedType?: string;
  /** Bounce to stack at end of turn (Test Run). */
  bounceToStackAtTurnEnd?: boolean;
  /**
   * While rezzed, when an encounter with ice protecting this server ends, if
   * the Runner broke ≥1 subroutine, they lose [click] (Mason Bellamy).
   */
  loseClickOnProtectingIceEncounterEndIfBroke?: boolean;
  /**
   * Corp identity: Runner cannot run remotes until they run a central this
   * turn (Jinteki: Replicating Perfection).
   */
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
  /**
   * Tyr's Hand: while unrezzed, may be rezzed as an interrupt when a
   * subroutine would be broken on bioroid ice protecting this server
   * (`break_interrupt`). While rezzed, provides a `[trash]` paid ability
   * (via `paidAbilities`) that prevents that pending break.
   */
  preventSubroutineBreakOnBioroidByTrash?: boolean;
  gainCreditsOnFirstRunnerClickSpendThisTurn?: number;
  refundCreditsIfRunBeginsOnThisServerDuringClickAction?: number;
  trashHostIfAllSubsBrokenThisEncounter?: boolean;
  /** Printed base link (CR 2.9.1), or link added by an installed card. */
  link?: number;
  /** Identity minimum deck size (CR 2.11.1). Deckbuilding only (CR 3.1.2). */
  minimumDeckSize?: number;
  /** Identity influence limit (CR 2.12.1). Deckbuilding only (CR 3.1.2). */
  influenceLimit?: number;
  /** Printed influence cost (CR 2.14.1). Absent when the card has no influence bar. */
  influence?: number;
  /** Explicit unsupported clause notes from card data. */
  unsupported?: string[];
  /** Whether the card is faceup (Runner cards / accessed / Archives). */
  faceup: boolean;
  /**
   * The player looking at this card while an ability resolves. Only that
   * player sees its face, whoever owns it (CR 1.21.2, CR 1.21.6).
   */
  lookedBy?: Side;
  /**
   * Revealed by the ability that is resolving. The card stays visible to
   * both players until that ability finishes or the card moves (CR 1.21.6).
   */
  revealing?: true;
  /** Corp installed cards: rezzed vs unrezzed. */
  rezzed: boolean;
  zone: ZoneId;
  /**
   * Server "this server" still names while an ability resolves after its
   * source left that server (CR 4.6.6i).
   */
  thisServerWhileResolving?: string;
}
