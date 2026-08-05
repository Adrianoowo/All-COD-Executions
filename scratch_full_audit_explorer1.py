import json

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("=== DE-HYPHENATING SAMPLE BUNDLES ===")
sample_count = 0
for game, items in data.items():
    for item in items:
        b = item.get("bundle", "")
        if len(b) > 3 and b.count("-") > len(b) // 3:
            # Reconstruct original string by removing inserted hyphens
            # E.g. "-U-n-l-o-c-k-e-d- -w-i-t-h- -G-a-z-" -> "Unlocked with Gaz"
            # Or "Tracer Pack: Trench Raider"
            cleaned = b.replace("-", "")
            print(f"[{game}] '{item['name']}':\n   RAW:     {b!r}\n   CLEANED: {cleaned!r}")
            sample_count += 1
            if sample_count >= 15:
                break
    if sample_count >= 15:
        break
