#!/usr/bin/env python3
"""Generate System Update 2021 card JSON from NRDB pack `su21`.

Requires /tmp/nrdb-cards.json (curl https://netrunnerdb.com/api/2.0/public/cards).

Reprints that reuse earlier wave defs (skipped as files; listed in pool.json):
  diesel, enigma, rototurret, gordian-blade, pad-campaign, aesops-pawnshop

Usage: python3 scripts/generate-system-update-2021.py
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "cards" / "system-update-2021"
NRDB = Path("/tmp/nrdb-cards.json")

# Existing accurate (or already-noted) defs — do not emit duplicate files.
REPRINTS = {
    "diesel",
    "enigma",
    "rototurret",
    "gordian-blade",
    "pad-campaign",
    "aesops-pawnshop",
}


def slugify(title: str) -> str:
    t = unicodedata.normalize("NFKD", title)
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.lower()
    t = t.replace("“", "").replace("”", "").replace('"', "")
    t = t.replace("'", "").replace("’", "")
    t = t.replace(".", "-").replace(":", " ")
    t = re.sub(r"[^a-z0-9]+", "-", t)
    return t.strip("-")


def etr():
    return {"op": "do", "action": {"kind": "end_the_run"}}


def gain(side: str, n: int):
    return {"op": "do", "action": {"kind": "gain_credits", "side": side, "amount": n}}


def lose(side: str, n: int):
    return {"op": "do", "action": {"kind": "lose_credits", "side": side, "amount": n}}


def draw(side: str, n: int):
    return {"op": "do", "action": {"kind": "draw", "side": side, "amount": n}}


def net(n: int):
    return {"op": "do", "action": {"kind": "net_damage", "amount": n}}


def meat(n: int):
    return {"op": "do", "action": {"kind": "meat_damage", "amount": n}}


def tags(n: int):
    return {"op": "do", "action": {"kind": "give_tags", "amount": n}}


def lose_clicks(side: str, n: int):
    return {"op": "do", "action": {"kind": "lose_clicks", "side": side, "amount": n}}


def gain_clicks(side: str, n: int):
    return {"op": "do", "action": {"kind": "gain_clicks", "side": side, "amount": n}}


def trash_prog(pick="choose"):
    return {"op": "do", "action": {"kind": "trash_program", "pick": pick}}


def trash_res(pick="choose"):
    return {"op": "do", "action": {"kind": "trash_resource", "pick": pick}}


def take_hosted(n: int):
    return {"op": "do", "action": {"kind": "take_hosted_credits", "amount": n}}


def place_hosted(n: int):
    return {"op": "do", "action": {"kind": "place_hosted_credits", "amount": n}}


def add_agenda(n: int):
    return {"op": "do", "action": {"kind": "add_agenda_counter", "amount": n}}


def archives_to_hq(n: int = 1):
    return {"op": "do", "action": {"kind": "archives_to_hq", "amount": n}}


def remove_tags(n: int):
    return {"op": "do", "action": {"kind": "remove_tags", "amount": n}}


def seq(*effects):
    return {"op": "seq", "effects": list(effects)}


def choose(chooser: str, options: list):
    return {"op": "choose", "chooser": chooser, "options": options}


def iff(cond, then, else_=None):
    e = {"op": "if", "cond": cond, "then": then}
    if else_ is not None:
        e["else"] = else_
    return e


def base(c, **extra):
    subtypes = []
    if c.get("keywords"):
        subtypes = [s.strip().lower() for s in c["keywords"].split(" - ")]
    card = {
        "id": slugify(c["title"]),
        "title": c["title"],
        "wave": "system-update-2021",
        "nrdbCode": c["code"],
        "type": c["type_code"],
        "side": "runner" if c["side_code"] == "runner" else "corp",
        "unsupported": [],
    }
    if subtypes:
        card["subtypes"] = subtypes
    if c.get("cost") is not None:
        if c["type_code"] in ("event", "operation"):
            card["playCost"] = c["cost"]
        elif c["type_code"] in ("ice", "asset", "upgrade"):
            card["installCost"] = c["cost"]
            card["rezCost"] = c["cost"]
        else:
            card["installCost"] = c["cost"]
    if c.get("trash_cost") is not None:
        card["trashCost"] = c["trash_cost"]
    if c.get("strength") is not None:
        card["strength"] = c["strength"]
    if c.get("memory_cost") is not None:
        card["memoryCost"] = c["memory_cost"]
    if c.get("advancement_cost") is not None:
        card["advancementRequirement"] = c["advancement_cost"]
    if c.get("agenda_points") is not None:
        card["agendaPoints"] = c["agenda_points"]
    if c.get("base_link") is not None:
        card["link"] = c["base_link"]
    card.update(extra)
    return card


def breaker_card(c, subtype, strength, break_c, pump_c=None, pump_s=None, duration=None, **extra):
    br = {
        "breaksSubtype": subtype,
        "strength": strength,
        "breakCredits": break_c,
    }
    if pump_c is not None:
        br["pumpCredits"] = pump_c
        br["pumpStrength"] = pump_s if pump_s is not None else 1
    paid = []
    if pump_c is not None:
        pump_eff = {
            "op": "do",
            "action": {"kind": "pump_strength", "amount": pump_s if pump_s is not None else 1},
        }
        if duration:
            pump_eff["action"]["duration"] = duration
        paid.append(
            {
                "id": f"{slugify(c['title'])}-pump",
                "label": f"Pump {c['title']} +{pump_s if pump_s is not None else 1} strength",
                "clickCost": 0,
                "creditCost": pump_c,
                "cost": {"credits": pump_c},
                "windows": ["encounter_paw"],
                "effect": pump_eff,
            }
        )
    return base(c, breaker=br, paidAbilities=paid, **extra)


def map_card(c: dict) -> dict | None:
    cid = slugify(c["title"])
    if cid in REPRINTS:
        return None
    text = c.get("text") or ""
    t = c["type_code"]

    # --- Runner identities ---
    if cid == "quetzal-free-spirit":
        return base(
            c,
            paidAbilities=[
                {
                    "id": "quetzal-break",
                    "label": "Break 1 barrier subroutine",
                    "clickCost": 0,
                    "creditCost": 0,
                    "cost": {"credits": 0},
                    "oncePerTurn": True,
                    "windows": ["encounter_paw"],
                    "effect": {
                        "op": "do",
                        "action": {"kind": "break_host_subroutine"},
                    },
                }
            ],
            unsupported=[
                "Break is modeled as break_host_subroutine on encounter PAW; must only target barrier subs (engine does not subtype-check Quetzal yet)."
            ],
        )
    if cid == "reina-roja-freedom-fighter":
        return base(
            c,
            firstIceRezCostIncrease=1,
            unsupported=[],
        )
    if cid == "ken-express-tenma-disappeared-clone":
        return base(
            c,
            gainCreditOnFirstRunEvent=1,
            unsupported=[],
        )
    if cid == "steve-cambridge-master-grifter":
        return base(
            c,
            unsupported=[
                "First successful HQ run each turn: choose 2 heap cards; Corp RFGs one, other to grip — needs heap multi-choice + Corp RFG."
            ],
        )
    if cid == "ayla-bios-rahim-simulant-specialist":
        return base(
            c,
            unsupported=[
                "Starting set-aside zone (top 6, shuffle 2 back) and click to add set-aside card to grip — needs special zone."
            ],
        )
    if cid == "rielle-kit-peddler-transhuman":
        return base(
            c,
            firstEncounterGainsCodeGate=True,
            unsupported=[],
        )

    # --- Corp identities ---
    if cid == "haas-bioroid-architects-of-tomorrow":
        return base(
            c,
            unsupported=[
                "First time Runner passes rezzed bioroid ice each turn, may rez a bioroid paying 4¢ less — needs pass trigger + discounted rez."
            ],
        )
    if cid == "jinteki-personal-evolution":
        return base(
            c,
            netDamageOnAgendaScoredOrStolen=1,
            unsupported=[],
        )
    if cid == "near-earth-hub-broadcast-center":
        return base(
            c,
            drawOnFirstRemoteCreated=1,
            unsupported=[],
        )
    if cid == "weyland-consortium-building-a-better-world":
        return base(
            c,
            gainCreditOnTransactionPlayed=1,
            unsupported=[],
        )

    # --- Simple economy / draw ---
    if cid == "biotic-labor":
        return base(c, onPlay=gain_clicks("corp", 2), unsupported=[])
    if cid == "archived-memories":
        return base(c, onPlay=archives_to_hq(1), unsupported=[])
    if cid == "professional-contacts":
        return base(
            c,
            paidAbilities=[
                {
                    "id": "pro-contacts",
                    "label": "Gain 1¢ and draw 1",
                    "clickCost": 1,
                    "creditCost": 0,
                    "cost": {"clicks": 1},
                    "windows": ["runner_action_paw"],
                    "effect": seq(gain("runner", 1), draw("runner", 1)),
                }
            ],
            unsupported=[],
        )
    if cid == "networking":
        return base(
            c,
            onPlay=seq(
                remove_tags(1),
                choose(
                    "runner",
                    [
                        {
                            "id": "return",
                            "label": "Pay 1¢ to return Networking to grip",
                            "effect": {
                                "op": "do",
                                "action": {"kind": "return_self_to_grip", "creditCost": 1},
                            },
                        },
                        {
                            "id": "decline",
                            "label": "Decline",
                            "effect": {"op": "do", "action": {"kind": "gain_credits", "side": "runner", "amount": 0}},
                        },
                    ],
                ),
            ),
            unsupported=[
                "Return-to-grip after play is approximate (return_self_to_grip); decline option is a no-op gain 0."
            ],
        )

    # --- Breakers ---
    if cid == "corroder":
        return breaker_card(c, "barrier", 2, 1, 1, 1)
    if cid == "mimic":
        return breaker_card(c, "sentry", 3, 1)
    if cid == "abagnale":
        card = breaker_card(c, "code gate", 2, 1, 2, 2)
        card["paidAbilities"] = card.get("paidAbilities", []) + [
            {
                "id": "abagnale-bypass",
                "label": "Trash Abagnale: bypass code gate",
                "clickCost": 0,
                "creditCost": 0,
                "cost": {"trashSelf": True},
                "windows": ["encounter_paw"],
                "effect": {"op": "do", "action": {"kind": "bypass_current_ice"}},
            }
        ]
        card["unsupported"] = [
            "Trash-to-bypass is modeled; bypass only legal vs code gates (engine does not subtype-check yet)."
        ]
        return card
    if cid == "femme-fatale":
        card = breaker_card(c, "sentry", 2, 1, 2, 1)
        card["unsupported"] = [
            "On install choose ice; pay 1¢ per sub to bypass that ice on encounter — needs chosen-ice targeting."
        ]
        return card
    if cid == "atman":
        return base(
            c,
            subtypes=["icebreaker", "ai"],
            breaker={
                "breaksSubtype": "*",
                "strength": 0,
                "breakCredits": 1,
            },
            unsupported=[
                "Install: spend X¢ for X power counters; +1 strength per counter; may only interface equal-strength ice — needs power counters + equal-str gate."
            ],
        )
    if cid == "chameleon":
        return base(
            c,
            subtypes=["icebreaker"],
            breaker={"breaksSubtype": "*", "strength": 3, "breakCredits": 1},
            unsupported=[
                "On install choose barrier/code gate/sentry; return to grip at discard phase end — needs subtype choice + discard-phase bounce."
            ],
        )

    # --- Programs / viruses ---
    if cid == "clot":
        return base(
            c,
            subtypes=["virus"],
            memoryCost=1,
            forbidScoreAgendaInstalledThisTurn=True,
            trashOnVirusPurge=True,
            unsupported=[],
        )
    if cid == "imp":
        return base(
            c,
            subtypes=["virus"],
            memoryCost=1,
            onInstall={"op": "do", "action": {"kind": "add_virus_counter", "amount": 2}},
            accessTrashWithVirus=True,
            unsupported=[
                "Access once-per-turn hosted virus trash of accessed card — needs access paid ability window."
            ],
        )
    if cid == "paricia":
        return base(
            c,
            memoryCost=1,
            recurringCreditsMax=2,
            recurringSpendFor=["trash_asset"],
            unsupported=[
                "Recurring credits refill modeled; spending them only on asset trash costs is not yet gated."
            ],
        )
    if cid == "sneakdoor-beta":
        return base(
            c,
            memoryCost=2,
            paidAbilities=[
                {
                    "id": "sneakdoor-run",
                    "label": "Run Archives (success → HQ)",
                    "clickCost": 1,
                    "creditCost": 0,
                    "cost": {"clicks": 1},
                    "windows": ["runner_action_paw"],
                    "effect": {
                        "op": "do",
                        "action": {"kind": "gain_credits", "side": "runner", "amount": 0},
                    },
                    "startsRun": {
                        "servers": "archives",
                        "redirectSuccessTo": "hq",
                    },
                }
            ],
            unsupported=[
                "Sneakdoor redirects successful Archives run to HQ — redirectSuccessTo needs engine support (listed explicitly until wired)."
            ],
        )
    if cid == "egret":
        return base(
            c,
            subtypes=["trojan"],
            memoryCost=1,
            installOnIce=True,
            hostGainsAllIceSubtypes=True,
            unsupported=[
                "Install only on rezzed ice; host gains barrier+code gate+sentry — installOnIce exists; subtype grant not yet applied to interface."
            ],
        )

    # --- Resources ---
    if cid == "liberated-account":
        return base(
            c,
            hostedCreditsOnInstall=16,
            paidAbilities=[
                {
                    "id": "lib-account",
                    "label": "Take 4¢",
                    "clickCost": 1,
                    "creditCost": 0,
                    "cost": {"clicks": 1},
                    "windows": ["runner_action_paw"],
                    "effect": take_hosted(4),
                }
            ],
            unsupported=[],
        )
    if cid == "scrubber":
        return base(
            c,
            subtypes=["connection", "seedy"],
            recurringCreditsMax=2,
            recurringSpendFor=["trash"],
            unsupported=[
                "Recurring credits refill modeled; spending them only on trash costs is not yet gated."
            ],
        )
    if cid == "ice-carver":
        return base(
            c,
            subtypes=["virtual"],
            runnerEncounterIceStrengthModifier=-1,
            unsupported=[],
        )
    if cid == "xanadu":
        return base(
            c,
            subtypes=["virtual"],
            iceRezCostIncrease=1,
            unsupported=[],
        )
    if cid == "security-testing":
        return base(
            c,
            subtypes=["job"],
            unsupported=[
                "Turn begin choose server; first successful run there gains 2¢ instead of breach — needs turn-begin server choice + replace breach."
            ],
        )
    if cid == "earthrise-hotel":
        return base(
            c,
            subtypes=["location", "ritzy"],
            powerCountersOnInstall=3,
            onTurnBegin=seq(
                {"op": "do", "action": {"kind": "remove_power_counter", "amount": 1}},
                draw("runner", 2),
            ),
            trashWhenPowerEmpty=True,
            unsupported=[],
        )
    if cid == "prepaid-voicepad":
        return base(
            c,
            subtypes=["gear"],
            type="hardware",
            recurringCreditsMax=1,
            recurringSpendFor=["play_event"],
            unsupported=[
                "Recurring credits refill modeled; spending them only to play events is not yet gated."
            ],
        )

    # --- Events / run events ---
    if cid == "dirty-laundry":
        return base(
            c,
            subtypes=["run"],
            runEvent={
                "servers": "any",
                "onSuccessfulRun": gain("runner", 5),
            },
            unsupported=[],
        )
    if cid == "inside-job":
        return base(
            c,
            subtypes=["run"],
            runEvent={"servers": "any", "bypassFirstEncounter": True},
            unsupported=[],
        )
    if cid == "legwork":
        return base(
            c,
            subtypes=["run"],
            runEvent={"servers": "hq", "bonusAccess": 2},
            unsupported=[],
        )
    if cid == "the-makers-eye":
        return base(
            c,
            subtypes=["run"],
            runEvent={"servers": "rd", "bonusAccess": 2},
            unsupported=[],
        )
    if cid == "retrieval-run":
        return base(
            c,
            subtypes=["run"],
            runEvent={
                "servers": "archives",
                "onSuccessfulRun": {
                    "op": "do",
                    "action": {"kind": "install_program_from_heap_ignoring_costs"},
                },
            },
            unsupported=[
                "Successful Archives: instead of breach, may install program from heap ignoring costs — needs replace-breach + heap install."
            ],
        )
    if cid == "en-passant":
        return base(
            c,
            subtypes=["sabotage"],
            playRequiresSuccessfulRunThisTurn=True,
            onPlay={"op": "do", "action": {"kind": "trash_unrezzed_ice_passed_last_run"}},
            unsupported=[
                "Trash 1 unrezzed ice passed during last run — needs last-run passed-ice tracking."
            ],
        )
    if cid == "career-fair":
        return base(
            c,
            onPlay={"op": "do", "action": {"kind": "install_resource_from_grip", "discount": 3}},
            unsupported=[
                "Install 1 resource from grip paying 3¢ less — needs discounted install-from-grip targeting."
            ],
        )
    if cid == "emergency-shutdown":
        return base(
            c,
            subtypes=["sabotage"],
            playRequiresSuccessfulRunOnHqThisTurn=True,
            onPlay={"op": "do", "action": {"kind": "derez_ice"}},
            unsupported=[
                "Play only after successful HQ run this turn; derez 1 ice — needs HQ-success flag + derez targeting."
            ],
        )
    if cid == "forged-activation-orders":
        return base(
            c,
            subtypes=["sabotage"],
            onPlay={"op": "do", "action": {"kind": "corp_rez_or_trash_ice"}},
            unsupported=[
                "Choose unrezzed ice; Corp may rez or must trash — needs Corp choice targeting."
            ],
        )
    if cid == "test-run":
        return base(
            c,
            onPlay={"op": "do", "action": {"kind": "test_run_install_program"}},
            unsupported=[
                "Search stack/heap for program, install ignoring costs; bounce to stack at turn end — needs search + delayed bounce."
            ],
        )

    # --- Ice ---
    if cid == "eli-1-0":
        return base(
            c,
            subtypes=["barrier", "bioroid"],
            subroutines=[
                {"id": "eli-etr1", "text": "End the run.", "effect": etr()},
                {"id": "eli-etr2", "text": "End the run.", "effect": etr()},
            ],
            unsupported=[],
        )
    if cid == "magnet":
        return base(
            c,
            subtypes=["code gate"],
            onRez={"op": "do", "action": {"kind": "host_program_from_ice"}},
            subroutines=[{"id": "magnet-etr", "text": "End the run.", "effect": etr()}],
            unsupported=[
                "On rez host a program already hosted on ice; hosted programs lose abilities — needs ice-host transfer."
            ],
        )
    if cid == "ravana-1-0":
        return base(
            c,
            subtypes=["code gate", "bioroid"],
            subroutines=[
                {
                    "id": "ravana-1",
                    "text": "Resolve 1 subroutine on another rezzed bioroid ice.",
                    "effect": {
                        "op": "do",
                        "action": {"kind": "resolve_bioroid_subroutine"},
                    },
                },
                {
                    "id": "ravana-2",
                    "text": "Resolve 1 subroutine on another rezzed bioroid ice.",
                    "effect": {
                        "op": "do",
                        "action": {"kind": "resolve_bioroid_subroutine"},
                    },
                },
            ],
            unsupported=[
                "Resolve 1 subroutine on another rezzed bioroid ice — needs cross-ice sub resolution."
            ],
        )
    if cid == "lotus-field":
        return base(
            c,
            subtypes=["code gate"],
            strengthCannotBeLowered=True,
            subroutines=[{"id": "lotus-etr", "text": "End the run.", "effect": etr()}],
            unsupported=[],
        )
    if cid == "swordsman":
        return base(
            c,
            subtypes=["sentry", "ap", "destroyer"],
            cannotBreakWithAi=True,
            subroutines=[
                {
                    "id": "sword-ai",
                    "text": "Trash 1 installed AI program.",
                    "effect": {
                        "op": "do",
                        "action": {"kind": "trash_program", "pick": "choose"},
                    },
                },
                {"id": "sword-net", "text": "Do 1 net damage.", "effect": net(1)},
            ],
            unsupported=[
                "Cannot break with AI programs — flag set; trash AI-only targeting not enforced (any program)."
            ],
        )
    if cid == "tollbooth":
        return base(
            c,
            subtypes=["code gate"],
            onEncounter=choose(
                "runner",
                [
                    {
                        "id": "pay3",
                        "label": "Pay 3¢",
                        "effect": lose("runner", 3),
                    },
                    {
                        "id": "etr",
                        "label": "End the run (if unable to pay)",
                        "effect": etr(),
                    },
                ],
            ),
            subroutines=[{"id": "tb-etr", "text": "End the run.", "effect": etr()}],
            unsupported=[
                "Encounter: must pay 3¢ if able, else ETR — modeled as runner choice; auto-force when able not enforced."
            ],
        )
    if cid == "wraparound":
        return base(
            c,
            subtypes=["barrier"],
            strengthBonusIfNoInstalledSubtype={"subtype": "fracter", "bonus": 7},
            subroutines=[{"id": "wrap-etr", "text": "End the run.", "effect": etr()}],
            unsupported=[],
        )
    if cid == "pop-up-window":
        # Accurate NSG text (fixes wave2 approximation by providing SU21 file — wait, duplicate id)
        # We skip emitting and fix wave2 separately.
        return None
    if cid == "archer":
        return base(
            c,
            subtypes=["sentry", "destroyer"],
            rezAdditionalCostForfeitAgenda=True,
            subroutines=[
                {"id": "archer-gain", "text": "Gain 2¢.", "effect": gain("corp", 2)},
                {"id": "archer-trash1", "text": "Trash 1 program.", "effect": trash_prog()},
                {"id": "archer-trash2", "text": "Trash 1 program.", "effect": trash_prog()},
                {"id": "archer-etr", "text": "End the run.", "effect": etr()},
            ],
            unsupported=["Additional rez cost: forfeit 1 agenda — not enforced."],
        )
    if cid == "hortum":
        return base(
            c,
            subtypes=["code gate"],
            canAdvance=True,
            cannotBreakWithAiAtAdvancements=3,
            subroutines=[
                {
                    "id": "hortum-gain",
                    "text": "Gain 1¢ (4¢ if 3+ advancements).",
                    "effect": iff(
                        {"op": "advancements_gte", "amount": 3},
                        gain("corp", 4),
                        gain("corp", 1),
                    ),
                },
                {
                    "id": "hortum-etr",
                    "text": "End the run (or search R&D if advanced).",
                    "effect": iff(
                        {"op": "advancements_gte", "amount": 3},
                        seq(
                            {"op": "do", "action": {"kind": "search_rd_to_hq", "amount": 2}},
                            etr(),
                        ),
                        etr(),
                    ),
                },
            ],
            unsupported=[
                "3+ advancements: cannot break with AI; search R&D for up to 2 cards — search_rd_to_hq not fully implemented."
            ],
        )
    if cid == "ice-wall":
        return base(
            c,
            subtypes=["barrier"],
            canAdvance=True,
            strengthPerAdvancement=1,
            subroutines=[{"id": "iw-etr", "text": "End the run.", "effect": etr()}],
            unsupported=[],
        )

    # --- Agendas ---
    if cid == "project-vitruvius":
        return base(
            c,
            subtypes=["research"],
            onScore={
                "op": "do",
                "action": {"kind": "add_agenda_counters_from_overadvance", "past": 3},
            },
            paidAbilities=[
                {
                    "id": "vitruvius-archives",
                    "label": "Hosted agenda counter: Archives → HQ",
                    "clickCost": 0,
                    "creditCost": 0,
                    "cost": {"agendaCounters": 1},
                    "windows": ["corp_action_paw"],
                    "effect": archives_to_hq(1),
                }
            ],
            unsupported=[
                "Overadvance → agenda counters approximated; agenda-counter cost spend needs wiring."
            ],
        )
    if cid == "house-of-knives":
        return base(
            c,
            subtypes=["security"],
            onScore=add_agenda(3),
            paidAbilities=[
                {
                    "id": "hok-damage",
                    "label": "Hosted agenda counter: 1 net damage (once per run)",
                    "clickCost": 0,
                    "creditCost": 0,
                    "cost": {"agendaCounters": 1},
                    "windows": ["approach_paw", "encounter_paw", "approach_server_paw"],
                    "effect": net(1),
                    "oncePerRun": True,
                }
            ],
            unsupported=["Once-per-run agenda-counter net damage — oncePerRun / counter spend need wiring."],
        )
    if cid == "nisei-mk-ii":
        return base(
            c,
            subtypes=["initiative"],
            onScore=add_agenda(1),
            paidAbilities=[
                {
                    "id": "nisei-etr",
                    "label": "Hosted agenda counter: End the run",
                    "clickCost": 0,
                    "creditCost": 0,
                    "cost": {"agendaCounters": 1},
                    "windows": ["approach_paw", "encounter_paw", "approach_server_paw"],
                    "effect": etr(),
                }
            ],
            unsupported=["Agenda-counter cost to ETR — counter spend needs wiring."],
        )
    if cid == "license-acquisition":
        return base(
            c,
            subtypes=["expansion"],
            onScore={"op": "do", "action": {"kind": "install_and_rez_asset_or_upgrade_free"}},
            unsupported=[
                "On score: install and rez asset/upgrade from HQ or Archives ignoring costs."
            ],
        )
    if cid == "project-beale":
        return base(
            c,
            subtypes=["research"],
            onScore={
                "op": "do",
                "action": {
                    "kind": "add_agenda_counters_from_overadvance",
                    "past": 3,
                    "per": 2,
                },
            },
            agendaPointsPerAgendaCounter=1,
            unsupported=[
                "Overadvance counters (1 per 2 past 3) and +1 AP per counter — needs AP calculation from counters."
            ],
        )
    if cid == "hostile-takeover":
        # Emit accurate SU21 version; wave2 will be fixed to match / avoided via pool reuse of this id —
        # but duplicate id with wave2! So we fix wave2 instead and skip here.
        return None
    if cid == "oaktown-renovation":
        return base(
            c,
            subtypes=["public", "initiative"],
            installFaceup=True,
            creditsOnAdvance={"default": 2, "atOrAbove": 5, "bonus": 3},
            unsupported=[
                "Public faceup agenda; advance gains 2¢ (3¢ at 5+) — needs public agenda + on-advance credits."
            ],
        )
    if cid == "project-atlas":
        return base(
            c,
            subtypes=["research"],
            onScore={
                "op": "do",
                "action": {"kind": "add_agenda_counters_from_overadvance", "past": 3},
            },
            paidAbilities=[
                {
                    "id": "atlas-search",
                    "label": "Hosted agenda counter: Search R&D",
                    "clickCost": 0,
                    "creditCost": 0,
                    "cost": {"agendaCounters": 1},
                    "windows": ["corp_action_paw"],
                    "effect": {"op": "do", "action": {"kind": "search_rd_to_hq", "amount": 1}},
                }
            ],
            unsupported=["Overadvance counters + R&D search for 1 card — search/counter spend incomplete."],
        )

    # --- Assets / upgrades / ops ---
    if cid == "marilyn-campaign":
        return base(
            c,
            subtypes=["advertisement"],
            onRez=place_hosted(8),
            onTurnBegin=take_hosted(2),
            unsupported=[
                "Interrupt: when would be trashed, may shuffle into R&D instead — prevention/replace trash not modeled."
            ],
        )
    if cid == "ronin":
        return base(
            c,
            subtypes=["hostile"],
            canAdvance=True,
            paidAbilities=[
                {
                    "id": "ronin-damage",
                    "label": "Trash Ronin: 3 net damage (needs 4 advancements)",
                    "clickCost": 1,
                    "creditCost": 0,
                    "cost": {"clicks": 1, "trashSelf": True},
                    "windows": ["corp_action_paw"],
                    "effect": net(3),
                    "requiresAdvancements": 4,
                }
            ],
            unsupported=["Requires 4+ advancements gate on trash ability not enforced."],
        )
    if cid == "snare":
        return base(
            c,
            subtypes=["ambush"],
            onAccess=choose(
                "corp",
                [
                    {
                        "id": "pay",
                        "label": "Pay 4¢: tag + 3 net",
                        "effect": seq(lose("corp", 4), tags(1), net(3)),
                    },
                    {
                        "id": "decline",
                        "label": "Decline",
                        "effect": gain("corp", 0),
                    },
                ],
            ),
            unsupported=[
                "Reveal while accessing from R&D; onAccess anywhere except Archives — Archives exemption not checked."
            ],
        )
    if cid == "celebrity-gift":
        return base(
            c,
            subtypes=["double"],
            playAdditionalClick=True,
            onPlay={"op": "do", "action": {"kind": "reveal_hq_gain_credits_per", "max": 5, "per": 2}},
            unsupported=[
                "Double (extra click cost) + reveal up to 5 HQ cards for 2¢ each — reveal/gain not implemented."
            ],
        )
    if cid == "trick-of-light":
        return base(
            c,
            onPlay={"op": "do", "action": {"kind": "move_advancements", "amount": 2}},
            unsupported=["Move up to 2 advancements between advanceable cards — needs targeting."],
        )
    if cid == "hokusai-grid":
        return base(
            c,
            subtypes=["region"],
            onSuccessfulRunOnThisServer=net(1),
            unsupported=[
                "Successful run on this server → 1 net; limit 1 region/server — region limit not enforced."
            ],
        )
    if cid == "daily-business-show":
        return base(
            c,
            subtypes=["cast"],
            unsupported=[
                "Interrupt first draw each turn: draw +1 then put 1 drawn on bottom of R&D."
            ],
        )
    if cid == "reversed-accounts":
        return base(
            c,
            subtypes=["hostile"],
            canAdvance=True,
            paidAbilities=[
                {
                    "id": "reversed",
                    "label": "Trash: Runner loses 4¢ per advancement",
                    "clickCost": 1,
                    "creditCost": 0,
                    "cost": {"clicks": 1, "trashSelf": True},
                    "windows": ["corp_action_paw"],
                    "effect": {
                        "op": "do",
                        "action": {"kind": "lose_credits_per_advancement", "per": 4},
                    },
                }
            ],
            unsupported=[],
        )
    if cid == "psychographics":
        return base(
            c,
            playCost=0,  # X cost
            onPlay={"op": "do", "action": {"kind": "place_advancements_x_up_to_tags"}},
            unsupported=[
                "X cost ≤ Runner tags; place X advancements on advanceable card — X cost + targeting needed."
            ],
        )
    if cid == "sansan-city-grid":
        return base(
            c,
            subtypes=["region"],
            advancementRequirementReduction=1,
            unsupported=[
                "Agendas in this server −1 advancement requirement; limit 1 region/server — reduction not applied yet."
            ],
        )
    if cid == "corporate-town":
        return base(
            c,
            rezAdditionalCostForfeitAgenda=True,
            onTurnBegin=choose(
                "corp",
                [
                    {
                        "id": "trash",
                        "label": "Trash a resource",
                        "effect": trash_res(),
                    },
                    {
                        "id": "decline",
                        "label": "Decline",
                        "effect": gain("corp", 0),
                    },
                ],
            ),
            unsupported=[
                "Rez requires forfeit agenda; trash resource cannot be prevented — forfeit + unpreventable not modeled."
            ],
        )
    if cid == "punitive-counterstrike":
        return base(
            c,
            subtypes=["black ops"],
            onPlay={
                "op": "do",
                "action": {
                    "kind": "trace",
                    "strength": 5,
                    "onSuccess": {
                        "op": "do",
                        "action": {"kind": "meat_damage_stolen_agenda_points_last_turn"},
                    },
                },
            },
            unsupported=[
                "Trace[5]; meat damage = printed AP stolen last turn — last-turn steal tracking needed."
            ],
        )
    if cid == "crisium-grid":
        return base(
            c,
            subtypes=["region"],
            runsCannotBeSuccessful=True,
            unsupported=[
                "Runs against this server cannot be declared successful; limit 1 region/server."
            ],
        )
    if cid == "corporate-troubleshooter":
        return base(
            c,
            paidAbilities=[
                {
                    "id": "troubleshooter",
                    "label": "X¢, trash: ice +X strength this turn",
                    "clickCost": 0,
                    "creditCost": 0,
                    "cost": {"trashSelf": True},
                    "windows": ["corp_action_paw", "approach_paw", "encounter_paw"],
                    "effect": {
                        "op": "do",
                        "action": {"kind": "fortify_ice_x_credits"},
                    },
                }
            ],
            unsupported=["X¢ trash for +X ice strength remainder of turn — X payment not modeled."],
        )
    if cid == "subliminal-messaging":
        return base(
            c,
            subtypes=["gray ops"],
            onPlay=seq(gain("corp", 1), gain_clicks("corp", 1)),
            unsupported=[
                "First copy each turn gains [click] (always applied here); Archives recursion when Runner made no runs last turn not modeled."
            ],
        )

    # Fallback: skeleton with full text as unsupported
    card = base(c)
    card["unsupported"] = [
        f"Full text not yet mapped to IR: {re.sub(r'<[^>]+>', '', text)[:200]}"
    ]
    return card


def main():
    data = json.loads(NRDB.read_text())["data"]
    su = sorted(
        [c for c in data if c.get("pack_code") == "su21"],
        key=lambda c: c.get("position", 0),
    )
    assert len(su) == 82, len(su)
    OUT.mkdir(parents=True, exist_ok=True)
    # Clear prior generated files
    for p in OUT.glob("*.json"):
        p.unlink()

    written = []
    skipped = []
    for c in su:
        cid = slugify(c["title"])
        mapped = map_card(c)
        if mapped is None:
            skipped.append(cid)
            continue
        # Drop null playCost for psychographics-style if needed
        path = OUT / f"{cid}.json"
        path.write_text(json.dumps(mapped, indent=2, ensure_ascii=False) + "\n")
        written.append(cid)

    print(f"Wrote {len(written)} cards to {OUT}")
    print(f"Skipped reprints/shared: {skipped}")
    full = sum(
        1
        for cid in written
        if not json.loads((OUT / f"{cid}.json").read_text()).get("unsupported")
    )
    partial = len(written) - full
    print(f"Among written: full={full} partial={partial}")
    # Pool order
    pool_ids = []
    for c in su:
        pool_ids.append(slugify(c["title"]))
    print("POOL_IDS=" + json.dumps(pool_ids))


if __name__ == "__main__":
    main()
