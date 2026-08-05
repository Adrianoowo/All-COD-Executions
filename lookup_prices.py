"""
lookup_prices.py
----------------
Multi-tier price lookup module and standalone utility for Call of Duty finishing move bundles.
Maintains ground-truth price dictionaries for webstore/COD Tracker entries and applies
price matrix rules for all 14 COD Point price tiers (3300, 3000, 2800, 2400, 2000, 1800, 1600, 1400, 1200, 1100, 1000, 800, 600, 0 CP).
"""

import json
import re
import sys
from pathlib import Path

DATA_JSON_PATH = Path(__file__).parent / "data.json"
VALID_PRICE_TIERS = {0, 600, 800, 1000, 1100, 1200, 1400, 1600, 1800, 2000, 2400, 2800, 3000, 3300}

# Master Ground Truth Explicit Overrides: (game, item_name) -> (price, bundle_name)
EXPLICIT_OVERRIDES = {
    # 0 CP Free / Unlock / Pro Pack / Event
    ("MW", "Brick by Brick"): (0, "Lerch Operator Mission"),
    ("MW", "Herding"): (0, "Mara Season One Battle Pass Tier 100 Operator Mission"),
    ("MW", "Payback"): (0, "Black Ops Cold War Digital Pre-Order Bonus"),
    ("MW", "Pew Pew Pew"): (0, "Fourth of July Pack Bundle"),
    ("MWII", "Making Holes"): (0, "Unlocked with König"),
    ("MWII", "Sighted In"): (0, "Unlocked with König"),
    ("MWII", "Point And Shoot"): (0, "Unlocked with König"),
    ("MWII", "Bloody Percussionist"): (0, "Unlocked with Nova"),
    ("MWII", "No Scope Needed"): (0, "Base Operator Unlock"),
    ("MWII", "Hammer It Out"): (0, "Base Operator Unlock"),
    ("MWII", "Trick and Treat"): (0, "Pumpkin Patch Pro Pack"),
    ("MWIII", "Wrong Made Right"): (0, "Base Operator Unlock"),

    # 600 CP Micro Store Packs
    ("CW", "Back Up Plan"): (600, "Hot Gothic Bundle"),
    ("MW", "Foul Play"): (600, "Micro Store Accessory Pack"),

    # 800 CP Small Store / Feature Packs
    ("MW", "Achilles Heel"): (800, "Suburban Specialist Bundle"),
    ("MW", "Axe You Nicely"): (800, "Blunt Force Bundle"),
    ("CW", "Sneak Attack"): (800, "Special Forces Pack"),
    ("VG", "Rack It"): (800, "Dragon's Breath Pack"),
    ("MWII", "A Bit Stabby"): (800, "Plague Pack"),
    ("BO6", "Batter Up"): (800, "Heavy Hitter Bundle"),

    # 1000 CP Starter Packs
    ("MW", "Disable and Decimate"): (1000, "Season Starter Pack"),
    ("CW", "Axe Nicely"): (1000, "Season 1 Starter Pack"),
    ("MWII", "A Friendly Hello"): (1000, "MWII Starter Pack"),

    # 1200 CP Standard Packs
    ("MW", "Axe and Receive"): (1200, "Infiltrator Bundle"),
    ("MW", "Baton Dispatch"): (1200, "Earthquake Bundle"),
    ("CW", "Body Slam"): (1200, "Cold Blood Bundle"),
    ("CW", "Body Snatcher"): (1200, "The Professional Bundle"),
    ("VG", "Angler's Hook"): (1200, "Subtle Threat Bundle"),
    ("MWII", "All Kicks"): (1200, "Executive Armory Bundle"),

    # 1400 CP Mid-Tier Packs
    ("MW", "Cranial Carnage"): (1400, "Security Detail Bundle"),
    ("MW", "Death Pirouette"): (1400, "Scorpion Bundle"),
    ("CW", "Boom Surprise"): (1400, "Blood Stained Bundle"),
    ("CW", "Bow Breaker"): (1400, "Ghost Pack: Oil Slick Bundle"),
    ("VG", "Arnis Assault"): (1400, "Shadow Pack Bundle"),
    ("MWII", "Punctual Puncture"): (1400, "Racer Pack Bundle"),

    # 1600 CP Specialty Bundles
    ("BO7", "Multi-Use Tool"): (1600, "Tracer Pack: Trench Raider Zombies Universe Bundle"),
    ("MW", "Disable and Kill"): (1600, "Tracer Pack: Trench Raider Bundle"),
    ("CW", "Bow Strike"): (1600, "Firestarter Specialty Bundle"),

    # 1800 CP Standard Operator Bundles
    ("MW", "Disdainful Destruction"): (1800, "Grim Reaper Operator Bundle"),
    ("MW", "Face the End"): (1800, "Psychopomp Operator Bundle"),
    ("CW", "Caught Staring"): (1800, "Biohazard Operator Bundle"),
    ("CW", "Cheap Shot"): (1800, "Night Stalker Operator Bundle"),
    ("VG", "Barrel It Up"): (1800, "Urban Assault Operator Bundle"),
    ("MWII", "Sidearm Hustle"): (1800, "Death Stalker Operator Bundle"),
    ("MWIII", "Stick N' Move"): (1800, "Vanguard Operator Bundle"),

    # 2000 CP Premium Packs
    ("MW", "Hatchet Hitman"): (2000, "Gilded Age Bundle"),
    ("CW", "Compromised Recovery"): (2000, "Golden Era Bundle"),

    # 2400 CP Premium / Tracer / Ultra / Crossover Bundles
    ("MW", "Axing For Trouble"): (2400, "Sparks Operator Bundle"),
    ("MW", "Carver"): (2400, "Iskra Operator Bundle"),
    ("MW", "Mace to the Face"): (2400, "Mace Operator Bundle"),
    ("MW", "Point Taken"): (2400, "Soap Operator Bundle"),
    ("MW", "Queen of Spades"): (2400, "Mara: Kawaii Cat Bundle"),
    ("MW", "Run Through"): (2400, "Mace: Guns Blazing Bundle"),
    ("MW", "Sick 'Em"): (2400, "Talon Operator Bundle"),
    ("MW", "Step Aside"): (2400, "Sgt. Griggs Operator Bundle"),
    ("MW", "Take a Bow"): (2400, "Velikan Operator Bundle"),
    ("MW", "The Fix"): (2400, "Nikto Operator Bundle"),
    ("MW", "Hellhound"): (2400, "Undead Forces Bundle"),
    ("MW", "Hello Stranger"): (2400, "Ghost Pack: Contingency Bundle"),
    ("MW", "Snafu"): (2400, "Roze Operator Bundle"),
    ("MW", "Sputnik"): (2400, "Nikto: Take No Prisoners Bundle"),
    ("MW", "Toto"): (2400, "Mara: No Place Like Home Bundle"),
    ("MW", "Tuco"): (2400, "Morte Operator Bundle"),
    ("CW", "Unlikely Volunteer"): (2400, "Lazar Operator Bundle"),
    ("CW", "Between the Legs"): (2400, "Rivas Operator Bundle"),
    ("CW", "Big Stick"): (2400, "Zeyna Operator Bundle"),
    ("CW", "Bird of Prey"): (2400, "Knight Operator Bundle"),
    ("CW", "Dog of War"): (2400, "Wolf Operator Bundle"),
    ("CW", "Maim & Tame"): (2400, "Reactive Maxis Operator Bundle"),
    ("CW", "Overpower"): (2400, "Zombie Dozer Bundle"),
    ("CW", "Drop Dead"): (2400, "Reactive Luchador Bundle"),
    ("CW", "Nailed Down"): (2400, "Death's Veil Maxis Bundle"),
    ("VG", "Fenrir Unchained"): (2400, "Pack Leader Ultra Bundle"),
    ("MWII", "Laser Everyone"): (2400, "Tracer Pack: The Boys - Homelander Operator Bundle"),
    ("MWII", "Shhh"): (2400, "Tracer Pack: The Boys - Black Noir Operator Bundle"),
    ("MWII", "Snoop Hustle"): (2400, "Tracer Pack: Snoop Dogg Operator Bundle"),
    ("MWII", "Get Bodied"): (2400, "Tracer Pack: Nicki Minaj Operator Bundle"),
    ("MWII", "Stabbed... A Lot"): (2400, "Tracer Pack: 21 Savage Operator Bundle"),
    ("MWII", "Boomstick Boogie"): (2400, "Tracer Pack: Evil Dead 2 Ash Williams Operator Bundle"),
}

