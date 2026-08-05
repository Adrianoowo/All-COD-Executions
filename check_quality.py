import json
import re

data = json.load(open('data.json', encoding='utf-8'))

print("=== CHECKING ALL BUNDLE AND NAME STRINGS FOR SPECIFIC ISSUES ===")

# 1. Invalid Unicode check
print("\n--- 1. INVALID UNICODE (\\ufffd or corrupt chars) ---")
unicode_issues = []
for game, items in data.items():
    for idx, item in enumerate(items):
        name = item.get('name', '')
        bundle = item.get('bundle', '')
        if '\ufffd' in name or '\ufffd' in bundle or '' in name or '' in bundle:
            unicode_issues.append((game, idx, name, bundle))

print(f"Found {len(unicode_issues)} invalid unicode occurrences:")
for game, idx, name, bundle in unicode_issues:
    print(f"  [{game} #{idx}] Name: {name!r} | Bundle: {bundle!r}")

# 2. Residual Operator Prefixes (e.g. Sparks-, Ghost-, Mara-, Soap-, etc.)
print("\n--- 2. RESIDUAL OPERATOR PREFIXES ---")
operator_prefix_issues = []
# Searching for patterns like "Sparks-", "Mara-", "Soap-", "Ghost-", "Price-", "Gaz-", or any "Name-" prefix in bundle or name
for game, items in data.items():
    for idx, item in enumerate(items):
        name = item.get('name', '')
        bundle = item.get('bundle', '')
        
        # Check raw and unhyphenated
        # Let's search for regex like r'\b[A-Za-z0-9_]+-\s*' or r'Sparks-'
        if 'sparks-' in bundle.lower() or 'sparks-' in name.lower():
            operator_prefix_issues.append((game, idx, name, bundle, "Sparks-"))
        
        # Also check for operator prefixes before bundle title
        # e.g. "Sparks Operator Bundle" vs "Sparks- Tracer Pack..."
        matches = re.findall(r'([A-Z][a-z]+-[A-Z])', bundle) + re.findall(r'([A-Z][a-z]+-[A-Z])', name)
        if matches:
            for m in matches:
                operator_prefix_issues.append((game, idx, name, bundle, f"Hyphenated prefix: {m}"))

print(f"Found {len(operator_prefix_issues)} potential operator prefix issues:")
for game, idx, name, bundle, reason in operator_prefix_issues:
    print(f"  [{game} #{idx}] Reason: {reason} | Name: {name!r} | Bundle: {bundle!r}")

# 3. Dismemberment text check
print("\n--- 3. DISMEMBERMENT TEXT ---")
dismemberment_issues = []
for game, items in data.items():
    for idx, item in enumerate(items):
        name = item.get('name', '')
        bundle = item.get('bundle', '')
        if 'dismember' in name.lower() or 'dismember' in bundle.lower():
            dismemberment_issues.append((game, idx, name, bundle))

print(f"Found {len(dismemberment_issues)} dismemberment text occurrences:")
for game, idx, name, bundle in dismemberment_issues:
    print(f"  [{game} #{idx}] Name: {name!r} | Bundle: {bundle!r}")

# 4. Typo glitches (like -B-a-s-e- or double spaces or bad formatting)
print("\n--- 4. TYPO GLITCHES AND FORMATTING ANOMALIES ---")
typo_issues = []
for game, items in data.items():
    for idx, item in enumerate(items):
        name = item.get('name', '')
        bundle = item.get('bundle', '')
        
        # Check if bundle has hyphenation glitch like "-B-a-s-e- -f-o-r- -W-y-a-t-t-"
        if bundle.startswith('-') and bundle.endswith('-'):
            typo_issues.append((game, idx, name, bundle, "Hyphenated bundle character glitch"))
            
        # Check for double spaces or strange punctuation
        if '  ' in name or '  ' in bundle:
            typo_issues.append((game, idx, name, bundle, "Double space"))

print(f"Found {len(typo_issues)} typo glitch / formatting issues.")
print("Sample typo glitch issues (first 10):")
for game, idx, name, bundle, reason in typo_issues[:10]:
    print(f"  [{game} #{idx}] {reason}: Name={name!r} | Bundle={bundle!r}")
