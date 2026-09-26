/** Core game-state types for the Netrunner engine library. */

import type { Effect } from "../effects/ir.js";

export type Side = "corp" | "runner";

export type CardType =
  | "identity"
  | "agenda"
  | "asset"
  | "upgrade"
  | "ice"
  | "operation"
  | "event"
  | "hardware"
  | "program"
  | "resource";

export type ZoneId =
  | "corp:rd"
  | "corp:hq"
  | "corp:archives"
  | "corp:score"
  | "runner:stack"
  | "runner:grip"
  | "runner:heap"
  | "runner:rig"
  | "runner:score"
  | "runner:set-aside"
  | "removed-from-game"
  | `server:${string}:root`
  | `server:${string}:ice`;

export type DamageType = "net" | "meat" | "brain";

export interface Subroutine {
  id: string;
  text: string;
  /** Effect IR executed when this sub resolves unbroken. */
  effect: Effect;
}

export interface BreakerAbility {
  /**
   * Ice subtype this breaker can break, e.g. barrier.
   * Use `"*"` for AI breakers that break any ice.
   */
  breaksSubtype: string;
  strength: number;
  /** Credits to break one subroutine (or one ability use when breakMaxSubs > 1). */
  breakCredits: number;
  /**
   * Max subroutines broken per paid break ability use (default 1).
   * Extra breaks in the same encounter after paying once are free until the
   * remaining budget is spent (Buzzsaw / Cleaver "break up to 2").
   */
  breakMaxSubs?: number;
  /** Credits to pump (+pumpStrength, default 1) via paid ability. */
  pumpCredits?: number;
  pumpStrength?: number;
  /**
   * When pumping, strength gain equals installed icebreaker count (Unity)
   * instead of the fixed pump effect amount.
   */
  pumpUsesIcebreakerCount?: boolean;
  /** Reduce breakCredits by this much after a successful run this turn (Marjanah). */
  breakCreditsDiscountIfSuccessfulRunThisTurn?: number;
}

export type PaidAbilityWindow =
  | "approach_paw"
  | "approach_server_paw"
  | "encounter_paw"
  | "corp_action_paw"
  | "runner_action_paw";

/** Cost model for paid abilities / play costs (CR 1.16). */
export interface CostSpec {
  clicks?: number;
  credits?: number;
  /** Spend from a card's recurring credit pool. */
  recurringCredits?: number;
  /** Spend hosted virus counters from this card. */
  virusCounters?: number;
  /** Spend hosted agenda counters from this card. */
  agendaCounters?: number;
  /** Trash this card as a cost. */
  trashSelf?: boolean;
  /** Trash this many cards from HQ (Corp). */
  trashFromHq?: number;
  /** Trash this many cards from grip (Runner). */
  trashFromGrip?: number;
}

/** Run started by an event or paid ability (Jailbreak, Red Team, Conduit). */
export interface StartsRunSpec {
  /** Target filter for the run. */
  servers: "any" | "central" | "hq_rd" | "rd" | "hq" | "archives";
  /** Red Team: only centrals not already run this turn. */
  requireNotRunThisTurn?: boolean;
  /** Conduit: +X R&D access where X = virus counters on source. */
  bonusAccessFromVirus?: boolean;
  /** Flat bonus accesses (Jailbreak). */
  bonusAccess?: number;
  /** Tread Lightly: ice rez cost increase for this run. */
  iceRezCostIncrease?: number;
  /** Overclock: place this many spendable credits on the run. */
  placeEventCredits?: number;
  /** Effect fired when this run is successful (source = ability/event card). */
  onSuccessfulRun?: Effect;
  /** Inside Job: bypass the first ice encounter of the run. */
  bypassFirstEncounter?: boolean;
  /** Sneakdoor: when run would succeed, change attacked server. */
  redirectSuccessTo?: "hq" | "rd" | "archives";
  /** Retrieval Run: on success, skip breach and may install program from heap. */
  skipBreachInstallProgramFromHeap?: boolean;
}

