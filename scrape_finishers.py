"""
scrape_finishers.py
-------------------
Scrapes finishing move entries from the Call of Duty Fandom wiki via the
MediaWiki action=parse API (not blocked by Cloudflare like the regular pages)
and adds any new entries to data.json without modifying existing ones.

Table structure per game (discovered by inspection):
  MW    – Cell 0: "Name|Rarity",  Cell 1: icon img (data-image-key)
  CW    – Cell 0: name,           Cell 2: icon img (data-image-key)
  VG    – Cell 0: name,           Cell 2: gif img (data-image-key)
  MWII  – Cell 0: name,           Cell 1: icon img (data-image-key)
  MWIII – Cell 0: name,           Cell 1: icon img (data-image-key)
  BO6   – Cell 0: "Name|Rarity",  Cell 1: icon img (data-image-key)
"""

import json
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATA_JSON_PATH = Path(__file__).parent / "data.json"

FANDOM_API_BASE = "https://callofduty.fandom.com/api.php"

# Mapping: (game_key, wiki_page_title, name_cell_idx, icon_cell_idx, name_has_rarity)
# name_has_rarity: True if the name cell contains "Name|Rarity" and we take split[0]
PAGES = [
    ("MW",
     "Finishing_Move/Call_of_Duty:_Modern_Warfare_(2019)",
     0, 1, True),
    ("CW",
     "Finishing_Move/Call_of_Duty:_Black_Ops_Cold_War",
     0, 2, False),
    ("VG",
     "Finishing_Move/Call_of_Duty:_Vanguard",
     0, 2, False),
    ("MWII",
     "Finishing_Move/Call_of_Duty:_Modern_Warfare_II",
     0, 1, False),
    ("MWIII",
     "Finishing_Move/Call_of_Duty:_Modern_Warfare_III",
     0, 1, False),
    ("BO6",
     "Finishing_Move/Call_of_Duty:_Black_Ops_6",
     0, 1, True),
]

# Simple API-friendly session (NO browser-specific Sec-Fetch headers)
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
})

REQUEST_DELAY = 2.0  # seconds between requests


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def to_camel_case(text: str) -> str:
    """Convert display name to CamelCase icon stem, stripping non-alphanumeric."""
    parts = re.split(r"[\s\-–—_/\\]+", text)
    camel = ""
    for part in parts:
        if not part:
            continue
        cleaned = re.sub(r"[^A-Za-z0-9']", "", part)
        if cleaned:
            camel += cleaned[0].upper() + cleaned[1:]
    return camel


def stem_from_image_key(key: str) -> str | None:
    """Extract stem from image data-image-key attribute."""
    if not key:
        return None
    key = key.strip()
    # URL-decode common encodings (e.g. %26 → &)
    key = key.replace("%26", "&").replace("%27", "'").replace("%20", " ")
    for pattern in [
        r"^(.+?)_FinishingMove_Icon_",
        r"^(.+?)_Finishing_Move_Icon_",
        r"^(.+?)_FinisherIcon_",
        r"^(.+?)_Finisher_",
        r"^(.+?)_FinishingMove_",
        r"^(.+?)_Finishing_Move_",
    ]:
        m = re.match(pattern, key, re.IGNORECASE)
        if m:
            return m.group(1)
    # For VG gifs like "RackIt_FinishingMove_Polina_CODV.gif":
    # strip extension
    return re.sub(r"\.[a-z]+$", "", key, flags=re.IGNORECASE)


def make_icon_path(game_key: str, stem: str) -> str:
    return f"assets/{game_key}/{stem}.png"


def build_new_entry(name: str, game_key: str, stem: str) -> dict:
    return {
        "name": name,
        "icon": make_icon_path(game_key, stem),
        "standing": "Standing",
        "prone": "Prone",
        "downed": "Downed",
        "anim_time": 0.0,
        "ttk": 0.0,
        "price": 0,
    }


# ---------------------------------------------------------------------------
# Fetch via MediaWiki API
# ---------------------------------------------------------------------------


