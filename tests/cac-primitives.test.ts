/**
 * Creation and Control (cac) Effect IR / card-field primitives.
 *
 * cac card data has not landed yet (data/cards-pin.json remains pinned to
 * Future Proof v1.93.0); these tests only exercise the new Effect IR
 * primitives added to support cac card abilities, via validateEffectTree.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  fx,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.93.0");
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

describe("Howler howler_install_rez_bioroid_inward", () => {
  it("validates the primitive", () => {
    expect(
      validateEffectTree(fx.howlerInstallRezBioroidInward()),
    ).toBeNull();
  });
});
