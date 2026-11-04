"""Preserve explicit quantities and finish requests across layout and furnishing."""

import re

from .design_knowledge import effective_needs
from .models import Brief, FurnitureNeed, InteriorBrief

ALIASES = {
    "bedside_table": r"(?:bedside tables?|nightstands?)",
    "vanity": r"(?:vanity(?: desk| table)?|dressing table)",
    "mirror": r"mirrors?",
    "wardrobe": r"wardrobes?",
    "armchair": r"(?:reading (?:arm)?chairs?|armchairs?)",
    "bookshelf": r"(?:bookshel(?:f|ves)|bookcases?)",
    "rug": r"rugs?",
    "lamp": r"lamps?",
    "plant": r"(?:decorative |potted )?plants?",
    "bed": r"(?:(?:double|queen|single) )?beds?\b(?!side)",
}
NAMES = {
    "bed": "Double bed with upholstered headboard",
    "bedside_table": "Bedside tables",
    "vanity": "Vanity desk",
    "mirror": "Vanity mirror",
    "wardrobe": "Wardrobe",
    "armchair": "Reading armchair",
    "bookshelf": "Small bookshelf",
    "rug": "Rug",
    "lamp": "Lamps",
    "plant": "Decorative plants",
}
NUMBERS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5}
KNOWN_COLOURS = ["blush pink", "warm cream", "sage green", "light oak"]


