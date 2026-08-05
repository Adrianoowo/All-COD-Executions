import json
import re
from collections import Counter, defaultdict

def load_data():
    with open('data.json', 'r', encoding='utf-8') as f:
        return json.load(f)

def analyze():
    data = load_data()
    print("=" * 60)
    print("ANALYSIS OF DATA.JSON")
    print("=" * 60)
    
    # 1. Games and overall counts
    games = list(data.keys())
    print(f"Games found: {games}")
    total_items = sum(len(items) for items in data.values())
    print(f"Total items across all games: {total_items}\n")
    
    # 2. Price tier distribution per game
    price_dist = {}
    for game, items in data.items():
        counts = Counter(item.get('price') for item in items)
        price_dist[game] = dict(sorted(counts.items(), key=lambda x: (x[0] if x[0] is not None else -1)))
        print(f"--- {game} Price Tier Distribution (Total: {len(items)}) ---")
        for price, cnt in price_dist[game].items():
            print(f"  Price {price:>4} CP : {cnt:>3} items ({cnt/len(items)*100:.1f}%)")
        print()

    # Overall price distribution
    all_prices = Counter()
    for items in data.values():
        for item in items:
            all_prices[item.get('price')] += 1
    print("--- Overall Price Tier Distribution ---")
    for price, cnt in sorted(all_prices.items(), key=lambda x: (x[0] if x[0] is not None else -1)):
        print(f"  Price {price:>4} CP : {cnt:>4} items ({cnt/total_items*100:.1f}%)")
    print()

    # 3. Edge Case Investigations
    print("=" * 60)
    print("EDGE CASE INVESTIGATIONS")
    print("=" * 60)
    
    # 3.1 Mega-bundles (3000 CP) e.g. Gundam, Space Marines
    print("\n--- 3000 CP Mega-Bundles & Gundam / Space Marines Search ---")
    mega_bundles_3000 = []
    gundam_space_marines = []
    for game, items in data.items():
        for item in items:
            bundle_name = item.get('bundle', '')
            name = item.get('name', '')
            price = item.get('price')
            
            if price == 3000:
                mega_bundles_3000.append((game, name, bundle_name, price))
            
            if re.search(r'gundam|space marine|warhammer|40,000|40k', f"{name} {bundle_name}", re.IGNORECASE):
                gundam_space_marines.append((game, name, bundle_name, price))
                
    print(f"Items with price = 3000 CP ({len(mega_bundles_3000)} items):")
    for game, name, bundle_name, price in mega_bundles_3000:
        print(f"  [{game}] Item: '{name}' | Bundle: '{bundle_name}' | Price: {price}")
        
    print(f"\nItems matching Gundam / Space Marines ({len(gundam_space_marines)} items):")
    for game, name, bundle_name, price in gundam_space_marines:
        print(f"  [{game}] Item: '{name}' | Bundle: '{bundle_name}' | Price: {price}")

    # 3.2 Mastercraft bundles (2800 CP)
    print("\n--- Mastercraft Bundles Search & 2800 CP Validation ---")
    mastercraft_items = []
    items_2800 = []
    for game, items in data.items():
        for item in items:
            bundle_name = str(item.get('bundle', ''))
            name = str(item.get('name', ''))
            price = item.get('price')
            
            if 'mastercraft' in bundle_name.lower() or 'mastercraft' in name.lower() or 'master craft' in bundle_name.lower():
                mastercraft_items.append((game, name, bundle_name, price))
            if price == 2800:
                items_2800.append((game, name, bundle_name, price))
                
    print(f"Total 2800 CP items across all games: {len(items_2800)}")
    print(f"Mastercraft items found: {len(mastercraft_items)}")
    for game, name, bundle_name, price in mastercraft_items:
        print(f"  [{game}] Item: '{name}' | Bundle: '{bundle_name}' | Price: {price}")

    # Check if any 2800 CP item is NOT Mastercraft or if any Mastercraft is NOT 2800 CP
    non_2800_mastercraft = [m for m in mastercraft_items if m[3] != 2800]
    if non_2800_mastercraft:
        print(f"\n⚠️ WARNING: Mastercraft items not priced at 2800 CP ({len(non_2800_mastercraft)}):")
        for game, name, bundle_name, price in non_2800_mastercraft:
            print(f"  [{game}] Item: '{name}' | Bundle: '{bundle_name}' | Price: {price}")
    else:
        print("  All Mastercraft items are accurately priced at 2800 CP!")

    # 3.3 1600 CP Tracer Packs (incl Trench Raider #7186)
    print("\n--- 1600 CP Tracer Packs & Trench Raider Validation ---")
    tracer_1600 = []
    all_1600 = []
    trench_raiders = []
    for game, items in data.items():
        for idx, item in enumerate(items):
            bundle_name = str(item.get('bundle', ''))
            name = str(item.get('name', ''))
            price = item.get('price')
            
            if price == 1600:
                all_1600.append((game, idx, name, bundle_name, price))
            if 'tracer pack' in bundle_name.lower() or 'tracer pack' in name.lower():
                if price == 1600:
                    tracer_1600.append((game, idx, name, bundle_name, price))
            if 'trench raider' in bundle_name.lower() or 'trench raider' in name.lower():
                trench_raiders.append((game, idx, name, bundle_name, price))

    print(f"Total 1600 CP items: {len(all_1600)}")
    for game, idx, name, bundle_name, price in all_1600:
        print(f"  [{game} #{idx}] Item: '{name}' | Bundle: '{bundle_name}' | Price: {price}")

    print(f"\nTrench Raider matches ({len(trench_raiders)}):")
    for game, idx, name, bundle_name, price in trench_raiders:
        print(f"  [{game} #{idx}] Item: '{name}' | Bundle: '{bundle_name}' | Price: {price}")

    # 3.4 1100 CP Battle Pass & 0 CP Free/Challenge/Pro Pack
    print("\n--- 1100 CP Battle Pass & 0 CP Free/Challenge/Pro Pack Validation ---")
    items_1100 = []
    items_0 = []
    for game, items in data.items():
        for idx, item in enumerate(items):
            bundle_name = str(item.get('bundle', ''))
            name = str(item.get('name', ''))
            price = item.get('price')
            
            if price == 1100:
                items_1100.append((game, name, bundle_name))
            elif price == 0:
                items_0.append((game, name, bundle_name))
                
    print(f"Total 1100 CP items: {len(items_1100)}")
    print("Sample 1100 CP items (up to 10):")
    for game, name, bundle_name in items_1100[:10]:
        print(f"  [{game}] Item: '{name}' | Bundle: '{bundle_name}'")
        
    print(f"\nTotal 0 CP items: {len(items_0)}")
    print("Sample 0 CP items (up to 10):")
    for game, name, bundle_name in items_0[:10]:
        print(f"  [{game}] Item: '{name}' | Bundle: '{bundle_name}'")

    # 4. Title Validation (Residual Prefixes, Unicode, Dismemberment, Typos)
    print("\n" + "=" * 60)
    print("TITLE VALIDATION & ANOMALIES")
    print("=" * 60)
    
    prefix_pattern = re.compile(r'^[A-Za-z0-9_]+-\s*') # e.g. Sparks-
    dismemberment_pattern = re.compile(r'dismemberment', re.IGNORECASE)
    hyphenated_typo_pattern = re.compile(r'(-[A-Za-z0-9]-)+') # e.g. -B-a-s-e-
    
    residual_prefix_items = []
    invalid_unicode_items = []
    dismemberment_items = []
    typo_items = []
    
    for game, items in data.items():
        for idx, item in enumerate(items):
            name = str(item.get('name', ''))
            bundle_name = str(item.get('bundle', ''))
            
            # Check for residual prefixes in bundle or name
            # Common operator prefixes in CoD asset naming: e.g. Sparks-, Ghost-, Price-, Soap-, Mara-, etc.
            if prefix_pattern.search(bundle_name) or prefix_pattern.search(name):
                # check if it matches specific operator hyphen patterns like Sparks-
                residual_prefix_items.append((game, idx, name, bundle_name))
                
            # Invalid unicode \ufffd or non-ascii oddities
            if '\ufffd' in name or '\ufffd' in bundle_name or '\\ufffd' in name or '\\ufffd' in bundle_name:
                invalid_unicode_items.append((game, idx, name, bundle_name))
                
            # Dismemberment text
            if dismemberment_pattern.search(name) or dismemberment_pattern.search(bundle_name):
                dismemberment_items.append((game, idx, name, bundle_name))
                
            # Typo glitches / hyphenated text
            if hyphenated_typo_pattern.search(name) or hyphenated_typo_pattern.search(bundle_name):
                typo_items.append((game, idx, name, bundle_name))

    print(f"\n1. Residual Operator Prefixes ({len(residual_prefix_items)} found):")
    for game, idx, name, b_name in residual_prefix_items:
        print(f"  [{game} #{idx}] Name: '{name}' | Bundle: '{b_name}'")

    print(f"\n2. Invalid Unicode (\\ufffd) ({len(invalid_unicode_items)} found):")
    for game, idx, name, b_name in invalid_unicode_items:
        print(f"  [{game} #{idx}] Name: '{name}' | Bundle: '{b_name}'")

    print(f"\n3. Dismemberment Text ({len(dismemberment_items)} found):")
    for game, idx, name, b_name in dismemberment_items:
        print(f"  [{game} #{idx}] Name: '{name}' | Bundle: '{b_name}'")

    print(f"\n4. Typo Glitches / Hyphenated Formatting ({len(typo_items)} found):")
    for game, idx, name, b_name in typo_items[:20]:
        print(f"  [{game} #{idx}] Name: '{name}' | Bundle: '{b_name}'")

if __name__ == '__main__':
    analyze()
