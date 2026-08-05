import json
import re

with open("data.json", "r", encoding="utf-8") as f:
    data = json.load(f)

print("Auditing MW, CW, VG entries...")

# Let's inspect each game's items and categorize errors/discrepancies:

def analyze_game(game_code):
    items = data[game_code]
    print(f"\n==================== {game_code} ANALYSIS ({len(items)} items) ====================")
    
    issues = {
        "price_discrepancies": [],
        "name_formatting_glitches": [],
        "operator_prefix_junk": [],
        "free_item_mispriced": [],
        "battle_pass_pricing": [],
        "real_money_pro_packs": [],
    }

    for idx, item in enumerate(items):
        name = item.get("name")
        bundle = item.get("bundle", "")
        price = item.get("price")
        
        # Check operator prefix junk like "Sparks-Sparks Operator Bundle" or "Charly -Deathbringer Bundle"
        if re.search(r"^[A-Za-z\s]+-\s*[A-Za-z]", bundle) and not bundle.startswith("T-800") and not bundle.startswith("T-1000"):
            issues["operator_prefix_junk"].append((idx+1, name, bundle, price))
            
        # Check formatting glitches like missing space after colon or bad unicode
        if ":" in bundle and not re.search(r":\s", bundle):
            issues["name_formatting_glitches"].append((idx+1, name, bundle, price, "Missing space after colon"))
        if "" in bundle or "\ufffd" in bundle:
            issues["name_formatting_glitches"].append((idx+1, name, bundle, price, "Corrupted unicode character"))

        b_lower = bundle.lower()
        
        # Free items check
        if any(k in b_lower for k in ["base for", "unlocked by default", "operator level", "pre-order", "campaign"]):
            if price != 0:
                issues["free_item_mispriced"].append((idx+1, name, bundle, price))
                
        # Battle pass check
        if "battle pass" in b_lower:
            issues["battle_pass_pricing"].append((idx+1, name, bundle, price))
            
        # Real money / Pro pack check
        if any(k in b_lower for k in ["pro pack", "c.o.d.e.", "endeavour"]):
            issues["real_money_pro_packs"].append((idx+1, name, bundle, price))

    print(f"Operator Prefix Junk: {len(issues['operator_prefix_junk'])}")
    for item in issues['operator_prefix_junk'][:10]:
        print(f"  #{item[0]} '{item[1]}': '{item[2]}'")
    if len(issues['operator_prefix_junk']) > 10:
        print(f"  ... and {len(issues['operator_prefix_junk'])-10} more")

    print(f"Name Formatting Glitches: {len(issues['name_formatting_glitches'])}")
    for item in issues['name_formatting_glitches']:
        print(f"  #{item[0]} '{item[1]}': '{item[2]}' ({item[4]})")

    print(f"Free Items Mispriced (!= 0): {len(issues['free_item_mispriced'])}")
    for item in issues['free_item_mispriced']:
        print(f"  #{item[0]} '{item[1]}': '{item[2]}' (Current Price: {item[3]})")

    print(f"Battle Pass Entries: {len(issues['battle_pass_pricing'])}")
    for item in issues['battle_pass_pricing'][:5]:
        print(f"  #{item[0]} '{item[1]}': '{item[2]}' (Price: {item[3]})")

    print(f"Real Money / Pro Packs: {len(issues['real_money_pro_packs'])}")
    for item in issues['real_money_pro_packs']:
        print(f"  #{item[0]} '{item[1]}': '{item[2]}' (Price: {item[3]})")

for g in ["MW", "CW", "VG"]:
    analyze_game(g)

