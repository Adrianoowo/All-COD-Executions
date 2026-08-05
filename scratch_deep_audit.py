import json
import re

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

REQUIRED_FIELDS = ["name", "icon", "standing", "prone", "downed", "bundle", "price", "aliases"]
GAMES = ["MW", "CW", "VG", "MWII", "MWIII", "BO6", "BO7"]

findings = {
    "missing_games": [],
    "missing_fields": [],
    "hyphen_corrupted": [],
    "unicode_ufffd": [],
    "operator_prefixes": [],
    "improper_capitalization": [],
    "improper_punctuation": [],
    "empty_bundles": [],
    "invalid_prices": [],
    "trench_raider_found": False,
    "trench_raider_details": None,
}

total_count = 0

for g in GAMES:
    if g not in data:
        findings["missing_games"].append(g)
        continue
        
    for idx, item in enumerate(data[g]):
        total_count += 1
        item_name = item.get("name", f"index_{idx}")
        
        # Check required fields
        for field in REQUIRED_FIELDS:
            if field not in item:
                findings["missing_fields"].append((g, item_name, field))
                
        bundle = item.get("bundle", "")
        price = item.get("price", None)
        
        # Check U+FFFD
        if "\ufffd" in str(bundle) or "\ufffd" in str(item_name):
            findings["unicode_ufffd"].append((g, item_name, bundle))
            
        # Check empty bundle
        if not isinstance(bundle, str) or not bundle.strip():
            findings["empty_bundles"].append((g, item_name, bundle))
            continue
            
        # Check hyphen corruption
        if len(bundle) > 3 and bundle.count("-") > len(bundle) // 3:
            findings["hyphen_corrupted"].append((g, item_name, bundle))
            
        # Check operator prefix artifacts (e.g., "Name-Name Bundle", "Operator- Bundle", "Operator Level...")
        # Pattern like "Word-Word..." or "Word- "
        if re.search(r"^[A-Za-z0-9_.\s\'-]+?-\s*(?=Tracer Pack|Operator|Horsemen|Season|Battle Pass|Executive|Pack|Bundle|Level|BlackCell)", bundle):
            findings["operator_prefixes"].append((g, item_name, bundle))
            
        # Check capitalization (should start with uppercase unless numeric/special)
        if bundle and bundle[0].islower():
            findings["improper_capitalization"].append((g, item_name, bundle))
            
        # Check punctuation (e.g. missing space after colon like "Tracer Pack:Scream")
        if re.search(r":\S", bundle):
            findings["improper_punctuation"].append((g, item_name, bundle))
            
        # Check price tier
        VALID_TIERS = {0, 600, 800, 1000, 1100, 1200, 1400, 1600, 1800, 2000, 2400, 2800, 3000}
        if not isinstance(price, (int, float)) or isinstance(price, bool) or int(price) not in VALID_TIERS:
            findings["invalid_prices"].append((g, item_name, price))
            
        # Check Trench Raider #7186
        if "trench raider" in bundle.lower() or "trench raider" in item_name.lower():
            findings["trench_raider_found"] = True
            findings["trench_raider_details"] = (g, item_name, bundle, price)

print(f"Total entries analyzed: {total_count}")
print(f"Missing games: {findings['missing_games']}")
print(f"Missing fields: {len(findings['missing_fields'])}")
print(f"Hyphen corrupted bundles: {len(findings['hyphen_corrupted'])}")
print(f"Unicode U+FFFD: {len(findings['unicode_ufffd'])}")
print(f"Operator prefix artifacts: {len(findings['operator_prefixes'])}")
print(f"Improper capitalization: {len(findings['improper_capitalization'])}")
print(f"Improper punctuation (colon space): {len(findings['improper_punctuation'])}")
print(f"Empty bundles: {len(findings['empty_bundles'])}")
print(f"Invalid prices: {len(findings['invalid_prices'])}")
print(f"Trench Raider found: {findings['trench_raider_found']}")
if findings['trench_raider_details']:
    print(f"Trench Raider details: {findings['trench_raider_details']}")