VERIFIED_PRICES = {
    "tracer pack: radiant blight": 3300,
    "radiant blight": 3300,
    "godzilla vs. kong mega bundle": 3000,
    "mobile suit gundam operator bundle": 3000,
    "warhammer 40,000 space marine mega bundle": 3000,
    "dune mega bundle": 3000,
    "alien ultra bundle": 2800,
    "dragon mastercraft bundle": 2800,
    "paint the town mastercraft bundle": 2800,
    "ratchet recon mastercraft ultra skin bundle": 2800,
    "panzersoldat mastercraft ultra skin bundle": 2800,
    "terminator t-1000 mastercraft bundle": 2800,
    "the boys - starlight operator bundle": 2400,
    "the boys - homelander operator bundle": 2400,
    "the boys - black noir operator bundle": 2400,
    "snoop dogg operator bundle": 2400,
    "nicki minaj operator bundle": 2400,
    "21 savage operator bundle": 2400,
    "tomb raider operator bundle": 2400,
    "gilded age bundle": 2000,
    "golden era bundle": 2000,
    "grim reaper operator bundle": 1800,
    "psychopomp operator bundle": 1800,
    "biohazard operator bundle": 1800,
    "night stalker operator bundle": 1800,
    "urban assault operator bundle": 1800,
    "death stalker operator bundle": 1800,
    "trench raider": 1600,
    "firestarter specialty bundle": 1600,
    "security detail bundle": 1400,
    "scorpion bundle": 1400,
    "blood stained bundle": 1400,
    "ghost pack: oil slick bundle": 1400,
    "shadow pack bundle": 1400,
    "racer pack bundle": 1400,
    "infiltrator bundle": 1200,
    "earthquake bundle": 1200,
    "cold blood bundle": 1200,
    "the professional bundle": 1200,
    "subtle threat bundle": 1200,
    "executive armory bundle": 1200,
    "season starter pack": 1000,
    "season 1 starter pack": 1000,
    "mwii starter pack": 1000,
    "suburban specialist bundle": 800,
    "blunt force bundle": 800,
    "special forces pack": 800,
    "dragon's breath pack": 800,
    "plague pack": 800,
    "heavy hitter bundle": 800,
    "hot gothic bundle": 600,
    "micro store accessory pack": 600,
}


