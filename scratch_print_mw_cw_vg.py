import json

with open("data.json", "r", encoding="utf-8") as f:
    data = json.load(f)

for g in ["MW", "CW", "VG"]:
    print(f"==================== {g} ({len(data[g])} items) ====================")
    for idx, item in enumerate(data[g]):
        name = item.get("name")
        bundle = item.get("bundle")
        price = item.get("price")
        print(f"{g}|{idx+1:03d}|{name}|{price}|{bundle}")