def interior_brief(prompt: str, extracted: Brief | None = None, room_types=None) -> InteriorBrief:
    text = prompt.lower()
    needs = {}
    excluded_roles = list(extracted.excluded_roles if extracted else [])
    scope = list(dict.fromkeys(room_types or ["bedroom"]))
    for role, pattern in {
        **ALIASES,
        "desk": r"desks?",
        "chair": r"chairs?",
        "sofa": r"sofas?",
        "storage": r"storage",
        "table": r"tables?",
    }.items():
        for match in re.finditer(
            r"\b(?:no|without)\s+(?:(?:a|any|decorative|small)\s+)?(" + pattern + r")\b", text
        ):
            clause = re.split(r"[.;,]", text[: match.start()])[-1]
            named = [kind for kind in scope if kind in clause]
            targets = [max(named, key=clause.rfind)] if named else scope
            excluded_roles.extend(f"{kind}:{role}" for kind in targets)
    for item in extracted.furniture if extracted else []:
        copy = item.model_copy(deep=True)
        copy.origin = "user"
        if copy.role not in ALIASES:
            phrase = copy.role.replace("_", " ")
            copy.role = next(
                (role for role, pattern in ALIASES.items() if re.fullmatch(pattern, phrase)),
                copy.role,
            )
        needs[(copy.room_type, copy.role)] = copy
    # This guard supplements schema-valid model output: a room-only answer must
    # never erase recognizable explicit requirements or the second nightstand.
    other_aliases = {
        **ALIASES,
        "desk": r"desks?",
        "chair": r"(?<!arm)\b(?:office |dining |ergonomic )?chairs?",
        "sofa": r"sofas?",
        "table": r"(?<!bedside )\b(?:dining |side |coffee )?tables?",
        "storage": r"(?:storage|kitchen counters?)",
        "toilet": r"toilets?",
        "shower": r"showers?",
    }
    for role, pattern in other_aliases.items():
        for match in re.finditer(r"\b" + pattern + r"\b", text):
            before = text[: match.start()]
            prefix = before[-32:]
            if re.search(r"\b(?:no|without)\s+(?:\w+\s+){0,2}$", prefix):
                continue
            named = [kind for kind in scope if kind in before]
            room_type = (
                max(named, key=before.rfind) if named else scope[0] if len(scope) == 1 else None
            )
            if room_type is None or room_type == "bedroom":
                continue
            amount = re.search(
                r"\b(a|an|one|two|three|four|five|\d+)\s+(?:(?:small|decorative|office|dining|ergonomic|floor|side|coffee)\s+){0,2}$",
                prefix,
            )
            value = amount[1] if amount else "one"
            quantity = NUMBERS.get(value, int(value) if value.isdigit() else 1)
            needs[(room_type, role)] = FurnitureNeed(
                role=role,
                name=NAMES.get(role, match[0]),
                quantity=min(20, quantity),
                room_type=room_type,
                priority="essential"
                if role in {"desk", "chair", "sofa", "storage", "toilet", "shower"}
                else "desired",
            )
    if "bedroom" in text:
        excluded = set()
        for role, pattern in ALIASES.items():
            matches = list(re.finditer(r"\b" + pattern + r"\b", text))
            quantities = []
            for match in matches:
                prefix = text[max(0, match.start() - 30) : match.start()]
                if re.search(r"\b(?:no|without)\s+(?:\w+\s+){0,2}$", prefix):
                    continue
                amount = re.search(
                    r"\b(a|an|one|two|three|four|five|\d+)\s+(?:(?:small|decorative|bedside|floor)\s+)?$",
                    prefix,
                )
                number = (
                    NUMBERS.get(amount[1], int(amount[1]) if amount[1].isdigit() else 1)
                    if amount
                    else (
                        2
                        if match[0].endswith("s") and role in {"bedside_table", "lamp", "plant"}
                        else 1
                    )
                )
                quantities.append(min(20, number))
            if quantities:
                key = ("bedroom", role)
                needs[key] = FurnitureNeed(
                    role=role,
                    name=("Single bed" if "single bed" in text else NAMES[role])
                    if role == "bed"
                    else NAMES[role],
                    quantity=max(quantities),
                    room_type="bedroom",
                    priority="essential"
                    if role in {"bed", "bedside_table", "wardrobe"}
                    else "desired",
                )
            elif matches:
                needs.pop(("bedroom", role), None)
                excluded.add(role)
                excluded_roles.append(f"bedroom:{role}")
        for clause in re.finditer(
            r"(?:\bwith|\band|\bplus|,)\s+(?:(a|an|one|two|three|\d+)\s+)?([a-z][a-z -]+?)(?=,|\.|\band\b|\bplus\b|$)",
            text,
        ):
            noun = clause[2].strip()
            if any(re.search(pattern, noun) for pattern in ALIASES.values()) or any(
                word in noun
                for word in [
                    "window",
                    "door",
                    "wall",
                    "floor",
                    "lighting",
                    "palette",
                    "bedroom",
                    "blush pink",
                    "warm cream",
                    "sage green",
                    "light oak",
                    "soft fabrics",
                ]
            ):
                continue
            role = noun.replace(" ", "_")[:80]
            amount = clause[1] or "one"
            number = NUMBERS.get(amount, int(amount) if amount.isdigit() else 1)
            needs[("bedroom", role)] = FurnitureNeed(role=role, name=noun, quantity=min(20, number))
    needs = {
        key: value for key, value in needs.items() if f"{key[0]}:{key[1]}" not in excluded_roles
    }

    def canonical(values):
        aliases = {
            "pink": "blush pink",
            "blush": "blush pink",
            "cream": "warm cream",
            "sage": "sage green",
            "oak": "light oak",
            "fabric": "soft fabrics",
            "fabrics": "soft fabrics",
            "soft fabric": "soft fabrics",
            "warm lighting": "warm natural lighting",
            "natural lighting": "warm natural lighting",
            "warm natural light": "warm natural lighting",
            "natural wood (light oak)": "light oak",
            "light oak wood": "light oak",
            "soft upholstery": "soft fabrics",
        }
        return list(
            dict.fromkeys(
                aliases.get(value.lower().strip(), value.lower().strip()) for value in values
            )
        )

    return InteriorBrief(
        prompt=prompt,
        furniture=list(needs.values()),
        excluded_roles=list(dict.fromkeys(excluded_roles)),
        palette=canonical(
            [
                *[color for color in KNOWN_COLOURS if color in text],
                *(extracted.palette if extracted else []),
            ]
        ),
        materials=canonical(
            [
                *[
                    material
                    for material in ["light oak", "soft fabrics", "warm natural lighting"]
                    if material in text
                ],
                *(extracted.materials if extracted else []),
            ]
        ),
    )


ROLE_PRODUCTS = {
    "bed": ["pastel_double_bed", "sample_bed", "compact_bed", "single_bed", "queen_bed"],
    "bedside_table": ["white_nightstand", "nightstand"],
    "vanity": ["dressing_vanity"],
    "mirror": ["dressing_vanity"],
    "wardrobe": ["wardrobe"],
    "armchair": ["fabric_chair"],
    "bookshelf": ["bookcase", "open_shelf"],
    "rug": ["small_rug", "woven_rug"],
    "lamp": ["bed_lamp", "floor_lamp", "desk_lamp"],
    "plant": ["potted_plant"],
    "bench": ["bench"],
}


def matches_role(product, role: str, name: str = ""):
    if role == "vanity" and product.category == "vanity":
        return True
    if role == "bed":
        if "single" in name.lower() and product.width_m >= 1.35:
            return False
        if any(word in name.lower() for word in ["double", "queen"]) and product.width_m < 1.35:
            return False
    return product.id in ROLE_PRODUCTS.get(role, []) or (
        role not in ROLE_PRODUCTS and product.category == role
    )


def requests_for(scene):
    if not scene.design_brief:
        return []
    return [
        (f"{room.id}:{need.role}", room, need)
        for room in scene.rooms
        for need in effective_needs(scene)
        if need.room_type == room.type
    ]
