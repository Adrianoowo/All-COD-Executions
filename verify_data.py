"""
verify_data.py
--------------
Standalone verification script to check data integrity of data.json.
Validates:
1. data.json is valid JSON.
2. Every game key (MW, CW, VG, MWII, MWIII, BO6, BO7) exists.
3. Every execution entry contains:
   - "name": non-empty string
   - "icon": non-empty string
   - "standing": non-empty string
   - "prone": non-empty string
   - "downed": non-empty string
   - "bundle": non-empty string
   - "price": integer/float >= 0
   - "aliases": list
4. Outputs comprehensive summary table and status result.
"""

import json
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

def verify():
    print("==================== DATA INTEGRITY VERIFICATION ====================")
    
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
            
            # Field validations
            name = entry.get("name")
            icon = entry.get("icon")
            standing = entry.get("standing")
            prone = entry.get("prone")
            downed = entry.get("downed")
            bundle = entry.get("bundle")
            price = entry.get("price")
            aliases = entry.get("aliases")

            has_valid_name = isinstance(name, str) and len(name.strip()) > 0
            has_valid_icon = isinstance(icon, str) and len(icon.strip()) > 0
            has_valid_standing = isinstance(standing, str) and len(standing.strip()) > 0
            has_valid_prone = isinstance(prone, str) and len(prone.strip()) > 0
            has_valid_downed = isinstance(downed, str) and len(downed.strip()) > 0
            has_valid_bundle = isinstance(bundle, str) and len(bundle.strip()) > 0
            has_valid_price = isinstance(price, (int, float)) and not isinstance(price, bool) and price >= 0
            has_valid_aliases = isinstance(aliases, list)
            
            is_compliant = (
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
            else:
                issues = []
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

    print("\n---------------- Game-by-Game Breakdown ----------------")
    print(f"{'Game':<10} | {'Compliant':<10} | {'Total':<10} | {'Status':<10}")
    print("-" * 50)
    for g, s in game_summaries.items():
        status = "PASS" if s["compliant"] == s["total"] and s["total"] > 0 else "FAIL"
        print(f"{g:<10} | {s['compliant']:<10} | {s['total']:<10} | {status:<10}")
    print("-" * 50)
    
    pct = (compliant_entries / total_entries * 100) if total_entries > 0 else 0.0
    print(f"\nTotal Executions Evaluated: {total_entries}")
    print(f"Compliant Executions:       {compliant_entries} / {total_entries} ({pct:.2f}%)")

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
        print("=====================================================================")
        sys.exit(0)

if __name__ == "__main__":
    verify()

