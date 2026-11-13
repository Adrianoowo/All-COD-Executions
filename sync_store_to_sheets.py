#!/usr/bin/env python3
"""
sync_store_to_sheets.py
-----------------------
Database Enrichment & Auto-Backfill tool for All-COD-Executions.

Uses itemshop.gg's Call of Duty Item Shop API to:
1. Detect brand-new Finishing Moves / Executions released in the store.
2. Backfill missing prices (COD Points), bundle names, and store URLs for existing finishers.
3. Dual-sync updates to Google Sheets via the Apps Script Webhook and locally to data-fallback.js.

Note: Media (icons, preview GIFs) is handled through the wiki scraper. This script
populates the canonical Cloudflare R2 asset paths in the database.

Usage:
    python3 sync_store_to_sheets.py --dry-run
    python3 sync_store_to_sheets.py --live
    python3 sync_store_to_sheets.py --live --overwrite
"""

import os
import sys
import json
import csv
import re
import argparse
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

# Terminal color formatting
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

# Default coordinates
BASE_DIR = Path(__file__).resolve().parent
FALLBACK_JS_PATH = BASE_DIR / "data-fallback.js"
DEFAULT_GAME = "call-of-duty"
USER_AGENT = "All-COD-Executions-Sync/1.0 (https://github.com/Adrianoowo/All-COD-Executions)"
GOOGLE_SHEET_CSV_URL = (
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vT9EOMdiacUjhgNkMA8tQze2PqKXThqPX4MxCUZNnS-3GNuGapsATPrYJKLWggNaJjcaLz89JL23ovP/pub?gid=1458453375&single=true&output=csv"
)

def load_env_file(path: Path):
    """Load key-value pairs from .env into os.environ if present."""
    if not path.exists():
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

# Load environment configs (check local .env, then ExecutionersBot/.env)
load_env_file(BASE_DIR / ".env")
load_env_file(BASE_DIR.parent / "ExecutionersBot" / ".env")

def normalize_key(s: Optional[str]) -> str:
    """Normalize a name by stripping non-alphanumeric chars and lowercasing."""
    if not s:
        return ""
    return re.sub(r"[^a-zA-Z0-9]", "", s).lower()

def clean_alphanumeric(s: Optional[str]) -> str:
    """Remove spaces and special characters for clean filenames."""
    if not s:
        return ""
    return re.sub(r"[^a-zA-Z0-9]", "", s)

