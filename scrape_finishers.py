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

# Mapping: (game_key, wiki_page_title, name_cell_idx, icon_cell_idx, preview_cell_idx, name_has_rarity)
# name_has_rarity: True if the name cell contains "Name|Rarity" and we take split[0]
PAGES = [
    ("BO7",
     "Finishing_Move/Call_of_Duty:_Black_Ops_7",
     0, 1, 2, True),
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


def ext_from_image_key(key: str, url: str | None) -> str:
    """Extract file extension (including dot) from data-image-key or URL."""
    if key:
        match = re.search(r"\.([a-zA-Z0-9]+)$", key)
        if match:
            return f".{match.group(1).lower()}"
    if url:
        path_part = url.split("?")[0].split("/revision")[0]
        match = re.search(r"\.([a-zA-Z0-9]+)$", path_part)
        if match:
            return f".{match.group(1).lower()}"
    return ".png"


def make_icon_path(game_key: str, stem: str, ext: str = ".png") -> str:
    return f"assets/{game_key}/{stem}{ext}"


def make_preview_path(game_key: str, stem: str, ext: str = ".gif") -> str:
    return f"assets/previews/{game_key}/{stem}{ext}"


def build_new_entry(
    name: str, 
    game_key: str, 
    stem: str, 
    ext: str = ".png", 
    url: str | None = None,
    preview_url: str | None = None,
    preview_ext: str = ".gif",
    has_icon_col: bool = True
) -> dict:
    entry = {
        "name": name,
        "icon": make_icon_path(game_key, stem, ext) if has_icon_col else "Icon",
        "standing": "Standing",
        "prone": "Prone",
        "downed": "Downed",
        "anim_time": 0.0,
        "ttk": 0.0,
        "price": 0,
        "preview": make_preview_path(game_key, stem, preview_ext) if preview_url else "Preview"
    }
    if url and has_icon_col:
        entry["_image_url"] = url
    if preview_url:
        entry["_preview_url"] = preview_url
    return entry


def download_image(url: str, dest_path: Path) -> bool:
    """Download image from url and save to dest_path."""
    try:
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        resp = SESSION.get(url, timeout=30)
        resp.raise_for_status()
        dest_path.write_bytes(resp.content)
        return True
    except Exception as exc:
        print(f"      [DOWNLOAD ERROR] Failed to download {url} to {dest_path}: {exc}")
        return False


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
    icon_cell_idx: int | None,
    preview_cell_idx: int | None,
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

            name = name_raw.split("|")[0].strip().strip('"').strip("'").strip()

            if not name or len(name) < 2:
                continue

            # ----------------------------------------------------------------
            # Extract icon stem, extension, and URL
            # ----------------------------------------------------------------
            stem = None
            ext = ".png"
            img_url = None

            if icon_cell_idx is not None and len(cells) > icon_cell_idx:
                icon_cell = cells[icon_cell_idx]
                imgs = icon_cell.find_all("img")
                if not imgs:
                    # Try looking in the whole row for the icon (avoiding the preview cell)
                    imgs = []
                    for idx, cell in enumerate(cells):
                        if idx != preview_cell_idx and cell.name == "td":
                            imgs.extend(cell.find_all("img"))

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
                            raw_url = img.get("data-src") or img.get("src")
                            ext = ext_from_image_key(data_key, raw_url)
                            if raw_url and not raw_url.startswith("data:"):
                                if "/revision/latest" in raw_url:
                                    img_url = raw_url.split("/revision/latest")[0] + "/revision/latest"
                                else:
                                    img_url = raw_url
                            break

            # ----------------------------------------------------------------
            # Extract preview stem, extension, and URL
            # ----------------------------------------------------------------
            preview_url = None
            preview_ext = ".gif"

            if preview_cell_idx is not None and len(cells) > preview_cell_idx:
                preview_cell = cells[preview_cell_idx]
                p_imgs = preview_cell.find_all("img")
                for img in p_imgs:
                    data_key = (
                        img.get("data-image-key", "")
                        or img.get("data-image-name", "")
                        or img.get("alt", "")
                    )
                    if data_key:
                        p_candidate = stem_from_image_key(data_key)
                        if p_candidate and len(p_candidate) > 1:
                            if not stem:
                                stem = p_candidate
                            raw_url = img.get("data-src") or img.get("src")
                            preview_ext = ext_from_image_key(data_key, raw_url)
                            if raw_url and not raw_url.startswith("data:"):
                                if "/revision/latest" in raw_url:
                                    preview_url = raw_url.split("/revision/latest")[0] + "/revision/latest"
                                else:
                                    preview_url = raw_url
                            break

            if not stem:
                stem = to_camel_case(name)

            if not stem:
                continue

            entries.append(build_new_entry(
                name=name, 
                game_key=game_key, 
                stem=stem, 
                ext=ext, 
                url=img_url, 
                preview_url=preview_url, 
                preview_ext=preview_ext,
                has_icon_col=(icon_cell_idx is not None)
            ))

    return entries


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    print(f"Loading {DATA_JSON_PATH} …")
    with open(DATA_JSON_PATH, "r", encoding="utf-8") as fh:
        data = json.load(fh)

    summary: dict[str, int] = {}

    for game_key, page_title, name_idx, icon_idx, preview_idx, name_has_rarity in PAGES:
        print(f"\n{'=' * 60}")
        print(f"Processing {game_key}: {page_title}")
        print(f"{'=' * 60}")

        if game_key not in data:
            data[game_key] = []

        def normalize_name(s: str) -> str:
            return re.sub(r'[^a-z0-9]', '', s.lower())

        existing_names: set[str] = {entry["name"] for entry in data[game_key]}
        print(f"  Existing entries: {len(existing_names)}")

        soup = fetch_via_api(page_title)
        if soup is None:
            print(f"  [SKIP] Could not fetch page for {game_key}")
            summary[game_key] = 0
            time.sleep(REQUEST_DELAY)
            continue

        parsed = parse_finishing_moves(
            soup, game_key, name_idx, icon_idx, preview_idx, name_has_rarity
        )
        print(f"  Parsed {len(parsed)} entries from page")

        # Map of normalized name -> existing entry
        existing_entries_map = {normalize_name(entry["name"]): entry for entry in data[game_key]}

        added = 0
        seen_in_this_run: set[str] = set()
        for entry in parsed:
            name = entry["name"]
            norm_name = normalize_name(name)
            if norm_name in seen_in_this_run:
                continue
            seen_in_this_run.add(norm_name)

            url = entry.pop("_image_url", None)
            preview_url = entry.pop("_preview_url", None)
            is_new = norm_name not in existing_entries_map

            if is_new:
                data[game_key].append(entry)
                existing_entries_map[norm_name] = entry
                added += 1
                icon_path = entry.get("icon")
                preview_path = entry.get("preview")
                print(f"    + {name!r}  ->  icon: {icon_path}, preview: {preview_path}")
                target_entry = entry
            else:
                target_entry = existing_entries_map[norm_name]

            if url:
                parsed_icon = entry["icon"]
                dest_path = DATA_JSON_PATH.parent / parsed_icon

                current_icon = target_entry.get("icon")
                if current_icon != parsed_icon:
                    print(f"    Updating icon path for {name!r}: {current_icon} -> {parsed_icon}")
                    target_entry["icon"] = parsed_icon

                if not dest_path.exists():
                    print(f"    Downloading {parsed_icon} ...")
                    if download_image(url, dest_path):
                        time.sleep(0.5)

            if preview_url:
                parsed_preview = entry["preview"]
                dest_preview_path = DATA_JSON_PATH.parent / parsed_preview

                current_preview = target_entry.get("preview", "Preview")
                if current_preview != parsed_preview:
                    print(f"    Updating preview path for {name!r}: {current_preview} -> {parsed_preview}")
                    target_entry["preview"] = parsed_preview

                if not dest_preview_path.exists():
                    print(f"    Downloading preview {parsed_preview} ...")
                    # Ensure directory exists
                    dest_preview_path.parent.mkdir(parents=True, exist_ok=True)
                    if download_image(preview_url, dest_preview_path):
                        time.sleep(0.5)

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