/** Minimal paid ability (CR 9.5.1) — body is effect IR. */
export interface PaidAbility {
  id: string;
  label: string;
  /** @deprecated prefer `cost` */
  clickCost: number;
  /** @deprecated prefer `cost` */
  creditCost: number;
  cost?: CostSpec;
  windows: PaidAbilityWindow[];
  effect: Effect;
  /** Enforce once-per-turn usage for this ability. */
  oncePerTurn?: boolean;
  /** Enforce once-per-run usage for this ability. */
  oncePerRun?: boolean;
  /** Require this many advancements on the source card. */
  requiresAdvancements?: number;
  /** Encounter ice must have this subtype (e.g. Abagnale bypass). */
  requireEncounterSubtype?: string;
  /** When set, this ability starts a run (server chosen via action.serverId). */
  startsRun?: StartsRunSpec;
}

export interface CardInstance {
  id: string;
  /** Definition id from card data (stable across instances). */
  defId?: string;
  title: string;
  type: CardType;
  side: Side;
  /** Printed install cost in credits (programs/hardware/resources/ice). */
  installCost: number;
  /** Corp rez cost (ice/assets/upgrades). */
  rezCost?: number;
  /** Play cost for operations / events. */
  playCost?: number;
  strength?: number;
  subtypes?: string[];
  subroutines?: Subroutine[];
  breaker?: BreakerAbility;
  /** Paid abilities usable in matching PAW windows (CR 9.5). */
  paidAbilities?: PaidAbility[];
  /**
   * Continuous / on-rez effect IR (e.g. prevent jack-out).
   * Evaluated when the card is rezzed.
   */
  onRez?: Effect;
  /** Effect IR when an operation/event is played. */
  onPlay?: Effect;
  /** Effect IR when Corp scores this agenda. */
  onScore?: Effect;
  /** Effect IR when Runner steals this agenda. */
  onSteal?: Effect;
  /** Effect IR when this ice is encountered (CR 6.5.1). */
  onEncounter?: Effect;
  /** Effect IR when this card's controller's turn begins (rezzed/installed). */
  onTurnBegin?: Effect;
  /** Effect IR when this card is installed. */
  onInstall?: Effect;
  /** Effect IR when the Runner makes a successful run (installed/rezzed source). */
  onSuccessfulRun?: Effect;
  /** Effect IR when this card is accessed (ambushes). */
  onAccess?: Effect;
  /**
   * Hardcoded prevention while this card is rezzed during a run.
   * Prefer onRez prevent IR; kept for back-compat with Lockdown tests.
   */
  prevention?: {
    jackOutForRun?: boolean;
  };
  /** Effect IR the first time the Runner receives a tag each turn (identities). */
  onFirstTagThisTurn?: Effect;
  /** Effect IR when Corp scores any agenda (identity continuous). */
  onAgendaScored?: Effect;
  /** Agenda points when scored/stolen. */
  agendaPoints?: number;
  /** Advancement requirement to score. */
  advancementRequirement?: number;
  /** Current advancement counters. */
  advancementTokens?: number;
  /** Printed trash cost (assets/upgrades). */
  trashCost?: number;
  /** Max recurring credits on this card. */
  recurringCreditsMax?: number;
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
  /** +strength while advancementTokens >= threshold (Pharos). */
  strengthBonusAtAdvancements?: { threshold: number; bonus: number };
  /** Hand-size modifier applied while installed / scored. */
  handSizeBonus?: number;
  /** Memory units this program uses (default 1 for programs). */
  memoryCost?: number;
  /** Bonus to Runner memory limit while installed (consoles / chips). */
  muBonus?: number;
  /** +strength per installed icebreaker (Echelon). */
  strengthBonusPerIcebreaker?: number;
  /** Lower install cost after a successful run this turn (Carmen). */
  installCostDiscountIfSuccessfulRunThisTurn?: number;
  /** Lower first program install cost this turn while this card is installed (DZMZ). */
  firstProgramInstallDiscount?: number;
  /** When hosted credits empty and card trashes, draw this many (Nico). */
  drawOnHostedEmpty?: number;
  /** Play restriction: Runner must be tagged. */
  playRequiresTagged?: boolean;
  /** Play restriction: Runner made a successful run last turn. */
  playRequiresSuccessfulRunLastTurn?: boolean;
  /** Trash this card when the run ends if it broke a sub this run (Mayfly). */
  trashAfterBreakingThisRun?: boolean;
  /** Gain this many credits when any agenda is scored or stolen (Pantograph). */
  creditsOnScoreOrSteal?: number;
  /** Zahya: gain 1¢ per access when HQ/R&D run ends (once per turn). */
  creditsPerAccessOnCentralRunEnd?: boolean;
  /** René: on access-trash, gain credits/draw once per turn. */
  onAccessTrashGain?: { credits: number; draw: number; oncePerTurn?: boolean };
  /** Run event metadata (played events that start a run). */
  runEvent?: StartsRunSpec;
  /** Trojan: must install hosted on a piece of ice. */
  installOnIce?: boolean;
  /** Ice instance this card is hosted on (trojans). */
  hostId?: string;
  /** Tranquilizer: derez host when virus counters reach this threshold. */
  derezHostAtVirus?: number;
  /** Amaze: give this many tags at run end if an agenda was stolen (persistent). */
  tagsIfAgendaStolenThisRun?: number;
  /** Manegarm: approach-server tax alternatives (Runner must pay one or ETR). */
  approachServerTax?: { clicks: number; credits: number };
  /** Karunā: after this 0-based sub index resolves, Runner may jack out. */
  offerJackOutAfterSub?: number;
  /** Carnivore: once per turn, trash N from grip to trash the accessed card. */
  accessTrashFromGrip?: { gripCards: number; oncePerTurn?: boolean };
  /** Pantograph: after ¢ on score/steal, may install from grip. */
  mayInstallOnScoreOrSteal?: boolean;
  /** Send a Message: may rez any ice ignoring all costs. */
  mayRezIceIgnoringCostsOnScoreOrSteal?: boolean;
  /** Tāo: when agenda scored/stolen, may swap two installed ice. */
  maySwapIceOnAgendaScoredOrStolen?: boolean;
  /** Malapert: when agenda scored from this server, search R&D for non-agenda. */
  searchRdNonAgendaOnScoreFromServer?: boolean;
  /** +1 strength per hosted advancement (Ice Wall). */
  strengthPerAdvancement?: number;
  /** Wraparound: +bonus unless Runner has an installed program of subtype. */
  strengthBonusIfNoInstalledSubtype?: { subtype: string; bonus: number };
  /** Lotus Field: ice strength cannot be lowered. */
  strengthCannotBeLowered?: boolean;
  /** Ice Carver: while encountering ice, modify ice strength. */
  runnerEncounterIceStrengthModifier?: number;
  /** Reina: first ice rez each turn costs this much more. */
  firstIceRezCostIncrease?: number;
  /** Xanadu: each ice rez costs this much more. */
  iceRezCostIncrease?: number;
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
  /** Clot: trash when Corp purges viruses (flag only until purge exists). */
  trashOnVirusPurge?: boolean;
  /** Power counters (Earthrise). */
  powerCounters?: number;
  powerCountersOnInstall?: number;
  trashWhenPowerEmpty?: boolean;
  /** Play only if successful run this turn. */
  playRequiresSuccessfulRunThisTurn?: boolean;
  /** Play only if successful HQ run this turn. */
  playRequiresSuccessfulHqRunThisTurn?: boolean;
  /** Hosted agenda counters (scored agendas). */
  agendaCounters?: number;
  /** +agenda points per hosted agenda counter (Beale). */
  agendaPointsPerAgendaCounter?: number;
  /** Ice cannot be broken by AI programs. */
  cannotBreakWithAi?: boolean;
  /** Ice cannot be broken by AI while advancements >= threshold (Hortum). */
  cannotBreakWithAiAtAdvancements?: number;
  /** Install this agenda faceup (public). */
  installFaceup?: boolean;
  /** Credits gained when this card is advanced. */
  creditsOnAdvance?: { default: number; atOrAbove?: number; bonus?: number };
  /** Reduce agenda advancement requirement in this server (SanSan). */
  advancementRequirementReduction?: number;
  /** Runs against this server cannot be declared successful (Crisium). */
  runsCannotBeSuccessful?: boolean;
  /** Trojan: host ice gains barrier+code gate+sentry (Egret). */
  hostGainsAllIceSubtypes?: boolean;
  /** Recurring credits may only be spent for these purposes. */
  recurringSpendFor?: Array<"trash" | "trash_asset" | "play_event">;
  /** Imp: mid-access trash accessed card by spending a virus counter. */
  accessTrashWithVirus?: boolean;
  /** Card may be advanced (assets/ice). */
  canAdvance?: boolean;
  /** Rez requires forfeiting 1 scored agenda (Archer, Corporate Town). */
  rezAdditionalCostForfeitAgenda?: boolean;
  /** Double: play costs an additional click (Celebrity Gift). */
  playAdditionalClick?: boolean;
  /** When this corp card would be trashed, may shuffle into R&D instead (Marilyn). */
  mayShuffleIntoRdWhenTrashed?: boolean;
  /** Bad publicity gained when this agenda is scored (Hostile Takeover). */
  badPublicityOnScore?: number;
  /** Play cost X ≤ Runner tags; places X advancements (Psychographics). */
  playCostXMaxRunnerTags?: boolean;
  /** Install: spend remaining credits as X for X power counters (Atman). */
  installSpendCreditsForPowerCounters?: boolean;
  /** +1 strength per hosted power counter. */
  strengthPerPowerCounter?: boolean;
  /** May only interface ice of equal strength (Atman). */
  interfaceRequiresEqualStrength?: boolean;
  /** On install, choose breaker subtype barrier/code gate/sentry (Chameleon). */
  chooseBreakerSubtypeOnInstall?: boolean;
  /** Return to grip during discard phase (Chameleon). */
  returnToGripAtDiscardPhase?: boolean;
  /** On install choose an ice; may pay to bypass that ice (Femme Fatale). */
  chooseIceOnInstallForBypass?: boolean;
  /** Ice id chosen by Femme Fatale (runtime). */
  chosenIceId?: string;
  /** Hosted programs lose abilities while hosted here (Magnet). */
  hostedProgramsLoseAbilities?: boolean;
  /** Abilities blanked while hosted on Magnet. */
  abilitiesBlanked?: boolean;
  /** Security Testing: name a server at turn begin. */
  securityTesting?: boolean;
  /** Named server for Security Testing (runtime). */
  namedServerId?: ServerId;
  /** HB Architects: first pass of rezzed bioroid → may rez bioroid −4¢. */
  rezBioroidDiscountOnFirstPass?: number;
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
  /** Bounce to stack at end of turn (Test Run). */
  bounceToStackAtTurnEnd?: boolean;
  /** Base link value (identities). */
  link?: number;
  /** Explicit unsupported clause notes from card data. */
  unsupported?: string[];
  /** Whether the card is faceup (Runner cards / accessed / Archives). */
  faceup: boolean;
  /** Corp installed cards: rezzed vs unrezzed. */
  rezzed: boolean;
  zone: ZoneId;
}

