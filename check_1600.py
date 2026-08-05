import json

def unhyphenate(t):
    if isinstance(t, str) and t.startswith('-') and t.endswith('-'):
        return ' '.join(c.replace('-', '') for c in t.split(' - '))
    return t

data = json.load(open('data.json', encoding='utf-8'))

print("=== ALL 1600 CP ITEMS ===")
for game, items in data.items():
    for idx, item in enumerate(items):
        if item.get('price') == 1600:
            b = unhyphenate(item.get('bundle'))
            n = item.get('name')
            p = item.get('price')
            print(f"[{game} #{idx}] Price: {p} | Name: {n!r} | Bundle: {b!r}")

print("\n=== ALL TRACER PACKS AND THEIR PRICES ===")
for game, items in data.items():
    for idx, item in enumerate(items):
        b = unhyphenate(item.get('bundle', ''))
        n = item.get('name', '')
        p = item.get('price')
        if 'tracer pack' in b.lower() or 'tracer pack' in n.lower():
            if p not in (2400, 2800, 3000): # highlight non-standard Tracer Pack prices
                print(f"[{game} #{idx}] Non-standard Tracer Pack price {p}: Name={n!r} | Bundle={b!r}")
