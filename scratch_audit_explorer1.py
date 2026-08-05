import json
import re

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

games = ["MW", "CW", "VG", "MWII", "MWIII", "BO6", "BO7"]
required_fields = ["name", "icon", "standing", "prone", "downed", "bundle", "price", "aliases"]
valid_price_tiers = {0, 600, 800, 1000, 1100, 1200, 1400, 1600, 1800, 2000, 2400, 2800, 3000}

issues = []
trench_raider_entry = None

total_entries = 0
game_counts = {}

for g in games:
    items = data.get(g, [])
    game_counts[g] = len(items)
    for idx, item in enumerate(items):
        total_entries += 1
        name = item.get("name", f"Index {idx}")
        bundle = item.get("bundle", "")
        price = item.get("price", None)
        
        # 1. Required fields
        for fld in required_fields:
            if fld not in item or item[fld] is None or (isinstance(item[fld], str) and not item[fld].strip()):
                issues.append(f"[{g}] '{name}': missing or empty required field '{fld}'")
                
        # 2. Corrupted unicode \ufffd
        if isinstance(bundle, str) and "\ufffd" in bundle:
            issues.append(f"[{g}] '{name}': contains corrupted unicode \\ufffd in bundle ({bundle!r})")
        if isinstance(name, str) and "\ufffd" in name:
            issues.append(f"[{g}] '{name}': contains corrupted unicode \\ufffd in name ({name!r})")
            
        # 3. Operator prefix artifacts (e.g. "Sparks-Sparks", "Lewis- Operator Level", etc.)
        if isinstance(bundle, str):
            if re.search(r"^[A-Za-z0-9_.\s\'-]+?-\s*(?=Tracer Pack|Operator|Horsemen|Season|Battle Pass|Executive|Pack|Bundle|Level|BlackCell)", bundle):
                issues.append(f"[{g}] '{name}': operator prefix artifact in bundle ({bundle!r})")
            if bundle.startswith("-"):
                issues.append(f"[{g}] '{name}': leading hyphen in bundle ({bundle!r})")
                
        # 4. Capitalization & Punctuation
        if isinstance(bundle, str) and bundle:
            if bundle[0].islower():
                issues.append(f"[{g}] '{name}': bundle string not capitalized ({bundle!r})")
            if re.search(r":\S", bundle):
                issues.append(f"[{g}] '{name}': missing space after colon in bundle ({bundle!r})")
                
        # 5. Price tier validation
        if not isinstance(price, (int, float)) or isinstance(price, bool) or int(price) not in valid_price_tiers:
            issues.append(f"[{g}] '{name}': invalid price {price!r}")
            
        # Check Trench Raider #7186
        if isinstance(bundle, str) and "trench raider" in bundle.lower():
            trench_raider_entry = (g, name, bundle, price)
        if isinstance(name, str) and "trench raider" in name.lower():
            trench_raider_entry = (g, name, bundle, price)

print("=== PROJECT DATA INTEGRITY AUDIT ===")
print(f"Total Games Evaluated: {len(game_counts)}")
print(f"Game Breakdown: {game_counts}")
print(f"Total Executions: {total_entries}")
print(f"Total Issues Found in raw data.json: {len(issues)}")

if issues:
    print("\nTop Issues Found:")
    for iss in issues[:20]:
        print(f" - {iss}")

print(f"\nTracer Pack: Trench Raider entry: {trench_raider_entry}")
