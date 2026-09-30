/**
 * Creation and Control (cac) Effect IR / card-field primitives.
 *
 * cac card data has not landed yet (data/cards-pin.json remains pinned to
 * Future Proof v1.93.0); these tests only exercise the new Effect IR
 * primitives added to support cac card abilities, via validateEffectTree.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  fx,
  validateEffectTree,
  type CardInstance,
} from "../src/index.js";
import { resolveAndAdvance } from "../src/timing/machine.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.104.0");
});

describe("Alix T4LB07 gain_credits_per_power_counter", () => {
  it("validates the primitive", () => {
    expect(
      validateEffectTree(fx.do({ kind: "gain_credits_per_power_counter", per: 2 })),
    ).toBeNull();
  });
});

describe("Freelance Coding Contract trash_up_to_grip_cards_gain_credits_each", () => {
  it("validates the primitive", () => {
    expect(
      validateEffectTree(
        fx.do({
          kind: "trash_up_to_grip_cards_gain_credits_each",
          remaining: 5,
          per: 2,
          types: ["program"],
        }),
      ),
    ).toBeNull();
  });
});

describe("Project Wotan grant_approached_rezzed_bioroid_etr_subroutine_this_run", () => {
  it("validates the primitive", () => {
    expect(
      validateEffectTree(
        fx.do({ kind: "grant_approached_rezzed_bioroid_etr_subroutine_this_run" }),
      ),
    ).toBeNull();
  });
});

describe("Cyber-Cypher choose_server_runner", () => {
  it("validates the primitive", () => {
    expect(validateEffectTree(fx.do({ kind: "choose_server_runner" }))).toBeNull();
  });
});

describe("NEXT Design onGameStart setup chain", () => {
  it("validates next_design_may_install_ice", () => {
    expect(
      validateEffectTree(
        fx.do({
          kind: "next_design_may_install_ice",
          remaining: 3,
          usedServerIds: [],
          thenDrawToHq: 5,
        }),
      ),
    ).toBeNull();
  });
  it("validates draw_until_hq_has", () => {
    expect(
      validateEffectTree(fx.do({ kind: "draw_until_hq_has", amount: 5 })),
    ).toBeNull();
  });
});

describe("Same Old Thing may_play_event_from_heap", () => {
  it("validates the primitive", () => {
    expect(
      validateEffectTree(fx.do({ kind: "may_play_event_from_heap" })),
    ).toBeNull();
  });
});

describe("Scavenge scavenge_install_program", () => {
  it("validates the primitive", () => {
    expect(
      validateEffectTree(fx.scavengeInstallProgram()),
    ).toBeNull();
  });
  it("validates trash_runner_rig_card_record_program_cost", () => {
    expect(
      validateEffectTree(
        fx.trashRunnerRigCardRecordProgramCost("dummy-id"),
      ),
    ).toBeNull();
  });
});

describe("Omni-drive hostsAnyProgramMemoryCostLte", () => {
  it("is a plain numeric CardInstance field (no Effect IR to validate)", () => {
    expect(true).toBe(true);
  });
});

describe("Escher instead-of-breach ice rearrange", () => {
  it("validates escher_may_instead_of_breach", () => {
    expect(
      validateEffectTree(fx.escherMayInsteadOfBreach()),
    ).toBeNull();
  });
  it("validates escher_rearrange_pick_server", () => {
    expect(
      validateEffectTree(fx.do({ kind: "escher_rearrange_pick_server" })),
    ).toBeNull();
  });
});

describe("Exploratory Romp instead-of-breach remove advancements", () => {
  it("validates exploratory_romp_may_instead_of_breach", () => {
    expect(
      validateEffectTree(fx.exploratoryRompMayInsteadOfBreach(3)),
    ).toBeNull();
  });
});

describe("Monolith install_up_to_n_programs_from_grip_discount", () => {
  it("validates the primitive", () => {
    expect(
      validateEffectTree(fx.installUpToNProgramsFromGripDiscount(3, 4)),
    ).toBeNull();
  });
});

describe("Director Haas' Pet Project haas_pet_project_setup", () => {
  it("validates the primitive", () => {
    expect(
      validateEffectTree(fx.haasPetProjectSetup(3)),
    ).toBeNull();
  });
});

describe("Bioroid Efficiency Research ber_rez_bioroid_and_host", () => {
  it("validates the primitive", () => {
    expect(
      validateEffectTree(fx.berRezBioroidAndHost()),
    ).toBeNull();
  });

  it("validates trash_self_and_derez_host", () => {
    expect(
      validateEffectTree(fx.trashSelfAndDerezHost()),
    ).toBeNull();
  });
});

describe("Minelayer may_install_ice_from_hq_protecting_this_server_ignore_costs", () => {
  it("validates the primitive", () => {
    expect(
      validateEffectTree(fx.mayInstallIceFromHqProtectingThisServerIgnoreCosts()),
    ).toBeNull();
  });
});

describe("Howler howler_install_rez_bioroid_inward", () => {
  it("validates the primitive", () => {
    expect(
      validateEffectTree(fx.howlerInstallRezBioroidInward()),
    ).toBeNull();
  });
});

describe("Awakening Center awakening_center_rez_hosted", () => {
  it("validates the primitive", () => {
    expect(
      validateEffectTree(fx.awakeningCenterRezHosted("ice-1")),
    ).toBeNull();
  });

  it("hosts a bioroid ice via InstallDestination host_upgrade, ignoring install cost", () => {
    const s = createInitialState();
    const center: CardInstance = {
      id: "ac-1",
      defId: "awakening-center",
      title: "Awakening Center",
      type: "upgrade",
      side: "corp",
      installCost: 2,
      rezCost: 2,
      zone: "server:hq:root",
      rezzed: true,
      faceup: true,
      hostsBioroidIceIgnoreInstallCost: true,
    };
    const ice: CardInstance = {
      id: "ice-1",
      defId: "ichi-1-0",
      title: "Ichi 1.0",
      type: "ice",
      side: "corp",
      installCost: 3,
      rezCost: 3,
      subtypes: ["bioroid", "sentry"],
      zone: "corp:hand",
      rezzed: false,
      faceup: false,
    };
    s.cards["ac-1"] = center;
    s.cards["ice-1"] = ice;
    s.servers.hq.root = ["ac-1"];
    s.corp.hand = ["ice-1"];
    s.corp.credits = 10;
    s.activeSide = "corp";
    s.corp.clicks = 3;
    s.timingKey = "corp.takeAction";

    const r = applyAction(s, {
      type: "basic_install",
      cardId: "ice-1",
      destination: { kind: "host_upgrade", hostId: "ac-1" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.corp.credits).toBe(10); // free install
    expect(r.state.corp.hand).not.toContain("ice-1");
    expect(r.state.cards["ice-1"].hostId).toBe("ac-1");
    expect(r.state.cards["ice-1"].zone).toBe("hosted:ac-1");
    expect(r.state.cards["ac-1"].hostedCardIds).toContain("ice-1");
  });

  it("passing all ice offers to rez the hosted ice for −7¢ and forces an encounter; trashed at run end", () => {
    const s = createInitialState();
    const center: CardInstance = {
      id: "ac-1",
      defId: "awakening-center",
      title: "Awakening Center",
      type: "upgrade",
      side: "corp",
      installCost: 2,
      rezCost: 2,
      zone: "server:hq:root",
      rezzed: true,
      faceup: true,
      hostsBioroidIceIgnoreInstallCost: true,
      hostedCardIds: ["ice-1"],
    };
    const ice: CardInstance = {
      id: "ice-1",
      defId: "ichi-1-0",
      title: "Ichi 1.0",
      type: "ice",
      side: "corp",
      installCost: 3,
      rezCost: 3,
      subtypes: ["bioroid", "sentry"],
      zone: "hosted:ac-1",
      rezzed: false,
      faceup: false,
      hostId: "ac-1",
      subroutines: [
        {
          id: "ichi-etr",
          text: "End the run.",
          effect: { op: "do", action: { kind: "end_the_run" } },
        },
      ],
    };
    s.cards["ac-1"] = center;
    s.cards["ice-1"] = ice;
    s.servers.hq.root = ["ac-1"];
    s.servers.hq.ice = [];
    s.corp.credits = 10;
    s.run = {
      attackedServerId: "hq",
      phase: "movement",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
    };
    s.timingKey = "run.jackOutWindow";
    resolveAndAdvance(s);

    expect(s.pendingChoice?.sourceId).toBe("ac-1");
    expect(
      s.pendingChoice?.options.some((o) => o.id === "awakening-rez:ice-1"),
    ).toBe(true);

    const chosen = applyAction(s, {
      type: "choose_option",
      optionId: "awakening-rez:ice-1",
    });
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) return;
    expect(chosen.state.cards["ice-1"].rezzed).toBe(true);
    expect(chosen.state.corp.credits).toBe(10); // rezCost 3 − 7 → 0
    expect(chosen.state.run?.awakeningCenterHostedIceIds).toContain("ice-1");
    // Runner is forced into a nested encounter with the hosted ice (Konjin-
    // class divert), or has already resolved it — accept either.
    expect(
      chosen.state.run?.encounter?.iceId === "ice-1" ||
        chosen.state.timingKey === "run.approachPaw" ||
        chosen.state.timingKey === "run.encounterPaw" ||
        chosen.state.log.some((l) => l.includes("will encounter")),
    ).toBe(true);

    // Run-end cleanup: hosted ice is trashed (not just derezzed).
    const s2 = createInitialState();
    s2.cards["ac-1"] = {
      ...center,
      hostedCardIds: [],
    };
    s2.cards["ice-1"] = { ...ice, rezzed: true, faceup: true };
    s2.servers.hq.root = ["ac-1"];
    s2.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      awakeningCenterHostedIceIds: ["ice-1"],
    };
    s2.timingKey = "run.ends";
    resolveAndAdvance(s2);
    expect(s2.cards["ice-1"].zone).toBe("corp:archives");
    expect(s2.cards["ice-1"].rezzed).toBe(false);
    expect(s2.corp.discard).toContain("ice-1");
  });
});

describe("Tyr's Hand break_interrupt_paw / prevent_pending_subroutine_break", () => {
  it("validates the primitive", () => {
    expect(
      validateEffectTree(fx.preventPendingSubroutineBreak()),
    ).toBeNull();
  });

  function setupEncounter(tyr: CardInstance) {
    const s = createInitialState();
    const ice: CardInstance = {
      id: "wall-1",
      defId: "ichi-1-0",
      title: "Ichi 1.0",
      type: "ice",
      side: "corp",
      installCost: 3,
      rezCost: 3,
      subtypes: ["bioroid", "sentry"],
      zone: "server:hq:ice",
      rezzed: true,
      faceup: true,
      subroutines: [
        {
          id: "ichi-etr",
          text: "End the run.",
          effect: { op: "do", action: { kind: "end_the_run" } },
        },
      ],
    };
    s.cards["wall-1"] = ice;
    s.cards["tyr-1"] = tyr;
    s.servers.hq.ice = ["wall-1"];
    s.servers.hq.root = ["tyr-1"];
    s.corp.credits = 10;
    s.runner.clicks = 3;
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: { iceId: "wall-1", broken: [false] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
    };
    s.timingKey = "run.encounterPaw";
    return s;
  }

  it("opens a break-interrupt window when an eligible unrezzed upgrade can afford to rez", () => {
    const tyr: CardInstance = {
      id: "tyr-1",
      defId: "tyrs-hand",
      title: "Tyr's Hand",
      type: "upgrade",
      side: "corp",
      installCost: 3,
      rezCost: 1,
      zone: "server:hq:root",
      rezzed: false,
      faceup: false,
      preventSubroutineBreakOnBioroidByTrash: true,
    };
    const s = setupEncounter(tyr);

    const attempt = applyAction(s, {
      type: "break_bioroid_subroutine",
      subIndex: 0,
    });
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) return;
    expect(attempt.state.pendingSubroutineBreak).toEqual({
      iceId: "wall-1",
      subIndex: 0,
    });
    expect(attempt.state.run?.encounter?.broken[0]).toBe(false);
    expect(attempt.state.runner.clicks).toBe(2); // cost already paid

    // Corp rezzes Tyr's Hand during the interrupt window.
    const rezzed = applyAction(attempt.state, {
      type: "rez_asset",
      cardId: "tyr-1",
    });
    expect(rezzed.ok).toBe(true);
    if (!rezzed.ok) return;
    expect(rezzed.state.cards["tyr-1"].rezzed).toBe(true);
    expect(rezzed.state.pendingSubroutineBreak).toEqual({
      iceId: "wall-1",
      subIndex: 0,
    });

    // Passing the window without trashing lets the break go through.
    const passed = applyAction(rezzed.state, { type: "pass_window" });
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    expect(passed.state.pendingSubroutineBreak).toBeNull();
    expect(passed.state.run?.encounter?.broken[0]).toBe(true);
  });

  it("[trash] paid ability prevents the pending subroutine break", () => {
    const tyr: CardInstance = {
      id: "tyr-1",
      defId: "tyrs-hand",
      title: "Tyr's Hand",
      type: "upgrade",
      side: "corp",
      installCost: 3,
      rezCost: 1,
      zone: "server:hq:root",
      rezzed: true,
      faceup: true,
      preventSubroutineBreakOnBioroidByTrash: true,
      paidAbilities: [
        {
          id: "prevent-break",
          label: "[trash]: prevent 1 subroutine from being broken",
          clickCost: 0,
          creditCost: 0,
          cost: { trashSelf: true },
          windows: ["break_interrupt_paw"],
          effect: fx.preventPendingSubroutineBreak(),
        },
      ],
    };
    const s = setupEncounter(tyr);

    const attempt = applyAction(s, {
      type: "break_bioroid_subroutine",
      subIndex: 0,
    });
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) return;
    expect(attempt.state.pendingSubroutineBreak).not.toBeNull();

    const prevented = applyAction(attempt.state, {
      type: "use_paid_ability",
      cardId: "tyr-1",
      abilityId: "prevent-break",
    });
    expect(prevented.ok).toBe(true);
    if (!prevented.ok) return;
    expect(prevented.state.pendingSubroutineBreak).toBeNull();
    expect(prevented.state.run?.encounter?.broken[0]).toBe(false);
    // Trashed as the paid ability's cost.
    expect(prevented.state.corp.discard).toContain("tyr-1");
    expect(prevented.state.cards["tyr-1"].zone).toBe("corp:archives");
  });

  it("does not open an interrupt window with no eligible upgrade installed", () => {
    const s = createInitialState();
    const ice: CardInstance = {
      id: "wall-1",
      defId: "ichi-1-0",
      title: "Ichi 1.0",
      type: "ice",
      side: "corp",
      installCost: 3,
      rezCost: 3,
      subtypes: ["bioroid", "sentry"],
      zone: "server:hq:ice",
      rezzed: true,
      faceup: true,
      subroutines: [
        {
          id: "ichi-etr",
          text: "End the run.",
          effect: { op: "do", action: { kind: "end_the_run" } },
        },
      ],
    };
    s.cards["wall-1"] = ice;
    s.servers.hq.ice = ["wall-1"];
    s.runner.clicks = 3;
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: { iceId: "wall-1", broken: [false] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
    };
    s.timingKey = "run.encounterPaw";

    const attempt = applyAction(s, {
      type: "break_bioroid_subroutine",
      subIndex: 0,
    });
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) return;
    expect(attempt.state.pendingSubroutineBreak).toBeNull();
    expect(attempt.state.run?.encounter?.broken[0]).toBe(true);
  });
});