class ItemShopAPI:
    """Lightweight client for fetching the active Call of Duty shop."""

    def __init__(self, game: str = DEFAULT_GAME, user_agent: str = USER_AGENT):
        self.game = game
        self.user_agent = user_agent

    def fetch_shop(self) -> Dict[str, Any]:
        url = f"https://itemshop.gg/api/v1/shop/{self.game}"
        req = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": self.user_agent
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data
        except urllib.error.HTTPError as e:
            if e.code == 429:
                retry = e.headers.get("Retry-After", "60")
                print(f"{Colors.FAIL}[Error] Rate limited by itemshop.gg. Retry-After: {retry}s{Colors.ENDC}")
            raise

    def extract_finishers(self, shop_payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract all finishing move entries from shop sections and bundle contents."""
        data = shop_payload.get("data", {})
        sections = data.get("sections", [])
        finishers = []

        for sec in sections:
            sec_title = sec.get("title", "")
            for item in sec.get("items", []):
                bundle_name = item.get("name", "")
                bundle_price = (item.get("price") or {}).get("amount")
                source_url = item.get("sourceUrl")
                bundle_card_img = (item.get("images") or {}).get("card")

                # Direct finisher listing
                item_type = (item.get("type") or "").lower()
                if any(k in item_type for k in ["finishing move", "execution"]):
                    finishers.append({
                        "name": item.get("name"),
                        "bundle": bundle_name,
                        "price": bundle_price,
                        "source_url": source_url,
                        "section": sec_title,
                        "item_card_img": bundle_card_img,
                        "finisher_img": bundle_card_img
                    })

                # Bundle contents listing
                for c in item.get("contents", []):
                    c_type = (c.get("type") or "").lower()
                    c_name = (c.get("name") or "").lower()
                    if any(k in c_type or k in c_name for k in ["finishing move", "execution"]):
                        finishers.append({
                            "name": c.get("name"),
                            "bundle": bundle_name,
                            "price": bundle_price,
                            "source_url": source_url,
                            "section": sec_title,
                            "item_card_img": bundle_card_img,
                            "finisher_img": c.get("image")
                        })

        return finishers

class DatabaseManager:
    """Manages reading/updating data-fallback.js and Google Sheets."""

    def __init__(self, fallback_path: Path = FALLBACK_JS_PATH, webhook_url: Optional[str] = None, webhook_secret: Optional[str] = None):
        self.fallback_path = fallback_path
        self.webhook_url = webhook_url or os.getenv("GOOGLE_APPS_SCRIPT_URL")
        self.webhook_secret = webhook_secret or os.getenv("GOOGLE_APPS_SCRIPT_SECRET")
        self.fallback_data: Dict[str, List[Dict[str, Any]]] = {}
        self._load_fallback()

    def _load_fallback(self):
        if not self.fallback_path.exists():
            print(f"{Colors.WARNING}Warning: {self.fallback_path} does not exist.{Colors.ENDC}")
            return
        with open(self.fallback_path, "r", encoding="utf-8") as f:
            text = f.read()
        prefix = "const FALLBACK_EXECUTIONS_DATA = "
        if text.startswith(prefix):
            json_str = text[len(prefix):].rstrip().rstrip(";")
            self.fallback_data = json.loads(json_str)

    def save_fallback(self):
        """Write in-memory fallback_data back to data-fallback.js."""
        with open(self.fallback_path, "w", encoding="utf-8") as f:
            f.write(f"const FALLBACK_EXECUTIONS_DATA = {json.dumps(self.fallback_data, indent=2)};\n")

    def infer_game_for_finisher(self, section_title: str, item_card_img: Optional[str], finisher_name: str) -> str:
        """Infer target game identifier (e.g. MW, CW, VG, MWII, MWIII, BO6, BO7, MW4)."""
        norm = normalize_key(finisher_name)

        # 1. Match against known database entries first
        for g, items in self.fallback_data.items():
            for it in items:
                if normalize_key(it.get("name")) == norm or normalize_key(it.get("clean_name")) == norm:
                    return g

        # 2. Check section title
        st = (section_title or "").lower()
        if "black ops 7" in st or "bo7" in st:
            return "BO7"
        if "black ops 6" in st or "bo6" in st:
            return "BO6"
        if "modern warfare 4" in st or "mw4" in st:
            return "MW4"
        if "modern warfare iii" in st or "mwiii" in st:
            return "MWIII"
        if "modern warfare ii" in st or "mwii" in st:
            return "MWII"
        if "vanguard" in st or "vg" in st:
            return "VG"
        if "cold war" in st or "cw" in st:
            return "CW"
        if "modern warfare" in st or "mw" in st:
            return "MW"

        # 3. Check card image URL
        img = (item_card_img or "").lower()
        if "modern-warfare-4" in img:
            return "MW4"
        if "black-ops-6" in img:
            return "BO6"

        return "BO7"

    def send_webhook_request(self, payload: Dict[str, Any]) -> Tuple[bool, str]:
        """Send payload to Google Apps Script Webhook."""
        if not self.webhook_url:
            return False, "GOOGLE_APPS_SCRIPT_URL not configured"
        if not self.webhook_secret:
            return False, "GOOGLE_APPS_SCRIPT_SECRET not configured"

        payload["secret"] = self.webhook_secret
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            self.webhook_url,
            data=req_data,
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                res_json = json.loads(resp.read().decode("utf-8"))
                if res_json.get("status") == "success":
                    return True, res_json.get("message", "Success")
                return False, res_json.get("message", "Unknown error")
        except Exception as e:
            return False, str(e)

def parse_args():
    parser = argparse.ArgumentParser(
        description="Enrich Google Sheets and data-fallback.js using itemshop.gg Call of Duty store data."
    )
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        "--live",
        action="store_true",
        help="Execute real updates to Google Sheets webhook and data-fallback.js (default is dry-run)."
    )
    mode_group.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the sync, displaying proposed updates and new discoveries without writing."
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing non-empty prices and bundle names if store data differs (default is Safe Fill)."
    )
    parser.add_argument(
        "--webhook-url",
        type=str,
        default=os.getenv("GOOGLE_APPS_SCRIPT_URL"),
        help="Google Apps Script Webhook URL for Google Sheets updates."
    )
    parser.add_argument(
        "--webhook-secret",
        type=str,
        default=os.getenv("GOOGLE_APPS_SCRIPT_SECRET"),
        help="Google Apps Script Webhook secret token."
    )
    return parser.parse_args()

def main():
    args = parse_args()
    is_live = args.live
    is_overwrite = args.overwrite

    print(f"\n{Colors.BOLD}{Colors.HEADER}======================================================{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.OKCYAN}   Call of Duty Store Database Enrichment Tool       {Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.HEADER}======================================================{Colors.ENDC}")
    print(f"Mode: {Colors.OKGREEN + 'LIVE SYNC' if is_live else Colors.WARNING + 'DRY RUN (Preview Only)'}{Colors.ENDC}")
    print(f"Policy: {Colors.WARNING + 'OVERWRITE' if is_overwrite else Colors.OKGREEN + 'SAFE FILL (Fill missing only)'}{Colors.ENDC}")
    print(f"Target: Google Sheets Webhook + data-fallback.js\n")

    # 1. Fetch live Call of Duty store
    print(f"[*] Fetching today's Call of Duty shop from itemshop.gg...")
    api = ItemShopAPI()
    try:
        shop_payload = api.fetch_shop()
    except Exception as e:
        print(f"{Colors.FAIL}[Error] Failed to fetch shop data: {e}{Colors.ENDC}")
        sys.exit(1)

    store_finishers = api.extract_finishers(shop_payload)
    print(f"{Colors.OKGREEN}[✓] Found {len(store_finishers)} finishing move listings in today's store.{Colors.ENDC}")

    # 2. Load database
    db = DatabaseManager(webhook_url=args.webhook_url, webhook_secret=args.webhook_secret)
    all_fallback_items: List[Tuple[str, Dict[str, Any]]] = []
    for g, items in db.fallback_data.items():
        for it in items:
            all_fallback_items.append((g, it))

    # Build lookup map: norm_name -> (game, item)
    db_map: Dict[str, Tuple[str, Dict[str, Any]]] = {}
    for g, it in all_fallback_items:
        norm = normalize_key(it.get("name"))
        if norm:
            db_map[norm] = (g, it)
        clean_norm = normalize_key(it.get("clean_name"))
        if clean_norm and clean_norm not in db_map:
            db_map[clean_norm] = (g, it)
        for alias in it.get("aliases", []):
            a_norm = normalize_key(alias)
            if a_norm and a_norm not in db_map:
                db_map[a_norm] = (g, it)

    # 3. Analyze matches, updates, and new discoveries
    backfilled_items: List[Dict[str, Any]] = []
    new_discoveries: List[Dict[str, Any]] = []
    already_synced_count = 0

    seen_new_keys = set()

    for sf in store_finishers:
        sf_name = sf["name"]
        norm = normalize_key(sf_name)
        store_price = sf["price"]
        store_bundle = sf["bundle"]
        store_url = sf["source_url"] or ""

        if norm in db_map:
            game, db_item = db_map[norm]
            curr_price = db_item.get("price")
            curr_bundle = db_item.get("bundle") or ""
            curr_bundle_url = db_item.get("bundle_url") or ""

            # Check if price should be updated
            update_price = False
            if store_price is not None:
                if curr_price is None or curr_price == "" or curr_price == 0:
                    update_price = True
                elif is_overwrite and curr_price != store_price:
                    update_price = True

            # Check if bundle name should be updated
            update_bundle = False
            if store_bundle and store_bundle.strip():
                if not curr_bundle or curr_bundle.strip() == "":
                    update_bundle = True
                elif is_overwrite and curr_bundle != store_bundle:
                    update_bundle = True

            # Check if bundle URL should be updated
            update_url = False
            if store_url and store_url.strip():
                if not curr_bundle_url or curr_bundle_url.strip() == "":
                    update_url = True
                elif is_overwrite and curr_bundle_url != store_url:
                    update_url = True

            if update_price or update_bundle or update_url:
                backfilled_items.append({
                    "game": game,
                    "name": db_item["name"],
                    "db_item": db_item,
                    "update_price": update_price,
                    "old_price": curr_price,
                    "new_price": store_price if update_price else curr_price,
                    "update_bundle": update_bundle,
                    "old_bundle": curr_bundle,
                    "new_bundle": store_bundle if update_bundle else curr_bundle,
                    "update_url": update_url,
                    "old_url": curr_bundle_url,
                    "new_url": store_url if update_url else curr_bundle_url
                })
            else:
                already_synced_count += 1
        else:
            # Brand new discovery!
            if norm not in seen_new_keys:
                seen_new_keys.add(norm)
                inferred_game = db.infer_game_for_finisher(sf["section"], sf["item_card_img"], sf_name)
                clean_name = clean_alphanumeric(sf_name)
                new_discoveries.append({
                    "game": inferred_game,
                    "name": sf_name,
                    "clean_name": clean_name,
                    "price": store_price or 0,
                    "bundle": store_bundle or "",
                    "bundle_url": store_url,
                    "aliases": [sf_name.lower(), clean_name.lower()],
                    "icon": f"assets/{inferred_game}/{clean_name}.png",
                    "preview": f"assets/previews/{inferred_game}/{clean_name}.gif",
                    "standing": "",
                    "prone": "",
                    "downed": "",
                    "anim_time": 0,
                    "ttk": 0,
                    "section": sf["section"]
                })

    # 4. Display Report
    print(f"\n{Colors.BOLD}--- 📊 Store Analysis Results ---{Colors.ENDC}")
    print(f"Total Store Finishers Scanned: {len(store_finishers)}")
    print(f"Already Complete in Database:   {already_synced_count}")
    print(f"Existing to Backfill / Update: {len(backfilled_items)}")
    print(f"Brand-New Discoveries:         {len(new_discoveries)}\n")

    if backfilled_items:
        print(f"{Colors.BOLD}{Colors.OKBLUE}📝 Backfill Opportunities ({len(backfilled_items)} executions):{Colors.ENDC}")
        for item in backfilled_items:
            changes = []
            if item["update_price"]:
                changes.append(f"Price: {item['old_price']} -> {item['new_price']} CP")
            if item["update_bundle"]:
                changes.append(f"Bundle: '{item['old_bundle']}' -> '{item['new_bundle']}'")
            if item["update_url"]:
                changes.append(f"URL: '{item['new_url']}'")
            print(f" • [{item['game']}] {Colors.BOLD}{item['name']}{Colors.ENDC}: {', '.join(changes)}")
        print()

    if new_discoveries:
        print(f"{Colors.BOLD}{Colors.OKGREEN}🆕 Brand-New Discoveries ({len(new_discoveries)} executions):{Colors.ENDC}")
        for nd in new_discoveries:
            print(f" • [{nd['game']}] {Colors.BOLD}{nd['name']}{Colors.ENDC} in bundle '{nd['bundle']}' ({nd['price']} CP)")
            print(f"   Asset Path: {nd['icon']} (Media handled via wiki scraper)")
        print()

    # 5. Apply Updates if Live
    if not is_live:
        print(f"{Colors.WARNING}Dry run complete. No changes were written.{Colors.ENDC}")
        print(f"Run with {Colors.BOLD}--live{Colors.ENDC} to write updates to Google Sheets and data-fallback.js.")
        return

    # Live Mode Execution
    print(f"{Colors.BOLD}[*] Applying Live Updates...{Colors.ENDC}")

    # A. Update local data-fallback.js
    for item in backfilled_items:
        db_item = item["db_item"]
        if item["update_price"]:
            db_item["price"] = item["new_price"]
        if item["update_bundle"]:
            db_item["bundle"] = item["new_bundle"]
        if item["update_url"]:
            db_item["bundle_url"] = item["new_url"]

    for nd in new_discoveries:
        g = nd["game"]
        if g not in db.fallback_data:
            db.fallback_data[g] = []
        # Exclude internal metadata field
        clean_entry = {k: v for k, v in nd.items() if k != "section"}
        db.fallback_data[g].append(clean_entry)

    db.save_fallback()
    print(f"{Colors.OKGREEN}[✓] data-fallback.js updated successfully.{Colors.ENDC}")

    # B. Send to Google Apps Script Webhook
    if not db.webhook_url or not db.webhook_secret:
        print(f"{Colors.WARNING}[!] GOOGLE_APPS_SCRIPT_URL or GOOGLE_APPS_SCRIPT_SECRET not configured.")
        print(f"    Local fallback was updated. Configure webhook in .env to update Google Sheets remotely.{Colors.ENDC}")
        return

    # 1. Update backfilled items via webhook (in a single atomic batch_update request)
    update_success = 0
    if backfilled_items:
        batch_payload = {
            "action": "batch_update",
            "updates": [
                {
                    "game": item["game"],
                    "name": item["name"],
                    "price": item["new_price"],
                    "bundle": item["new_bundle"],
                    "bundle_url": item["new_url"]
                }
                for item in backfilled_items
            ]
        }
        ok, msg = db.send_webhook_request(batch_payload)
        if ok:
            update_success = len(backfilled_items)
            print(f"{Colors.OKGREEN}[✓] Batch-updated {update_success} items on Google Sheets in one request.{Colors.ENDC}")
        else:
            print(f"{Colors.WARNING}[!] Batch update failed ({msg}), falling back to single updates...{Colors.ENDC}")
            for item in backfilled_items:
                payload = {
                    "action": "update",
                    "game": item["game"],
                    "name": item["name"],
                    "price": item["new_price"],
                    "bundle": item["new_bundle"],
                    "bundle_url": item["new_url"]
                }
                ok_single, msg_single = db.send_webhook_request(payload)
                if ok_single:
                    update_success += 1
                else:
                    print(f"{Colors.FAIL}Failed to update {item['name']} on Google Sheets: {msg_single}{Colors.ENDC}")
            print(f"{Colors.OKGREEN}[✓] Synced {update_success}/{len(backfilled_items)} updates to Google Sheets.{Colors.ENDC}")

    # 2. Add new discoveries via webhook batch_add
    if new_discoveries:
        clean_new_rows = [{k: v for k, v in nd.items() if k != "section"} for nd in new_discoveries]
        payload = {
            "action": "batch_add",
            "executions": clean_new_rows
        }
        ok, msg = db.send_webhook_request(payload)
        if ok:
            print(f"{Colors.OKGREEN}[✓] Batch-added {len(new_discoveries)} new discoveries to Google Sheets: {msg}{Colors.ENDC}")
        else:
            print(f"{Colors.FAIL}[Error] Failed to batch-add new discoveries to Google Sheets: {msg}{Colors.ENDC}")

    print(f"\n{Colors.BOLD}{Colors.OKGREEN}All sync operations completed!{Colors.ENDC}\n")

if __name__ == "__main__":
    main()
