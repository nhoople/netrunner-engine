#!/usr/bin/env python3
"""Regenerate System Gateway card JSON from NRDB pack `sg`.

Requires /tmp/nrdb-cards.json (curl https://netrunnerdb.com/api/2.0/public/cards).
Hand-mapped Effect IR; unsupported clauses listed explicitly.
Reprints Sure Gamble (30030) and Hedge Fund (30075) are skipped (reuse wave defs).

Usage: python3 scripts/generate-system-gateway.py
"""
# NOTE: Full mapping lives in git history / data/cards/system-gateway/*.json.
# This stub documents how the corpus was produced; prefer editing card JSON
# directly for fidelity fixes. Re-run only when refreshing from NRDB.
print("Gateway cards are committed under data/cards/system-gateway/.")
print("To refresh from NRDB, restore the generator from git history or re-author maps.")