def fetch_via_api(page_title: str) -> BeautifulSoup | None:
    """Use the MediaWiki action=parse API to retrieve page HTML."""
    params = {
        "action": "parse",
        "page": page_title,
        "prop": "text",
        "format": "json",
        "disablelimitreport": "1",
        "disableeditsection": "1",
    }
    try:
        resp = SESSION.get(FANDOM_API_BASE, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            print(f"  [API ERROR] {data['error']}")
            return None
        html = data.get("parse", {}).get("text", {}).get("*", "")
        if not html:
            print("  [API] Empty HTML returned")
            return None
        print(f"  [API] Retrieved {len(html):,} chars")
        return BeautifulSoup(html, "html.parser")
    except Exception as exc:
        print(f"  [API] Failed: {exc}")
        return None


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def parse_finishing_moves(
    soup: BeautifulSoup,
    game_key: str,
    name_cell_idx: int,
    icon_cell_idx: int,
    name_has_rarity: bool,
) -> list[dict]:
    """
    Parse finishing move entries from rendered wiki HTML.
    Returns a list of new entry dicts.
    """
    entries: list[dict] = []

    tables = soup.find_all("table", class_="wikitable")
    if not tables:
        tables = soup.find_all("table")
    print(f"  Tables found: {len(tables)}")

    for table in tables:
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all(["td", "th"])
            if not cells:
                continue
            # Skip header rows
            if all(c.name == "th" for c in cells):
                continue

            # ----------------------------------------------------------------
            # Extract name
            # ----------------------------------------------------------------
            if len(cells) <= name_cell_idx:
                continue

            name_raw = cells[name_cell_idx].get_text(separator="|", strip=True)
            if not name_raw:
                continue

            if name_has_rarity:
                # e.g. "Achilles Heel|Base" or "Look Sharp|Epic"
                name = name_raw.split("|")[0].strip()
            else:
                # Take first segment (in case of "Name|extra")
                name = name_raw.split("|")[0].strip()

            # Strip trailing/leading punctuation artifacts
            name = name.strip().strip('"').strip("'").strip()

            if not name or len(name) < 2:
                continue

            # ----------------------------------------------------------------
            # Extract icon stem
            # ----------------------------------------------------------------
            stem = None

            if len(cells) > icon_cell_idx:
                icon_cell = cells[icon_cell_idx]
                imgs = icon_cell.find_all("img")
                if not imgs:
                    # Try looking in the whole row for the icon
                    imgs = row.find_all("img")

                for img in imgs:
                    data_key = (
                        img.get("data-image-key", "")
                        or img.get("data-image-name", "")
                        or img.get("alt", "")
                    )
                    if data_key:
                        candidate = stem_from_image_key(data_key)
                        if candidate and len(candidate) > 1:
                            stem = candidate
                            break

            if not stem:
                # Fall back to deriving stem from the name
                stem = to_camel_case(name)

            if not stem:
                continue

            entries.append(build_new_entry(name, game_key, stem))

    return entries


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    print(f"Loading {DATA_JSON_PATH} …")
    with open(DATA_JSON_PATH, "r", encoding="utf-8") as fh:
        data = json.load(fh)

    summary: dict[str, int] = {}

    for game_key, page_title, name_idx, icon_idx, name_has_rarity in PAGES:
        print(f"\n{'=' * 60}")
        print(f"Processing {game_key}: {page_title}")
        print(f"{'=' * 60}")

        if game_key not in data:
            data[game_key] = []

        existing_names: set[str] = {entry["name"] for entry in data[game_key]}
        print(f"  Existing entries: {len(existing_names)}")

        soup = fetch_via_api(page_title)
        if soup is None:
            print(f"  [SKIP] Could not fetch page for {game_key}")
            summary[game_key] = 0
            time.sleep(REQUEST_DELAY)
            continue

        parsed = parse_finishing_moves(
            soup, game_key, name_idx, icon_idx, name_has_rarity
        )
        print(f"  Parsed {len(parsed)} entries from page")

        added = 0
        seen_in_this_run: set[str] = set()
        for entry in parsed:
            if entry["name"] in existing_names:
                continue
            if entry["name"] in seen_in_this_run:
                continue  # de-duplicate
            data[game_key].append(entry)
            existing_names.add(entry["name"])
            seen_in_this_run.add(entry["name"])
            added += 1
            print(f"    + {entry['name']!r}  ->  {entry['icon']}")

        summary[game_key] = added
        print(f"  Added {added} new entries for {game_key}")

        time.sleep(REQUEST_DELAY)

    print(f"\nWriting updated {DATA_JSON_PATH} …")
    with open(DATA_JSON_PATH, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)

    print("\n" + "=" * 60)
    print("SUMMARY — new entries added")
    print("=" * 60)
    for game_key, count in summary.items():
        total = len(data[game_key])
        print(f"  {game_key:6s}: +{count} new  (total now: {total})")

    print("\nDone.")


if __name__ == "__main__":
    main()
