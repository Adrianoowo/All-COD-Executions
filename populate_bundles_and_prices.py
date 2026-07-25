"""
populate_bundles_and_prices.py
-------------------------------
Fetches and parses 'How to obtain' table data from the Call of Duty Fandom Wiki
via MediaWiki parse API for all 7 game titles (MW, CW, VG, MWII, MWIII, BO6, BO7).
Populates missing 'bundle' and 'price' fields for all finishing move entries in data.json.
"""

import json
import re
import sys
from pathlib import Path
import requests
from bs4 import BeautifulSoup

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

# Alias map for name differences between data.json and Fandom Wiki tables
ALIAS_MAP = {
    ("MWIII", "ninjauity"): "ninjanuity",
    ("MWIII", "whiplashedunleashed"): "whipslashedunleashed",
    ("BO6", "kamawrath"): "axewrath",
    ("MWII", "barkandbite"): "tacticalpetmerlin",
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


def norm_name(s: str) -> str:
    """Normalize string for fuzzy matching (lowercase, alphanumeric only)."""
    return re.sub(r"[^a-z0-9]", "", s.lower())


def clean_bundle_name(raw_obtain: str) -> str:
    """Clean raw obtain string into a human-readable bundle/source name."""
    text = " ".join(raw_obtain.split()).strip()
    text = text.strip('"').strip("'")
    
    # Strip operator prefix if formatted like "Sparks - Sparks Operator Bundle"
    if " - " in text and any(kw in text.lower() for kw in ["bundle", "pack"]):
        parts = text.split(" - ", 1)
        if len(parts) == 2 and any(kw in parts[1].lower() for kw in ["bundle", "pack"]):
            text = parts[1].strip()
            
    return text


def determine_price(bundle_name: str, raw_obtain: str, existing_price: int | float | None) -> int:
    """Determine the COD Point price (integer) based on unlock source and bundle characteristics."""
    ob_lower = raw_obtain.lower()
    b_lower = bundle_name.lower()
    combined = f"{b_lower} {ob_lower}"

    # Real money purchase packs (Pro Packs, C.O.D.E. Packs, Endeavour Packs)
    if any(k in combined for k in ["pro pack", "c.o.d.e.", "code ", "endeavour"]):
        return 0

    # Free unlock sources: Default, Base Operator, Battle Pass, Campaign, Challenge, Event, Pre-Order, Vault Edition
    free_keywords = [
        "default", "base for", "unlocked with", "unlocked by", "unlocked in", "unlocked from",
        "operator level", "operator mission", "battle pass", "blackcell", "campaign",
        "challenge", "challenges", "event", "reward", "rewards", "pre-order", "preorder", "pre order",
        "vault edition", "vault", "sector", "page", "instant sector", "instant reward",
        "completion sector", "completion page", "tier",
        "catch", "get ", "wins", "earn", "complete", "obtain", "open the safe", "redeem", "performing"
    ]

    for kw in free_keywords:
        if kw in combined:
            if kw == "mission" and "rescue mission" in combined:
                continue
            return 0

    # Preserve existing non-standard prices (e.g. 1800, 3000)
    if existing_price is not None and isinstance(existing_price, (int, float)) and not isinstance(existing_price, bool):
        if existing_price not in (0, 2400) and existing_price > 0:
            return int(existing_price)

    # Standard store bundle tier
    return 2400


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
        params = {
            "action": "parse",
            "page": page_title,
            "prop": "text",
            "format": "json",
            "disablelimitreport": "1",
        }
        resp = SESSION.get(FANDOM_API_BASE, params=params)
        resp.raise_for_status()
        res = resp.json()

        if "error" in res:
            print(f"Error parsing wiki page {page_title}: {res['error']}")
            continue

        html = res.get("parse", {}).get("text", {}).get("*", "")
        soup = BeautifulSoup(html, "html.parser")
        tables = soup.find_all("table", class_="wikitable") or soup.find_all("table")

        wiki_map = {}
        if tables:
            rows = tables[0].find_all("tr")
            for row in rows[1:]:
                cells = row.find_all(["td", "th"])
                if len(cells) > max(name_col, obtain_col):
                    name_raw = cells[name_col].get_text(separator="|", strip=True).split("|")[0].strip().strip('"').strip("'")
                    if name_raw and name_raw != "Name":
                        obtain_raw = cells[obtain_col].get_text(separator=" ", strip=True)
                        wiki_map[norm_name(name_raw)] = obtain_raw

        for item in items:
            norm_item = norm_name(item["name"])
            lookup_key = ALIAS_MAP.get((game_key, norm_item), norm_item)
            raw_obtain = wiki_map.get(lookup_key)

            if not raw_obtain:
                print(f"Warning: No wiki match found for [{game_key}] '{item['name']}', using existing or Default.")
                raw_obtain = item.get("bundle") or "Default"

            bundle_name = clean_bundle_name(raw_obtain)
            price_val = determine_price(bundle_name, raw_obtain, item.get("price"))

            item["bundle"] = bundle_name
            item["price"] = price_val

            # Ensure aliases field exists for every item (including Juggled Doom)
            if "aliases" not in item or not isinstance(item["aliases"], list):
                name_lower = item["name"].lower()
                norm_str = norm_name(item["name"])
                aliases_set = {name_lower, norm_str}
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

    print(f"Successfully populated 'bundle' and 'price' for {updated_count}/{total_entries} entries in data.json.")



if __name__ == "__main__":
    populate_data()