export type CentralServerId = "hq" | "rd" | "archives";
export type ServerId = CentralServerId | `remote-${number}`;

export interface Server {
  id: ServerId;
  kind: "central" | "remote";
  /** Ice positions: index 0 = outermost. CR 6.2 / 4.6.9. */
  ice: string[];
  /** Root cards (agendas/assets/upgrades). */
  root: string[];
}

export interface PlayerState {
  side: Side;
  clicks: number;
  credits: number;
  maxHandSize: number;
  identityId: string;
  /** Runner tags (CR 10.5). Corp unused in v0. */
  tags: number;
  /** Runner brain damage (CR 10.4). */
  brainDamage: number;
  /** Runner link (identity + modifiers). */
  link: number;
  /**
   * Runner base memory limit before card bonuses (default 4).
   * Corp unused.
   */
  memoryLimit: number;
  /** Deck / stack card ids, top at index 0. */
  deck: string[];
  hand: string[];
  discard: string[];
  score: string[];
  /** Runner only: installed rig card ids. */
  rig: string[];
  /** Corp bad publicity (CR 10.6). */
  badPublicity?: number;
  /** Runner set-aside zone (Ayla). */
  setAside?: string[];
}

/** Per-turn flags shared by Gateway continuous / conditional abilities. */
export interface TurnBookkeeping {
  successfulRunThisTurn: boolean;
  successfulRunLastTurn: boolean;
  agendaPointsScoredThisTurn: number;
  programsInstalledThisTurn: number;
  basicDrawsThisTurn: number;
  usedAbilities: string[];
  installedThisTurn: string[];
  cannotScoreAgendas: boolean;
  tagsGivenThisTurn: number;
  hqBreachesThisTurn: number;
  /** Servers the Runner has run this turn (Red Team). */
  serversRunThisTurn: ServerId[];
  /** Zahya once-per-turn run-end credit ability used. */
  zahyaRunEndUsed: boolean;
  /** René once-per-turn access-trash ability used. */
  reneAccessTrashUsed: boolean;
  /** Carnivore once-per-turn access trash used. */
  carnivoreAccessTrashUsed: boolean;
  /** First ice rezzed this turn (Reina). */
  iceRezzedThisTurn: number;
  /** First run event played this turn (Ken Express). */
  runEventsPlayedThisTurn: number;
  /** First encounter this Runner turn used (Kit). */
  firstEncounterUsedThisTurn: boolean;
  /** First remote server created this Corp turn (NEH). */
  remotesCreatedThisTurn: number;
  /** Agenda points stolen this Runner turn (rolls to last turn for Punitive). */
  agendaPointsStolenThisTurn: number;
  /** Agenda points stolen last Runner turn. */
  agendaPointsStolenLastTurn: number;
  /** Successful HQ run this turn (Emergency Shutdown). */
  successfulHqRunThisTurn: boolean;
  /** Unrezzed ice ids passed during the most recent successful run (En Passant). */
  lastRunPassedUnrezzedIceIds: string[];
  /** Unrezzed ice passed during the current run (accumulates). */
  currentRunPassedUnrezzedIceIds: string[];
  /** Runner made at least one run this turn (Subliminal recursion). */
  runnerMadeRunThisTurn: boolean;
  /** Runner made a run last turn. */
  runnerMadeRunLastTurn: boolean;
  /** First Subliminal Messaging played this Corp turn. */
  subliminalPlayedThisTurn: boolean;
  /** First successful HQ Steve Cambridge trigger used. */
  steveCambridgeUsedThisTurn: boolean;
  /** First rezzed bioroid pass this turn (HB Architects). */
  bioroidPassedThisTurn: boolean;
  /** Turn-scoped ice strength boosts (Troubleshooter). */
  iceStrengthBoostsThisTurn: Record<string, number>;
  /** HB Architects pending rez discount for next bioroid rez. */
  pendingBioroidRezDiscount: number;
}

