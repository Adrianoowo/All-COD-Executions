import json
import re
from collections import Counter

def unhyphenate(text):
    if not isinstance(text, str):
        return text
    # If text is like "-T-r-a-c-e-r- -P-a-c-k-:-"
    # Replacing "-x-" with "x" and "- -" with " "
    # Let's see: "-T-r-a-c-e-r-" -> T, r, a, c, e, r
    if text.startswith('-') and text.endswith('-'):
        # Split by "- -" to get words
        words = text.split(' - ')
        clean_words = []
        for w in words:
            # w might be "-T-r-a-c-e-r-" or "T-r-a-c-e-r"
            chars = w.replace('-', '')
            clean_words.append(chars)
        return ' '.join(clean_words)
    return text

data = json.load(open('data.json', encoding='utf-8'))

print("=== UNHYPHENATED ANALYSIS ===")
mastercraft_count = 0
gundam_count = 0
space_marines_count = 0
tracer_pack_count = 0
trench_raider_count = 0

for game, items in data.items():
    for idx, item in enumerate(items):
        raw_b = str(item.get('bundle', ''))
        clean_b = unhyphenate(raw_b)
        name = str(item.get('name', ''))
        price = item.get('price')
        
        full_text = f"{name} {clean_b}".lower()
        raw_full = f"{name} {raw_b}".lower()
        
        if 'mastercraft' in full_text:
            mastercraft_count += 1
            print(f"Mastercraft: [{game}] '{name}' | Clean Bundle: '{clean_b}' | Price: {price}")
            
        if 'gundam' in full_text:
            gundam_count += 1
            print(f"Gundam: [{game}] '{name}' | Clean Bundle: '{clean_b}' | Price: {price}")
            
        if 'space marine' in full_text or 'warhammer' in full_text:
            space_marines_count += 1
            print(f"Space Marine: [{game}] '{name}' | Clean Bundle: '{clean_b}' | Price: {price}")

        if 'trench raider' in full_text:
            trench_raider_count += 1
            print(f"Trench Raider: [{game} #{idx}] '{name}' | Clean Bundle: '{clean_b}' | Price: {price}")

print(f"\nSummary counts with clean_b:")
print(f"Mastercraft: {mastercraft_count}")
print(f"Gundam: {gundam_count}")
print(f"Space Marines: {space_marines_count}")
print(f"Trench Raider: {trench_raider_count}")
