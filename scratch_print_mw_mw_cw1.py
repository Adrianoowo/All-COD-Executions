import json

with open("data.json", "r", encoding="utf-8") as f:
    data = json.load(f)

print("=== MW ===")
for idx, item in enumerate(data["MW"]):
    print(f"MW|{idx+1:03d}|{item['name']}|{item.get('price')}|{item.get('bundle')}")

print("=== CW (1 to 43) ===")
for idx, item in enumerate(data["CW"][:43]):
    print(f"CW|{idx+1:03d}|{item['name']}|{item.get('price')}|{item.get('bundle')}")
