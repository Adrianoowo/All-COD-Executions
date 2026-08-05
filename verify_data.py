"""
verify_data.py
--------------
Standalone verification script to validate data integrity of data.json.
Validates:
1. JSON syntax validity.
2. 100% field compliance across all 7 games (MW, CW, VG, MWII, MWIII, BO6, BO7):
   - "name": non-empty string
   - "icon": non-empty string
   - "standing": non-empty string
   - "prone": non-empty string
   - "downed": non-empty string
   - "bundle": non-empty string (sanitized, no wiki residue or raw notes)
   - "price": valid numeric COD Point price in standard tier set
   - "aliases": list of strings
3. Price tier distribution matching webstore data, explicitly confirming presence of
   verified entries across tiers: 3000 CP, 2800 CP, 2400 CP, 1800 CP, 1600 CP,
   1400 CP, 1200 CP, 1100 CP, 800 CP, 600 CP, and 0 CP.
"""

import json
import re
import sys
from pathlib import Path

# Fix Windows console unicode printing
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

DATA_JSON_PATH = Path(__file__).parent / "data.json"
EXPECTED_GAMES = ["MW", "CW", "VG", "MWII", "MWIII", "BO6", "BO7"]
REQUIRED_FIELDS = ["name", "icon", "standing", "prone", "downed", "bundle", "price", "aliases"]
VALID_PRICE_TIERS = {0, 600, 800, 1000, 1100, 1200, 1400, 1600, 1800, 2000, 2400, 2800, 3000}
REQUIRED_VERIFIED_TIERS = {3000, 2800, 2400, 1800, 1600, 1400, 1200, 1100, 800, 600, 0}