export type TurnPhase =
  | "corp_draw"
  | "corp_action"
  | "corp_discard"
  | "runner_action"
  | "runner_discard";

export type RunPhase =
  | "initiation"
  | "approach_ice"
  | "encounter"
  | "movement"
  | "success"
  | "breach"
  | "access"
  | "ends";

export interface EncounterState {
  iceId: string;
  /** Parallel to card.subroutines — true if broken this encounter. */
  broken: boolean[];
  /**
   * After paying for a multi-break ability, remaining free breaks for that
   * breaker this encounter (Buzzsaw / Cleaver).
   */
  freeBreaksRemaining?: { breakerId: string; remaining: number };
}

export interface RunState {
  attackedServerId: ServerId;
  phase: RunPhase;
  /** Ice index being approached/encountered, or null when past ice. */
  position: number | null;
  successful: boolean | null;
  accessedCardIds: string[];
  /** Cards still available to access during breach. */
  accessCandidates: string[];
  /** How many more cards the Runner may access this breach (centrals). */
  accessRemaining: number | null;
  encounter: EncounterState | null;
  /** Set when a subroutine ends the run. */
  endedTheRun: boolean;
  /** Runner cannot jack out for the remainder of this run (cannot effects). */
  cannotJackOut: boolean;
  /** Run-scoped icebreaker strength boosts (cardId → delta). */
  strengthBoosts: Record<string, number>;
  /** Encounter-scoped icebreaker strength boosts (cleared when passing ice). */
  encounterStrengthBoosts: Record<string, number>;
  /** Encounter-scoped ice strength boosts (cardId → delta). */
  iceStrengthBoosts: Record<string, number>;
  /** Card currently being accessed (awaiting steal/trash/no-action). */
  accessingCardId: string | null;
  /** Extra central accesses granted for this breach (Jailbreak / Docklands). */
  bonusAccess?: number;
  /** Breaker ids that broke a subroutine this run (Mayfly). */
  breakersThatBroke?: string[];
  /** Additional ice rez cost during this run (Tread Lightly). */
  iceRezCostIncrease?: number;
  /** Spendable credits from a run event (Overclock). */
  eventCredits?: number;
  /** Agendas stolen during this run (Amaze). */
  agendasStolenThisRun?: number;
  /** Ansel: Runner cannot steal or trash Corp cards this run. */
  cannotStealOrTrash?: boolean;
  /** Card id that started this run (event/ability); used for on-success effects. */
  runSourceId?: string;
  /** Effect to fire when this run succeeds (from run event / ability). */
  onSuccessfulRunEffect?: Effect;
  /** Persistent run-end tag effects (Amaze), survive trash during the run. */
  persistentTagsIfAgendaStolen?: number;
  /** After a sub offers jack-out, Runner must choose jack_out or continue. */
  pendingJackOutOffer?: boolean;
  /** Inside Job: bypass the first ice encounter. */
  bypassFirstEncounter?: boolean;
  /** Ice ids bypassed this run. */
  bypassedIceIds?: string[];
  /** Sneakdoor: redirect success to this server. */
  redirectSuccessTo?: "hq" | "rd" | "archives";
  /** Once-per-run paid abilities used this run (`cardId:abilityId`). */
  usedAbilitiesThisRun?: string[];
  /** Skip breach after success (Retrieval Run / Security Testing). */
  skipBreach?: boolean;
  /** On success instead of breach, may install a program from heap ignoring costs. */
  skipBreachInstallProgramFromHeap?: boolean;
}

