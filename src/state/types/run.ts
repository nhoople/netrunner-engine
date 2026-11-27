/** The run in progress: its phase, the current encounter, and the run's own bookkeeping. */

import type { Effect } from "../../effects/ir.js";
import type { StartsRunSpec } from "./abilities.js";
import type { ServerId } from "./servers.js";
import type { CardType } from "./shared.js";

type RunPhase =
  | "initiation"
  | "approach_ice"
  | "encounter"
  | "movement"
  | "success"
  | "breach"
  | "access"
  | "ends";

interface EncounterState {
  iceId: string;
  /**
   * The encountered ice was uninstalled. The encounter ends once any open
   * paid ability window is completed (CR 6.2.7c, 8.5.10).
   */
  iceUninstalled?: boolean;
  /** Parallel to card.subroutines — true if broken this encounter. */
  broken: boolean[];
  /** Subroutines that resolved this encounter, including replacements (CR 9.8.9). */
  subroutinesResolved?: number;
  /**
   * Indexes marked in `broken` that the Runner did not break: they resolved,
   * were prevented from resolving, or were skipped. Read through
   * `encounterFullyBrokenByRunner` (`turnAndActions/break.ts`).
   */
  notBrokenByRunner?: number[];
  /** Breaker ids that broke a subroutine this encounter (Crypsis). */
  breakersThatBrokeThisEncounter?: string[];
  /**
   * After paying for a multi-break ability, remaining free breaks for that
   * breaker this encounter (Buzzsaw / Cleaver).
   */
  freeBreaksRemaining?: { breakerId: string; remaining: number };
  /**
   * Printed subroutines broken this encounter by a breaker the ice exempts
   * from its cap (Hammer: killers), which the cap does not count.
   */
  exemptPrintedBreaks?: number;
  /** Inazuma: the Runner cannot break any subroutine this encounter. */
  forbidRunnerBreakThisEncounter?: boolean;
  /**
   * Anvil: the Runner cannot break this ice's printed subroutines for the
   * remainder of this encounter. Lives on the encounter so it ends with it
   * (CR 9.10.1).
   */
  forbidRunnerBreakPrintedThisEncounter?: boolean;
  /**
   * Banner: subroutines cannot end the run for the remainder of this encounter.
   */
  forbidEndTheRunThisEncounter?: boolean;
  /**
   * Virtual Service Agent: a decoder broke a printed sub this encounter.
   */
  brokePrintedSubWithDecoder?: boolean;
  /**
   * Flux Capacitor instance ids that already offered may-charge for the first
   * break this encounter.
   */
  firstBreakChargeFiredIds?: string[];
  /** When-encountered interrupt: onEncounter not yet fired. */
  onEncounterPending?: boolean;
  /** AirbladeX: skip onEncounter on this ice. */
  onEncounterPrevented?: boolean;
  /** Sorocaban Blade: installed Runner cards trashed by this ice this encounter. */
  installedRunnerTrashesThisEncounter?: number;
  /** Tsakhia "Bankhar" Gantulga: this is the turn's first encounter with ice on the chosen server. */
  gantulgaReplaces?: boolean;
  /**
   * Stick and Poke: synthetic subroutine was prepended for this encounter and
   * must be removed when the encounter ends.
   */
  stickAndPokeSynthetic?: boolean;
  /** Sensei: this encounter has a synthetic ETR sub appended after printed. */
  senseiEtrSynthetic?: boolean;
  /** True once every printed (+synthetic) sub was broken by the Runner. */
  fullyBrokenByRunner?: boolean;
  /** Ids whose onHostFullyBrokenThisEncounter already fired this encounter. */
  hostFullyBrokenFiredIds?: string[];
  /**
   * Engram Flush: Corp-chosen card type for reveal-grip trash this encounter
   * (typically a Runner type: event / hardware / program / resource).
   */
  chosenCardType?: CardType;
  /**
   * Pelangi: ice subtypes granted for the remainder of this encounter.
   */
  grantedSubtypes?: string[];
  /**
   * Şifr-class: ice strength is lowered to this value for the remainder of
   * the encounter (CR 9.12.1a set layer). Only lowers; never raises. Cleared
   * when the encounter ends with this object.
   */
  strengthLoweredTo?: number;
}