def verify():
    print("==================== DATA INTEGRITY & PRICE TIER VERIFICATION ====================")

    # 1. JSON Validity Check
    try:
        with open(DATA_JSON_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        print("[OK] Valid JSON structure loaded successfully.")
    except Exception as e:
        print(f"[FAIL] Invalid JSON format in data.json: {e}")
        sys.exit(1)

    total_entries = 0
    compliant_entries = 0
    violations = []
    game_summaries = {}
    price_tier_counts = {tier: 0 for tier in sorted(VALID_PRICE_TIERS)}

    for game in EXPECTED_GAMES:
        if game not in data:
            violations.append(f"Missing game key '{game}' in data.json")
            continue

        items = data[game]
        g_total = len(items)
        g_compliant = 0

        for idx, entry in enumerate(items):
            total_entries += 1
            item_name = entry.get("name", f"Index {idx}")

            # 1. Check all 8 required schema fields are present
            missing_fields = [f for f in REQUIRED_FIELDS if f not in entry]
            has_all_fields = len(missing_fields) == 0

            name = entry.get("name")
            icon = entry.get("icon")
            standing = entry.get("standing")
            prone = entry.get("prone")
            downed = entry.get("downed")
            bundle = entry.get("bundle")
            price = entry.get("price")
            aliases = entry.get("aliases")

            has_valid_name = isinstance(name, str) and len(name.strip()) > 0 and "\ufffd" not in name
            has_valid_icon = isinstance(icon, str) and len(icon.strip()) > 0
            has_valid_standing = isinstance(standing, str) and len(standing.strip()) > 0
            has_valid_prone = isinstance(prone, str) and len(prone.strip()) > 0
            has_valid_downed = isinstance(downed, str) and len(downed.strip()) > 0
            has_valid_bundle = (
                isinstance(bundle, str) and
                len(bundle.strip()) > 0 and
                "\ufffd" not in bundle and
                "dismembered" not in bundle.lower() and
                not bundle.startswith("[[") and
                re.search(r"(-[a-zA-Z0-9]){3,}", bundle) is None
            )
            has_valid_price = (
                isinstance(price, int) and
                not isinstance(price, bool) and
                price >= 0 and
                price in VALID_PRICE_TIERS
            )
            has_valid_aliases = (
                isinstance(aliases, list) and
                len(aliases) > 0 and
                all(isinstance(x, str) and len(x.strip()) > 0 for x in aliases)
            )

            is_compliant = (
                has_all_fields and
                has_valid_name and
                has_valid_icon and
                has_valid_standing and
                has_valid_prone and
                has_valid_downed and
                has_valid_bundle and
                has_valid_price and
                has_valid_aliases
            )

            if is_compliant:
                g_compliant += 1
                compliant_entries += 1
                price_tier_counts[price] += 1
            else:
                issues = []
                if not has_all_fields:
                    issues.append(f"missing schema fields ({missing_fields!r})")
                if not has_valid_name:
                    issues.append(f"invalid name ({name!r})")
                if not has_valid_icon:
                    issues.append(f"invalid icon ({icon!r})")
                if not has_valid_standing:
                    issues.append(f"invalid standing ({standing!r})")
                if not has_valid_prone:
                    issues.append(f"invalid prone ({prone!r})")
                if not has_valid_downed:
                    issues.append(f"invalid downed ({downed!r})")
                if not has_valid_bundle:
                    issues.append(f"invalid bundle ({bundle!r})")
                if not has_valid_price:
                    issues.append(f"invalid price ({price!r})")
                if not has_valid_aliases:
                    issues.append(f"invalid aliases ({aliases!r})")
                violations.append(f"[{game}] '{item_name}': " + ", ".join(issues))

        game_summaries[game] = {
            "total": g_total,
            "compliant": g_compliant,
            "percent": (g_compliant / g_total * 100) if g_total > 0 else 0.0
        }

    print("\n---------------- Game-by-Game Compliance Breakdown ----------------")
    print(f"{'Game':<10} | {'Compliant':<10} | {'Total':<10} | {'Status':<10}")
    print("-" * 50)
    for g, s in game_summaries.items():
        status = "PASS" if s["compliant"] == s["total"] and s["total"] > 0 else "FAIL"
        print(f"{g:<10} | {s['compliant']:<10} | {s['total']:<10} | {status:<10}")
    print("-" * 50)

    print("\n---------------- Price Tier Distribution (COD Points) ----------------")
    print(f"{'Price Tier':<12} | {'Count':<10} | {'Status':<15}")
    print("-" * 45)
    missing_required_tiers = []
    for tier in sorted(VALID_PRICE_TIERS):
        cnt = price_tier_counts[tier]
        if tier in REQUIRED_VERIFIED_TIERS:
            if cnt > 0:
                t_status = "VERIFIED (PASS)"
            else:
                t_status = "MISSING (FAIL)"
                missing_required_tiers.append(f"{tier} CP")
        else:
            t_status = "PRESENT" if cnt > 0 else "EMPTY"
        print(f"{tier:>4d} CP       | {cnt:<10d} | {t_status:<15}")
    print("-" * 45)

    pct = (compliant_entries / total_entries * 100) if total_entries > 0 else 0.0
    print(f"\nTotal Executions Evaluated: {total_entries}")
    print(f"Compliant Executions:       {compliant_entries} / {total_entries} ({pct:.2f}%)")

    if missing_required_tiers:
        violations.append("Missing required webstore price tiers: " + ", ".join(missing_required_tiers))

    if violations:
        print(f"\n[FAIL] Found {len(violations)} compliance violations:")
        for v in violations[:20]:
            print(f"  - {v}")
        if len(violations) > 20:
            print(f"  ... and {len(violations)-20} more.")
        sys.exit(1)
    else:
        print("\n=====================================================================")
        print(f"[OK] SUCCESS: 100% of execution entries are fully compliant ({compliant_entries}/{total_entries}).")
        print("     All required webstore price tiers are verified present.")
        print("=====================================================================")
        sys.exit(0)


if __name__ == "__main__":
    verify()