export type ForbiddenAction =
  | "jack_out"
  | "basic_run"
  | "basic_gain_credit"
  | "basic_draw"
  | "basic_install"
  | "rez_ice"
  | "break_subroutine"
  | "play_operation"
  | "play_event";

export interface RuleCite {
  number: string;
  id: string;
}

/** Active cannot / forbid effects (CR 1.2.2). */
export interface Restriction {
  forbid: ForbiddenAction;
  cite: RuleCite;
  source: string;
}

export type CheckpointKind = "cost" | "timing" | "priority_window";

/** Nested resolve / cost / priority checkpoint frame (CR 1.16.3 / 9.2.4 / 9.11.1b). */
export interface CheckpointFrame {
  id: string;
  kind: CheckpointKind;
  label: string;
  cites: RuleCite[];
  /** What opened this frame (action type or step key). */
  openedBy: string;
}

/**
 * Nested paid-ability / priority window frame (CR 9.2.4 / 9.2.4d).
 * Window closes after two consecutive passes (or one pass when the opponent
 * has no legal window actions — auto-pass).
 */
export interface PriorityWindowFrame {
  id: string;
  stepKey: string;
  nestDepth: number;
  consecutivePasses: number;
  priorityHolder: Side;
  checkpointId: string;
}

export interface TraceState {
  id: string;
  sourceId: string;
  baseStrength: number;
  corpSpent: number;
  runnerLinkSpent: number;
  onSuccess: Effect;
  onFailure?: Effect;
}

