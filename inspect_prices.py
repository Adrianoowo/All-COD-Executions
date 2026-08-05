import json
from collections import defaultdict

data = json.load(open('data.json', encoding='utf-8'))

price_map = defaultdict(list)

for game, items in data.items():
    for idx, item in enumerate(items):
        p = item.get('price')
        price_map[p].append((game, idx, item.get('name'), item.get('bundle')))

print("=== ALL PRICE VALUES IN DATA.JSON ===")
for p in sorted(price_map.keys(), key=lambda x: (x is None, x)):
    print(f"Price: {p!r} (type: {type(p).__name__}) -> {len(price_map[p])} items")
    if p in (1600, "1600", 3000, 2800, 1100, 0) or (isinstance(p, (int, str)) and '1600' in str(p)):
        for game, idx, name, bundle in price_map[p][:5]:
            print(f"   [{game} #{idx}] Name: {name!r} | Bundle: {bundle!r}")
