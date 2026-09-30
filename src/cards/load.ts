/**
 * Load and validate card definitions from vendored `vendor/cards-data/`
 * (fetched via `npm run fetch-cards` from the pinned netrunner-cards-data tag).
 * Fail closed on unknown Effect IR nodes.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateEffectTree,
  type Effect,
} from "../effects/ir.js";
import type {
  BreakerAbility,
  CardInstance,
  CardType,
  PaidAbility,
  Side,
  Subroutine,
} from "../state/types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const cardsDir = join(root, "vendor/cards-data");
const cardsPinPath = join(root, "data/cards-pin.json");

export interface CardsPin {
  tag: string;
  repo: string;
  rawBase: string;
  archiveUrl?: string;
  required?: string[];
}

export function loadCardsPin(): CardsPin {
  return JSON.parse(readFileSync(cardsPinPath, "utf8")) as CardsPin;
}

/** True when pin-required paths exist under vendor/cards-data/. */
export function cardsDataPresent(): boolean {
  if (!existsSync(join(cardsDir, "pool.json"))) return false;
  const pin = loadCardsPin();
  return (pin.required ?? ["pool.json"]).every((rel) =>
    existsSync(join(cardsDir, rel)),
  );
}

export function assertCardsDataPresent(): void {
  if (cardsDataPresent()) return;
  const pin = loadCardsPin();
  throw new Error(
    `Missing vendored card data under vendor/cards-data/. Run: npm run fetch-cards (pins ${pin.tag})`,
  );
}

export function assertCardsPinnedTag(expected = "v1.75.0"): void {
  const pin = loadCardsPin();
  if (pin.tag !== expected) {
    throw new Error(`Expected cards pin ${expected}, found ${pin.tag}`);
  }
  const vendorPinPath = join(cardsDir, "PIN.json");
  if (existsSync(vendorPinPath)) {
    const vendor = JSON.parse(readFileSync(vendorPinPath, "utf8")) as {
      tag: string;
    };
    if (vendor.tag !== expected) {
      throw new Error(`Vendor cards PIN.json tag ${vendor.tag} != ${expected}`);
    }
  }
}

/** Release directories scanned for card JSON (order is load-only; pool declares support). */
export const CARD_WAVE_DIRS = [
  "core",
  "what-lies-ahead",
  "trace-amount",
  "cyber-exodus",
  "a-study-in-static",
  "humanitys-shadow",
  "future-proof",
  "creation-and-control",
  "opening-moves",
  "stalwart",
  "mala-tempora",
  "true-colors",
  "fear-and-loathing",
  "double-time",
  "honor-and-profit",
  "upstalk",
  "the-spaces-between",
  "first-contact",
  "up-and-over",
  "all-that-remains",
  "the-source",
  "order-and-chaos",
  "the-valley",
  "breaker-bay",
  "chrome-city",
  "the-underway",
  "old-hollywood",
  "the-universe-of-tomorrow",
  "data-and-destiny",
  "kala-ghoda",
  "business-first",
  "democracy-and-dogma",
  "salsette-island",
  "the-liberated-mind",
  "fear-the-masses",
  "twenty-three-seconds",
  "blood-money",
  "escalation",
  "intervention",
  "martial-law",
  "quorum",
  "daedalus-complex",
  "station-one",
  "terminal-directive",
  "earths-scion",
  "blood-and-water",
  "free-mars",
  "crimson-dust",
  "revised-core",
  "sovereign-sight",
  "reign-and-reverie",
  "system-core-2019",
  "downfall",
  "uprising",
  "system-gateway",
  "system-update-2021",
  "midnight-sun",
  "parhelion",
  "the-automata-initiative",
  "rebellion-without-rehearsal",
  "elevation",
  "vantage-point",
  /** CR-example / host-test cards outside corpusOrder (e.g. Plascrete). */
  "fixtures",
] as const;

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
  subroutines?: Array<{
    id: string;
    text: string;
    effect: Effect;
    /** Zed 1.0: requires a lost click to break earlier this run. */
    requireLostClickToBreakThisRun?: boolean;
  }>;
  breaker?: BreakerAbility;
  paidAbilities?: PaidAbility[];
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
   * advancementTokens to steal an agenda (NAPD Cordon).
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
  /** Persistent: abilities work while installed unrezzed (Tucana). */
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
  /** Jesminder-class: prevent the first tag taken each turn. */
  preventFirstTagThisTurn?: boolean;
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
  nonAiIcebreakerInstallStrengthBonusThisTurn?: number;
  onFirstInstallInThisServerRootThisTurn?: Effect;
  gainsSubroutinesWhileProtectingHq?: Array<{ id: string; text: string; effect: Effect }>;
  gainsSubroutinesBeforePrintedPerFaceupArchives?: {
    subtype: string;
    type: string;
    per: number;
    subroutine: { id: string; text: string; effect: Effect };
  };
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
  maxPrintedSubsBreakablePerEncounterAtAdvancements?: { threshold: number; max: number };
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
  advancementRequirementReductionPerSameTitleAnywhere?: number;
  onAccessWhileUninstalled?: Effect;
  onAccessWhileInstalled?: Effect;
  onExposeWhileInstalled?: Effect;
  onAccessNotFromRd?: Effect;
  onFirstAdvancementOnServerThisTurn?: Effect;
  hapOncePerTurn?: boolean;
  onFirstNetDamageThisRunOnServer?: Effect;
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
  gainsSubroutinesPerAdvancement?: {
    subroutine: { id: string; text: string; effect: Effect };
  };
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
  runEvent?: import("../state/types.js").StartsRunSpec;
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
  hostGainsAllIceSubtypes?: boolean;
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
  /** Sub Boost: host ice gains barrier + ETR sub. */
  hostGainsBarrierAndEtrSubroutine?: boolean;
  /** Satellite Grid: ice protecting this server +N virtual advancements. */
  iceProtectingThisServerAdditionalAdvancementTokens?: number;
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
  /** Tour Guide: ETR sub per rezzed asset. */
  etrSubroutinesPerRezzedAsset?: boolean;
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
  zeroInfluenceIfNonAllianceFactionCardsGte?: { faction: string; threshold: number };
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
  /** Brainstorm */
  gainsSubroutinesOnEncounterEqualGripSize?: {
    id: string;
    text: string;
    effect: import("../effects/ir.js").Effect;
  };
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
  /** Wetwork Refit */
  hostGainsSubroutinesBeforePrinted?: Array<{
    id: string;
    text: string;
    effect: Effect;
  }>;
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
  gainsSubroutinesPerRezzedIceWithSubtype?: {
    subtype: string;
    subroutine: { id: string; text: string; effect: Effect };
  };
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
  onFirstBadPublicityTakeEachTurn?: Effect;
  onArchivesFacedownTurnedFaceupGte?: { min: number; effect: Effect };
  powerCounterOnAgendaScoredOrStolenFromThisServer?: number;
  canAdvance?: boolean;
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
  oncePerTurnPaidAbilities?: boolean;
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

export interface CardPool {
  version: number;
  description: string;
  agendaPointsToWinDefault: number;
  corpusOrder?: string[];
  waves: Record<
    string,
    { status: string; notes?: string; cards: string[] }
  >;
}

let catalogCache: Map<string, CardDef> | null = null;
let poolCache: CardPool | null = null;