export interface PendingDamage {
  type: DamageType;
  remaining: number;
  sourceId: string;
}

/** Corp chooses which program to trash (e.g. Rototurret). */
export interface PendingTrashProgram {
  sourceId: string;
  candidates: string[];
}

/** Host chooses among effect IR options (Ballista, Funhouse, etc.). */
export interface PendingChoice {
  sourceId: string;
  chooser: Side;
  options: Array<{ id: string; label: string; effect: Effect }>;
}

/**
 * Timing cursor labeled with CR appendix / step ids.
 * Appendix labels from timing-structures.json (11.2 / 11.3 / 11.4 / 11.5).
 */
export interface TimingCursor {
  structure: "corp_turn" | "runner_turn" | "run" | "breach";
  /** Stable YAML / deep-link id, e.g. sec_appendix_timing_structure_corps_turn_1_a */
  stepId: string;
  /** Printed appendix number when known, e.g. 11.2_1_a */
  stepNumber: string;
  label: string;
}

export interface GameConfig {
  /** Agenda points required to win (default 7). */
  agendaPointsToWin: number;
  /**
   * When true, mark `done` after the first Runner turn completes
   * (legacy vertical-slice demos). Library `createGame` sets false.
   */
  stopAfterFirstCycle: boolean;
}

export interface GameState {
  turnNumber: number;
  activeSide: Side;
  /** Derived from the timing graph node (kept for describe / filters). */
  turnPhase: TurnPhase;
  corp: PlayerState;
  runner: PlayerState;
  cards: Record<string, CardInstance>;
  servers: Record<ServerId, Server>;
  nextRemoteNumber: number;
  run: RunState | null;
  /** Explicit step-graph key, e.g. corp.takeAction */
  timingKey: string;
  timing: TimingCursor;
  /** Nested checkpoint stack (innermost last). */
  checkpoints: CheckpointFrame[];
  /** Nested priority / PAW stack (innermost last). */
  priorityStack: PriorityWindowFrame[];
  /** Active cannot effects. */
  restrictions: Restriction[];
  /** Pending interactive trace, if any. */
  trace: TraceState | null;
  /** Pending damage awaiting prevention, if any. */
  pendingDamage: PendingDamage | null;
  /** Pending Corp choice of program to trash. */
  pendingTrashProgram: PendingTrashProgram | null;
  /** Pending effect-IR choice (chooser must resolve). */
  pendingChoice: PendingChoice | null;
  /** Turn-scoped flags for conditional abilities. */
  turn: TurnBookkeeping;
  /** Cards removed from the game (Steve Cambridge). */
  removedFromGame: string[];
  /** Winner when the game has ended. */
  winner: Side | null;
  /** Win reason for hosts. */
  winReason: "corp_agenda" | "runner_agenda" | "flatline" | null;
  config: GameConfig;
  log: string[];
  /** True when the game (or demo cycle) has finished. */
  done: boolean;
}

