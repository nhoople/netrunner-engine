/**
 * Framework migration M1/M6: gained-sub collectors + Sub Boost barrier grant.
 */
import { describe, expect, it } from "vitest";
import {
  abilitiesSuppressed,
  createInitialState,
  effectiveIceSubtypes,
  instantiateCard,
} from "../src/index.js";
import {
  collectFatumaGainedSubs,
  collectHostedConditionSubsBeforePrinted,
  collectSubBoostEtrSubs,
} from "../src/state/continuousSubs.js";

describe("continuous gained-sub collectors (M1)", () => {
  it("Sub Boost grants barrier via the subtype layer, not ice.subtypes mutation", () => {
    const s = createInitialState();
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    // Ice Wall is already barrier printed — use a non-barrier host.
    const enigma = instantiateCard("enigma", "eng-1", "server:hq:ice");
    enigma.rezzed = true;
    enigma.faceup = true;
    const boost = instantiateCard("sub-boost", "sb-1", "hosted:eng-1");
    boost.faceup = true;
    boost.hostId = "eng-1";
    enigma.hostedCardIds = ["sb-1"];
    s.cards["eng-1"] = enigma;
    s.cards["sb-1"] = boost;
    s.servers.hq.ice = ["eng-1"];

    expect(enigma.subtypes?.map((t) => t.toLowerCase())).not.toContain(
      "barrier",
    );
    expect(effectiveIceSubtypes(s, "eng-1").map((t) => t.toLowerCase())).toContain(
      "barrier",
    );
    expect(collectSubBoostEtrSubs(s, "eng-1")).toHaveLength(1);
  });

  it("Wetwork-class hosted subs skip blanked hosts", () => {
    const s = createInitialState();
    const ice = instantiateCard("heimdall-1-0", "heim-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    const wet = instantiateCard("wetwork-refit", "wet-1", "hosted:heim-1");
    wet.faceup = true;
    wet.hostId = "heim-1";
    wet.abilitiesBlanked = true;
    ice.hostedCardIds = ["wet-1"];
    s.cards["heim-1"] = ice;
    s.cards["wet-1"] = wet;
    s.servers.hq.ice = ["heim-1"];

    expect(abilitiesSuppressed(s, "wet-1")).toBe(true);
    expect(collectHostedConditionSubsBeforePrinted(s, "heim-1")).toHaveLength(0);
  });
});

describe("continuous gained-sub decls (M6)", () => {
  it("Fatuma collector follows continuousGainedSubDecls without the legacy boolean", () => {
    const s = createInitialState();
    const ice = instantiateCard("heimdall-1-0", "heim-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    s.cards["heim-1"] = ice;
    s.servers.hq.ice = ["heim-1"];
    const fatuma = instantiateCard("warden-fatuma", "fat-1", "server:hq:root");
    fatuma.rezzed = true;
    fatuma.bioroidIceGainsLoseClickSubroutineBeforeOthers = false;
    fatuma.continuousGainedSubDecls = [{ kind: "fatuma_lose_click" }];
    s.cards["fat-1"] = fatuma;
    s.servers.hq.root = ["fat-1"];

    expect(collectFatumaGainedSubs(s, "heim-1")).toHaveLength(1);
  });

  it("Sub Boost ETR follows continuousGainedSubDecls without the legacy boolean", () => {
    const s = createInitialState();
    const enigma = instantiateCard("enigma", "eng-1", "server:hq:ice");
    enigma.rezzed = true;
    enigma.faceup = true;
    const boost = instantiateCard("sub-boost", "sb-1", "hosted:eng-1");
    boost.faceup = true;
    boost.hostId = "eng-1";
    boost.hostGainsBarrierAndEtrSubroutine = false;
    boost.continuousGainedSubDecls = [{ kind: "sub_boost_etr" }];
    boost.continuousSubtypeGrants = [{ kind: "host_grant_barrier" }];
    enigma.hostedCardIds = ["sb-1"];
    s.cards["eng-1"] = enigma;
    s.cards["sb-1"] = boost;
    s.servers.hq.ice = ["eng-1"];

    expect(collectSubBoostEtrSubs(s, "eng-1")).toHaveLength(1);
    expect(effectiveIceSubtypes(s, "eng-1").map((t) => t.toLowerCase())).toContain(
      "barrier",
    );
  });

  it("Wetwork marker decl alone does not grant without hostGainsSubroutinesBeforePrinted", () => {
    const s = createInitialState();
    const ice = instantiateCard("heimdall-1-0", "heim-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    const wet = instantiateCard("wetwork-refit", "wet-1", "hosted:heim-1");
    wet.faceup = true;
    wet.hostId = "heim-1";
    wet.hostGainsSubroutinesBeforePrinted = [];
    wet.continuousGainedSubDecls = [{ kind: "wetwork_hosted_before" }];
    ice.hostedCardIds = ["wet-1"];
    s.cards["heim-1"] = ice;
    s.cards["wet-1"] = wet;
    s.servers.hq.ice = ["heim-1"];

    expect(collectHostedConditionSubsBeforePrinted(s, "heim-1")).toHaveLength(0);
  });
});