function validateCardShape(raw: unknown, path: string): CardDef {
  if (!raw || typeof raw !== "object") {
    throw new Error(`${path}: card must be an object`);
  }
  const c = raw as Record<string, unknown>;
  for (const key of ["id", "title", "type", "side"] as const) {
    if (typeof c[key] !== "string") {
      throw new Error(`${path}: missing/invalid ${key}`);
    }
  }
  const checkEffect = (effect: unknown, label: string) => {
    if (effect === undefined) return;
    const err = validateEffectTree(effect, `${path}.${label}`);
    if (err) throw new Error(err);
  };
  if (Array.isArray(c.subroutines)) {
    for (let i = 0; i < c.subroutines.length; i++) {
      const sub = c.subroutines[i] as { effect?: unknown };
      checkEffect(sub.effect, `subroutines[${i}].effect`);
    }
  }
  if (
    c.gainsSubroutinesBeforePrintedPerFaceupArchives &&
    typeof c.gainsSubroutinesBeforePrintedPerFaceupArchives === "object"
  ) {
    const g = c.gainsSubroutinesBeforePrintedPerFaceupArchives as {
      subroutine?: { effect?: unknown };
    };
    checkEffect(
      g.subroutine?.effect,
      "gainsSubroutinesBeforePrintedPerFaceupArchives.subroutine.effect",
    );
  }
  if (
    c.gainsSubroutinesPerAdvancement &&
    typeof c.gainsSubroutinesPerAdvancement === "object"
  ) {
    const g = c.gainsSubroutinesPerAdvancement as {
      subroutine?: { effect?: unknown };
    };
    checkEffect(
      g.subroutine?.effect,
      "gainsSubroutinesPerAdvancement.subroutine.effect",
    );
  }
  if (Array.isArray(c.gainsSubroutinesWhileProtectingHq)) {
    for (let i = 0; i < c.gainsSubroutinesWhileProtectingHq.length; i++) {
      const sub = c.gainsSubroutinesWhileProtectingHq[i] as { effect?: unknown };
      checkEffect(sub.effect, `gainsSubroutinesWhileProtectingHq[${i}].effect`);
    }
  }
  if (Array.isArray(c.paidAbilities)) {
    for (let i = 0; i < c.paidAbilities.length; i++) {
      const ab = c.paidAbilities[i] as {
        effect?: unknown;
        startsRun?: { onSuccessfulRun?: unknown; onRunEnd?: unknown };
      };
      checkEffect(ab.effect, `paidAbilities[${i}].effect`);
      if (ab.startsRun?.onSuccessfulRun) {
        checkEffect(
          ab.startsRun.onSuccessfulRun,
          `paidAbilities[${i}].startsRun.onSuccessfulRun`,
        );
      }
      if (ab.startsRun?.onRunEnd) {
        checkEffect(
          ab.startsRun.onRunEnd,
          `paidAbilities[${i}].startsRun.onRunEnd`,
        );
      }
    }
  }
  if (c.runEvent && typeof c.runEvent === "object") {
    const re = c.runEvent as {
      onSuccessfulRun?: unknown;
      onRunEnd?: unknown;
    };
    checkEffect(re.onSuccessfulRun, "runEvent.onSuccessfulRun");
    checkEffect(re.onRunEnd, "runEvent.onRunEnd");
  }
  checkEffect(c.onInstallWithoutSpendingCredits, "onInstallWithoutSpendingCredits");
  checkEffect(c.onAccessFaceupInstalledAgenda, "onAccessFaceupInstalledAgenda");
  checkEffect(c.onCorpTurnEnd, "onCorpTurnEnd");
  checkEffect(c.onDiscardPhaseEnd, "onDiscardPhaseEnd");
  checkEffect(c.onWouldDrawOncePerTurn, "onWouldDrawOncePerTurn");
  checkEffect(
    c.onFirstTrashMatchingRunnerIdentityFactionEachTurn,
    "onFirstTrashMatchingRunnerIdentityFactionEachTurn",
  );
  checkEffect(c.onFirstRevealEachTurn, "onFirstRevealEachTurn");
  checkEffect(
    c.mirrormorphOnThirdDistinctAction,
    "mirrormorphOnThirdDistinctAction",
  );
  checkEffect(c.onCorpActionPhaseEnd, "onCorpActionPhaseEnd");
  checkEffect(c.onRunnerActionPhaseEnd, "onRunnerActionPhaseEnd");
  checkEffect(c.onAnyIceRez, "onAnyIceRez");
  checkEffect(
    c.onRunnerTrashFromThisServerRootOrProtecting,
    "onRunnerTrashFromThisServerRootOrProtecting",
  );
  checkEffect(
    c.onEncounterEndIfPrintedSubroutineBroken,
    "onEncounterEndIfPrintedSubroutineBroken",
  );
  checkEffect(c.onRezIceProtectingThisServer, "onRezIceProtectingThisServer");
  checkEffect(c.afterMandatoryDraw, "afterMandatoryDraw");
  checkEffect(c.onFirstEmptyGripEachTurn, "onFirstEmptyGripEachTurn");
  checkEffect(
    c.onFirstAgendaScoredOrStolenThisTurn,
    "onFirstAgendaScoredOrStolenThisTurn",
  );
  checkEffect(c.onRunBegin, "onRunBegin");
  checkEffect(c.onMovedToServerRoot, "onMovedToServerRoot");
  checkEffect(c.onRez, "onRez");
  checkEffect(c.onPlay, "onPlay");
  checkEffect(c.playAdditionalCost, "playAdditionalCost");
  checkEffect(c.onScore, "onScore");
  checkEffect(c.onGrayOrBlackOpsTrashedAfterResolve, "onGrayOrBlackOpsTrashedAfterResolve");
  checkEffect(c.onPassAllIceProtectingServer, "onPassAllIceProtectingServer");
  checkEffect(c.onSuccessfulRunThisServer, "onSuccessfulRunThisServer");
  checkEffect(c.onWouldTakeBadPublicity, "onWouldTakeBadPublicity");
  checkEffect(c.onForfeit, "onForfeit");
  checkEffect(c.scoreAdditionalCost, "scoreAdditionalCost");
  checkEffect(c.stealAdditionalCost, "stealAdditionalCost");
  checkEffect(c.trashAdditionalCost, "trashAdditionalCost");
  checkEffect(
    c.stealAdditionalCostFromProtectingServer,
    "stealAdditionalCostFromProtectingServer",
  );
  checkEffect(c.onSteal, "onSteal");
  checkEffect(c.onAgendaStolen, "onAgendaStolen");
  checkEffect(c.onPassRezzedIceProtectingThisServer, "onPassRezzedIceProtectingThisServer");
  checkEffect(c.onOtherAgendaStolen, "onOtherAgendaStolen");
  checkEffect(c.onFullyBreakOncePerTurn, "onFullyBreakOncePerTurn");
  checkEffect(c.onFullyBreak, "onFullyBreak");
  checkEffect(
    c.onSuccessfulRunOtherServerOncePerTurn,
    "onSuccessfulRunOtherServerOncePerTurn",
  );
  checkEffect(c.onSuccessfulRunEndOncePerTurn, "onSuccessfulRunEndOncePerTurn");
  checkEffect(c.onSuccessfulRunEnd, "onSuccessfulRunEnd");
  checkEffect(
    c.onSpendCreditsOutsidePoolDuringRunOncePerTurn,
    "onSpendCreditsOutsidePoolDuringRunOncePerTurn",
  );
  checkEffect(
    c.onFirstBadPublicityTakeEachTurn,
    "onFirstBadPublicityTakeEachTurn",
  );
  if (c.onArchivesFacedownTurnedFaceupGte) {
    checkEffect(
      (c.onArchivesFacedownTurnedFaceupGte as { effect?: unknown }).effect,
      "onArchivesFacedownTurnedFaceupGte.effect",
    );
  }
  if (
    c.firstEncounterGainsSubroutine &&
    typeof c.firstEncounterGainsSubroutine === "object"
  ) {
    const syn = c.firstEncounterGainsSubroutine as {
      effect?: unknown;
    };
    checkEffect(syn.effect, "firstEncounterGainsSubroutine.effect");
  }
  checkEffect(c.onEncounter, "onEncounter");
  checkEffect(c.onPass, "onPass");
  checkEffect(c.onBypass, "onBypass");
  checkEffect(c.onFirstProgramInstallEachTurn, "onFirstProgramInstallEachTurn");
  checkEffect(
    c.onFirstHardwareInstallEachTurn,
    "onFirstHardwareInstallEachTurn",
  );
  checkEffect(c.onFirstEncounterEachRun, "onFirstEncounterEachRun");
  checkEffect(c.onFirstCorpCardTrashEachTurn, "onFirstCorpCardTrashEachTurn");
  checkEffect(
    c.onFirstRunnerStoleOrTrashedCorpCardThisTurn,
    "onFirstRunnerStoleOrTrashedCorpCardThisTurn",
  );
  checkEffect(c.onAccessTrash, "onAccessTrash");
  checkEffect(
    c.onFirstCorpRootInstallEachTurn,
    "onFirstCorpRootInstallEachTurn",
  );
  checkEffect(c.onPassHost, "onPassHost");
  checkEffect(c.rezAdditionalCost, "rezAdditionalCost");
  checkEffect(c.onHostRezzed, "onHostRezzed");
  checkEffect(c.onHostDerezzed, "onHostDerezzed");
  checkEffect(c.onHostEncounter, "onHostEncounter");
  checkEffect(c.onApproachServer, "onApproachServer");
  checkEffect(c.onRunDeclaredOnThisServerIfTagged, "onRunDeclaredOnThisServerIfTagged");
  if (Array.isArray(c.hostGainsSubroutinesBeforePrinted)) {
    for (let i = 0; i < c.hostGainsSubroutinesBeforePrinted.length; i++) {
      const sub = c.hostGainsSubroutinesBeforePrinted[i] as {
        id?: string;
        effect?: unknown;
      };
      checkEffect(
        sub.effect,
        `hostGainsSubroutinesBeforePrinted[${i}].effect`,
      );
    }
  }
  checkEffect(c.onApproachIce, "onApproachIce");
  const flippedHooks = c.identityFlippedHooks as CardDef["identityFlippedHooks"];
  if (flippedHooks?.onFirstOperationPlayThisTurn) {
    checkEffect(
      flippedHooks.onFirstOperationPlayThisTurn,
      "identityFlippedHooks.onFirstOperationPlayThisTurn",
    );
  }
  if (flippedHooks?.onSuccessfulHqOrRdRun) {
    checkEffect(
      flippedHooks.onSuccessfulHqOrRdRun,
      "identityFlippedHooks.onSuccessfulHqOrRdRun",
    );
  }
  if (flippedHooks?.onSuccessfulHqRun) {
    checkEffect(
      flippedHooks.onSuccessfulHqRun,
      "identityFlippedHooks.onSuccessfulHqRun",
    );
  }
  checkEffect(
    c.onFirstHardwareUseDuringRunEachTurn,
    "onFirstHardwareUseDuringRunEachTurn",
  );
  checkEffect(
    c.onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun,
    "onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun",
  );
  if (flippedHooks?.onFlipToBackIfRunMatchesFace) {
    checkEffect(
      flippedHooks.onFlipToBackIfRunMatchesFace,
      "identityFlippedHooks.onFlipToBackIfRunMatchesFace",
    );
  }
  if (flippedHooks?.onRunnerDiscardPhaseEnd) {
    checkEffect(
      flippedHooks.onRunnerDiscardPhaseEnd,
      "identityFlippedHooks.onRunnerDiscardPhaseEnd",
    );
  }
  checkEffect(
    c.additionalCostOnScoreAgendaInstalledThisTurn,
    "additionalCostOnScoreAgendaInstalledThisTurn",
  );
  if (
    c.hostsUniqueCompanionOrConnectionResources &&
    typeof c.hostsUniqueCompanionOrConnectionResources === "object"
  ) {
    const h = c.hostsUniqueCompanionOrConnectionResources as {
      creditDiscount?: unknown;
    };
    if (typeof h.creditDiscount !== "number" || h.creditDiscount < 0) {
      throw new Error(
        `${path}.hostsUniqueCompanionOrConnectionResources.creditDiscount must be a non-negative number`,
      );
    }
  }
  checkEffect(
    c.onCreditsGainedFromAgendaOrOperationAbility,
    "onCreditsGainedFromAgendaOrOperationAbility",
  );
  checkEffect(c.onRunnerDiscardOverMaxHand, "onRunnerDiscardOverMaxHand");
  checkEffect(c.onTurnBegin, "onTurnBegin");
  checkEffect(c.onCorpTurnBegin, "onCorpTurnBegin");
  checkEffect(c.onGameStart, "onGameStart");
  checkEffect(c.onInstall, "onInstall");
  checkEffect(c.onUninstall, "onUninstall");
  checkEffect(c.onInstallFromNonHq, "onInstallFromNonHq");
  checkEffect(c.onRemoveTags, "onRemoveTags");
  checkEffect(
    c.onFirstAvoidOrRemoveTagThisTurn,
    "onFirstAvoidOrRemoveTagThisTurn",
  );
  checkEffect(
    c.onAgendaScoredFromThisServer,
    "onAgendaScoredFromThisServer",
  );
  checkEffect(
    c.onFirstSuccessfulRunOnRdEndsThisTurn,
    "onFirstSuccessfulRunOnRdEndsThisTurn",
  );
  checkEffect(
    c.onFirstProgramOrHardwareTrashEachTurn,
    "onFirstProgramOrHardwareTrashEachTurn",
  );
  checkEffect(c.onFirstAccessTrashEachTurn, "onFirstAccessTrashEachTurn");
  checkEffect(c.onRunnerTurnEnd, "onRunnerTurnEnd");
  checkEffect(c.onFirstIceRezEachTurn, "onFirstIceRezEachTurn");
  checkEffect(c.onSuccessfulRunOnThisServer, "onSuccessfulRunOnThisServer");
  checkEffect(c.onRunnerTurnBegin, "onRunnerTurnBegin");
  checkEffect(c.onEachCorpBadPublicityTake, "onEachCorpBadPublicityTake");
  checkEffect(c.onCorpTurnBeginIfRunnerUntagged, "onCorpTurnBeginIfRunnerUntagged");
  checkEffect(c.onTurnBeginIfCorpNoBadPublicity, "onTurnBeginIfCorpNoBadPublicity");
  checkEffect(c.onPowerCountersEmpty, "onPowerCountersEmpty");
  checkEffect(c.onPassUnrezzedIce, "onPassUnrezzedIce");
  checkEffect(c.onCorpBasicClickForCreditOrDraw, "onCorpBasicClickForCreditOrDraw");
  checkEffect(
    c.onFirstGripOrStackTrashBatchEachTurn,
    "onFirstGripOrStackTrashBatchEachTurn",
  );
  checkEffect(c.onFirstResourcePaidAbilityEachTurn, "onFirstResourcePaidAbilityEachTurn");
  checkEffect(c.onSuccessfulRun, "onSuccessfulRun");
  checkEffect(c.onSuccessfulRunOnRd, "onSuccessfulRunOnRd");
  checkEffect(c.onSuccessfulTraceDuringRun, "onSuccessfulTraceDuringRun");
  checkEffect(c.onBreakSubroutine, "onBreakSubroutine");
  if (
    c.onBreakSubroutineMayPayCreditsBreakAnother &&
    typeof c.onBreakSubroutineMayPayCreditsBreakAnother === "object"
  ) {
    const m = c.onBreakSubroutineMayPayCreditsBreakAnother as {
      credits?: unknown;
    };
    if (typeof m.credits !== "number" || m.credits < 0) {
      throw new Error(
        `${path}: onBreakSubroutineMayPayCreditsBreakAnother.credits must be a non-negative number`,
      );
    }
  }
  if (
    c.strengthBonusOnBreakSubForRun !== undefined &&
    typeof c.strengthBonusOnBreakSubForRun !== "number"
  ) {
    throw new Error(`${path}: strengthBonusOnBreakSubForRun must be a number`);
  }
  if (
    c.installedCardsTrashCostBonus !== undefined &&
    (typeof c.installedCardsTrashCostBonus !== "number" ||
      c.installedCardsTrashCostBonus < 0)
  ) {
    throw new Error(
      `${path}: installedCardsTrashCostBonus must be a non-negative number`,
    );
  }
  if (
    c.mayImmediatelyRezIceOnInstallProtectingThisServerDiscount !== undefined &&
    (typeof c.mayImmediatelyRezIceOnInstallProtectingThisServerDiscount !==
      "number" ||
      c.mayImmediatelyRezIceOnInstallProtectingThisServerDiscount < 0)
  ) {
    throw new Error(
      `${path}: mayImmediatelyRezIceOnInstallProtectingThisServerDiscount must be a non-negative number`,
    );
  }
  checkEffect(c.onAccess, "onAccess");
  checkEffect(c.onTrash, "onTrash");
  checkEffect(c.onTrashWhileAccessed, "onTrashWhileAccessed");
  checkEffect(c.onTrashFromGripOrStack, "onTrashFromGripOrStack");
  checkEffect(c.onVirusPurge, "onVirusPurge");
  checkEffect(c.onBreachHqIfHostingCorpCard, "onBreachHqIfHostingCorpCard");
  checkEffect(c.onBreachRd, "onBreachRd");
  if (c.accessHostNonAgendaFaceup && typeof c.accessHostNonAgendaFaceup === "object") {
    const ah = c.accessHostNonAgendaFaceup as { creditCost?: unknown };
    if (typeof ah.creditCost !== "number" || ah.creditCost < 0) {
      throw new Error(`${path}.accessHostNonAgendaFaceup.creditCost must be a non-negative number`);
    }
  }
  if (
    c.maxHostedCards !== undefined &&
    (typeof c.maxHostedCards !== "number" || c.maxHostedCards < 1)
  ) {
    throw new Error(`${path}.maxHostedCards must be a positive number`);
  }
  if (
    c.onWouldAccessArchivesHostInstead &&
    typeof c.onWouldAccessArchivesHostInstead === "object"
  ) {
    const w = c.onWouldAccessArchivesHostInstead as {
      oncePerArchivesBreach?: unknown;
    };
    if (
      w.oncePerArchivesBreach !== undefined &&
      typeof w.oncePerArchivesBreach !== "boolean"
    ) {
      throw new Error(
        `${path}.onWouldAccessArchivesHostInstead.oncePerArchivesBreach must be boolean`,
      );
    }
  }
  checkEffect(c.onRezzedCardTrashed, "onRezzedCardTrashed");
  checkEffect(c.onFirstTagThisTurn, "onFirstTagThisTurn");
  checkEffect(c.onTakeTagsWhenUntagged, "onTakeTagsWhenUntagged");
  checkEffect(c.onEncounterEndIfRezzedThisTurn, "onEncounterEndIfRezzedThisTurn");
  checkEffect(c.onEncounterEnd, "onEncounterEnd");
  checkEffect(c.onAfterOperationOrExpendable, "onAfterOperationOrExpendable");
  checkEffect(
    c.onFirstPassRezzedCodeGateOrSentryThisTurn,
    "onFirstPassRezzedCodeGateOrSentryThisTurn",
  );
  checkEffect(c.onFirstCoreDamageThisTurn, "onFirstCoreDamageThisTurn");
  checkEffect(c.onInstallProgramFromHeap, "onInstallProgramFromHeap");
  checkEffect(c.onSufferCoreDamage, "onSufferCoreDamage");
  checkEffect(c.onHostFullyBrokenThisEncounter, "onHostFullyBrokenThisEncounter");
  checkEffect(c.onFirstRdRunBeginThisTurn, "onFirstRdRunBeginThisTurn");
  checkEffect(
    c.onFirstArchivesRunBeginThisTurn,
    "onFirstArchivesRunBeginThisTurn",
  );
  checkEffect(c.onFirstRunBeginThisTurn, "onFirstRunBeginThisTurn");
  checkEffect(c.onFinishAccessRdOncePerTurn, "onFinishAccessRdOncePerTurn");
  checkEffect(c.onEncounterAnyIceOncePerTurn, "onEncounterAnyIceOncePerTurn");
  checkEffect(c.onUnsuccessfulRunOnThisServer, "onUnsuccessfulRunOnThisServer");
  checkEffect(c.onTurnBeginIfRunnerTagged, "onTurnBeginIfRunnerTagged");
  checkEffect(c.onFirstPassIceEachTurn, "onFirstPassIceEachTurn");
  checkEffect(c.onAdvance, "onAdvance");
  checkEffect(c.onStealAgenda, "onStealAgenda");
  checkEffect(c.onFirstRemoteInstallThisTurn, "onFirstRemoteInstallThisTurn");
  checkEffect(c.onFirstVirusInstallThisTurn, "onFirstVirusInstallThisTurn");
  checkEffect(c.onVirusProgramInstall, "onVirusProgramInstall");
  checkEffect(c.onFirstCorpCardInstallEachTurn, "onFirstCorpCardInstallEachTurn");
  if (
    c.remainderOfTurnOnInstallPrintedCostGte &&
    typeof c.remainderOfTurnOnInstallPrintedCostGte === "object"
  ) {
    const rem = c.remainderOfTurnOnInstallPrintedCostGte as {
      min?: unknown;
      effect?: unknown;
    };
    if (typeof rem.min !== "number" || rem.min < 1) {
      throw new Error(
        `${path}.remainderOfTurnOnInstallPrintedCostGte.min must be ≥ 1`,
      );
    }
    checkEffect(rem.effect, "remainderOfTurnOnInstallPrintedCostGte.effect");
  }
  checkEffect(
    c.onFirstSuccessfulMarkRunThisTurn,
    "onFirstSuccessfulMarkRunThisTurn",
  );
  checkEffect(
    c.onFirstSuccessfulHqRunThisTurn,
    "onFirstSuccessfulHqRunThisTurn",
  );
  checkEffect(
    c.onFirstSuccessfulCentralRunThisTurn,
    "onFirstSuccessfulCentralRunThisTurn",
  );
  checkEffect(
    c.onFirstSuccessfulRunThisTurn,
    "onFirstSuccessfulRunThisTurn",
  );
  checkEffect(
    c.onFirstUnsuccessfulRunThisTurn,
    "onFirstUnsuccessfulRunThisTurn",
  );
  checkEffect(c.onFirstInstallEachTurn, "onFirstInstallEachTurn");
  checkEffect(
    c.onFirstClickLossEachTurnExceptPaidAbility,
    "onFirstClickLossEachTurnExceptPaidAbility",
  );
  checkEffect(c.onFirstDamageEachTurn, "onFirstDamageEachTurn");
  checkEffect(
    c.onFirstBasicClickDrawEachTurn,
    "onFirstBasicClickDrawEachTurn",
  );
  checkEffect(c.onFullyBreakProtectingIce, "onFullyBreakProtectingIce");
  if (Array.isArray(c.identityFaceOptions)) {
    for (let i = 0; i < c.identityFaceOptions.length; i++) {
      const face = c.identityFaceOptions[i] as { onFlip?: unknown };
      checkEffect(face.onFlip, `identityFaceOptions[${i}].onFlip`);
    }
  }
  if (
    c.loseCreditsOnFirstAdvertisementRezThisTurn !== undefined &&
    (typeof c.loseCreditsOnFirstAdvertisementRezThisTurn !== "number" ||
      c.loseCreditsOnFirstAdvertisementRezThisTurn < 1)
  ) {
    throw new Error(
      `${path}.loseCreditsOnFirstAdvertisementRezThisTurn must be a positive number`,
    );
  }
  checkEffect(c.onProgramOrHardwareInstall, "onProgramOrHardwareInstall");
  checkEffect(c.onHardwareInstallOrTrash, "onHardwareInstallOrTrash");
  checkEffect(c.onHardwareInstall, "onHardwareInstall");
  if (c.onPowerCountersGte && typeof c.onPowerCountersGte === "object") {
    const gte = c.onPowerCountersGte as {
      amount?: unknown;
      effect?: unknown;
    };
    if (typeof gte.amount !== "number" || gte.amount < 0) {
      throw new Error(`${path}.onPowerCountersGte.amount must be a non-negative number`);
    }
    checkEffect(gte.effect, "onPowerCountersGte.effect");
  }
  if (c.onHostedCreditsGte && typeof c.onHostedCreditsGte === "object") {
    const gte = c.onHostedCreditsGte as {
      amount?: unknown;
      effect?: unknown;
    };
    if (typeof gte.amount !== "number" || gte.amount < 0) {
      throw new Error(
        `${path}.onHostedCreditsGte.amount must be a non-negative number`,
      );
    }
    checkEffect(gte.effect, "onHostedCreditsGte.effect");
  }
  checkEffect(c.onAgendaScored, "onAgendaScored");
  checkEffect(c.onAgendaScoredOrStolen, "onAgendaScoredOrStolen");
  if (c.breaker && typeof c.breaker === "object") {
    const br = c.breaker as Record<string, unknown>;
    if (typeof br.breaksSubtype !== "string") {
      throw new Error(`${path}.breaker.breaksSubtype required`);
    }
  }
  return c as unknown as CardDef;
}

function loadAllCardFiles(): Map<string, CardDef> {
  const map = new Map<string, CardDef>();
  assertCardsDataPresent();
  if (!existsSync(cardsDir)) {
    throw new Error(`Missing card data directory: ${cardsDir}`);
  }
  for (const wave of CARD_WAVE_DIRS) {
    const dir = join(cardsDir, wave);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      if (file.startsWith("_")) continue;
      const path = join(dir, file);
      const raw = JSON.parse(readFileSync(path, "utf8"));
      const def = validateCardShape(raw, path);
      if (map.has(def.id)) {
        throw new Error(`Duplicate card id ${def.id} in ${path}`);
      }
      map.set(def.id, def);
    }
  }
  return map;
}

export function loadCardCatalog(force = false): Map<string, CardDef> {
  if (!force && catalogCache) return catalogCache;
  catalogCache = loadAllCardFiles();
  return catalogCache;
}

export function loadCardPool(force = false): CardPool {
  if (!force && poolCache) return poolCache;
  const path = join(cardsDir, "pool.json");
  poolCache = JSON.parse(readFileSync(path, "utf8")) as CardPool;
  return poolCache;
}

export function getCardDef(id: string): CardDef {
  const def = loadCardCatalog().get(id);
  if (!def) {
    throw new Error(
      `Unknown card def "${id}". Add it to netrunner-cards-data or check pool.json.`,
    );
  }
  return def;
}