export type InstallDestination =
  | { kind: "new_remote" }
  | { kind: "remote_root"; serverId: ServerId }
  | { kind: "protect"; serverId: ServerId }
  | { kind: "rig" }
  | { kind: "host_ice"; iceId: string };

export type Action =
  | { type: "pass_window" }
  | { type: "basic_gain_credit" }
  | { type: "basic_draw" }
  | {
      type: "basic_install";
      cardId: string;
      destination: InstallDestination;
    }
  | { type: "basic_run"; serverId: ServerId }
  | { type: "play_operation"; cardId: string }
  | { type: "play_event"; cardId: string; serverId?: ServerId }
  | { type: "advance"; cardId: string }
  | { type: "score_agenda"; cardId: string }
  | { type: "rez_ice"; cardId: string }
  | {
      type: "break_subroutine";
      breakerId: string;
      subIndex: number;
    }
  | {
      /** Spend [click] to break a subroutine on bioroid ice (card text). */
      type: "break_bioroid_subroutine";
      subIndex: number;
    }
  | {
      type: "use_paid_ability";
      cardId: string;
      abilityId: string;
      serverId?: ServerId;
    }
  | { type: "use_identity_ability"; abilityId: string }
  | { type: "continue_run" }
  | { type: "jack_out" }
  | { type: "access_card"; cardId: string }
  | { type: "steal_agenda"; cardId: string }
  | { type: "trash_accessed"; cardId: string }
  | { type: "finish_access" }
  | { type: "finish_breach" }
  | {
      /** Carnivore: trash N from grip to trash the accessed card. */
      type: "access_trash_from_grip";
    }
  | {
      /** Imp: spend 1 virus counter to trash the accessed card. */
      type: "access_trash_with_virus";
      cardId: string;
    }
  | { type: "boost_trace"; credits: number }
  | { type: "spend_link"; amount: number }
  | { type: "resolve_trace" }
  | { type: "prevent_damage"; amount: number }
  | { type: "accept_damage" }
  | { type: "choose_trash_program"; cardId: string }
  | { type: "choose_option"; optionId: string }
  | { type: "rez_asset"; cardId: string }
  | { type: "discard_to_hand_size" };

