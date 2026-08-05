"""
populate_bundles_and_prices.py
-------------------------------
Fetches and parses 'How to obtain' table data from the Call of Duty Fandom Wiki
via MediaWiki parse API for all 7 game titles (MW, CW, VG, MWII, MWIII, BO6, BO7).
Cleans and sanitizes bundle titles and populates missing/inaccurate 'bundle' and 'price'
fields for all finishing move entries in data.json across all 13 price tiers.
"""

import json
import re
import sys
from pathlib import Path
import requests
from bs4 import BeautifulSoup

from lookup_prices import (
    EXPLICIT_OVERRIDES,
    lookup_bundle_price,
    sanitize_bundle_name,
)

DATA_JSON_PATH = Path(__file__).parent / "data.json"
FANDOM_API_BASE = "https://callofduty.fandom.com/api.php"

# Page configurations: (game_key, page_title, name_col_idx, obtain_col_idx)
PAGES = [
    ("MW", "Finishing_Move/Call_of_Duty:_Modern_Warfare_(2019)", 0, 3),
    ("CW", "Finishing_Move/Call_of_Duty:_Black_Ops_Cold_War", 0, 3),
    ("VG", "Finishing_Move/Call_of_Duty:_Vanguard", 0, 3),
    ("MWII", "Finishing_Move/Call_of_Duty:_Modern_Warfare_II", 0, 2),
    ("MWIII", "Finishing_Move/Call_of_Duty:_Modern_Warfare_III", 0, 2),
    ("BO6", "Finishing_Move/Call_of_Duty:_Black_Ops_6", 0, 3),
    ("BO7", "Finishing_Move/Call_of_Duty:_Black_Ops_7", 0, 3),
]


def norm_name(s: str) -> str:
    """Normalize string for fuzzy matching (lowercase, alphanumeric only)."""
    return re.sub(r"[^a-z0-9]", "", s.lower())


# Alias map for name differences between data.json and Fandom Wiki tables
ALIAS_MAP = {
    ("MWIII", norm_name("Ninjauity")): norm_name("Ninjanuity"),
    ("MWIII", norm_name("Whiplashed Unleashed")): norm_name("Whipslashed Unleashed"),
    ("BO6", norm_name("Kama Wrath")): norm_name("Axe Wrath"),
    ("MWII", norm_name("Bark And Bite")): norm_name("Tactical Pet: Merlin"),
}

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/html, */*",
})


def determine_price(bundle_name: str, raw_obtain: str, existing_price: int | float | None, game: str = "", name: str = "") -> int:
    """Determine the COD Point price (integer) across all 13 price tiers."""
    return lookup_bundle_price(bundle_name, raw_obtain, existing_price, game, name)


def populate_data():
    if not DATA_JSON_PATH.exists():
        print(f"Error: {DATA_JSON_PATH} not found.")
        sys.exit(1)

    with open(DATA_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    total_entries = sum(len(items) for items in data.values())
    print(f"Loaded data.json with {total_entries} entries across {len(data)} games.")

    updated_count = 0

    for game_key, page_title, name_col, obtain_col in PAGES:
        items = data.get(game_key, [])
        if not items:
            continue

        print(f"Fetching Wiki page for {game_key}: {page_title}...")
        wiki_map = {}
        try:
            params = {
                "action": "parse",
                "page": page_title,
                "prop": "text",
                "format": "json",
                "disablelimitreport": "1",
            }
            resp = SESSION.get(FANDOM_API_BASE, params=params, timeout=10)
            if resp.status_code == 200:
                res = resp.json()
                html = res.get("parse", {}).get("text", {}).get("*", "")
                if html:
                    soup = BeautifulSoup(html, "html.parser")
                    tables = soup.find_all("table", class_="wikitable") or soup.find_all("table")
                    if tables:
                        rows = tables[0].find_all("tr")
                        for row in rows[1:]:
                            cells = row.find_all(["td", "th"])
                            if len(cells) > max(name_col, obtain_col):
                                name_raw = cells[name_col].get_text(separator="|", strip=True).split("|")[0].strip().strip('"').strip("'")
                                if name_raw and name_raw != "Name":
                                    obtain_raw = cells[obtain_col].get_text(separator=" ", strip=True)
                                    wiki_map[norm_name(name_raw)] = obtain_raw
        except Exception as e:
            print(f"Note: Wiki fetch for {game_key} encountered error: {e}. Using existing entries with offline price matrix lookup.")

        for item in items:
            item_name = item.get("name", "")
            norm_item = norm_name(item_name)
            lookup_key = ALIAS_MAP.get((game_key, norm_item), norm_item)
            raw_obtain = wiki_map.get(lookup_key) or item.get("bundle") or "Default"

            bundle_name = sanitize_bundle_name(raw_obtain, game_key, item_name)
            price_val = determine_price(bundle_name, raw_obtain, item.get("price"), game_key, item_name)

            item["bundle"] = bundle_name
            item["price"] = price_val

            # Ensure aliases field exists for every item
            name_lower = item_name.lower()
            norm_str = norm_name(item_name)
            aliases_set = {item_name, name_lower, norm_str}
            if "aliases" in item and isinstance(item["aliases"], list):
                for a in item["aliases"]:
                    if isinstance(a, str) and a.strip():
                        aliases_set.add(a)
            item["aliases"] = sorted(list(aliases_set))

            # Ensure posture fields (standing, prone, downed) are non-empty strings
            if not item.get("standing"):
                item["standing"] = "Standing"
            if not item.get("prone"):
                item["prone"] = "Prone"
            if not item.get("downed"):
                item["downed"] = "Downed"

            updated_count += 1

    with open(DATA_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Successfully populated and sanitized {updated_count}/{total_entries} entries in data.json.")


if __name__ == "__main__":
    populate_data()