export function supportedCardIds(): string[] {
  const pool = loadCardPool();
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const wave of Object.values(pool.waves)) {
    if (wave.status !== "supported") continue;
    for (const id of wave.cards) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Instantiate a card from its data definition. */
export function instantiateCard(
  defId: string,
  instanceId: string,
  zone: CardInstance["zone"],
): CardInstance {
  const def = getCardDef(defId);
  const card: CardInstance = {
    id: instanceId,
    defId: def.id,
    title: def.title,
    type: def.type,
    side: def.side,
    installCost: def.installCost ?? 0,
    rezCost: def.rezCost,
    playCost: def.playCost,
    trashCost: def.trashCost,
    strength: def.strength,
    subtypes: def.subtypes ? [...def.subtypes] : undefined,
    agendaPoints: def.agendaPoints,
    advancementRequirement: def.advancementRequirement,
    advancementRequirementEqualsRunnerGrip:
      def.advancementRequirementEqualsRunnerGrip,
    advancementRequirementReductionPerTag:
      def.advancementRequirementReductionPerTag,
    advancementRequirementReductionPerCoreDamageThisGame:
      def.advancementRequirementReductionPerCoreDamageThisGame,
    advancementRequirementReductionPerBadPublicity:
      def.advancementRequirementReductionPerBadPublicity
        ? { ...def.advancementRequirementReductionPerBadPublicity }
        : undefined,
    advancementRequirementIncreasePerCorpBadPublicity:
      def.advancementRequirementIncreasePerCorpBadPublicity,
    advancementTokens: def.type === "agenda" ? 0 : undefined,
    recurringCreditsMax: def.recurringCreditsMax,
    recurringCreditsMaxEqualsRunnerLink: def.recurringCreditsMaxEqualsRunnerLink,
    recurringCreditsMaxEqualsVirusCounters:
      def.recurringCreditsMaxEqualsVirusCounters,
    recurringCreditsMaxEqualsRemoteServers:
      def.recurringCreditsMaxEqualsRemoteServers,
    recurringCreditsMaxEqualsIceProtectingHq:
      def.recurringCreditsMaxEqualsIceProtectingHq,
    startingHandSize: def.startingHandSize,
    playRequiresVirusCounterPlacedOnProgramThisTurn:
      def.playRequiresVirusCounterPlacedOnProgramThisTurn,
    recurringCredits:
      def.recurringCreditsMax !== undefined ||
      def.recurringCreditsMaxEqualsRunnerLink ||
      def.recurringCreditsMaxEqualsVirusCounters ||
      def.recurringCreditsMaxEqualsRemoteServers ||
      def.recurringCreditsMaxEqualsIceProtectingHq
        ? 0
        : undefined,
    hostedCreditsOnInstall: def.hostedCreditsOnInstall,
    hostedCredits: undefined,
    virusCounters: undefined,
    strengthBonusProtectingRemote: def.strengthBonusProtectingRemote,
    strengthBonusProtectingArchives: def.strengthBonusProtectingArchives,
    strengthBonusProtectingRd: def.strengthBonusProtectingRd,
    strengthBonusProtectingHq: def.strengthBonusProtectingHq,
    strengthBonusWhileTagged: def.strengthBonusWhileTagged,
    maxPrintedSubsBreakExceptSubtype: def.maxPrintedSubsBreakExceptSubtype,
    paidAbilityCreditDiscountIfOwnInstalledTrashedThisTurn:
      def.paidAbilityCreditDiscountIfOwnInstalledTrashedThisTurn,
    maxInstalledRunnerTrashesPerEncounter:
      def.maxInstalledRunnerTrashesPerEncounter,
    strengthBonusAtAdvancements: def.strengthBonusAtAdvancements
      ? { ...def.strengthBonusAtAdvancements }
      : undefined,
    maxPrintedSubsBreakablePerEncounterAtAdvancements:
      def.maxPrintedSubsBreakablePerEncounterAtAdvancements
        ? { ...def.maxPrintedSubsBreakablePerEncounterAtAdvancements }
        : undefined,
    handSizeBonus: def.handSizeBonus,
    handSizePerPowerCounter: def.handSizePerPowerCounter,
    runnerHandSizePenaltyPerPowerCounter:
      def.runnerHandSizePenaltyPerPowerCounter,
    runnerHandSizeBonus: def.runnerHandSizeBonus,
    handSizeEqualsCredits: def.handSizeEqualsCredits,
    advancementRequirementReductionPerSameTitleAnywhere:
      def.advancementRequirementReductionPerSameTitleAnywhere,
    cannotBeBypassed: def.cannotBeBypassed,
    corpPlayCostIncreaseForRunnerEventsOps:
      def.corpPlayCostIncreaseForRunnerEventsOps,
    trashSelfWhenInstalledProgramTrashed:
      def.trashSelfWhenInstalledProgramTrashed,
    powerCountersOnInstallFromUnusedMu: def.powerCountersOnInstallFromUnusedMu,
    recurringSpendForPlayEventSubtypes: def.recurringSpendForPlayEventSubtypes,
    allottedClicksBonus: def.allottedClicksBonus,
    giveStrengthToInstalledIcebreakers: def.giveStrengthToInstalledIcebreakers
      ? { ...def.giveStrengthToInstalledIcebreakers }
      : undefined,
    hostIcebreakerStrengthBonus: def.hostIcebreakerStrengthBonus,
    extendsHostBreakerPumpToRun: def.extendsHostBreakerPumpToRun,
    hostedCardsPlayableAsGrip: def.hostedCardsPlayableAsGrip,
    powerCounterOnDamageOrTrashFromHq: def.powerCounterOnDamageOrTrashFromHq,
    mayInstallAgendasFaceup: def.mayInstallAgendasFaceup,
    rfgOnUninstall: def.rfgOnUninstall,
    memoryCost:
      def.memoryCost ?? (def.type === "program" ? 1 : undefined),
    memoryCostZeroIfLinkGte: def.memoryCostZeroIfLinkGte,
    muBonus: def.muBonus,
    muBonusOnlyForCaissaPrograms: def.muBonusOnlyForCaissaPrograms,
    triggerCaissaClickAbilityOnCaissaInstall:
      def.triggerCaissaClickAbilityOnCaissaInstall,
    strengthBonusPerIcebreaker: def.strengthBonusPerIcebreaker,
    strengthBonusPerHeapSubtype: def.strengthBonusPerHeapSubtype
      ? { ...def.strengthBonusPerHeapSubtype }
      : undefined,
    installCostDiscountPerInstalledIcebreaker:
      def.installCostDiscountPerInstalledIcebreaker,
    strengthBonusPerCoreDamageThisGame: def.strengthBonusPerCoreDamageThisGame,
    threatStrengthBonus: def.threatStrengthBonus
      ? { ...def.threatStrengthBonus }
      : undefined,
    threatCannotSpendCreditsDuringSubs: def.threatCannotSpendCreditsDuringSubs,
    installCostDiscountIfSuccessfulRunThisTurn:
      def.installCostDiscountIfSuccessfulRunThisTurn,
    installCostDiscountIfSuccessfulHqRunThisTurn:
      def.installCostDiscountIfSuccessfulHqRunThisTurn,
    firstProgramInstallDiscount: def.firstProgramInstallDiscount,
    firstJobConnectionOrHardwareInstallDiscount:
      def.firstJobConnectionOrHardwareInstallDiscount,
    firstProgramOrHardwareInstallDiscount:
      def.firstProgramOrHardwareInstallDiscount,
    iceProtectingThisServerStrengthBonus:
      def.iceProtectingThisServerStrengthBonus,
    trashHostWhenStrengthLte: def.trashHostWhenStrengthLte,
    placeVirusCounterOnInstalledVirusProgram:
      def.placeVirusCounterOnInstalledVirusProgram,
    playRequiresScoredAgendaThisTurn: def.playRequiresScoredAgendaThisTurn,
    amplifyNetDamageOnTrashChosenEncounterType:
      def.amplifyNetDamageOnTrashChosenEncounterType,
    drawOnHostedEmpty: def.drawOnHostedEmpty,
    clicksOnHostedEmpty: def.clicksOnHostedEmpty,
    playRequiresTagged: def.playRequiresTagged,
    playRequiresCreditsLt: def.playRequiresCreditsLt,
    playCostReducedByLink: def.playCostReducedByLink,
    playRequiresRunnerAccessedCardLastTurn:
      def.playRequiresRunnerAccessedCardLastTurn,
    rfgInsteadOfTrashing: def.rfgInsteadOfTrashing,
    playRequiresInstalledResource: def.playRequiresInstalledResource,
    playRequiresInstalledProgram: def.playRequiresInstalledProgram,
    playRequiresInstalledProgramOrHardware:
      def.playRequiresInstalledProgramOrHardware,
    playRequiresUntagged: def.playRequiresUntagged,
    coreDamageOnAgendaScoredFromThisServer:
      def.coreDamageOnAgendaScoredFromThisServer,
    mustRevealWhenAccessedFromRd: def.mustRevealWhenAccessedFromRd,
    skipOnAccessFromArchives: def.skipOnAccessFromArchives,
    playRequiresMinTags: def.playRequiresMinTags,
    faction: typeof def.faction === "string" ? def.faction : undefined,
    blankIdentitiesWhileResolving: def.blankIdentitiesWhileResolving,
    playRequiresRunnerAgendaPointsGte: def.playRequiresRunnerAgendaPointsGte,
    playRequiresSuccessfulRunLastTurn:
      def.playRequiresSuccessfulRunLastTurn,
    playRequiresUnsuccessfulRunLastTurn:
      def.playRequiresUnsuccessfulRunLastTurn,
    playRequiresRunnerMadeRunLastTurn:
      def.playRequiresRunnerMadeRunLastTurn,
    playRequiresRunnerInstalledResourceLastTurn:
      def.playRequiresRunnerInstalledResourceLastTurn,
    iceStrengthBonusForSubtype: def.iceStrengthBonusForSubtype
      ? { ...def.iceStrengthBonusForSubtype }
      : undefined,
    playRequiresNoSuccessfulHqRunLastTurn:
      def.playRequiresNoSuccessfulHqRunLastTurn,
    playRequiresAgendaStolenLastTurn: def.playRequiresAgendaStolenLastTurn,
    playRequiresRunnerStoleOrTrashedCorpCardLastTurn:
      def.playRequiresRunnerStoleOrTrashedCorpCardLastTurn,
    playRequiresRunnerTrashedCorpCardLastTurn:
      def.playRequiresRunnerTrashedCorpCardLastTurn,
    playRequiresCorpHasInstalledCard: def.playRequiresCorpHasInstalledCard,
    playRequiresAgendaStolenThisTurn: def.playRequiresAgendaStolenThisTurn,
    playRequiresFirstClick: def.playRequiresFirstClick,
    trashAfterBreakingThisRun: def.trashAfterBreakingThisRun,
    creditsOnScoreOrSteal: def.creditsOnScoreOrSteal,
    creditsPerAccessOnCentralRunEnd: def.creditsPerAccessOnCentralRunEnd,
    onAccessTrashGain: def.onAccessTrashGain
      ? { ...def.onAccessTrashGain }
      : undefined,
    runEvent: def.runEvent ? structuredClone(def.runEvent) : undefined,
    runEventOptional: def.runEventOptional,
    installOnIce: def.installOnIce,
    caissaAdvanceOnSuccessfulRun: def.caissaAdvanceOnSuccessfulRun,
    hostStrengthModifier: def.hostStrengthModifier,
    hostStrengthPerVirusCounter: def.hostStrengthPerVirusCounter,
    hostStrengthPerPowerCounter: def.hostStrengthPerPowerCounter,
    otherIceProtectingServerStrengthModifier:
      def.otherIceProtectingServerStrengthModifier,
    blanksHostAbilities: def.blanksHostAbilities,
    chargeOnFirstBreakDuringHostEncounter:
      def.chargeOnFirstBreakDuringHostEncounter,
    derezHostAtVirus: def.derezHostAtVirus,
    tagsIfAgendaStolenThisRun: def.tagsIfAgendaStolenThisRun,
    gainCreditsOnFirstMarkRunEndIfBreached:
      def.gainCreditsOnFirstMarkRunEndIfBreached,
    gainCreditsOnFirstCompanionInstallOrSpendThisTurn:
      def.gainCreditsOnFirstCompanionInstallOrSpendThisTurn,
    bioroidBreakGivesCorpAllottedClickNextTurn:
      def.bioroidBreakGivesCorpAllottedClickNextTurn,
    bioroidBreakMaxSubs: def.bioroidBreakMaxSubs,
    paidAbilitiesUseStealthCreditsOnly: def.paidAbilitiesUseStealthCreditsOnly,
    onSuccessfulHqRunMayPayForBonusAccess: def.onSuccessfulHqRunMayPayForBonusAccess
      ? { ...def.onSuccessfulHqRunMayPayForBonusAccess }
      : undefined,
    onSuccessfulRdRunMayPayForBonusAccess: def.onSuccessfulRdRunMayPayForBonusAccess
      ? { ...def.onSuccessfulRdRunMayPayForBonusAccess }
      : undefined,
    meatDamageOnInstalledCorpTrashOncePerTurn:
      def.meatDamageOnInstalledCorpTrashOncePerTurn,
    maySpendPowerCountersForBonusRdAccess:
      def.maySpendPowerCountersForBonusRdAccess
        ? { ...def.maySpendPowerCountersForBonusRdAccess }
        : undefined,
    powerOnScoreIfAgendaNotInstalledOrAdvancedThisTurn:
      def.powerOnScoreIfAgendaNotInstalledOrAdvancedThisTurn,
    agendaPointsToWinReductionPerPowerCounter:
      def.agendaPointsToWinReductionPerPowerCounter,
    agendaPointsToWinModifierBoth: def.agendaPointsToWinModifierBoth,
    creditsOnTrashFromThisServer: def.creditsOnTrashFromThisServer,
    approachServerTax: def.approachServerTax
      ? { ...def.approachServerTax }
      : undefined,
    approachServerEtrUnlessCreditsPerAdvancedIce:
      def.approachServerEtrUnlessCreditsPerAdvancedIce,
    onVirusPurgeOncePerTurn: def.onVirusPurgeOncePerTurn,
    gainClickOnFirstRunEventThisTurn: def.gainClickOnFirstRunEventThisTurn,
    playRequiresOtherGripCardsGte: def.playRequiresOtherGripCardsGte,
    remoteOnly: def.remoteOnly,
    persistent: def.persistent,
    serverRootAssetTrashCostBonus: def.serverRootAssetTrashCostBonus,
    corpCardTrashCostReduction: def.corpCardTrashCostReduction,
    rezOnlyDuringCorpTurn: def.rezOnlyDuringCorpTurn,
    firstRunCannotTargetRemote: def.firstRunCannotTargetRemote,
    iceGainsTrashToResolveChosenSubOnEncounter:
      def.iceGainsTrashToResolveChosenSubOnEncounter,
    firstEncounterSubsBecomeNetDamage: def.firstEncounterSubsBecomeNetDamage,
    trashWhenNoHostedCards: def.trashWhenNoHostedCards,
    hostedCardIds: undefined,
    deckLimit: def.deckLimit,
    offerJackOutAfterSub: def.offerJackOutAfterSub,
    accessTrashFromGrip: def.accessTrashFromGrip
      ? { ...def.accessTrashFromGrip }
      : undefined,
    mayInstallOnScoreOrSteal: def.mayInstallOnScoreOrSteal,
    mayRezIceIgnoringCostsOnScoreOrSteal:
      def.mayRezIceIgnoringCostsOnScoreOrSteal,
    maySwapIceOnAgendaScoredOrStolen: def.maySwapIceOnAgendaScoredOrStolen,
    searchRdNonAgendaOnScoreFromServer: def.searchRdNonAgendaOnScoreFromServer,
    strengthPerAdvancement: def.strengthPerAdvancement,
    strengthPerVirusCounter: def.strengthPerVirusCounter,
    sameServerIceStrengthBonus: def.sameServerIceStrengthBonus,
    rezAsNonIceDuringRunsOnServer: def.rezAsNonIceDuringRunsOnServer,
    strengthBonusIfNoInstalledSubtype: def.strengthBonusIfNoInstalledSubtype
      ? { ...def.strengthBonusIfNoInstalledSubtype }
      : undefined,
    strengthCannotBeLowered: def.strengthCannotBeLowered,
    runnerEncounterIceStrengthModifier: def.runnerEncounterIceStrengthModifier,
    firstIceRezCostIncrease: def.firstIceRezCostIncrease,
    iceRezCostIncrease: def.iceRezCostIncrease,
    iceRezCostIncreaseBySubtype: def.iceRezCostIncreaseBySubtype
      ? { ...def.iceRezCostIncreaseBySubtype }
      : undefined,
    iceRezCostIncreaseProtectingHostedServer:
      def.iceRezCostIncreaseProtectingHostedServer,
    strengthBonusPerRezzedIceWithSubtype: def.strengthBonusPerRezzedIceWithSubtype
      ? { ...def.strengthBonusPerRezzedIceWithSubtype }
      : undefined,
    iceRezCostReductionProtectingThisServer:
      def.iceRezCostReductionProtectingThisServer,
    iceRezCostReductionPerAgendaCounter:
      def.iceRezCostReductionPerAgendaCounter,
    installedCardsTrashCostBonus: def.installedCardsTrashCostBonus,
    mayImmediatelyRezIceOnInstallProtectingThisServerDiscount:
      def.mayImmediatelyRezIceOnInstallProtectingThisServerDiscount,
    strengthBonusOnBreakSubForRun: def.strengthBonusOnBreakSubForRun,
    onBreakSubroutineMayPayCreditsBreakAnother:
      def.onBreakSubroutineMayPayCreditsBreakAnother
        ? { ...def.onBreakSubroutineMayPayCreditsBreakAnother }
        : undefined,
    rootRezCostReductionThisServerIfThreat:
      def.rootRezCostReductionThisServerIfThreat
        ? { ...def.rootRezCostReductionThisServerIfThreat }
        : undefined,
    rezCostDiscountPerRezzedSubtype: def.rezCostDiscountPerRezzedSubtype
      ? { ...def.rezCostDiscountPerRezzedSubtype }
      : undefined,
    rezCostDiscountPerOtherUnrezzedIce: def.rezCostDiscountPerOtherUnrezzedIce,
    eventPlayCostDiscount: def.eventPlayCostDiscount,
    gainCreditOnFirstRunEvent: def.gainCreditOnFirstRunEvent,
    netDamageOnAgendaScoredOrStolen: def.netDamageOnAgendaScoredOrStolen,
    drawOnFirstRemoteCreated: def.drawOnFirstRemoteCreated,
    gainCreditOnTransactionPlayed: def.gainCreditOnTransactionPlayed,
    firstEncounterGainsCodeGate: def.firstEncounterGainsCodeGate,
    forbidScoreAgendaInstalledThisTurn: def.forbidScoreAgendaInstalledThisTurn,
    cannotScoreIfInstalledThisTurn: def.cannotScoreIfInstalledThisTurn,
    unique: def.unique,
    hostsUniqueCompanionOrConnectionResources:
      def.hostsUniqueCompanionOrConnectionResources
        ? { ...def.hostsUniqueCompanionOrConnectionResources }
        : undefined,
    handSizeBonusIfHostingCompanionAndConnection:
      def.handSizeBonusIfHostingCompanionAndConnection,
    flipIdentityOnSuccessfulCentralRun: def.flipIdentityOnSuccessfulCentralRun,
    trashOnVirusPurge: def.trashOnVirusPurge,
    maxHostedCards: def.maxHostedCards,
    accessHostNonAgendaFaceup: def.accessHostNonAgendaFaceup
      ? { ...def.accessHostNonAgendaFaceup }
      : undefined,
    onWouldAccessArchivesHostInstead: def.onWouldAccessArchivesHostInstead
      ? { ...def.onWouldAccessArchivesHostInstead }
      : undefined,
    powerCountersOnInstall: def.powerCountersOnInstall,
    powerCountersOnRez: def.powerCountersOnRez,
    trashWhenPowerEmpty: def.trashWhenPowerEmpty,
    lingerAsCurrent: def.lingerAsCurrent,
    currentTrashOnAgendaStolen: def.currentTrashOnAgendaStolen,
    currentTrashOnAgendaScored: def.currentTrashOnAgendaScored,
    runnerFirstRunEachTurnAdditionalCost: def.runnerFirstRunEachTurnAdditionalCost,
    blankRunnerIdentityPrintedAbilities: def.blankRunnerIdentityPrintedAbilities,
    limitOnePerServer: def.limitOnePerServer,
    runnerLosesAllCreditsOnClickLossDuringRunOnThisServer:
      def.runnerLosesAllCreditsOnClickLossDuringRunOnThisServer,
    whileScoredIceSubtypeStrengthBonus: def.whileScoredIceSubtypeStrengthBonus,
    ignoreInstallCostFirstIceEachTurn: def.ignoreInstallCostFirstIceEachTurn,
    firstEncounteredIceStrengthPenaltyThisRun:
      def.firstEncounteredIceStrengthPenaltyThisRun,
    corpMaxIceInstallsPerTurn: def.corpMaxIceInstallsPerTurn,
    strengthPerCorpCardInHq: def.strengthPerCorpCardInHq,
    rezCostIncreasePerCorpCardInHq: def.rezCostIncreasePerCorpCardInHq,
    jackOutOnThisServerTrashRunnerProgram:
      def.jackOutOnThisServerTrashRunnerProgram,
    runnerCannotPlayCurrentEvents: def.runnerCannotPlayCurrentEvents,
    morphOddAdvancementSubtypeSwap: def.morphOddAdvancementSubtypeSwap,
    supplierHost: def.supplierHost,
    onFirstRunnerCreditPoolEmptyThisTurn: def.onFirstRunnerCreditPoolEmptyThisTurn
      ? structuredClone(def.onFirstRunnerCreditPoolEmptyThisTurn)
      : undefined,
    onGripArchivesSuccessInstallSelfIgnoringCosts:
      def.onGripArchivesSuccessInstallSelfIgnoringCosts,
    trashSelfWhenRunnerTagged: def.trashSelfWhenRunnerTagged,
    netDamageWheneverRunnerTrashesCorpCard:
      def.netDamageWheneverRunnerTrashesCorpCard,
    memoryLimitEqualsGripSize: def.memoryLimitEqualsGripSize,
    onGripHqSuccessInstallSelfIgnoringCosts:
      def.onGripHqSuccessInstallSelfIgnoringCosts,
    trashCostIncreasePerFacedownArchivesCard:
      def.trashCostIncreasePerFacedownArchivesCard,
    gainCreditsOnCreateServer: def.gainCreditsOnCreateServer,
    whileScoredStealAdditionalCreditsPerAdvancement:
      def.whileScoredStealAdditionalCreditsPerAdvancement,
    gainCreditsWhenCorpLosesCredits: def.gainCreditsWhenCorpLosesCredits,
    drawWhenCorpRezzesIce: def.drawWhenCorpRezzesIce,
    strengthBonusPerUnusedMu: def.strengthBonusPerUnusedMu,
    briberyPlayCostX: def.briberyPlayCostX,
    gainCreditsOnJackOut: def.gainCreditsOnJackOut,
    additionalCreditsToAccessRemoteRoot: def.additionalCreditsToAccessRemoteRoot,
    rezCostReductionPerAdvancement: def.rezCostReductionPerAdvancement,
    gainCreditsOnSpendAgendaCounter: def.gainCreditsOnSpendAgendaCounter,
    badPublicityOnRez: def.badPublicityOnRez,
    firstRunnerInstallTrashFromGripEachTurn:
      def.firstRunnerInstallTrashFromGripEachTurn,
    hostGainsBarrierAndEtrSubroutine: def.hostGainsBarrierAndEtrSubroutine,
    iceProtectingThisServerAdditionalAdvancementTokens:
      def.iceProtectingThisServerAdditionalAdvancementTokens,
    firstAccessedOperationTrashFreeEachTurn:
      def.firstAccessedOperationTrashFreeEachTurn,
    corpStartsWithBadPublicity: def.corpStartsWithBadPublicity,
    corpHandSizeBonusPerBadPublicity: def.corpHandSizeBonusPerBadPublicity,
    installRequiresCorpBadPublicityGte: def.installRequiresCorpBadPublicityGte,
    placeVirusCounterWhenInstalledCorpCardTrashed:
      def.placeVirusCounterWhenInstalledCorpCardTrashed,
    hivemindSharesVirusCounters: def.hivemindSharesVirusCounters,
    onFirstInstallEachTurn: def.onFirstInstallEachTurn
      ? structuredClone(def.onFirstInstallEachTurn)
      : undefined,
    onFirstClickLossEachTurnExceptPaidAbility:
      def.onFirstClickLossEachTurnExceptPaidAbility
        ? structuredClone(def.onFirstClickLossEachTurnExceptPaidAbility)
        : undefined,
    geneticsAlsoTriggerSecondTime: def.geneticsAlsoTriggerSecondTime,
    onFirstDamageEachTurn: def.onFirstDamageEachTurn
      ? structuredClone(def.onFirstDamageEachTurn)
      : undefined,
    agendaAdvancementRequirementBonusPerCopyInCorpScore:
      def.agendaAdvancementRequirementBonusPerCopyInCorpScore,
    onFirstBasicClickDrawEachTurn: def.onFirstBasicClickDrawEachTurn
      ? structuredClone(def.onFirstBasicClickDrawEachTurn)
      : undefined,
    bioroidIceRezCostReductionPerRunnerClickRemaining:
      def.bioroidIceRezCostReductionPerRunnerClickRemaining,
    chooseIdentityFaceBeforeFirstTurn: def.chooseIdentityFaceBeforeFirstTurn,
    identityFaceOptions: def.identityFaceOptions
      ? structuredClone(def.identityFaceOptions)
      : undefined,
    onFullyBreakProtectingIce: def.onFullyBreakProtectingIce
      ? structuredClone(def.onFullyBreakProtectingIce)
      : undefined,
    rezNonIceAdditionalCostRandomTrashHq:
      def.rezNonIceAdditionalCostRandomTrashHq,
    hostsConnectionResources: def.hostsConnectionResources,
    drawOnHostConnectionInstall: def.drawOnHostConnectionInstall,
    onFirstEventEachTurnMayPlayAnother: def.onFirstEventEachTurnMayPlayAnother,
    trashHostedProgramsOnTurnEnd: def.trashHostedProgramsOnTurnEnd,
    playCostX: def.playCostX,
    cardsCannotLeaveRunnerHeap: def.cardsCannotLeaveRunnerHeap,
    eventPlayExtraCostIfCopyInHeap: def.eventPlayExtraCostIfCopyInHeap,
    rootRezCostReductionThisServer: def.rootRezCostReductionThisServer,
    rootTrashCostIncreaseThisServer: def.rootTrashCostIncreaseThisServer,
    preventCyberneticInstallDamage: def.preventCyberneticInstallDamage,
    runnerChoosesDamageTrashFromGrip: def.runnerChoosesDamageTrashFromGrip,
    drawOnUseTrashAbility: def.drawOnUseTrashAbility,
    iceCannotBeBypassedThisServer: def.iceCannotBeBypassedThisServer,
    cardsCannotBeExposedThisServer: def.cardsCannotBeExposedThisServer,
    trashTopOfStackOnAdvance: def.trashTopOfStackOnAdvance
      ? { ...def.trashTopOfStackOnAdvance }
      : undefined,
    increaseFirstCoreDamagePerTurn: def.increaseFirstCoreDamagePerTurn,
    hostAgendaCapacity: def.hostAgendaCapacity,
    mayHostAccessedAgenda: def.mayHostAccessedAgenda,
    countsAsTagged: def.countsAsTagged,
    preventAllMeatDamage: def.preventAllMeatDamage,
    runnerLosesClickWhenTrashesCorpCard: def.runnerLosesClickWhenTrashesCorpCard,
    cannotStealMoreThanOneAgendaPerTurn: def.cannotStealMoreThanOneAgendaPerTurn,
    cannotStealUnlessCopyInRunnerScore: def.cannotStealUnlessCopyInRunnerScore,
    placeAdvancementOnAnotherOnAdvance: def.placeAdvancementOnAnotherOnAdvance
      ? { ...def.placeAdvancementOnAnotherOnAdvance }
      : undefined,
    basicTrashResourceAdditionalCostCredits:
      def.basicTrashResourceAdditionalCostCredits,
    corpChoosesFirstNetDamageCardEachTurn:
      def.corpChoosesFirstNetDamageCardEachTurn,
    netDamageOnJackOut: def.netDamageOnJackOut,
    runnerCannotDrawMoreThanPerTurn: def.runnerCannotDrawMoreThanPerTurn,
    mustRevealAgendasAccessedFromRd: def.mustRevealAgendasAccessedFromRd,
    addSelfToCorpScoreOnAgendaAccess: def.addSelfToCorpScoreOnAgendaAccess
      ? { ...def.addSelfToCorpScoreOnAgendaAccess }
      : undefined,
    hostAssetsOnly: def.hostAssetsOnly,
    etrSubroutinesPerRezzedAsset: def.etrSubroutinesPerRezzedAsset,
    basicRemoveTagAdditionalCostCreditsWhileUnflipped: def.basicRemoveTagAdditionalCostCreditsWhileUnflipped,
    basicTrashResourceCreditReductionWhileFlipped: def.basicTrashResourceCreditReductionWhileFlipped,
    subroutineTraceBaseStrengthBonus: def.subroutineTraceBaseStrengthBonus,
    assetsGainSubtype: def.assetsGainSubtype,
    addToCorpScoreOnAccessIfRunnerTagged: def.addToCorpScoreOnAccessIfRunnerTagged,
    runnerAllottedClicksBonus: def.runnerAllottedClicksBonus,
    gainsEtrSubroutineWhileCurrentActive: def.gainsEtrSubroutineWhileCurrentActive,
    strengthBonusPerRunnerTag: def.strengthBonusPerRunnerTag,
    playAdditionalCostForfeitAgenda: def.playAdditionalCostForfeitAgenda,
    runnerSpendsFirstForTracesDuringRun: def.runnerSpendsFirstForTracesDuringRun,
    traceBaseStrengthBonusDuringRunOnThisServer: def.traceBaseStrengthBonusDuringRunOnThisServer,
    cannotInstallNonVirtualResources: def.cannotInstallNonVirtualResources,
    turnFacedownInsteadOfHeapWhenTrashed: def.turnFacedownInsteadOfHeapWhenTrashed,
    gainCreditsOnFirstOwnInstalledTrashEachTurn: def.gainCreditsOnFirstOwnInstalledTrashEachTurn,
    startWithDirectiveCards: def.startWithDirectiveCards,
    muEqualsAgendaPoints: def.muEqualsAgendaPoints,
    handSizeEqualsAgendaPoints: def.handSizeEqualsAgendaPoints,
    firstClickMustBeRunOrRunEvent: def.firstClickMustBeRunOrRunEvent,
    mustTrashFirstAccessedCardWithTrashCostEachTurn: def.mustTrashFirstAccessedCardWithTrashCostEachTurn,
    drawAtTurnEndIfGripBelowMaxHandSize: def.drawAtTurnEndIfGripBelowMaxHandSize,
    installRequiresLinkGte: def.installRequiresLinkGte,
    installCostReductionPerLink: def.installCostReductionPerLink,
    blankCorpIdentityPrintedAbilities: def.blankCorpIdentityPrintedAbilities,
    hostedCreditsOnProgramOrHardwareInstall: def.hostedCreditsOnProgramOrHardwareInstall,
    runnerChoosesUnbrokenSubroutineOrder: def.runnerChoosesUnbrokenSubroutineOrder,
    breakOnAtMostOneIcePerRun: def.breakOnAtMostOneIcePerRun,
    onFinishAccessRdOncePerTurn: def.onFinishAccessRdOncePerTurn
      ? structuredClone(def.onFinishAccessRdOncePerTurn)
      : undefined,
    onEncounterAnyIceOncePerTurn: def.onEncounterAnyIceOncePerTurn
      ? structuredClone(def.onEncounterAnyIceOncePerTurn)
      : undefined,
    zeroInfluenceIfNonAllianceFactionCardsGte: def.zeroInfluenceIfNonAllianceFactionCardsGte
      ? { ...def.zeroInfluenceIfNonAllianceFactionCardsGte }
      : undefined,
    onPassIceProtectingThisServerMaySwap: def.onPassIceProtectingThisServerMaySwap,
    zeroInfluenceIfIceInDeckLte: def.zeroInfluenceIfIceInDeckLte,
    zeroInfluenceIfCardsInDeckGte: def.zeroInfluenceIfCardsInDeckGte,
    chooseServerOnInstall: def.chooseServerOnInstall,
    additionalCreditCostToInstallInChosenServer: def.additionalCreditCostToInstallInChosenServer,
    gainCreditOnTrashAbilityUse: def.gainCreditOnTrashAbilityUse,
    daemonHostMaxMuFromInstalledCopiesOfSelf: def.daemonHostMaxMuFromInstalledCopiesOfSelf,
    hostedProgramMemoryDoesNotCount: def.hostedProgramMemoryDoesNotCount,
    corpAdditionalBadPublicity: def.corpAdditionalBadPublicity,
    corpAdditionalBadPublicityCannotBeRemoved: def.corpAdditionalBadPublicityCannotBeRemoved,
    playRequiresInstalledSubtype: def.playRequiresInstalledSubtype,
    placePowerCounterOnAnyCardRez: def.placePowerCounterOnAnyCardRez,
    gainCreditOnFirstRunnerDrawEachTurn: def.gainCreditOnFirstRunnerDrawEachTurn,
    onAdvance: def.onAdvance ? structuredClone(def.onAdvance) : undefined,
    zeroInfluenceIfCardCopiesGte: def.zeroInfluenceIfCardCopiesGte
      ? { ...def.zeroInfluenceIfCardCopiesGte }
      : undefined,
    mayJackOutOnEncounterSentryOncePerTurn:
      def.mayJackOutOnEncounterSentryOncePerTurn,
    revealRandomHqOnJackOut: def.revealRandomHqOnJackOut,
    installRequiresSuccessfulHqRunThisTurn:
      def.installRequiresSuccessfulHqRunThisTurn,
    corpAllottedClicksBonusWhileInstalled:
      def.corpAllottedClicksBonusWhileInstalled,
    onCorpRezAssetOrUpgradeMayPayRezCostTrashSelfDerez:
      def.onCorpRezAssetOrUpgradeMayPayRezCostTrashSelfDerez,
    onDrawAgendaMayRevealAndInstall: def.onDrawAgendaMayRevealAndInstall,
    gainCreditWheneverRunnerBreaksSubroutine:
      def.gainCreditWheneverRunnerBreaksSubroutine,
    onRezOtherCardInRootOrProtectingMayRezDiscount:
      def.onRezOtherCardInRootOrProtectingMayRezDiscount,
    hostAgendaPointsModifier: def.hostAgendaPointsModifier,
    accessPayTrashCostRemoveFromGameOncePerTurn:
      def.accessPayTrashCostRemoveFromGameOncePerTurn,
    addInstalledNonVirusProgramToStackTopOnEncounterEndIfBroke:
      def.addInstalledNonVirusProgramToStackTopOnEncounterEndIfBroke,
    patronChooseServerDrawInsteadOfBreach:
      def.patronChooseServerDrawInsteadOfBreach,
    onInstallHardwareFromGripMayInstallAnotherCopy:
      def.onInstallHardwareFromGripMayInstallAnotherCopy,
    onRunnerSearchStackOrInstallFromHeapTrashRandomFromGrip:
      def.onRunnerSearchStackOrInstallFromHeapTrashRandomFromGrip,
    gainClickFirstTimeSpendClicksGteOnSameActionEachTurn:
      def.gainClickFirstTimeSpendClicksGteOnSameActionEachTurn,
    onDrawMayLoseClickRevealSwapArchivesSameTypeOncePerTurn:
      def.onDrawMayLoseClickRevealSwapArchivesSameTypeOncePerTurn,
    onAnySuccessfulTraceGainAndRunnerLose: def.onAnySuccessfulTraceGainAndRunnerLose
      ? { ...def.onAnySuccessfulTraceGainAndRunnerLose }
      : undefined,
    onRezOrPlayOutOfFactionGainCredits: def.onRezOrPlayOutOfFactionGainCredits,
    zeroInfluenceIfAssetsInDeckGte: def.zeroInfluenceIfAssetsInDeckGte,
    mustTrashWhenAccessedWhileInstalled: def.mustTrashWhenAccessedWhileInstalled,
    heapOnTurnBeginMayRfgSelfToMakeRun: def.heapOnTurnBeginMayRfgSelfToMakeRun,
    autoPreventNetOrMeatDamagePayOrTrash: def.autoPreventNetOrMeatDamagePayOrTrash,
    placePowerOnHqOrRdRunEndIfNoAgendaStolen:
      def.placePowerOnHqOrRdRunEndIfNoAgendaStolen,
    gainsSubroutinesOnEncounterEqualGripSize: def.gainsSubroutinesOnEncounterEqualGripSize
      ? {
          ...def.gainsSubroutinesOnEncounterEqualGripSize,
          effect: structuredClone(def.gainsSubroutinesOnEncounterEqualGripSize.effect),
        }
      : undefined,
    firstSuccessfulHqRunEachTurnPsiCorpChoosesAccess:
      def.firstSuccessfulHqRunEachTurnPsiCorpChoosesAccess,
    onSuccessfulRunMayPlaceAdvancementOnCanBeAdvanced:
      def.onSuccessfulRunMayPlaceAdvancementOnCanBeAdvanced,
    corpCannotWinExceptFlatline: def.corpCannotWinExceptFlatline,
    playRequiresAgendaInRunnerScoreArea: def.playRequiresAgendaInRunnerScoreArea,
    revealGripWhileRunnerTagged: def.revealGripWhileRunnerTagged,
    hostAssetsOrAgendas: def.hostAssetsOrAgendas,
    trashCostIncreasePerHostedCard: def.trashCostIncreasePerHostedCard,
    rezRequiresTagged: def.rezRequiresTagged,
    blockRunnerPaidAbilitiesExceptIcebreakersAndMidAccess:
      def.blockRunnerPaidAbilitiesExceptIcebreakersAndMidAccess,
    corpLosesCreditsOnNonFirstDrawThisTurn:
      def.corpLosesCreditsOnNonFirstDrawThisTurn,
    mayExposeApproachedIceThenMayTrashSelfToJackOut:
      def.mayExposeApproachedIceThenMayTrashSelfToJackOut,
    additionalIceRezCostEqualToSubroutineCountWhenCorpCreditsGte:
      def.additionalIceRezCostEqualToSubroutineCountWhenCorpCreditsGte,
    onSuccessfulRdRunMayReplaceSpentRecurringCredit:
      def.onSuccessfulRdRunMayReplaceSpentRecurringCredit,
    firstRevealSecretlySpentCreditsGainThatManyEachTurn:
      def.firstRevealSecretlySpentCreditsGainThatManyEachTurn,
    onUnsuccessfulRunOnThisServer: def.onUnsuccessfulRunOnThisServer
      ? structuredClone(def.onUnsuccessfulRunOnThisServer)
      : undefined,
    firstIceRezCostReductionPerRunnerTag: def.firstIceRezCostReductionPerRunnerTag,
    onTurnBeginIfRunnerTagged: def.onTurnBeginIfRunnerTagged
      ? structuredClone(def.onTurnBeginIfRunnerTagged)
      : undefined,
    iceStrengthBonusPerFiveCorpCreditsWhenCorpCreditsGte:
      def.iceStrengthBonusPerFiveCorpCreditsWhenCorpCreditsGte
        ? { ...def.iceStrengthBonusPerFiveCorpCreditsWhenCorpCreditsGte }
        : undefined,
    blankUniqueNonRegionAssetUpgradePrintedAbilities:
      def.blankUniqueNonRegionAssetUpgradePrintedAbilities,
    mayInstallSelfFromHeapOnEncounterBarrier:
      def.mayInstallSelfFromHeapOnEncounterBarrier,
    onFirstPassIceEachTurn: def.onFirstPassIceEachTurn
      ? structuredClone(def.onFirstPassIceEachTurn)
      : undefined,
    playRequiresRunnerCreditsGte: def.playRequiresRunnerCreditsGte,
    firstAdvancedIceEncounterEndMeatDamageEachTurn:
      def.firstAdvancedIceEncounterEndMeatDamageEachTurn,
    handSizeBonusPerTag: def.handSizeBonusPerTag,
    drawPerAccessOnFirstSuccessfulHqOrRdRunEndEachTurn:
      def.drawPerAccessOnFirstSuccessfulHqOrRdRunEndEachTurn,
    mayInstallSelfFromHeapOnEncounterCodeGate:
      def.mayInstallSelfFromHeapOnEncounterCodeGate,
    firstStealthSpendEachRunPlaceCreditOrDraw:
      def.firstStealthSpendEachRunPlaceCreditOrDraw,
    spendHostedCreditsForAnything: def.spendHostedCreditsForAnything,
    revealDrawnCards: def.revealDrawnCards,
    playRequiresRunnerCreditsLt: def.playRequiresRunnerCreditsLt,
    trashTopOfStackOnRunnerNetDamage: def.trashTopOfStackOnRunnerNetDamage,
    resourceInstallCostIncrease: def.resourceInstallCostIncrease,
    bonusAccessOnHqBreachPerFullyBrokenProtectingIce:
      def.bonusAccessOnHqBreachPerFullyBrokenProtectingIce,
    mayInsteadOfBreachRdAccessOneOfTopN: def.mayInsteadOfBreachRdAccessOneOfTopN,
    secretSpendCannotEqual: def.secretSpendCannotEqual,
    hostGainsSubroutinesBeforePrinted: def.hostGainsSubroutinesBeforePrinted
      ? structuredClone(def.hostGainsSubroutinesBeforePrinted)
      : undefined,
    meatDamageWhenSecretSpendAmountsDiffer:
      def.meatDamageWhenSecretSpendAmountsDiffer,
    onRunDeclaredOnThisServerIfTagged: def.onRunDeclaredOnThisServerIfTagged
      ? structuredClone(def.onRunDeclaredOnThisServerIfTagged)
      : undefined,
    placePowerPerUnbrokenSubOnAnyEncounterEnd:
      def.placePowerPerUnbrokenSubOnAnyEncounterEnd,
    mayInstallSelfFromHeapOnEncounterSentry:
      def.mayInstallSelfFromHeapOnEncounterSentry,
    drawOnFirstTrashInstalledEachTurn: def.drawOnFirstTrashInstalledEachTurn,
    cannotRezNonIceDuringRunnerTurn: def.cannotRezNonIceDuringRunnerTurn,
    gainsPaidAbilitiesOfHostedIcebreakers:
      def.gainsPaidAbilitiesOfHostedIcebreakers,
    additionalClickNextTurnOnSuccessfulRunEndIfRunnerLt6cOrNoClicks:
      def.additionalClickNextTurnOnSuccessfulRunEndIfRunnerLt6cOrNoClicks,
    mayMoveAnyAdvancementsFromSelfToRezzedIce:
      def.mayMoveAnyAdvancementsFromSelfToRezzedIce,
    sifrMayZeroEncounterIceStrengthOncePerTurn:
      def.sifrMayZeroEncounterIceStrengthOncePerTurn,
    playRequiresCorpScoredNoAgendasLastTurn:
      def.playRequiresCorpScoredNoAgendasLastTurn,
    trashTopOfStackOnBreakSubIfRunnerHasAi:
      def.trashTopOfStackOnBreakSubIfRunnerHasAi,
    firstTraceEachTurnRunnerLinkTreatedAs0:
      def.firstTraceEachTurnRunnerLinkTreatedAs0,
    gainCreditsWhenRunnerSpendsForLinkPer2Spent:
      def.gainCreditsWhenRunnerSpendsForLinkPer2Spent,
    bryanStinsonPlayArchivesTransactionWhileRunnerLt6c:
      def.bryanStinsonPlayArchivesTransactionWhileRunnerLt6c,
    nasxMaySpendUpTo2OnAbilityCreditGainToPlacePower:
      def.nasxMaySpendUpTo2OnAbilityCreditGainToPlacePower,
    mawFirstAccessNotArchivesNoStealOrTrashForceCorpTrashHq:
      def.mawFirstAccessNotArchivesNoStealOrTrashForceCorpTrashHq,
    archivistOnCorpScoresInitiativeOrSecurityTrace:
      def.archivistOnCorpScoresInitiativeOrSecurityTrace,
    iceNotInnermostInstallCostIncrease: def.iceNotInnermostInstallCostIncrease,
    synthDnaFirstApSubBrokenEachTurnNetDamage:
      def.synthDnaFirstApSubBrokenEachTurnNetDamage,
    netAnalyticsMayDrawWhenRunnerAvoidsOrRemovesTags:
      def.netAnalyticsMayDrawWhenRunnerAvoidsOrRemovesTags,
    jemisonOnForfeitPlaceAdvancementsEqualAgendaPointsPlus1:
      def.jemisonOnForfeitPlaceAdvancementsEqualAgendaPointsPlus1,
    oberthFirstAdvanceThisServerAdditionalAdvancement:
      def.oberthFirstAdvanceThisServerAdditionalAdvancement,
    placePowerCounterOnSufferAnyDamage: def.placePowerCounterOnSufferAnyDamage,
    strengthBonusPerIceProtectingThisServer:
      def.strengthBonusPerIceProtectingThisServer,
    systemSeizureFirstPumpStrengthLastsRemainderOfRun:
      def.systemSeizureFirstPumpStrengthLastsRemainderOfRun,
    corpGainsOnFirstRunnerBasicGainCreditEachTurn:
      def.corpGainsOnFirstRunnerBasicGainCreditEachTurn,
    additionalTagsWhileHosted: def.additionalTagsWhileHosted,
    mcaInformantCondition: def.mcaInformantCondition,
    mcaInformantHosted: def.mcaInformantHosted,
    daemonHostInstallCreditDiscount: def.daemonHostInstallCreditDiscount,
    basicDrawBonus: def.basicDrawBonus,
    polyhistorPassAllHqIceMayDrawForceCorpDraw:
      def.polyhistorPassAllHqIceMayDrawForceCorpDraw,
    maxwellJamesRequireAfterSuccessfulHqRunPaidWindow:
      def.maxwellJamesRequireAfterSuccessfulHqRunPaidWindow,
    placePowerCounterOnInstallCardInRemoteRoot:
      def.placePowerCounterOnInstallCardInRemoteRoot,
    onSuccessfulRunThisServer: def.onSuccessfulRunThisServer
      ? structuredClone(def.onSuccessfulRunThisServer)
      : undefined,
    skorpiosRfgOneTrashedRunnerCardOncePerTurn:
      def.skorpiosRfgOneTrashedRunnerCardOncePerTurn,
    onTrashWhileRezzedTakeBadPublicity: def.onTrashWhileRezzedTakeBadPublicity,
    meatDamageWhenRunnerTakesTags: def.meatDamageWhenRunnerTakesTags,
    playOnlyIfRunnerStoleAgendaLastTurn: def.playOnlyIfRunnerStoleAgendaLastTurn,
    longTermInvestmentGainAbilityAtHostedCredits:
      def.longTermInvestmentGainAbilityAtHostedCredits,
    strengthBonusPerSubroutineOnEncounteredBarrier:
      def.strengthBonusPerSubroutineOnEncounteredBarrier,
    aeneasInformantRevealGainOnAccessWithoutTrash:
      def.aeneasInformantRevealGainOnAccessWithoutTrash,
    hostGainsAiSubtype: def.hostGainsAiSubtype,
    hostGainsLoseClickBreakAnySubroutine: def.hostGainsLoseClickBreakAnySubroutine,
    hostGainsPumpAbility: def.hostGainsPumpAbility
      ? { ...def.hostGainsPumpAbility }
      : undefined,
    inversificatorSwapIceAfterFullyBrokeOncePerTurn:
      def.inversificatorSwapIceAfterFullyBrokeOncePerTurn,
    trashSelfAndMeatDamageWhenCreditsZero:
      def.trashSelfAndMeatDamageWhenCreditsZero,
    gainsSubroutinesPerRezzedIceWithSubtype:
      def.gainsSubroutinesPerRezzedIceWithSubtype
        ? {
            subtype: def.gainsSubroutinesPerRezzedIceWithSubtype.subtype,
            subroutine: {
              ...def.gainsSubroutinesPerRezzedIceWithSubtype.subroutine,
              effect: structuredClone(
                def.gainsSubroutinesPerRezzedIceWithSubtype.subroutine.effect,
              ),
            },
          }
        : undefined,
    bioroidWorkCrewRequireAfterOperationPaidWindow:
      def.bioroidWorkCrewRequireAfterOperationPaidWindow,
    mayTakeTagToBypassOnEncounter: def.mayTakeTagToBypassOnEncounter,
    gainCreditsOnBreakSubThisServerIfTagged:
      def.gainCreditsOnBreakSubThisServerIfTagged,
    playRequiresOtherCardsInHq: def.playRequiresOtherCardsInHq,
    trashSelfWhenNoPowerCounters: def.trashSelfWhenNoPowerCounters,
    corpCannotTrashWhileOtherResourceInstalled:
      def.corpCannotTrashWhileOtherResourceInstalled,
    installCostX: def.installCostX,
    powerCountersOnInstallEqualPaidX: def.powerCountersOnInstallEqualPaidX,
    onTurnEndIfGripEmptyDrawPerPowerThenTrash:
      def.onTurnEndIfGripEmptyDrawPerPowerThenTrash,
    gainCreditsOnFirstDerezIceEachTurn: def.gainCreditsOnFirstDerezIceEachTurn,
    drawOnFirstRunEachTurnIfServerIceGte: def.drawOnFirstRunEachTurnIfServerIceGte
      ? { ...def.drawOnFirstRunEachTurnIfServerIceGte }
      : undefined,
    fullyBreakNextEncounterFirstNSubsDoNotResolve:
      def.fullyBreakNextEncounterFirstNSubsDoNotResolve,
    onRunnerTrashFromThisServerRootOrProtecting:
      def.onRunnerTrashFromThisServerRootOrProtecting
        ? structuredClone(def.onRunnerTrashFromThisServerRootOrProtecting)
        : undefined,
    onEncounterEndIfPrintedSubroutineBroken:
      def.onEncounterEndIfPrintedSubroutineBroken
        ? structuredClone(def.onEncounterEndIfPrintedSubroutineBroken)
        : undefined,
    playRequiresNoSuccessfulRunLastTurn:
      def.playRequiresNoSuccessfulRunLastTurn,
    onRezIceProtectingThisServer: def.onRezIceProtectingThisServer
      ? structuredClone(def.onRezIceProtectingThisServer)
      : undefined,
    ripDealHeapInsteadOfHqAccess: def.ripDealHeapInsteadOfHqAccess,
    rfgSelfOnRunEnd: def.rfgSelfOnRunEnd,
    strengthBonusPerInstalledProgram: def.strengthBonusPerInstalledProgram,
    strengthBonusPerIceProtectingAttackedServerDuringRun:
      def.strengthBonusPerIceProtectingAttackedServerDuringRun,
    nonVirtualResourceInstallCostIncrease:
      def.nonVirtualResourceInstallCostIncrease,
    cannotHostCards: def.cannotHostCards,
    afterMandatoryDraw: def.afterMandatoryDraw
      ? structuredClone(def.afterMandatoryDraw)
      : undefined,
    hostAgendaGainsPublic: def.hostAgendaGainsPublic,
    playRequiresSuccessfulCentralRunThisTurn:
      def.playRequiresSuccessfulCentralRunThisTurn,
    onFirstEmptyGripEachTurn: def.onFirstEmptyGripEachTurn
      ? structuredClone(def.onFirstEmptyGripEachTurn)
      : undefined,
    placeVirusCounterOnExposeAnyCard: def.placeVirusCounterOnExposeAnyCard,
    placeVirusCounterOnFinishBreachIfNoStealOrTrash:
      def.placeVirusCounterOnFinishBreachIfNoStealOrTrash,
    revealCorpBasicActionDraws: def.revealCorpBasicActionDraws,
    operationAndEventPlayCostIncrease: def.operationAndEventPlayCostIncrease,
    corpGainsCreditsOnFirstRunnerEventEachTurn:
      def.corpGainsCreditsOnFirstRunnerEventEachTurn,
    trashTopOfStackWhenAllSubsBrokenOnProtectingIce:
      def.trashTopOfStackWhenAllSubsBrokenOnProtectingIce,
    strengthBonusIfInstalledSubtype: def.strengthBonusIfInstalledSubtype
      ? { ...def.strengthBonusIfInstalledSubtype }
      : undefined,
    mayGainCreditsOnCorpCardExposed: def.mayGainCreditsOnCorpCardExposed,
    memoryCostPerPowerCounter: def.memoryCostPerPowerCounter,
    corpHandSizeBonusWhileInstalled: def.corpHandSizeBonusWhileInstalled,
    gainCreditsOnFirstFullyBreakEachTurn:
      def.gainCreditsOnFirstFullyBreakEachTurn,
    placeAdvancementOnSufferMeatDamage: def.placeAdvancementOnSufferMeatDamage,
    playRequiresRunnerHasInstalledHardwareOrNonVirtualResource:
      def.playRequiresRunnerHasInstalledHardwareOrNonVirtualResource,
    daemonHostVirusProgramsOnly: def.daemonHostVirusProgramsOnly,
    preventOneVirusPurgeOnHostedProgram: def.preventOneVirusPurgeOnHostedProgram,
    muBonusOnlyForVirusPrograms: def.muBonusOnlyForVirusPrograms,
    archivesAccessMayRfgInstead: def.archivesAccessMayRfgInstead
      ? { ...def.archivesAccessMayRfgInstead }
      : undefined,

    playersCannotTrashThisIce: def.playersCannotTrashThisIce,
    dynamicEtrSubroutineCountFromCorpHandSize:
      def.dynamicEtrSubroutineCountFromCorpHandSize,
    runnerFirstInstallCostIncreasePerPowerCounterOnThis:
      def.runnerFirstInstallCostIncreasePerPowerCounterOnThis,
    handSizeBonusPerInstalledCopyWithSameDefId:
      def.handSizeBonusPerInstalledCopyWithSameDefId,
    trashSelfOnUnsuccessfulRunThisTurn: def.trashSelfOnUnsuccessfulRunThisTurn,
    onCorpRemoteServerCreated: def.onCorpRemoteServerCreated
      ? structuredClone(def.onCorpRemoteServerCreated)
      : undefined,
    trashWhenHostedCreditsEmpty: def.trashWhenHostedCreditsEmpty,
    trashSelfOnCorpIceInstall: def.trashSelfOnCorpIceInstall,
    scoreWhenPowerEmpty: def.scoreWhenPowerEmpty
      ? structuredClone(def.scoreWhenPowerEmpty)
      : undefined,
    installServers: def.installServers
      ? [...def.installServers]
      : undefined,
    daemonHost: def.daemonHost,
    daemonHostMaxMu: def.daemonHostMaxMu,
    daemonHostExcludeIcebreaker: def.daemonHostExcludeIcebreaker,
    chooseBonusAccessLessThanVirusOnRdBreach:
      def.chooseBonusAccessLessThanVirusOnRdBreach,
    chooseBonusAccessLessThanVirusOnHqBreach:
      def.chooseBonusAccessLessThanVirusOnHqBreach,
    mayExposeApproachedUnrezzedIceOncePerRunThenMayJackOut:
      def.mayExposeApproachedUnrezzedIceOncePerRunThenMayJackOut,
    personalWorkshop: def.personalWorkshop,
    onAccessRequiresInstalled: def.onAccessRequiresInstalled,
    canAdvanceOnlyWhenRezzed: def.canAdvanceOnlyWhenRezzed,
    gainsSubroutinesPerAdvancement: def.gainsSubroutinesPerAdvancement
      ? {
          subroutine: {
            ...def.gainsSubroutinesPerAdvancement.subroutine,
            effect: structuredClone(
              def.gainsSubroutinesPerAdvancement.subroutine.effect,
            ),
          },
        }
      : undefined,
    mayRezWhenCardWouldBeExposed: def.mayRezWhenCardWouldBeExposed,
    rfgWhenPowerEmpty: def.rfgWhenPowerEmpty,
    badPublicityCountersOnRez: def.badPublicityCountersOnRez,
    winWhenBadPublicityCountersEmpty: def.winWhenBadPublicityCountersEmpty,
    etrSubroutinesPerPowerCounter: def.etrSubroutinesPerPowerCounter,
    powerCounterOnHarmonicIceRez: def.powerCounterOnHarmonicIceRez,
    powerOnFirstInstalledCardCreditSpendThisTurn:
      def.powerOnFirstInstalledCardCreditSpendThisTurn,
    removePowerForBonusAccessOnHqRdBreach:
      def.removePowerForBonusAccessOnHqRdBreach,
    playRequiresSuccessfulRunThisTurn: def.playRequiresSuccessfulRunThisTurn,
    playRequiresThreat: def.playRequiresThreat,
    installRequiresSuccessfulCentralRunThisTurn:
      def.installRequiresSuccessfulCentralRunThisTurn,
    agendaPointsPerAgendaCounter: def.agendaPointsPerAgendaCounter,
    cannotBreakWithAi: def.cannotBreakWithAi,
    cannotBreakWithAiAtAdvancements: def.cannotBreakWithAiAtAdvancements,
    cannotBreakExceptSubtype: def.cannotBreakExceptSubtype,
    cannotBeTrashedByRunnerWhileRezzed: def.cannotBeTrashedByRunnerWhileRezzed,
    strengthBonusIfSoleIceProtectingServer:
      def.strengthBonusIfSoleIceProtectingServer,
    strengthBonusIfRezzedThisTurn: def.strengthBonusIfRezzedThisTurn,
    paidAbilityCreditDiscountIfRunEventActive:
      def.paidAbilityCreditDiscountIfRunEventActive,
    threatGiveTagsOnRezzedTrash: def.threatGiveTagsOnRezzedTrash
      ? { ...def.threatGiveTagsOnRezzedTrash }
      : undefined,
    cannotBreakWithRunnerCardAbilities: def.cannotBreakWithRunnerCardAbilities,
    installFaceup: def.installFaceup,
    creditsOnAdvance: def.creditsOnAdvance
      ? { ...def.creditsOnAdvance }
      : undefined,
    advancementRequirementReduction: def.advancementRequirementReduction,
    agendaAdvancementRequirementBonus: def.agendaAdvancementRequirementBonus,
    agendaAdvancementRequirementBonusIfVirusCountersGte:
      def.agendaAdvancementRequirementBonusIfVirusCountersGte
        ? { ...def.agendaAdvancementRequirementBonusIfVirusCountersGte }
        : undefined,
    runsCannotBeSuccessful: def.runsCannotBeSuccessful,
    maxAccessOtherThanSelf: def.maxAccessOtherThanSelf,
    hostGainsAllIceSubtypes: def.hostGainsAllIceSubtypes,
    recurringSpendFor: def.recurringSpendFor
      ? [...def.recurringSpendFor]
      : undefined,
    accessTrashWithVirus: def.accessTrashWithVirus,
    accessTrashPayingPrintedCostFromStealth:
      def.accessTrashPayingPrintedCostFromStealth,
    returnHostedBadPublicityOnUninstall:
      def.returnHostedBadPublicityOnUninstall,
    gainsTextOfHostedIdentity: def.gainsTextOfHostedIdentity,
    returnHostedIdentityToOutsideGameOnUninstall:
      def.returnHostedIdentityToOutsideGameOnUninstall,
    agendaPointsModifierInRunnerScoreArea:
      def.agendaPointsModifierInRunnerScoreArea,
    canAdvance: def.canAdvance,
    playRequiresSuccessfulHqRunThisTurn:
      def.playRequiresSuccessfulHqRunThisTurn,
    playRequiresSuccessfulAllCentralsThisTurn:
      def.playRequiresSuccessfulAllCentralsThisTurn,
    playRequiresCorpBadPublicityGte: def.playRequiresCorpBadPublicityGte,
    onGrayOrBlackOpsTrashedAfterResolve: def.onGrayOrBlackOpsTrashedAfterResolve
      ? structuredClone(def.onGrayOrBlackOpsTrashedAfterResolve)
      : undefined,
    onPassAllIceProtectingServer: def.onPassAllIceProtectingServer
      ? structuredClone(def.onPassAllIceProtectingServer)
      : undefined,
    onWouldTakeBadPublicity: def.onWouldTakeBadPublicity
      ? structuredClone(def.onWouldTakeBadPublicity)
      : undefined,
    dynamicEtrSubroutineCountFromCorpAgendaPoints:
      def.dynamicEtrSubroutineCountFromCorpAgendaPoints,
    dynamicEtrSubroutineCountFromRezzedIceSubtype:
      def.dynamicEtrSubroutineCountFromRezzedIceSubtype,
    runnerIcebreakerAbilityAdditionalCostOnThisServer:
      def.runnerIcebreakerAbilityAdditionalCostOnThisServer,
    gainCreditsOnTraceInitiated: def.gainCreditsOnTraceInitiated,
    onGripRdSuccessInstallSelfIgnoringCosts:
      def.onGripRdSuccessInstallSelfIgnoringCosts,
    onEncounterRezzedAfterApproach: def.onEncounterRezzedAfterApproach
      ? structuredClone(def.onEncounterRezzedAfterApproach)
      : undefined,
    oncePerTurnPaidAbilities: def.oncePerTurnPaidAbilities,
    blackguardForceRezOnExpose: def.blackguardForceRezOnExpose,
    breakerOnlyOutermostIce: def.breakerOnlyOutermostIce,
    breakerOnlyInnermostIce: def.breakerOnlyInnermostIce,
    onScoreIfRunnerTaggedPlaceAgendaCounter:
      def.onScoreIfRunnerTaggedPlaceAgendaCounter,
    playRequiresScoredAgendaNotInstalledThisTurn:
      def.playRequiresScoredAgendaNotInstalledThisTurn,
    playRequiresNoCorpActionFinished: def.playRequiresNoCorpActionFinished,
    playRequiresNoActiveLockdown: def.playRequiresNoActiveLockdown,
    lingerUntilCorpNextTurnBegins: def.lingerUntilCorpNextTurnBegins,
    rezAdditionalCostForfeitAgenda: def.rezAdditionalCostForfeitAgenda,
    rezCostCreditDiscountOnForfeitAgenda:
      def.rezCostCreditDiscountOnForfeitAgenda,
    rezAdditionalCostDerezSubtype: def.rezAdditionalCostDerezSubtype,
    playAdditionalClick: def.playAdditionalClick,
    playAdditionalClicks: def.playAdditionalClicks,
    stealAdditionalClicks: def.stealAdditionalClicks,
    stealAdditionalCredits: def.stealAdditionalCredits,
    stealAdditionalCreditsFormula: def.stealAdditionalCreditsFormula,
    runnerLoseCreditsOnBreakPrintedSubroutine:
      def.runnerLoseCreditsOnBreakPrintedSubroutine,
    stealAdditionalCreditsWhileRezzed: def.stealAdditionalCreditsWhileRezzed,
    stealAdditionalCreditsFromProtectingServer:
      def.stealAdditionalCreditsFromProtectingServer,
    playCostDiscountPerIceProtectingServer:
      def.playCostDiscountPerIceProtectingServer,
    firstDoubleOperationClickDiscount: def.firstDoubleOperationClickDiscount,
    rezCostDiscountIfAgendaScoredOrStolenThisTurn:
      def.rezCostDiscountIfAgendaScoredOrStolenThisTurn,
    allIceStrengthPenalty: def.allIceStrengthPenalty,
    allIceStrengthBonus: def.allIceStrengthBonus,
    cannotBreakExceptIcebreaker: def.cannotBreakExceptIcebreaker,
    gainCreditOnBreakIceStrengthLteOncePerTurn:
      def.gainCreditOnBreakIceStrengthLteOncePerTurn,
    endsActionPhase: def.endsActionPhase,
    mayShuffleIntoRdWhenTrashed: def.mayShuffleIntoRdWhenTrashed,
    badPublicityOnScore: def.badPublicityOnScore,
    playCostXMaxRunnerTags: def.playCostXMaxRunnerTags,
    installSpendCreditsForPowerCounters:
      def.installSpendCreditsForPowerCounters,
    strengthPerPowerCounter: def.strengthPerPowerCounter,
    interfaceRequiresEqualStrength: def.interfaceRequiresEqualStrength,
    interfaceRequiresTrojanHost: def.interfaceRequiresTrojanHost,
    interfaceRequiresChosenServer: def.interfaceRequiresChosenServer,
    chooseBreakerSubtypeOnInstall: def.chooseBreakerSubtypeOnInstall,
    returnToGripAtDiscardPhase: def.returnToGripAtDiscardPhase,
    chooseIceOnInstallForBypass: def.chooseIceOnInstallForBypass,
    chooseIceOnInstall: def.chooseIceOnInstall,
    hostedProgramsLoseAbilities: def.hostedProgramsLoseAbilities,
    securityTesting: def.securityTesting,
    rezBioroidDiscountOnFirstPass: def.rezBioroidDiscountOnFirstPass,
    interruptFirstDrawBottomOne: def.interruptFirstDrawBottomOne,
    subliminalMessaging: def.subliminalMessaging,
    aylaSetAside: def.aylaSetAside,
    steveCambridge: def.steveCambridge,
    aesopPawnshop: def.aesopPawnshop,
    link: def.link,
    unsupported: def.unsupported ? [...def.unsupported] : undefined,
    faceup: def.type === "identity" || def.side === "runner",
    rezzed: def.type === "identity",
    zone,
  };
  if (def.subroutines) {
    card.subroutines = def.subroutines.map(
      (s): Subroutine => ({
        id: s.id,
        text: s.text,
        effect: structuredClone(s.effect),
        ...(s.requireLostClickToBreakThisRun
          ? { requireLostClickToBreakThisRun: true }
          : {}),
      }),
    );
  }
  if (def.breaker) {
    card.breaker = { ...def.breaker };
  }
  if (def.paidAbilities) {
    card.paidAbilities = def.paidAbilities.map(
      (a): PaidAbility => ({
        ...a,
        clickCost: a.clickCost ?? a.cost?.clicks ?? 0,
        creditCost: a.creditCost ?? a.cost?.credits ?? 0,
        cost: a.cost ? { ...a.cost } : undefined,
        windows: [...a.windows],
        effect: structuredClone(a.effect),
        oncePerTurn: a.oncePerTurn,
        oncePerRun: a.oncePerRun,
        oncePerEncounter: a.oncePerEncounter,
        usableByRunnerOnSelfIce: a.usableByRunnerOnSelfIce,
        usableFromHq: a.usableFromHq,
        usableFromArchives: a.usableFromArchives,
        usableByAnyPlayer: a.usableByAnyPlayer,
        usableFromRunnerScoreArea: a.usableFromRunnerScoreArea,
        requireProtectingHostServer: a.requireProtectingHostServer,
        requiresAdvancements: a.requiresAdvancements,
        requiresThreat: a.requiresThreat,
        requiresSuccessfulRdRunThisTurn: a.requiresSuccessfulRdRunThisTurn,
        requiresSuccessfulHqRunThisTurn: a.requiresSuccessfulHqRunThisTurn,
        requiresRezzedIce: a.requiresRezzedIce,
        requiresSuccessfulAllCentralsThisTurn:
          a.requiresSuccessfulAllCentralsThisTurn,
        requiresUntagged: a.requiresUntagged,
        requireRunnerTagged: a.requireRunnerTagged,
        requiresActiveRun: a.requiresActiveRun,
        requireOtherServer: a.requireOtherServer,
        requireThisServer: a.requireThisServer,
        onlyDuringArchivesRun: a.onlyDuringArchivesRun,
        requireRunnerClicksEq: a.requireRunnerClicksEq,
        requireEncounterSubtype: a.requireEncounterSubtype,
        requireEncounterChosenIce: a.requireEncounterChosenIce,
        requireAttackingMark: a.requireAttackingMark,
        requireBrokenSubThisEncounter: a.requireBrokenSubThisEncounter,
        requireFullyBrokenThisEncounter: a.requireFullyBrokenThisEncounter,
        requireSufferedCorpDamageThisTurn: a.requireSufferedCorpDamageThisTurn,
        requireSufferedMeatDamageThisTurn: a.requireSufferedMeatDamageThisTurn,
        requireSufferedAnyDamageThisTurn: a.requireSufferedAnyDamageThisTurn,
        requireNextPawAfterDamage: a.requireNextPawAfterDamage,
        requireDuringRun: a.requireDuringRun,
        forbidDuringRun: a.forbidDuringRun,
        formicaryApproachAnyServer: a.formicaryApproachAnyServer,
        requirePendingDamageTypes: a.requirePendingDamageTypes
          ? [...a.requirePendingDamageTypes]
          : undefined,
        oncePerPendingDamageInstance: a.oncePerPendingDamageInstance,
        requiresCorpCreditsGte: a.requiresCorpCreditsGte,
        startsRun: a.startsRun ? structuredClone(a.startsRun) : undefined,
      }),
    );
    if (def.oncePerTurnPaidAbilities) {
      for (const ab of card.paidAbilities) {
        ab.oncePerTurn = true;
      }
    }
  }
  if (def.onRez) card.onRez = structuredClone(def.onRez);
  if (def.onPlay) card.onPlay = structuredClone(def.onPlay);
  if (def.playAdditionalCost) {
    card.playAdditionalCost = structuredClone(def.playAdditionalCost);
  }
  if (def.onScore) card.onScore = structuredClone(def.onScore);
  if (def.onForfeit) card.onForfeit = structuredClone(def.onForfeit);
  if (def.scoreAdditionalCost) {
    card.scoreAdditionalCost = structuredClone(def.scoreAdditionalCost);
  }
  if (def.stealAdditionalCost) {
    card.stealAdditionalCost = structuredClone(def.stealAdditionalCost);
  }
  if (def.trashAdditionalCost) {
    card.trashAdditionalCost = structuredClone(def.trashAdditionalCost);
  }
  if (def.stealAdditionalCostFromProtectingServer) {
    card.stealAdditionalCostFromProtectingServer = structuredClone(
      def.stealAdditionalCostFromProtectingServer,
    );
  }
  if (def.onSteal) card.onSteal = structuredClone(def.onSteal);
  if (def.onGrayOrBlackOpsTrashedAfterResolve) {
    card.onGrayOrBlackOpsTrashedAfterResolve = structuredClone(
      def.onGrayOrBlackOpsTrashedAfterResolve,
    );
  }
  if (def.onPassAllIceProtectingServer) {
    card.onPassAllIceProtectingServer = structuredClone(
      def.onPassAllIceProtectingServer,
    );
  }
  if (def.onWouldTakeBadPublicity) {
    card.onWouldTakeBadPublicity = structuredClone(def.onWouldTakeBadPublicity);
  }
  if (def.dynamicEtrSubroutineCountFromCorpAgendaPoints) {
    card.dynamicEtrSubroutineCountFromCorpAgendaPoints = true;
  }
  if (def.dynamicEtrSubroutineCountFromRezzedIceSubtype) {
    card.dynamicEtrSubroutineCountFromRezzedIceSubtype =
      def.dynamicEtrSubroutineCountFromRezzedIceSubtype;
  }
  if (def.dynamicEtrSubroutineCountFromCorpHandSize) {
    card.dynamicEtrSubroutineCountFromCorpHandSize = true;
  }
  if (def.runnerIcebreakerAbilityAdditionalCostOnThisServer !== undefined) {
    card.runnerIcebreakerAbilityAdditionalCostOnThisServer =
      def.runnerIcebreakerAbilityAdditionalCostOnThisServer;
  }
  if (def.gainCreditsOnTraceInitiated !== undefined) {
    card.gainCreditsOnTraceInitiated = def.gainCreditsOnTraceInitiated;
  }
  if (def.onGripRdSuccessInstallSelfIgnoringCosts) {
    card.onGripRdSuccessInstallSelfIgnoringCosts = true;
  }
  if (def.onGripArchivesSuccessInstallSelfIgnoringCosts) {
    card.onGripArchivesSuccessInstallSelfIgnoringCosts = true;
  }
  if (def.strengthPerCorpCardInHq) {
    card.strengthPerCorpCardInHq = def.strengthPerCorpCardInHq;
  }
  if (def.rezCostIncreasePerCorpCardInHq) {
    card.rezCostIncreasePerCorpCardInHq = def.rezCostIncreasePerCorpCardInHq;
  }
  if (def.jackOutOnThisServerTrashRunnerProgram) {
    card.jackOutOnThisServerTrashRunnerProgram = true;
  }
  if (def.runnerCannotPlayCurrentEvents) {
    card.runnerCannotPlayCurrentEvents = true;
  }
  if (def.morphOddAdvancementSubtypeSwap) {
    card.morphOddAdvancementSubtypeSwap = {
      ...def.morphOddAdvancementSubtypeSwap,
    };
  }
  if (def.supplierHost) {
    card.supplierHost = true;
  }
  if (def.onFirstRunnerCreditPoolEmptyThisTurn) {
    card.onFirstRunnerCreditPoolEmptyThisTurn = structuredClone(
      def.onFirstRunnerCreditPoolEmptyThisTurn,
    );
  }
  if (def.trashSelfWhenRunnerTagged) {
    card.trashSelfWhenRunnerTagged = true;
  }
  if (def.playersCannotTrashThisIce) {
    card.playersCannotTrashThisIce = true;
  }
  if (def.runnerFirstInstallCostIncreasePerPowerCounterOnThis) {
    card.runnerFirstInstallCostIncreasePerPowerCounterOnThis =
      def.runnerFirstInstallCostIncreasePerPowerCounterOnThis;
  }
  if (def.handSizeBonusPerInstalledCopyWithSameDefId) {
    card.handSizeBonusPerInstalledCopyWithSameDefId =
      def.handSizeBonusPerInstalledCopyWithSameDefId;
  }
  if (def.trashSelfOnUnsuccessfulRunThisTurn) {
    card.trashSelfOnUnsuccessfulRunThisTurn = true;
  }
  if (def.onCorpRemoteServerCreated) {
    card.onCorpRemoteServerCreated = structuredClone(
      def.onCorpRemoteServerCreated,
    );
  }
  if (def.onEncounterRezzedAfterApproach) {
    card.onEncounterRezzedAfterApproach = structuredClone(
      def.onEncounterRezzedAfterApproach,
    );
  }
  if (def.advancementRequirementIncreasePerCorpBadPublicity !== undefined) {
    card.advancementRequirementIncreasePerCorpBadPublicity =
      def.advancementRequirementIncreasePerCorpBadPublicity;
  }
  if (def.oncePerTurnPaidAbilities) {
    card.oncePerTurnPaidAbilities = true;
  }
  if (def.blackguardForceRezOnExpose) {
    card.blackguardForceRezOnExpose = true;
  }
  if (def.breakerOnlyOutermostIce) card.breakerOnlyOutermostIce = true;
  if (def.breakerOnlyInnermostIce) card.breakerOnlyInnermostIce = true;
  if (def.onScoreIfRunnerTaggedPlaceAgendaCounter) {
    card.onScoreIfRunnerTaggedPlaceAgendaCounter = true;
  }
  if (def.playRequiresCorpBadPublicityGte !== undefined) {
    card.playRequiresCorpBadPublicityGte = def.playRequiresCorpBadPublicityGte;
  }
  if (def.onEncounter) card.onEncounter = structuredClone(def.onEncounter);
  if (def.onPass) card.onPass = structuredClone(def.onPass);
  if (def.onBypass) card.onBypass = structuredClone(def.onBypass);
  if (def.onBypassMayInstallFromHeap) {
    card.onBypassMayInstallFromHeap = { ...def.onBypassMayInstallFromHeap };
  }
  if (def.onFirstProgramInstallEachTurn) {
    card.onFirstProgramInstallEachTurn = structuredClone(
      def.onFirstProgramInstallEachTurn,
    );
  }
  if (def.onFirstHardwareInstallEachTurn) {
    card.onFirstHardwareInstallEachTurn = structuredClone(
      def.onFirstHardwareInstallEachTurn,
    );
  }
  if (def.onFirstEncounterEachRun) {
    card.onFirstEncounterEachRun = structuredClone(def.onFirstEncounterEachRun);
  }
  if (def.onFirstCorpCardTrashEachTurn) {
    card.onFirstCorpCardTrashEachTurn = structuredClone(
      def.onFirstCorpCardTrashEachTurn,
    );
  }
  if (def.onFirstRunnerStoleOrTrashedCorpCardThisTurn) {
    card.onFirstRunnerStoleOrTrashedCorpCardThisTurn = structuredClone(
      def.onFirstRunnerStoleOrTrashedCorpCardThisTurn,
    );
  }
  if (def.onAccessTrash) {
    card.onAccessTrash = structuredClone(def.onAccessTrash);
  }
  if (def.onFirstCorpRootInstallEachTurn) {
    card.onFirstCorpRootInstallEachTurn = structuredClone(
      def.onFirstCorpRootInstallEachTurn,
    );
  }
  if (def.onAccessRequiresRezzed) card.onAccessRequiresRezzed = true;
  if (def.onAccessRequiresInstalled) card.onAccessRequiresInstalled = true;
  if (def.onPassHost) card.onPassHost = structuredClone(def.onPassHost);
  if (def.hostedCreditsOnAnyIceRez !== undefined) {
    card.hostedCreditsOnAnyIceRez = def.hostedCreditsOnAnyIceRez;
  }
  if (def.hostedCreditsSpendForInstallTypes) {
    card.hostedCreditsSpendForInstallTypes = [
      ...def.hostedCreditsSpendForInstallTypes,
    ];
  }
  if (def.paidAbilitiesOncePerTurn) {
    card.paidAbilitiesOncePerTurn = true;
  }
  if (def.hostedCreditsSpendFor) {
    card.hostedCreditsSpendFor = [...def.hostedCreditsSpendFor];
  }
  if (def.hostedCreditsSpendForInstallSubtypes) {
    card.hostedCreditsSpendForInstallSubtypes = [
      ...def.hostedCreditsSpendForInstallSubtypes,
    ];
  }
  if (def.hostedCreditsSpendForInstallExcludeSubtypes) {
    card.hostedCreditsSpendForInstallExcludeSubtypes = [
      ...def.hostedCreditsSpendForInstallExcludeSubtypes,
    ];
  }
  if (def.accessTrashSelfNonAgendaThenDraw) {
    card.accessTrashSelfNonAgendaThenDraw = true;
  }
  if (def.rezAdditionalCost) {
    card.rezAdditionalCost = structuredClone(def.rezAdditionalCost);
  }
  if (def.onHostRezzed) card.onHostRezzed = structuredClone(def.onHostRezzed);
  if (def.onHostDerezzed) {
    card.onHostDerezzed = structuredClone(def.onHostDerezzed);
  }
  if (def.onHostEncounter) {
    card.onHostEncounter = structuredClone(def.onHostEncounter);
  }
  if (def.threatCannotSpendCreditsDuringSubs !== undefined) {
    card.threatCannotSpendCreditsDuringSubs =
      def.threatCannotSpendCreditsDuringSubs;
  }
  if (def.onApproachServer) {
    card.onApproachServer = structuredClone(def.onApproachServer);
  }
  if (def.onApproachServerOncePerRun) {
    card.onApproachServerOncePerRun = true;
  }
  if (def.onApproachIce) {
    card.onApproachIce = structuredClone(def.onApproachIce);
  }
  if (def.onApproachIceOncePerRun) {
    card.onApproachIceOncePerRun = true;
  }
  if (def.identityFlippedHooks) {
    card.identityFlippedHooks = structuredClone(def.identityFlippedHooks);
  }
  if (def.additionalCostOnScoreAgendaInstalledThisTurn) {
    card.additionalCostOnScoreAgendaInstalledThisTurn = structuredClone(
      def.additionalCostOnScoreAgendaInstalledThisTurn,
    );
  }
  if (def.onRunnerDiscardOverMaxHand) {
    card.onRunnerDiscardOverMaxHand = structuredClone(
      def.onRunnerDiscardOverMaxHand,
    );
  }
  if (def.onCreditsGainedFromAgendaOrOperationAbility) {
    card.onCreditsGainedFromAgendaOrOperationAbility = structuredClone(
      def.onCreditsGainedFromAgendaOrOperationAbility,
    );
  }
  if (def.remoteOnly) card.remoteOnly = true;
  if (def.persistent) card.persistent = true;
  if (def.rezOnlyDuringCorpTurn) card.rezOnlyDuringCorpTurn = true;
  if (def.firstRunCannotTargetRemote) card.firstRunCannotTargetRemote = true;
  if (def.iceGainsTrashToResolveChosenSubOnEncounter) {
    card.iceGainsTrashToResolveChosenSubOnEncounter = true;
  }
  if (def.onTurnBegin) card.onTurnBegin = structuredClone(def.onTurnBegin);
  if (def.onCorpTurnBegin) {
    card.onCorpTurnBegin = structuredClone(def.onCorpTurnBegin);
  }
  if (def.onGameStart) card.onGameStart = structuredClone(def.onGameStart);
  if (def.onInstall) card.onInstall = structuredClone(def.onInstall);
  if (def.onUninstall) card.onUninstall = structuredClone(def.onUninstall);
  if (def.onInstallWithoutSpendingCredits) {
    card.onInstallWithoutSpendingCredits = structuredClone(
      def.onInstallWithoutSpendingCredits,
    );
  }
  if (def.onAccessFaceupInstalledAgenda) {
    card.onAccessFaceupInstalledAgenda = structuredClone(
      def.onAccessFaceupInstalledAgenda,
    );
  }
  if (def.onInstallFromNonHq) {
    card.onInstallFromNonHq = structuredClone(def.onInstallFromNonHq);
  }
  if (def.onCorpTurnEnd) {
    card.onCorpTurnEnd = structuredClone(def.onCorpTurnEnd);
  }
  if (def.onDiscardPhaseEnd) {
    card.onDiscardPhaseEnd = structuredClone(def.onDiscardPhaseEnd);
  }
  if (def.onWouldDrawOncePerTurn) {
    card.onWouldDrawOncePerTurn = structuredClone(def.onWouldDrawOncePerTurn);
  }
  if (def.onFirstTrashMatchingRunnerIdentityFactionEachTurn) {
    card.onFirstTrashMatchingRunnerIdentityFactionEachTurn = structuredClone(
      def.onFirstTrashMatchingRunnerIdentityFactionEachTurn,
    );
  }
  if (def.onFirstRevealEachTurn) {
    card.onFirstRevealEachTurn = structuredClone(def.onFirstRevealEachTurn);
  }
  if (def.mirrormorphOnThirdDistinctAction) {
    card.mirrormorphOnThirdDistinctAction = structuredClone(
      def.mirrormorphOnThirdDistinctAction,
    );
    card.mirrormorphTrackDistinctActions = true;
  }
  if (def.blankIdentitiesWhileResolving) {
    card.blankIdentitiesWhileResolving = true;
  }
  if (def.onCorpActionPhaseEnd) {
    card.onCorpActionPhaseEnd = structuredClone(def.onCorpActionPhaseEnd);
  }
  if (def.onRunnerActionPhaseEnd) {
    card.onRunnerActionPhaseEnd = structuredClone(def.onRunnerActionPhaseEnd);
  }
  if (def.onAnyIceRez) {
    card.onAnyIceRez = structuredClone(def.onAnyIceRez);
  }
  if (def.onFirstAgendaScoredOrStolenThisTurn) {
    card.onFirstAgendaScoredOrStolenThisTurn = structuredClone(
      def.onFirstAgendaScoredOrStolenThisTurn,
    );
  }
  if (def.onRunBegin) {
    card.onRunBegin = structuredClone(def.onRunBegin);
  }
  if (def.onMovedToServerRoot) {
    card.onMovedToServerRoot = structuredClone(def.onMovedToServerRoot);
  }
  if (def.advancedIceProtectingThisServerStrengthBonus !== undefined) {
    card.advancedIceProtectingThisServerStrengthBonus =
      def.advancedIceProtectingThisServerStrengthBonus;
  }
  if (def.onRunBeginMaySpendAgendaCounterRezUpToIceProtectingAttacked) {
    card.onRunBeginMaySpendAgendaCounterRezUpToIceProtectingAttacked = {
      ...def.onRunBeginMaySpendAgendaCounterRezUpToIceProtectingAttacked,
    };
  }
  if (def.onCorpTurnEndDerezUpToIceProtectingLightningServer) {
    card.onCorpTurnEndDerezUpToIceProtectingLightningServer = {
      ...def.onCorpTurnEndDerezUpToIceProtectingLightningServer,
    };
  }
  if (def.oncePerTurnOnRezIceProtectingThisServerDuringRun) {
    card.oncePerTurnOnRezIceProtectingThisServerDuringRun = {
      ...def.oncePerTurnOnRezIceProtectingThisServerDuringRun,
    };
  }
  if (def.onRezApOrDestroyerIceDuringRun) {
    card.onRezApOrDestroyerIceDuringRun = {
      ...def.onRezApOrDestroyerIceDuringRun,
    };
  }
  if (def.derezAtAnyTurnEnd) {
    card.derezAtAnyTurnEnd = true;
  }
  if (def.powerOnHqRdRunEndIfAccessedGte) {
    card.powerOnHqRdRunEndIfAccessedGte = {
      ...def.powerOnHqRdRunEndIfAccessedGte,
    };
  }
  if (def.bonusAccessOnHqRdBreachWhileTagged !== undefined) {
    card.bonusAccessOnHqRdBreachWhileTagged =
      def.bonusAccessOnHqRdBreachWhileTagged;
  }
  if (def.bonusAccessOnFirstHqBreachThisTurn !== undefined) {
    card.bonusAccessOnFirstHqBreachThisTurn =
      def.bonusAccessOnFirstHqBreachThisTurn;
  }
  if (def.bonusAccessOnHqBreach !== undefined) {
    card.bonusAccessOnHqBreach = def.bonusAccessOnHqBreach;
  }
  if (def.bonusAccessOnRdBreach !== undefined) {
    card.bonusAccessOnRdBreach = def.bonusAccessOnRdBreach;
  }
  if (def.threatBasicTrashAdditionalCostTrashHq !== undefined) {
    card.threatBasicTrashAdditionalCostTrashHq =
      def.threatBasicTrashAdditionalCostTrashHq;
  }
  if (def.wageWorkersTrackActions) {
    card.wageWorkersTrackActions = true;
  }
  if (def.onSuccessfulRun) {
    card.onSuccessfulRun = structuredClone(def.onSuccessfulRun);
  }
  if (def.onSuccessfulRunOnRd) {
    card.onSuccessfulRunOnRd = structuredClone(def.onSuccessfulRunOnRd);
  }
  if (def.onPassUnrezzedIce) {
    card.onPassUnrezzedIce = structuredClone(def.onPassUnrezzedIce);
  }
  if (def.onPassRezzedIce) {
    card.onPassRezzedIce = structuredClone(def.onPassRezzedIce);
  }
  if (typeof def.whileScoredMeatDamageIncrease === "number") {
    card.whileScoredMeatDamageIncrease = def.whileScoredMeatDamageIncrease;
  }
  if (def.blocksRunnerRunsOnHostServer) {
    card.blocksRunnerRunsOnHostServer = true;
  }
  if (def.trashSelfWhenFullyBrokenByRunner) {
    card.trashSelfWhenFullyBrokenByRunner = true;
  }
  if (def.trashSelfOnCorpSuccessfulHqRun) {
    card.trashSelfOnCorpSuccessfulHqRun = true;
  }
  if (typeof def.gainCreditsWhenRunnerHostsProgramOnSelf === "number") {
    card.gainCreditsWhenRunnerHostsProgramOnSelf =
      def.gainCreditsWhenRunnerHostsProgramOnSelf;
  }
  if (def.onCorpBasicClickForCreditOrDraw) {
    card.onCorpBasicClickForCreditOrDraw = structuredClone(
      def.onCorpBasicClickForCreditOrDraw,
    );
  }
  if (def.onSuccessfulRunOncePerTurn) {
    card.onSuccessfulRunOncePerTurn = true;
  }
  if (def.onSuccessfulTraceDuringRun) {
    card.onSuccessfulTraceDuringRun = structuredClone(
      def.onSuccessfulTraceDuringRun,
    );
  }
  if (def.onBreakSubroutine) {
    card.onBreakSubroutine = structuredClone(def.onBreakSubroutine);
  }
  if (def.onBreakSubroutineMayPayCreditsBreakAnother) {
    card.onBreakSubroutineMayPayCreditsBreakAnother = {
      ...def.onBreakSubroutineMayPayCreditsBreakAnother,
    };
  }
  if (def.strengthBonusOnBreakSubForRun !== undefined) {
    card.strengthBonusOnBreakSubForRun = def.strengthBonusOnBreakSubForRun;
  }
  if (def.installedCardsTrashCostBonus !== undefined) {
    card.installedCardsTrashCostBonus = def.installedCardsTrashCostBonus;
  }
  if (
    def.mayImmediatelyRezIceOnInstallProtectingThisServerDiscount !== undefined
  ) {
    card.mayImmediatelyRezIceOnInstallProtectingThisServerDiscount =
      def.mayImmediatelyRezIceOnInstallProtectingThisServerDiscount;
  }
  if (def.onAccess) card.onAccess = structuredClone(def.onAccess);
  if (def.onTrash) card.onTrash = structuredClone(def.onTrash);
  if (def.onTrashWhileAccessed) {
    card.onTrashWhileAccessed = structuredClone(def.onTrashWhileAccessed);
  }
  if (def.onVirusPurge) card.onVirusPurge = structuredClone(def.onVirusPurge);
  if (def.onBreachHqIfHostingCorpCard) {
    card.onBreachHqIfHostingCorpCard = structuredClone(
      def.onBreachHqIfHostingCorpCard,
    );
  }
  if (def.onBreachRd) {
    card.onBreachRd = structuredClone(def.onBreachRd);
  }
  if (def.onTrashFromGripOrStack) {
    card.onTrashFromGripOrStack = structuredClone(def.onTrashFromGripOrStack);
  }
  if (def.onRezzedCardTrashed) {
    card.onRezzedCardTrashed = structuredClone(def.onRezzedCardTrashed);
  }
  if (def.onFirstTagThisTurn) {
    card.onFirstTagThisTurn = structuredClone(def.onFirstTagThisTurn);
  }
  if (def.preventFirstTagThisTurn) {
    card.preventFirstTagThisTurn = true;
  }
  if (def.onTakeTagsWhenUntagged) {
    card.onTakeTagsWhenUntagged = structuredClone(def.onTakeTagsWhenUntagged);
  }
  if (def.connectionBasicTrashAdditionalCostTrashHq) {
    card.connectionBasicTrashAdditionalCostTrashHq = true;
  }
  if (def.onEncounterEndIfRezzedThisTurn) {
    card.onEncounterEndIfRezzedThisTurn = structuredClone(
      def.onEncounterEndIfRezzedThisTurn,
    );
  }
  if (def.onEncounterEnd) {
    card.onEncounterEnd = structuredClone(def.onEncounterEnd);
  }
  if (def.onAfterOperationOrExpendable) {
    card.onAfterOperationOrExpendable = structuredClone(
      def.onAfterOperationOrExpendable,
    );
  }
  if (def.creditsOnFirstRdTrashThisTurn !== undefined) {
    card.creditsOnFirstRdTrashThisTurn = def.creditsOnFirstRdTrashThisTurn;
  }
  if (def.onFirstPassRezzedCodeGateOrSentryThisTurn) {
    card.onFirstPassRezzedCodeGateOrSentryThisTurn = structuredClone(
      def.onFirstPassRezzedCodeGateOrSentryThisTurn,
    );
  }
  if (def.onFirstCoreDamageThisTurn) {
    card.onFirstCoreDamageThisTurn = structuredClone(
      def.onFirstCoreDamageThisTurn,
    );
  }
  if (def.onSufferCoreDamage) {
    card.onSufferCoreDamage = structuredClone(def.onSufferCoreDamage);
  }
  if (def.onHostFullyBrokenThisEncounter) {
    card.onHostFullyBrokenThisEncounter = structuredClone(
      def.onHostFullyBrokenThisEncounter,
    );
  }
  if (def.onInstallProgramFromHeap) {
    card.onInstallProgramFromHeap = structuredClone(
      def.onInstallProgramFromHeap,
    );
  }
  if (def.onFirstRdRunBeginThisTurn) {
    card.onFirstRdRunBeginThisTurn = structuredClone(
      def.onFirstRdRunBeginThisTurn,
    );
  }
  if (def.onFirstArchivesRunBeginThisTurn) {
    card.onFirstArchivesRunBeginThisTurn = structuredClone(
      def.onFirstArchivesRunBeginThisTurn,
    );
  }
  if (def.onFirstRunBeginThisTurn) {
    card.onFirstRunBeginThisTurn = structuredClone(def.onFirstRunBeginThisTurn);
  }
  if (def.maxRemoteServers !== undefined) {
    card.maxRemoteServers = def.maxRemoteServers;
  }
  if (def.loseClickOnProtectingIceEncounterEndIfBroke) {
    card.loseClickOnProtectingIceEncounterEndIfBroke = true;
  }
  if (def.cannotRunRemotesUntilCentralRunThisTurn) {
    card.cannotRunRemotesUntilCentralRunThisTurn = true;
  }
  if (def.removeVirusOrTrashOnEncounterEndIfBroke) {
    card.removeVirusOrTrashOnEncounterEndIfBroke = true;
  }
  if (typeof def.corpGainsCreditsOnEncounterEndIfBroke === "number") {
    card.corpGainsCreditsOnEncounterEndIfBroke =
      def.corpGainsCreditsOnEncounterEndIfBroke;
  }
  if (typeof def.strengthPenaltyPerGripCard === "number") {
    card.strengthPenaltyPerGripCard = def.strengthPenaltyPerGripCard;
  }
  if (typeof def.gainCreditsOnEachBadPublicityTake === "number") {
    card.gainCreditsOnEachBadPublicityTake =
      def.gainCreditsOnEachBadPublicityTake;
  }
  if (typeof def.corpLosesCreditsOnCreateServer === "number") {
    card.corpLosesCreditsOnCreateServer = def.corpLosesCreditsOnCreateServer;
  }
  if (def.hostNonAiIcebreaker) card.hostNonAiIcebreaker = true;
  if (def.hostedIcebreakerMemoryDoesNotCount) {
    card.hostedIcebreakerMemoryDoesNotCount = true;
  }
  if (typeof def.hostsAnyProgramMemoryCostLte === "number") {
    card.hostsAnyProgramMemoryCostLte = def.hostsAnyProgramMemoryCostLte;
  }
  if (def.hostsBioroidIceIgnoreInstallCost) {
    card.hostsBioroidIceIgnoreInstallCost = true;
  }
  if (def.preventSubroutineBreakOnBioroidByTrash) {
    card.preventSubroutineBreakOnBioroidByTrash = true;
  }
  if (def.playOrInstallDiscountByTrashingGripOncePerTurn !== undefined) {
    card.playOrInstallDiscountByTrashingGripOncePerTurn =
      def.playOrInstallDiscountByTrashingGripOncePerTurn;
  }
  if (def.gainCreditsOnFirstRunnerClickSpendThisTurn !== undefined) {
    card.gainCreditsOnFirstRunnerClickSpendThisTurn =
      def.gainCreditsOnFirstRunnerClickSpendThisTurn;
  }
  if (def.refundCreditsIfRunBeginsOnThisServerDuringClickAction !== undefined) {
    card.refundCreditsIfRunBeginsOnThisServerDuringClickAction =
      def.refundCreditsIfRunBeginsOnThisServerDuringClickAction;
  }
  if (def.onFirstRunnerClickSpendOrLoseDuringRun) {
    card.onFirstRunnerClickSpendOrLoseDuringRun = structuredClone(
      def.onFirstRunnerClickSpendOrLoseDuringRun,
    );
  }
  if (def.trashHostIfAllSubsBrokenThisEncounter) {
    card.trashHostIfAllSubsBrokenThisEncounter = true;
  }
  if (def.additionalRunInitiateCredits) {
    card.additionalRunInitiateCredits = {
      ...def.additionalRunInitiateCredits,
    };
  }
  if (def.additionalRunInitiatePerPowerCounter) {
    card.additionalRunInitiatePerPowerCounter = {
      ...def.additionalRunInitiatePerPowerCounter,
    };
  }
  if (def.additionalRunInitiateClicks !== undefined) {
    card.additionalRunInitiateClicks = def.additionalRunInitiateClicks;
  }
  if (def.rezSpendCreditsForPowerCounters) {
    card.rezSpendCreditsForPowerCounters = {
      max: def.rezSpendCreditsForPowerCounters.max,
    };
  }
  if (def.vacheronStealReplacement) card.vacheronStealReplacement = true;
  if (def.worthZeroAgendaPointsWhileHasAgendaCounters) {
    card.worthZeroAgendaPointsWhileHasAgendaCounters = true;
  }
  if (def.onFirstHardwareUseDuringRunEachTurn) {
    card.onFirstHardwareUseDuringRunEachTurn = structuredClone(
      def.onFirstHardwareUseDuringRunEachTurn,
    );
  }
  if (def.onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun) {
    card.onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun =
      structuredClone(def.onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun);
  }
  if (def.onFirstRemoteInstallThisTurn) {
    card.onFirstRemoteInstallThisTurn = structuredClone(
      def.onFirstRemoteInstallThisTurn,
    );
  }
  if (def.whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun !== undefined) {
    card.whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun =
      def.whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun;
  }
  if (def.onFirstVirusInstallThisTurn) {
    card.onFirstVirusInstallThisTurn = structuredClone(
      def.onFirstVirusInstallThisTurn,
    );
  }
  if (def.onVirusProgramInstall) {
    card.onVirusProgramInstall = structuredClone(def.onVirusProgramInstall);
  }
  if (def.onFirstCorpCardInstallEachTurn) {
    card.onFirstCorpCardInstallEachTurn = structuredClone(
      def.onFirstCorpCardInstallEachTurn,
    );
  }
  if (def.onFirstSuccessfulMarkRunThisTurn) {
    card.onFirstSuccessfulMarkRunThisTurn = structuredClone(
      def.onFirstSuccessfulMarkRunThisTurn,
    );
  }
  if (def.onFirstSuccessfulHqRunThisTurn) {
    card.onFirstSuccessfulHqRunThisTurn = structuredClone(
      def.onFirstSuccessfulHqRunThisTurn,
    );
  }
  if (def.onFirstSuccessfulCentralRunThisTurn) {
    card.onFirstSuccessfulCentralRunThisTurn = structuredClone(
      def.onFirstSuccessfulCentralRunThisTurn,
    );
  }
  if (def.onFirstSuccessfulRunThisTurn) {
    card.onFirstSuccessfulRunThisTurn = structuredClone(
      def.onFirstSuccessfulRunThisTurn,
    );
  }
  if (def.onFirstUnsuccessfulRunThisTurn) {
    card.onFirstUnsuccessfulRunThisTurn = structuredClone(
      def.onFirstUnsuccessfulRunThisTurn,
    );
  }
  if (def.loseCreditsOnFirstAdvertisementRezThisTurn !== undefined) {
    card.loseCreditsOnFirstAdvertisementRezThisTurn =
      def.loseCreditsOnFirstAdvertisementRezThisTurn;
  }
  if (def.onFirstEventTrashedThisTurn) {
    card.onFirstEventTrashedThisTurn = structuredClone(
      def.onFirstEventTrashedThisTurn,
    );
  }
  if (def.nonAiIcebreakerInstallStrengthBonusThisTurn !== undefined) {
    card.nonAiIcebreakerInstallStrengthBonusThisTurn =
      def.nonAiIcebreakerInstallStrengthBonusThisTurn;
  }
  if (def.onFirstInstallInThisServerRootThisTurn) {
    card.onFirstInstallInThisServerRootThisTurn = structuredClone(
      def.onFirstInstallInThisServerRootThisTurn,
    );
  }
  if (def.gainsSubroutinesWhileProtectingHq) {
    card.gainsSubroutinesWhileProtectingHq =
      def.gainsSubroutinesWhileProtectingHq.map((s) => ({
        id: s.id,
        text: s.text,
        effect: structuredClone(s.effect),
      }));
  }
  if (def.gainsSubroutinesBeforePrintedPerFaceupArchives) {
    const g = def.gainsSubroutinesBeforePrintedPerFaceupArchives;
    card.gainsSubroutinesBeforePrintedPerFaceupArchives = {
      subtype: g.subtype,
      type: g.type as import("../state/types.js").CardType,
      per: g.per,
      subroutine: {
        id: g.subroutine.id,
        text: g.subroutine.text,
        effect: structuredClone(g.subroutine.effect),
      },
    };
  }
  if (def.additionalTagsDuringOutermostIceEncounter !== undefined) {
    card.additionalTagsDuringOutermostIceEncounter =
      def.additionalTagsDuringOutermostIceEncounter;
  }
  if (def.onProgramOrHardwareInstall) {
    card.onProgramOrHardwareInstall = structuredClone(
      def.onProgramOrHardwareInstall,
    );
  }
  if (def.onHardwareInstallOrTrash) {
    card.onHardwareInstallOrTrash = structuredClone(
      def.onHardwareInstallOrTrash,
    );
  }
  if (def.onHardwareInstall) {
    card.onHardwareInstall = structuredClone(def.onHardwareInstall);
  }
  if (def.onPowerCountersGte) {
    card.onPowerCountersGte = {
      amount: def.onPowerCountersGte.amount,
      effect: structuredClone(def.onPowerCountersGte.effect),
    };
  }
  if (def.onHostedCreditsGte) {
    card.onHostedCreditsGte = {
      amount: def.onHostedCreditsGte.amount,
      effect: structuredClone(def.onHostedCreditsGte.effect),
    };
  }
  if (def.onAgendaScored) {
    card.onAgendaScored = structuredClone(def.onAgendaScored);
  }
  if (def.onAgendaScoredOrStolen) {
    card.onAgendaScoredOrStolen = structuredClone(def.onAgendaScoredOrStolen);
  }
  if (def.onAgendaStolen) {
    card.onAgendaStolen = structuredClone(def.onAgendaStolen);
  }
  if (def.onPassRezzedIceProtectingThisServer) {
    card.onPassRezzedIceProtectingThisServer = structuredClone(def.onPassRezzedIceProtectingThisServer);
  }
  if (def.onOtherAgendaStolen) {
    card.onOtherAgendaStolen = structuredClone(def.onOtherAgendaStolen);
  }
  if (def.onFullyBreakOncePerTurn) {
    card.onFullyBreakOncePerTurn = structuredClone(
      def.onFullyBreakOncePerTurn,
    );
  }
  if (def.onFullyBreak) {
    card.onFullyBreak = structuredClone(def.onFullyBreak);
  }
  if (def.hostedCreditsOnRunEventPlay !== undefined) {
    card.hostedCreditsOnRunEventPlay = def.hostedCreditsOnRunEventPlay;
  }
  if (def.hostedCreditsOnFirstEventPlayOncePerTurn !== undefined) {
    card.hostedCreditsOnFirstEventPlayOncePerTurn =
      def.hostedCreditsOnFirstEventPlayOncePerTurn;
  }
  if (def.spendHostedCreditsDuringRuns !== undefined) {
    card.spendHostedCreditsDuringRuns = def.spendHostedCreditsDuringRuns;
  }
  if (def.spendHostedCreditsToUseProgramsDuringRuns !== undefined) {
    card.spendHostedCreditsToUseProgramsDuringRuns =
      def.spendHostedCreditsToUseProgramsDuringRuns;
  }
  if (def.remainderOfTurnOnInstallPrintedCostGte) {
    card.remainderOfTurnOnInstallPrintedCostGte = {
      min: def.remainderOfTurnOnInstallPrintedCostGte.min,
      effect: structuredClone(def.remainderOfTurnOnInstallPrintedCostGte.effect),
    };
  }
  if (def.firstEncounterGainsSubroutine) {
    card.firstEncounterGainsSubroutine = {
      text: def.firstEncounterGainsSubroutine.text,
      effect: structuredClone(def.firstEncounterGainsSubroutine.effect),
    };
  }
  if (def.mayTakeTagForBonusAccessOnHqRdBreach !== undefined) {
    card.mayTakeTagForBonusAccessOnHqRdBreach =
      def.mayTakeTagForBonusAccessOnHqRdBreach;
  }
  if (def.maySwapOutermostIceOnPassAfterFullyBreakOncePerTurn !== undefined) {
    card.maySwapOutermostIceOnPassAfterFullyBreakOncePerTurn =
      def.maySwapOutermostIceOnPassAfterFullyBreakOncePerTurn;
  }
  if (def.creditsOnFirstAdvanceThisTurn !== undefined) {
    card.creditsOnFirstAdvanceThisTurn = def.creditsOnFirstAdvanceThisTurn;
  }
  if (def.onSuccessfulRunOtherServerOncePerTurn) {
    card.onSuccessfulRunOtherServerOncePerTurn = structuredClone(
      def.onSuccessfulRunOtherServerOncePerTurn,
    );
  }
  if (def.onSuccessfulRunEndOncePerTurn) {
    card.onSuccessfulRunEndOncePerTurn = structuredClone(
      def.onSuccessfulRunEndOncePerTurn,
    );
  }
  if (def.onSuccessfulRunEnd) {
    card.onSuccessfulRunEnd = structuredClone(def.onSuccessfulRunEnd);
  }
  if (def.onSpendCreditsOutsidePoolDuringRunOncePerTurn) {
    card.onSpendCreditsOutsidePoolDuringRunOncePerTurn = structuredClone(
      def.onSpendCreditsOutsidePoolDuringRunOncePerTurn,
    );
  }
  if (def.onFirstBadPublicityTakeEachTurn) {
    card.onFirstBadPublicityTakeEachTurn = structuredClone(
      def.onFirstBadPublicityTakeEachTurn,
    );
  }
  if (def.onArchivesFacedownTurnedFaceupGte) {
    card.onArchivesFacedownTurnedFaceupGte = structuredClone(
      def.onArchivesFacedownTurnedFaceupGte,
    );
  }
  if (def.powerCounterOnAgendaScoredOrStolenFromThisServer !== undefined) {
    card.powerCounterOnAgendaScoredOrStolenFromThisServer =
      def.powerCounterOnAgendaScoredOrStolenFromThisServer;
  }
  if (def.onBreachHqRdIfNoBreaksOncePerTurnMayBonusAccess !== undefined) {
    card.onBreachHqRdIfNoBreaksOncePerTurnMayBonusAccess =
      def.onBreachHqRdIfNoBreaksOncePerTurnMayBonusAccess;
  }
  if (def.onBreachRdIfAccessGteMayBonusAccess) {
    card.onBreachRdIfAccessGteMayBonusAccess = {
      ...def.onBreachRdIfAccessGteMayBonusAccess,
    };
  }
  if (def.onRemoveTags) {
    card.onRemoveTags = structuredClone(def.onRemoveTags);
  }
  if (def.onFirstAvoidOrRemoveTagThisTurn) {
    card.onFirstAvoidOrRemoveTagThisTurn = structuredClone(
      def.onFirstAvoidOrRemoveTagThisTurn,
    );
  }
  if (def.onAgendaScoredFromThisServer) {
    card.onAgendaScoredFromThisServer = structuredClone(
      def.onAgendaScoredFromThisServer,
    );
  }
  if (def.onFirstSuccessfulRunOnRdEndsThisTurn) {
    card.onFirstSuccessfulRunOnRdEndsThisTurn = structuredClone(
      def.onFirstSuccessfulRunOnRdEndsThisTurn,
    );
  }
  if (def.onFirstProgramOrHardwareTrashEachTurn) {
    card.onFirstProgramOrHardwareTrashEachTurn = structuredClone(
      def.onFirstProgramOrHardwareTrashEachTurn,
    );
  }
  if (def.onFirstAccessTrashEachTurn) {
    card.onFirstAccessTrashEachTurn = structuredClone(
      def.onFirstAccessTrashEachTurn,
    );
  }
  if (def.onRunnerTurnEnd) {
    card.onRunnerTurnEnd = structuredClone(def.onRunnerTurnEnd);
  }
  if (def.onFirstIceRezEachTurn) {
    card.onFirstIceRezEachTurn = structuredClone(def.onFirstIceRezEachTurn);
  }
  if (def.onSuccessfulRunOnThisServer) {
    card.onSuccessfulRunOnThisServer = structuredClone(def.onSuccessfulRunOnThisServer);
  }
  if (def.onRunnerTurnBegin) {
    card.onRunnerTurnBegin = structuredClone(def.onRunnerTurnBegin);
  }
  if (def.onEachCorpBadPublicityTake) {
    card.onEachCorpBadPublicityTake = structuredClone(def.onEachCorpBadPublicityTake);
  }
  if (def.onCorpTurnBeginIfRunnerUntagged) {
    card.onCorpTurnBeginIfRunnerUntagged = structuredClone(
      def.onCorpTurnBeginIfRunnerUntagged,
    );
  }
  if (def.onTurnBeginIfCorpNoBadPublicity) {
    card.onTurnBeginIfCorpNoBadPublicity = structuredClone(
      def.onTurnBeginIfCorpNoBadPublicity,
    );
  }
  if (def.onPowerCountersEmpty) {
    card.onPowerCountersEmpty = structuredClone(def.onPowerCountersEmpty);
  }
  if (def.ignoreAdditionalCostFirstDoubleEventEachTurn !== undefined) {
    card.ignoreAdditionalCostFirstDoubleEventEachTurn =
      def.ignoreAdditionalCostFirstDoubleEventEachTurn;
  }
  if (def.strengthBonusIfOutermostOnServer !== undefined) {
    card.strengthBonusIfOutermostOnServer = def.strengthBonusIfOutermostOnServer;
  }
  if (def.onFirstGripOrStackTrashBatchEachTurn) {
    card.onFirstGripOrStackTrashBatchEachTurn = structuredClone(
      def.onFirstGripOrStackTrashBatchEachTurn,
    );
  }
  if (def.onStealAgenda) {
    card.onStealAgenda = structuredClone(def.onStealAgenda);
  }
  if (def.onFirstResourcePaidAbilityEachTurn) {
    card.onFirstResourcePaidAbilityEachTurn = structuredClone(
      def.onFirstResourcePaidAbilityEachTurn,
    );
  }
  if (def.powerCounterOnAnyCardRez !== undefined) {
    card.powerCounterOnAnyCardRez = def.powerCounterOnAnyCardRez;
  }
  if (def.powerCounterOnAnyCorpInstall !== undefined) {
    card.powerCounterOnAnyCorpInstall = def.powerCounterOnAnyCorpInstall;
  }
  if (def.powerCountersOnPlay !== undefined) {
    card.powerCountersOnPlay = def.powerCountersOnPlay;
  }
  if (def.prevention) card.prevention = { ...def.prevention };
  if (def.bryanStinsonPlayArchivesTransactionWhileRunnerLt6c) {
    card.bryanStinsonPlayArchivesTransactionWhileRunnerLt6c = true;
    const bryanAb: import("../state/types.js").PaidAbility = {
      id: "bryan-stinson-play-tx",
      label:
        "[click]: Play a transaction from Archives, ignoring all costs; RFG it",
      clickCost: 1,
      creditCost: 0,
      cost: { clicks: 1 },
      windows: ["corp_action_paw"],
      effect: {
        op: "do",
        action: { kind: "bryan_stinson_play_archives_transaction" },
      },
    };
    card.paidAbilities = [...(card.paidAbilities ?? []), bryanAb];
  }
  return card;
}

/** Apply a card definition onto an existing instance (legacy stub helper). */
export function applyCardDef(card: CardInstance, defId: string): void {
  const fresh = instantiateCard(defId, card.id, card.zone);
  Object.assign(card, {
    ...fresh,
    id: card.id,
    zone: card.zone,
    faceup: card.faceup,
    rezzed: card.rezzed,
  });
}