/** Host intent — same as Action for the pure library API. */
export type Intent = Action;

export type ApplyResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string; cites: RuleCite[] };

/** Side-filtered public view for future online hosts. */
export interface PublicView {
  viewer: Side;
  turnNumber: number;
  activeSide: Side;
  timingKey: string;
  timing: TimingCursor;
  done: boolean;
  winner: Side | null;
  winReason: GameState["winReason"];
  self: {
    clicks: number;
    credits: number;
    tags: number;
    brainDamage: number;
    link: number;
    maxHandSize: number;
    hand: string[];
    handCount: number;
    deckCount: number;
    discard: string[];
    score: string[];
    scorePoints: number;
    rig: string[];
    identityId: string;
  };
  opponent: {
    clicks: number;
    credits: number;
    tags: number;
    brainDamage: number;
    link: number;
    maxHandSize: number;
    handCount: number;
    deckCount: number;
    discardFaceup: string[];
    score: string[];
    scorePoints: number;
    rig: string[];
    identityId: string;
  };
  servers: Array<{
    id: ServerId;
    kind: Server["kind"];
    ice: Array<{
      id: string;
      title: string | null;
      rezzed: boolean;
      strength: number | null;
    }>;
    root: Array<{
      id: string;
      title: string | null;
      rezzed: boolean;
      type: CardType | null;
      advancementTokens: number | null;
    }>;
  }>;
  run: RunState | null;
  trace: TraceState | null;
  pendingDamage: PendingDamage | null;
  pendingTrashProgram: PendingTrashProgram | null;
  pendingChoice: PendingChoice | null;
  priorityStack: PriorityWindowFrame[];
  log: string[];
}
