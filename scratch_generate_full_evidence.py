import json

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

games = ["MW", "CW", "VG", "MWII", "MWIII", "BO6", "BO7"]

print(f"{'Game':<10} | {'Total':<10} | {'Corrupted Bundles':<20} | {'Clean Bundles':<15}")
print("-" * 65)

total_all = 0
corrupted_all = 0
clean_all = 0

for g in games:
    items = data.get(g, [])
    t = len(items)
    c = 0
    cl = 0
    for item in items:
        b = item.get("bundle", "")
        if len(b) > 3 and b.count("-") > len(b) // 3:
            c += 1
        else:
            cl += 1
    total_all += t
    corrupted_all += c
    clean_all += cl
    print(f"{g:<10} | {t:<10} | {c:<20} | {cl:<15}")

print("-" * 65)
print(f"{'TOTAL':<10} | {total_all:<10} | {corrupted_all:<20} | {clean_all:<15}")
