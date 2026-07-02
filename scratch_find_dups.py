import json
import re
from collections import Counter

with open("data.json", "r", encoding="utf-8") as fh:
    data = json.load(fh)

game_key = "MWIII"
entries = data.get(game_key, [])

def normalize(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

normalized_names = [normalize(entry["name"]) for entry in entries]
counter = Counter(normalized_names)
dups = {k: v for k, v in counter.items() if v > 1}
print(f"Normalized duplicates in data.json[{game_key}]:")
for norm_name, count in dups.items():
    print(f"  {repr(norm_name)}: {count} times")
    # print the entries themselves
    matching_entries = [e for e in entries if normalize(e["name"]) == norm_name]
    for e in matching_entries:
        print(f"    {e}")
