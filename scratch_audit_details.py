import json

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print('=== ALL 1600 CP ITEMS ===')
for game, items in data.items():
    for idx, item in enumerate(items):
        if item.get('price') == 1600:
            print(f'[{game}] idx={idx} name={item["name"]!r} bundle={item["bundle"]!r}')

print('\n=== ALL NON-HYPHEN-CORRUPTED ITEMS (SAMPLE) ===')
count = 0
for game, items in data.items():
    for idx, item in enumerate(items):
        b = item.get("bundle", "")
        if not b.startswith("-"):
            print(f'[{game}] idx={idx} name={item["name"]!r} bundle={b!r} price={item["price"]}')
            count += 1
            if count >= 30:
                break
    if count >= 30:
        break
print(f"Total non-hyphen-corrupted items: {sum(1 for g in data for i in data[g] if not i.get('bundle', '').startswith('-'))}")
