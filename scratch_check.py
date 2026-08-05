import json

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

hyphenated_count = 0
total_items = 0

for game, items in data.items():
    print(f'=== {game} ===')
    for item in items:
        total_items += 1
        b = item.get('bundle', '')
        if '-a-' in b or '-e-' in b or '-o-' in b or b.startswith('-'):
            hyphenated_count += 1
            if hyphenated_count <= 20:
                print(f"  [{game}] {item['name']}: {b!r}")

print(f"\nTotal hyphen-corrupted bundles: {hyphenated_count} / {total_items}")