def norm_name(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def sanitize_bundle_name(raw_obtain: str, game: str = "", name: str = "") -> str:
    if (game, name) in EXPLICIT_OVERRIDES:
        return EXPLICIT_OVERRIDES[(game, name)][1]

    text = " ".join(raw_obtain.split()).strip().strip('"').strip("'")
    text = text.replace("K\ufffdnig", "König").replace("Knig", "König")
    text = text.replace("P\ufffddraig", "Pádraig").replace("Pdraig", "Pádraig")
    text = text.replace("\ufffd", "")
    text = text.replace("\u2013", "-").replace("\u2014", "-")
    text = text.replace("\u00a0", " ")

    if "dismembered" in text.lower():
        text = "Base Operator Unlock"

    if "quantum exchange event" in text.lower():
        return "Quantum Exchange Event Reward"
    if "robocop event" in text.lower():
        return "RoboCop Event Reward"
    if "uncaged event" in text.lower():
        return "Uncaged Event Reward"
    if "champion's quest" in text.lower() or "champions quest" in text.lower():
        return "Warzone Champion's Quest Reward"
    if "high art event" in text.lower():
        return "High Art Event Reward"
    if "beavis and butt-head event" in text.lower():
        return "Beavis and Butt-Head Event Reward"
    if "90s action heroes event" in text.lower():
        return "90s Action Heroes Event Reward"
    if "nuketown block party event" in text.lower():
        return "Nuketown Block Party Event Reward"
    if "chucky event" in text.lower():
        return "Chucky Event Reward"
    if "fallout event" in text.lower():
        return "Fallout Event Reward"
    if "counter skies event" in text.lower():
        return "Counter Skies Event Reward"

    text = re.sub(r"^[A-Za-z0-9_.\s\'-]+?-\s*(?=Tracer Pack|Operator|Horsemen|Season|Battle Pass|Executive|Pack|Bundle|Level|BlackCell)", "", text, flags=re.I).strip()
    if "operator level" in text.lower():
        text = re.sub(r"^[A-Za-z0-9_.\s\'-]+?\s+(?=Operator Level)", "", text, flags=re.I).strip()

    text = re.sub(r":([A-Za-z0-9])", r": \1", text)
    text = re.sub(r"!([A-Za-z0-9])", r"! \1", text)
    text = text.replace("Tracer Pack: Screan Operator Bundle", "Tracer Pack: Scream Operator Bundle")
    text = text.replace("Tracer Pack:Screan Operator Bundle", "Tracer Pack: Scream Operator Bundle")

    text = " ".join(text.split())
    return text


def lookup_bundle_price(bundle_name: str, raw_obtain: str = "", current_price: int | float | None = None, game: str = "", name: str = "") -> int:
    """Determine the accurate COD Point price (integer) across all price tiers."""
    if (game, name) in EXPLICIT_OVERRIDES:
        return EXPLICIT_OVERRIDES[(game, name)][0]

    clean_b = bundle_name.strip()
    b_lower = clean_b.lower()
    ob_lower = raw_obtain.lower() if raw_obtain else ""
    combined = f"{b_lower} {ob_lower}"

    # 1. Direct match in VERIFIED_PRICES dictionary
    for key, val in VERIFIED_PRICES.items():
        if key in b_lower or key in ob_lower:
            return val

    # 2. Check explicit CP number in obtain text
    m = re.search(r"(\d{3,4})\s*cp", combined)
    if m:
        val = int(m.group(1))
        if val in VALID_PRICE_TIERS:
            return val

    # 3. Check 3300 CP Mega-Bundles
    if "radiant blight" in combined or "3300" in combined:
        return 3300

    # 4. Check 0 CP Unlock Sources
    if any(k in combined for k in [
        "pro pack", "c.o.d.e.", "code ", "endeavour", "blackcell", "black cell",
        "unlocked by default", "available by default", "base for", "unlocked with", "unlocked by", "unlocked in", "unlocked from", "base operator",
        "operator mission", "operator level", "campaign", "pre-order", "preorder", "fourth of july",
        "event reward", "challenge", "warzone champion's quest reward", "event", "safe"
    ]):
        return 0

    # 5. Check Battle Pass
    if "battle pass" in combined:
        if "free" in combined or "mission" in combined:
            return 0
        return 1100

    # 6. Check 3000 CP Mega-Bundles
    if any(k in combined for k in ["mega bundle", "super bundle", "gundam", "warhammer 40,000 space marine"]):
        return 3000

    # 7. Check 2800 CP Mastercraft / Ultra Bundles
    if "mastercraft" in combined and any(k in combined for k in ["ultra", "bundle", "skin"]):
        return 2800

    # 8. Specific price tier keyword checks
    if any(k in combined for k in ["suburban specialist", "blunt force", "special forces", "heavy hitter", "dragon's breath", "plague pack"]):
        return 800
    if any(k in combined for k in ["starter pack", "starter bundle"]):
        return 1000
    if any(k in combined for k in ["infiltrator bundle", "earthquake bundle", "cold blood bundle", "the professional bundle", "subtle threat", "executive armory"]):
        return 1200
    if any(k in combined for k in ["security detail", "scorpion bundle", "blood stained", "oil slick", "shadow pack", "racer pack"]):
        return 1400
    if any(k in combined for k in ["trench raider"]):
        return 1600
    if any(k in combined for k in ["grim reaper", "psychopomp", "biohazard", "night stalker", "urban assault", "death stalker"]):
        return 1800
    if any(k in combined for k in ["gilded age", "golden era"]):
        return 2000

    # 9. Fallback to current valid price tier if present
    if current_price is not None and isinstance(current_price, (int, float)) and not isinstance(current_price, bool):
        c_val = int(current_price)
        if c_val in VALID_PRICE_TIERS:
            return c_val

    # 10. Generic 2400 CP Tracer Pack / Ultra Skin
    if any(k in combined for k in ["tracer pack", "ultra skin"]):
        return 2400

    return 1800


def main():
    if not DATA_JSON_PATH.exists():
        print(f"Error: {DATA_JSON_PATH} not found.")
        sys.exit(1)

    with open(DATA_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    updated = 0
    tier_counts = {}

    for game, entries in data.items():
        for item in entries:
            item_name = item.get("name", "")
            b_orig = item.get("bundle", "")
            b_clean = sanitize_bundle_name(b_orig, game, item_name)
            p_orig = item.get("price", 0)
            p_new = lookup_bundle_price(b_clean, b_orig, p_orig, game, item_name)
            
            item["bundle"] = b_clean
            item["price"] = p_new

            # Maintain schema compliance
            if not item.get("standing"):
                item["standing"] = "Standing"
            if not item.get("prone"):
                item["prone"] = "Prone"
            if not item.get("downed"):
                item["downed"] = "Downed"

            aliases_set = {item_name, item_name.lower(), norm_name(item_name)}
            if "aliases" in item and isinstance(item["aliases"], list):
                for a in item["aliases"]:
                    if isinstance(a, str) and a.strip():
                        aliases_set.add(a)
            item["aliases"] = sorted(list(aliases_set))

            updated += 1
            tier_counts[p_new] = tier_counts.get(p_new, 0) + 1

    with open(DATA_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Updated price tiers for {updated} items in data.json.")
    print("Price Tier Distribution:")
    for p in sorted(tier_counts.keys()):
        print(f"  {p:4d} CP: {tier_counts[p]:3d} entries")


if __name__ == "__main__":
    main()