export interface RunState {
  attackedServerId: ServerId;
  phase: RunPhase;
  /** Ice index being approached/encountered, or null when past ice. */
  position: number | null;
  /**
   * The ice in the Runner's position was uninstalled. The position exists
   * until the Runner moves (CR 6.2.4); `position` is the index the next ice
   * inward now has.
   */
  positionVacated?: boolean;
  /**
   * The approached ice was uninstalled. The approach ends once any open
   * paid ability window is completed (CR 6.2.7a, 8.5.10).
   */
  approachedIceUninstalled?: boolean;
  /**
   * Times net damage has become imminent this run, including damage that
   * an interrupt then prevents (CR 9.9.5a).
   */
  netDamageWould?: number;
  successful: boolean | null;
  /**
   * The Success Phase step has resolved for this run (CR 6.9.5a). A psi
   * game or trace started there brings the walk back to the step when it
   * finishes; the step then has nothing left to resolve.
   */
  successPhaseResolved?: boolean;
  /**
   * The attacked remote ceased to exist during an open paid ability window.
   * The run ends when that window closes (CR 4.6.8e).
   */
  endAfterPaidAbilityWindow?: boolean;
  /** Bandwidth: tags given that remove on successful run. */
  bandwidthTagsToRemoveOnSuccess?: number;
  /** Transport Monopoly-class: this run cannot be declared successful. */
  cannotDeclareSuccessful?: boolean;
  accessedCardIds: string[];
  /** Aumakua: true if Runner stole or trashed an accessed card this breach. */
  breachStoleOrTrashed?: boolean;
  /** Cards still available to access during breach. */
  accessCandidates: string[];
  /**
   * Cards that entered the breached server's root since the previous
   * checkpoint (CR 10.3.1j). Filled from the zone diff at 10.3.1a; also
   * holds entries when the Runner's declaration waits on an open choice.
   */
  cardsEnteredRootSinceCheckpoint?: string[];
  /** Remaining root entries the Runner has not declared yet (CR 10.3.1j). */
  pendingRootEntryIds?: string[];
  /** How many more cards the Runner may access this breach (centrals). */
  randomAccessLimit: number | null;
  /**
   * The breach is a breach of R&D whose `randomAccessLimit` counts only the
   * candidates chosen from the Corp's deck, not root upgrades (CR 7.3.5).
   * Set by `beginBreachAccess`; other breaches count every chosen candidate.
   */
  randomAccessLimitDeckOnly?: boolean;
  encounter: EncounterState | null;
  /**
   * Subroutines waiting for the Corp to choose each one's position among
   * the ones the ice already has (CR 9.8.2c).
   */
  pendingSubroutineInserts?: Array<{
    id: string;
    text: string;
    effect: Effect;
  }>;
  /**
   * The run event only allows these servers. "If successful" does not
   * trigger after the run moves off that set (CR 6.7.4a).
   */
  successTiedToServers?: StartsRunSpec["servers"];
  /** Set when a subroutine ends the run. */
  endedTheRun: boolean;
  /**
   * This encounter was forced while no run was in progress (Detente / Ganked!).
   * Ending the run ends the encounter only (CR 6.1.4b).
   */
  encounterOutsideRun?: boolean;
  /**
   * The encounter-end replacement moved the Runner instead of passing
   * this ice (CR 6.1.3e). Pass triggers do not fire.
   */
  passReplacedByEncounterEnd?: boolean;
  /**
   * While completing other open priority windows at Run Ends (CR 6.8.2c),
   * pending abilities resolve normally but new timing structures (e.g.
   * Formicary encounter) cannot be initiated.
   */
  forbidNewTimingStructures?: boolean;
  /** Runner cannot jack out for the remainder of this run (cannot effects). */
  cannotJackOut: boolean;
  /**
   * True once the Runner has spent [click] to break a subroutine on a
   * bioroid this run (Zed 1.0 subroutine gate).
   */
  lostClickToBreakThisRun?: boolean;
  /**
   * Icebreakers that gained System Seizure's run-duration rewrite for the
   * remainder of this run (CR 9.9.9).
   */
  strengthDurationRunInsteadBreakerIds?: string[];
  /** Armored Servers: trash 1 grip additional cost to jack out / break. */
  armoredServersTrashGripAdditionalCost?: boolean;
  /** Holmegaard: cannot access or breach remainder of run. */
  holmegaardForbidAccessBreach?: boolean;
  /** Down the White Nile — RNG Key named number for next access this run. */
  dtwnRngKeyNamedNumber?: number;
  dtwnRngKeySourceId?: string;
  dtwnRngKeyPendingReveal?: boolean;
  /** Council of the Crest — Code Replicator may jack out before reencounter. */
  cotcCodeReplicatorMayJackOut?: boolean;
  /** Ice ids that gained a Thunderbolt synthetic subroutine this run. */
  thunderboltGrantedIceIds?: string[];
  /** Howler: card id to trash at run end (set when its subroutine fires). */
  howlerId?: string;
  /** Howler: ice id it installed+rezzed, to derez at run end. */
  howlerInstalledIceId?: string;
  /**
   * Peeping Tom: ice instance ids that gained run-scoped ETR-unless-tag
   * subroutines; restore baseSubroutines at run end.
   */
  peepingTomIceIds?: string[];
  /** Card currently being accessed (awaiting steal/trash/no-action). */
  accessingCardId: string | null;
  /** Vikram 1.0: Runner cannot use programs for the remainder of this run. */
  kgCannotUsePrograms?: boolean;
  /** Interrupt 0: additional ¢ to use icebreaker break abilities this run. */
  kgIcebreakerBreakAdditionalCost?: number;
  /** Panchatantra: bonus subtypes granted to ice this run. */
  kgEncounterBonusSubtypes?: Record<string, string[]>;
  /** Mongoose: breaker ids already used to break on an ice this run. */
  kgBreakerUsedOnIceIds?: Record<string, string>;
  /** EMP Device: max ice rez count this run. */
  bfMaxIceRezThisRun?: number;
  /** EMP Device: ice rezzed so far this run under the limit. */
  bfIceRezzedThisRun?: number;
  /** Extra central accesses granted for this breach (Jailbreak / Docklands). */
  bonusAccess?: number;
  /** Runner spent credits outside their credit pool this run (Shackleton). */
  outsidePoolCreditSpendThisRun?: boolean;
  /** Beta Build: program installed by the event for return-on-end. */
  betaBuildTrackedInstallId?: string;
  /** Perfect Recall: titles Runner cannot steal/trash this run. */
  forbidStealTrashTitles?: string[];
  /**
   * After this run ends, begin a standalone breach of this server
   * (Virtuoso non-HQ mark). Cleared when the post-run breach shell starts.
   */
  breachWhenRunEnds?: ServerId;
  /**
   * True when `run` is a shell that exists only to host a post-run breach
   * (not a successful run; CR breach outside a run).
   */
  isPostRunBreach?: boolean;
  /** Mind's Eye: exclude cards in the attacked server root during breach. */
  cannotAccessRoot?: boolean;
  /**
   * Shiro-class: after the Corp declines to pay, breach this server mid-
   * encounter (nested), then resume the ice encounter.
   */
  pendingNestedBreach?: {
    server: ServerId;
    cannotAccessRoot?: boolean;
    resumeIceId: string;
  };
  /** True while a mid-encounter nested breach (Shiro-class) is in progress. */
  nestedBreachFromEncounter?: boolean;
  /** Attacked server to restore after a nested mid-encounter breach. */
  attackedServerIdBeforeNestedBreach?: ServerId;
  /**
   * Divide and Conquer-class: after the current breach completes, breach these
   * servers in order (optionally excluding root cards).
   */
  queuedBreachesAfterCurrent?: Array<{
    server: ServerId;
    cannotAccessRoot?: boolean;
  }>;
  /** Breaker ids that broke a subroutine this run (Mayfly). */
  breakersThatBroke?: string[];
  /** True once the Runner has begun breach of the attacked server this run. */
  breached?: boolean;
  /**
   * Letheia-class: card instance ids whose `onApproachServerOncePerRun`
   * trigger already fired this run.
   */
  approachServerTriggersFiredIds?: string[];
  /** Wake Implant: waiting on may-spend-power choice before building RD access. */
  wakeImplantPending?: boolean;
  /** Wake Implant: choice already resolved this breach. */
  wakeImplantResolved?: boolean;
  /** Mercury: waiting on may-bonus-access choice before building HQ/R&D access. */
  mercuryBreachPending?: boolean;
  /** Medium: resume beginBreachAccess after virus bonus-access choice. */
  mediumBreachPending?: boolean;
  /**
   * Midori-class: card instance ids whose `onApproachIceOncePerRun`
   * trigger already fired this run.
   */
  approachIceTriggersFiredIds?: string[];
  /** Cupellation: waiting on HQ-breach hosted-Corp bonus choice. */
  cupellationBreachPending?: boolean;
  /** Cupellation: already offered HQ-breach bonus this breach. */
  cupellationBreachResolved?: boolean;
  /** Akiko-class: waiting on onBreachRd psi/choice before building R&D access. */
  onBreachRdPending?: boolean;
  /** Akiko-class: onBreachRd already fired this breach. */
  onBreachRdResolved?: boolean;
  /** Heliamphora: hosted-instead ability used this Archives breach. */
  heliamphoraHostInsteadUsedThisBreach?: boolean;
  /** Heliamphora: card id awaiting host-instead vs access choice. */
  pendingHeliamphoraAccessCardId?: string;
  /** Pretty Mary: already offered may-bonus this breach. */
  prettyMaryBreachResolved?: boolean;
  /** The Twinning's bonus access was offered this breach. */
  twinningBreachResolved?: boolean;
  /** Mercury's bonus access was offered this breach. */
  mercuryBreachOffered?: boolean;
  /** Additional ice rez cost during this run (Tread Lightly). */
  iceRezCostIncrease?: number;
  /** Running Interference: pay additional rez equal to printed rez cost. */
  iceRezAdditionalCostEqualsPrintedRezCost?: boolean;
  /** Bribery: first approached unrezzed ice +X rez (X = bribery play cost). */
  briberyFirstIceAdditionalRezEqualsX?: boolean;
  /** Bribery: additional rez cost remaining for first unrezzed ice this run. */
  firstApproachedIceAdditionalRezCost?: number;
  /** Bribery: first-ice additional rez already applied/consumed. */
  briberyFirstIceRezConsumed?: boolean;
  /** Spendable credits from a run event (Overclock). */
  eventCredits?: number;
  /** Agendas stolen during this run (Amaze). */
  agendasStolenThisRun?: number;
  /**
   * SYNC BRE: reduce cards accessed on each breach by this many for the
   * remainder of the run.
   */
  breachAccessReduction?: number;
  /** Signal Jamming: cards cannot be installed until the run ends. */
  forbidInstallsUntilRunEnd?: boolean;
  /** The Turning Wheel: named central for +1 access this run. */
  tlmTurningWheelBonusServer?: "hq" | "rd";
  /** The Noble Path / similar: prevent all Runner damage this run. */
  preventAllDamageThisRun?: boolean;
  /** Dorm Computer: prevent all tags the Runner would take during this run. */
  preventAllTagsThisRun?: boolean;
  /**
   * The Runner would have taken tags during this run at least once
   * (Jesminder Sareen's "the first time each run", CR 9.9.5a).
   */
  runnerWouldTakeTagsThisRun?: boolean;
  /** Dedicated Neural Net: Corp chooses which HQ cards are accessed. */
  tlmCorpChoosesHqAccess?: boolean;
  /** Ansel: Runner cannot steal or trash Corp cards this run. */
  cannotStealOrTrash?: boolean;
  /** Pinhole Threading: an accessed agenda cannot be stolen or trashed this run. */
  cannotStealOrTrashAgendas?: boolean;
  /** The Future Perfect: the card being accessed cannot be stolen during this access. */
  stealForbiddenAccessCardId?: string;
  /**
   * When true, `beginBreachAccess` keeps existing `accessCandidates` /
   * `randomAccessLimit` (Pinhole replace-breach preset).
   */
  accessCandidatesPreset?: boolean;
  kitsuneIceToTrashAtBreachEnd?: string;
  bannedProgramInstanceIds?: string[];
  /** Card id that started this run (event/ability); used for on-success effects. */
  runSourceId?: string;
  /** Effect to fire when this run succeeds (from run event / ability). */
  onSuccessfulRunEffect?: Effect;
  /**
   * Place this many power counters on runSource whenever a subroutine
   * resolves (Raindrops Cut Stone).
   */
  addPowerCounterOnSubroutineResolve?: number;
  /** Effect to fire when this run ends (from run event); source = runSourceId. */
  onRunEndEffect?: Effect;
  /** Persistent run-end tag effects (Amaze), survive trash during the run. */
  persistentTagsIfAgendaStolen?: number;
  /** Card that created the persisted run-end instance (CR 9.12.5d). */
  persistentAmazeSourceId?: string;
  /** Compile (win): program installed ignoring costs this run. */
  winCompileInstalledProgramId?: string;
  /** Run-end delayed abilities were ordered by the player (CR 9.1.4). */
  delayedRunEndOrderResolved?: boolean;
  /** Re-enter run.ends after that order, skipping the head of the step. */
  resumeAfterDelayedOrder?: boolean;
  /** Option chosen for the run-end order, applied after the choice is logged. */
  delayedRunEndChoice?: string;
  /** Zone of each delayed ability's source when it became pending. */
  delayedRunEndSourceZone?: Record<string, string>;
  /** Logic Bomb: bypass the currently encountered ice. */
  bypassCurrentEncounter?: boolean;
  /** After a sub offers jack-out, Runner must choose jack_out or continue. */
  pendingJackOutOffer?: boolean;
  /** Feint: bypass the next N ice encounters. */
  bypassEncountersRemaining?: number;
  /** Inazuma: next encounter cannot break subroutines on encountered ice. */
  inazumaLockNextEncounter?: boolean;
  /**
   * Inazuma second sub: clear `cannotJackOut` when the next ice encounter
   * begins (printed: cannot jack out until after that encounter begins).
   */
  clearCannotJackOutOnNextEncounterBegin?: boolean;
  /** Inside Job: bypass the first ice encounter. */
  bypassFirstEncounter?: boolean;
  /** Recon: may jack out at first ice encounter. */
  mayJackOutOnFirstIceEncounter?: boolean;
  reconJackOutOffered?: boolean;
  /** Compile: the first encounter of this run already offered the install. */
  compileFirstEncounterFired?: boolean;
  /**
   * Scrubbed: the first piece of ice encountered this turn, when that
   * encounter is in this run ("for the remainder of the run").
   */
  firstEncounteredIceId?: string;
  /** Eater broke a subroutine: no card can be accessed this run. */
  cannotAccessCardsThisRun?: boolean;
  /**
   * Checkpoint: meat damage to do when this run becomes successful, a
   * delayed ability created by the subroutine (CR 9.6.13c).
   */
  delayedMeatDamageOnSuccess?: Array<{ sourceId: string; amount: number }>;
  /** Port Anson Grid sources that already resolved on this jack out. */
  portAnsonResolvedSourceIds?: string[];
  /** Spear Phishing: bypass the innermost ice protecting the attacked server. */
  bypassInnermostEncounter?: boolean;
  /** Ice instance ids rezzed during this run (Run Amok). */
  iceRezzedThisRunIds?: string[];
  /** Helheim Servers: +strength on ice protecting serverId until end of run. */
  helheimServerStrengthBonus?: Partial<Record<ServerId, number>>;
  /** Lean and Mean: icebreaker strength bonus if programs ≤ max at run start. */
  icebreakerStrengthBonusIfInstalledProgramsLte?: {
    programsMax: number;
    bonus: number;
  };
  onEncounterMayInstallProgramFromGripIgnoringCosts?: boolean;
  trashProgramsInstalledThisWayOnRunEnd?: boolean;
  /** Diana's Hunt: program ids installed ignoring costs this run. */
  dianaInstalledProgramIds?: string[];
  /** Ice ids bypassed this run. */
  bypassedIceIds?: string[];
  /**
   * Ice instance ids passed this run (order preserved; same ice may appear
   * more than once). Used by Into the Depths–class exclusive choices.
   * Only counted when ice is still in the position at pass (CR pass ice;
   * NSG Into the Depths ruling on uninstall-during-encounter).
   */
  passedIceIds?: string[];
  /**
   * CR 6.9.4a: the Runner passed a piece of ice with no position more
   * inward. Conditions for passing all ice protecting the server are met
   * only then; a run on a server with no ice never meets them.
   */
  passedAllIce?: boolean;
  /** The Gauntlet: ice protecting HQ fully broken this run. */
  inFullyBrokenHqProtectingIceIds?: string[];
  /** Most recent unrezzed ice id passed (False Echo-class). */
  lastPassedUnrezzedIceId?: string;
  /** Copycat: last rezzed ice passed this run. */
  lastPassedRezzedIceId?: string;
  /** Sneakdoor: redirect success to this server. */
  redirectSuccessTo?: "hq" | "rd" | "archives";
  /** Omar Keung: Runner chooses HQ or R&D when run would succeed. */
  redirectSuccessChooseHqOrRd?: boolean;
  /** Maintenance Access: after Archives ice, approach HQ instead. */
  redirectApproachArchivesToHq?: boolean;
  archivesApproachRedirectUsed?: boolean;
  /**
   * Baker: after Archives ice, may pay this many stealth credits to approach
   * HQ or R&D instead.
   */
  mayRedirectApproachArchivesToHqOrRdPayingStealthCredits?: number;
  /** Aircheck: cannot spend or lose credits from the credit pool this run. */
  blockCreditPoolSpendAndLose?: boolean;
  /** Shred: first ETR prevention already consumed this run. */
  shredPreventFirstEndTheRun?: boolean;
  shredFirstEndTheRunUsed?: boolean;
  /** Once-per-run paid abilities used this run (`cardId:abilityId`). */
  usedAbilitiesThisRun?: string[];
  /** Once-per-encounter paid abilities used this encounter. */
  usedAbilitiesThisEncounter?: string[];
  /**
   * Attini-class: Runner cannot spend credits while a subroutine is
   * resolving (includes nested pendingChoice from that sub).
   */
  runnerCannotSpendCredits?: boolean;
  /** RSVP: Runner cannot spend credits for remainder of this run. */
  runnerCannotSpendCreditsForRun?: boolean;
  /** Blackmail: Corp cannot rez ice during this run. */
  forbidCorpRezIceDuringRun?: boolean;
  /**
   * Clicks gained by the Runner during this run (Pichação).
   * Incremented by `gain_clicks` while a run is active.
   */
  clicksGainedThisRun?: number;
  /** Ryō Phoenix: a subroutine resolved during this run. */
  subroutineResolvedThisRun?: boolean;
  /**
   * S-Dobrado: at the second ice encounter, Runner may spend [click] to bypass.
   */
  bypassSecondEncounterForClick?: boolean;
  /**
   * Alarm Clock: at the first ice encounter, Runner may spend this many
   * clicks to bypass.
   */
  bypassFirstEncounterForClicks?: number;
  /** Ice encounters begun this run (S-Dobrado second-encounter gate). */
  iceEncounteredCount?: number;
  /** Baklan: onFirstEncounterEachRun already noted this run. */
  onFirstEncounterEachRunFired?: boolean;
  /**
   * Baklan: first encounter this run met since previous checkpoint; marked
   * pending at the next 10.3.1a (phase 3).
   */
  firstEncounterEachRunMetPending?: boolean;
  /** Ice derezzed by Window of Opportunity at run begin. */
  eventDerezzedIceId?: string;
  mayRezEventDerezzedIceOnRunEndIgnoreCosts?: boolean;
  /** Window: pending derez choice when run begins. */
  derezProtectingIceOnRunBegin?: boolean;
  /** Ice rezzed during the approach to the current encounter (Nasir). */
  iceRezzedDuringApproachId?: string;
  /** Sisyphus: ice id awaiting Corp reencounter choice. */
  pendingReencounterIceId?: string;
  /** Sisyphus / Formicary / Ganked!: ice id to reencounter after choice. */
  reencounterIceId?: string;
  /**
   * Ganked!-class: after a mid-access forced encounter resolves, resume the
   * suspended access-a-card walk instead of jacking out / approaching server.
   */
  resumeAccessAfterReencounter?: boolean;
  /**
   * Konjin-class: after a nested forced encounter ends, resume the encounter
   * with this ice (if still rezzed) without re-firing onEncounter.
   */
  resumeEncounterIceId?: string;
  /** Stashed encounter state for `resumeEncounterIceId` (Konjin). */
  suspendedEncounter?: EncounterState;
  /**
   * Force the next encounter to use this ice id (may protect another server).
   * Consumed when the encounter begins.
   */
  forceEncounterIceId?: string;
  /** Skip onEncounter once when resuming a suspended parent encounter. */
  skipOnEncounterOnce?: boolean;
  /**
   * Awakening Center: upgrade ids whose "pass all ice protecting this
   * server" trigger has already fired this run (fires once per run, even
   * though the run re-approaches the server after a forced encounter ends).
   */
  awakeningCenterTriggeredIds?: string[];
  /**
   * Awakening Center: hosted ice ids rezzed and force-encountered this run;
   * trashed (not just derezzed) when the run ends.
   */
  awakeningCenterHostedIceIds?: string[];
  /**
   * Boomerang-class delayed conditional titles: on successful run end, may
   * shuffle one heap card with each title into the stack (CR 9.10 lingering).
   */
  mayShuffleTitlesFromHeapOnSuccessfulRunEnd?: string[];
  /** Skip breach after success (Retrieval Run / Security Testing). */
  skipBreach?: boolean;
  /**
   * `skipBreach` was set when the run began, by the run event's own
   * "instead of breaching" (Pinhole Threading, Embezzle). That replacement
   * has not applied yet, so others may still be ordered before it
   * (CR 9.9.11).
   */
  skipBreachFromRunStart?: boolean;
  /** Security Testing is waiting to be ordered with another breach replacement (CR 9.9.11a). */
  deferBreachReplacement?: boolean;
  /** Immolation Script: once this run may trash rezzed copy instead of accessing Archives ice. */
  immolationScriptAccessReplace?: boolean;
  /** Pending Archives access card awaiting Immolation Script choice. */
  pendingImmolationAccessCardId?: string;
  /** This access already declined Archives Interface, so the access proceeds. */
  archivesInterfaceSkippedCardId?: string;
  /** Gagarin tax already paid for this access. */
  accessTaxPaidFor?: string;
  accessFromBottomOfRd?: boolean;
  trashFirstFullyBrokenSubtype?: string;
  trashFirstFullyBrokenSubtypeUsed?: boolean;
  /** Demolition Run-class: access → trash for 0¢ during this run. */
  accessTrashFree?: boolean;
  /** Credit Crash: trash first non-agenda; Corp may pay to prevent. */
  trashFirstNonAgendaAccessCorpMayPayRezOrPlayCostToPrevent?: boolean;
  trashFirstNonAgendaAccessUsed?: boolean;
  /**
   * Watch the World Burn: RFG first non-agenda access this run.
   */
  rfgFirstNonAgendaAccess?: boolean;
  lastingRfgCopiesOnAccess?: boolean;
  rfgFirstNonAgendaAccessUsed?: boolean;
  /**
   * Slot Machine: max shared-type count among revealed top-3 when encounter began.
   */
  encounterSlotMachineSharedTypeMax?: number;
  /** Project Kusanagi: iceId → extra net damage sub count this run. */
  esKusanagiNetSubs?: Record<string, number>;
  /** Chum: next ice encounter gets strength bonus + conditional net on end. */
  chumNextIce?: {
    strengthBonus: number;
    netDamageIfNotFullyBroken: number;
    /** Chum card id — pending source for CR 9.6.10. */
    chumSourceId: string;
  };
  /** Marker: next encountered ice gains an extra ETR subroutine after printed subs. */
  markerExtraEtrNextIce?: boolean;
  /**
   * Grappling Hook: subroutines the Runner has chosen not to break, and how
   * many such choices remain (CR 9.8.6b).
   */
  pendingSpareSubroutines?: { remaining: number; spared: number[] };
  /**
   * Street Magic: unbroken subroutine indexes still to be ordered, then the
   * order the Corp must resolve (CR 9.8.7d).
   */
  pendingSubroutineOrder?: {
    sourceId: string;
    remaining: number[];
    picked: number[];
  };
  subroutineResolveOrder?: { iceId: string; indexes: number[] };
  /** Chum: active encounter tracking for not-fully-broken damage. */
  chumActiveEncounter?: {
    iceId: string;
    netDamageIfNotFullyBroken: number;
    /** Chum card id — pending source for CR 9.6.10. */
    chumSourceId: string;
  };
  /**
   * Sensei: source ice ids whose ETR-on-other-ice-for-run ability is active.
   * Cleared when the run ends.
   */
  senseiEtrSourceIds?: string[];
  /**
   * During this run, cards in the root of the attacked server lose all abilities
   * (Light the Fire!).
   */
  blankAttackedServerRoot?: boolean;
  /**
   * Direct Access: both players' identities lose all abilities for the
   * duration of this run.
   */
  blankIdentities?: boolean;
  /**
   * Whistleblower: named agenda title; accessing that title this run steals
   * ignoring all costs.
   */
  whistleblowerNamedTitle?: string;
  /**
   * Always Have a Backup Plan: auto-bypass this ice id when encountered on
   * the second run.
   */
  backupPlanBypassIceId?: string;
  /** Backup Plan second run: ignore additional costs to initiate. */
  backupPlanIgnoreAdditionalCosts?: boolean;
  /** Tracker: prevent the first subroutine that would resolve this run. */
  quTrackerPreventFirstSubroutine?: boolean;
  /** Last ice encountered this run (feeds Backup Plan). */
  lastEncounteredIceId?: string;
  /** True after any ice is derezzed during this run (Stegodon). */
  iceDerezzedThisRun?: boolean;
  /** Only these card ids may be accessed on attacked server (Adrian). */
  accessOnlyCardIds?: string[];
  /** These card ids cannot be accessed this run (Adrian). */
  forbiddenAccessCardIds?: string[];
  /** Candidates removed by an access cap, restored if that cap ends (CR 7.4.2a). */
  prunedAccessCandidateIds?: string[];
  /**
   * Flagship: access caps that persist for the rest of the run after the
   * Runner trashed the rezzed card while accessing it (CR 9.12.5a), by
   * source id.
   */
  persistentAccessCaps?: Record<string, number>;
  /** Arissana: program installed via identity ability this run. */
  identityInstalledProgramId?: string;
  /** Trash identityInstalledProgramId at run end unless this subtype. */
  identityInstalledProgramTrashUnlessSubtype?: string;
}
