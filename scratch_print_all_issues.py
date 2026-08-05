import json
import re

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

games = ["MW", "CW", "VG", "MWII", "MWIII", "BO6", "BO7"]
required_fields = ["name", "icon", "standing", "prone", "downed", "bundle", "price", "aliases"]
valid_price_tiers = {0, 600, 800, 1000, 1100, 1200, 1400, 1600, 1800, 2000, 2400, 2800, 3000}

issues = []

for g in games:
    items = data.get(g, [])
    for idx, item in enumerate(items):
        name = item.get("name", f"Index {idx}")
        bundle = item.get("bundle", "")
        price = item.get("price", None)
        
        # 1. Required fields
        for fld in required_fields:
            if fld not in item or item[fld] is None or (isinstance(item[fld], str) and not item[fld].strip()):
                issues.append((g, name, f"missing or empty required field '{fld}'"))
                
        # 2. Corrupted unicode \ufffd
        if isinstance(bundle, str) and "\ufffd" in bundle:
            issues.append((g, name, f"contains corrupted unicode \\ufffd in bundle ({bundle!r})"))
        if isinstance(name, str) and "\ufffd" in name:
            issues.append((g, name, f"contains corrupted unicode \\ufffd in name ({name!r})"))
            
        # 3. Operator prefix artifacts
        if isinstance(bundle, str):
            if re.search(r"^[A-Za-z0-9_.\s\'-]+?-\s*(?=Tracer Pack|Operator|Horsemen|Season|Battle Pass|Executive|Pack|Bundle|Level|BlackCell)", bundle):
                issues.append((g, name, f"operator prefix artifact in bundle ({bundle!r})"))
            elif re.search(r"^[A-Za-z0-9_.\s\'-]+?-\s*(?=Operator Level)", bundle):
                issues.append((g, name, f"operator prefix artifact in bundle ({bundle!r})"))
            elif bundle.startswith("-"):
                issues.append((g, name, f"leading hyphen in bundle ({bundle!r})"))
                
        # 4. Capitalization & Punctuation
        if isinstance(bundle, str) and bundle:
            if bundle[0].islower():
                issues.append((g, name, f"bundle string not capitalized ({bundle!r})"))
            if re.search(r":\S", bundle):
                issues.append((g, name, f"missing space after colon in bundle ({bundle!r})"))
                
        # 5. Price tier validation
        if not isinstance(price, (int, float)) or isinstance(price, bool) or int(price) not in valid_price_tiers:
            issues.append((g, name, f"invalid price {price!r}"))

print(f"Total issues in clean repo data.json: {len(issues)}")
for idx, (g, n, msg) in enumerate(issues, 1):
    print(f"{idx:2d}. [{g}] '{n}': {msg}")
