import json

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("=== DATA AUDIT SUMMARY ===")
print("Games in data.json:", list(data.keys()))

total_entries = 0
hyphen_corrupted = []
prefix_artifacts = []
unicode_artifacts = []
empty_bundles = []
invalid_prices = []
non_capitalized_bundles = []
all_prices = {}

for game, items in data.items():
    for idx, item in enumerate(items):
        total_entries += 1
        name = item.get("name", "")
        bundle = item.get("bundle", "")
        price = item.get("price", None)
        
        # Check hyphen corruption
        if len(bundle) > 3 and bundle.count("-") > len(bundle) // 3:
            hyphen_corrupted.append((game, name, bundle))

        # Check unicode artifacts
        if "\ufffd" in bundle or "\ufffd" in name:
            unicode_artifacts.append((game, name, bundle))
            
        # Check empty bundle
        if not bundle or not isinstance(bundle, str) or not bundle.strip():
            empty_bundles.append((game, name, bundle))

        # Check price
        if not isinstance(price, (int, float)) or price not in [0, 600, 800, 1000, 1100, 1200, 1400, 1600, 1800, 2000, 2400, 2800, 3000]:
            invalid_prices.append((game, name, price))
        else:
            all_prices[price] = all_prices.get(price, 0) + 1

        # Check operator prefix artifacts (e.g. "Operator - Bundle" or "Name- Name Bundle")
        if "-" in bundle and not bundle.startswith("-"):
            parts = bundle.split("-", 1)
            if parts[0].strip().lower() in name.lower() or "operator" in parts[0].lower():
                prefix_artifacts.append((game, name, bundle))

print(f"Total Entries: {total_entries}")
print(f"Hyphen Corrupted Bundles: {len(hyphen_corrupted)}")
print(f"Unicode Artifacts (\\ufffd): {len(unicode_artifacts)}")
print(f"Empty Bundles: {len(empty_bundles)}")
print(f"Invalid Price Entries: {len(invalid_prices)}")

print("\nPrice Distribution in data.json:")
for p in sorted(all_prices.keys()):
    print(f"  {p:>4d} CP: {all_prices[p]} entries")

print("\nFirst 10 Hyphen Corrupted Bundles:")
for g, n, b in hyphen_corrupted[:10]:
    print(f"  [{g}] '{n}': {b!r}")

print("\nChecking for Trench Raider / 1600 CP entries:")
found_trench = False
for game, items in data.items():
    for item in items:
        if "trench raider" in item.get("bundle", "").lower() or "trench raider" in item.get("name", "").lower():
            print(f"  Found Trench Raider: [{game}] '{item['name']}' | Bundle: {item['bundle']!r} | Price: {item['price']}")
            found_trench = True

if not found_trench:
    print("  No item containing 'trench raider' found in data.json!")
