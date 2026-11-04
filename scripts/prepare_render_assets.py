"""Explicit, bounded asset preparation; never runs during install, build or startup.

Run: uv run --project backend python scripts/prepare_render_assets.py
Only the individually curated CC0 files below are downloaded. Existing files are
reused. Publisher license metadata and SHA-256 hashes accompany every file.
"""

import argparse
import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "apps/web/public/assets"
CC0 = "https://creativecommons.org/publicdomain/zero/1.0/"
MODELS = {
    "walnut-desk": (
        "linea-140-walnut-writing-desk-c94a30dc",
        ["sample_desk", "wide_desk", "wall_desk"],
    ),
    "ergonomic-chair": ("vector-ergonomic-office-chair-ae299d68", ["task_chair"]),
    "bookshelf": (
        "filled-bookshelf-small-original-interior-furnishing-2f38979c",
        ["bookcase"],
    ),
    "reading-chair": ("petal-shell-pedestal-armchair-261bd2b4", ["fabric_chair"]),
    "sofa": ("haven-224-oatmeal-two-seat-sofa-40262c27", ["sample_sofa"]),
    "bed": (
        "platform-bed-with-bedding-original-interior-furnishing-d69cf237",
        ["sample_bed"],
    ),
    "wardrobe": ("linea-120-textile-panel-wardrobe-d7898f5e", ["wardrobe"]),
    "vanity": (
        "basin-90-freestanding-bathroom-vanity-c58c9ba0",
        ["sample_vanity", "small_vanity"],
    ),
    "toilet": ("compact-wc-close-coupled-toilet-84214efd", ["sample_toilet"]),
    "side-table": ("orbit-45-travertine-side-table-d2e9684b", ["stone_table"]),
    "floor-lamp": ("paper-column-paper-column-floor-lamp-3b5a06e7", ["floor_lamp"]),
}
TEXTURES = {
    "floor": "wood_floor",
    "wood": "american_walnut_veneer",
    "plaster": "white_plaster_02",
}
MAX_FILE = 8 * 1024 * 1024
MAX_TOTAL = 60 * 1024 * 1024


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Recheck publishers and replace the selected local files",
    )
    args = parser.parse_args()
    previous = (
        json.loads((ASSETS / "manifest.json").read_text(encoding="utf-8"))
        if (ASSETS / "manifest.json").exists()
        else {"assets": []}
    )
    previous_files = {
        file["path"]: file for asset in previous["assets"] for file in asset["files"]
    }
    current_sources = {asset["id"]: asset["source"] for asset in previous["assets"]}
    expected_sources = {
        name: "https://www.innerscene.com/tools/library/3d-parts/" + slug
        for name, (slug, _) in MODELS.items()
    }
    intact = bool(previous_files) and all(
        current_sources.get(name) == source for name, source in expected_sources.items()
    )
    for url, file in previous_files.items():
        path = ASSETS / url.removeprefix("/assets/")
        if (
            not path.exists()
            or hashlib.sha256(path.read_bytes()).hexdigest() != file["sha256"]
        ):
            intact = False
    if intact and not args.refresh and (ASSETS / "registry.json").exists():
        print(
            f"Verified {len(previous_files)} local files against the curated manifest; no network requests. Use --refresh for an explicit publisher refresh."
        )
        return
    registry = {"models": [], "materials": [], "environment": None}
    manifest = {"verifiedAt": datetime.now(UTC).date().isoformat(), "assets": []}
    total = 0
    with httpx.Client(follow_redirects=True, timeout=60) as client:

        def download(url, local):
            nonlocal total
            path = ASSETS / local
            if (
                args.refresh
                or not path.exists()
                or previous_files.get("/assets/" + local, {}).get("download") != url
            ):
                chunks = []
                size = 0
                with client.stream("GET", url) as response:
                    response.raise_for_status()
                    for chunk in response.iter_bytes():
                        size += len(chunk)
                        if size > MAX_FILE or total + size > MAX_TOTAL:
                            raise ValueError(
                                f"Curated download budget exceeded: {local}"
                            )
                        chunks.append(chunk)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"".join(chunks))
            data = path.read_bytes()
            total += len(data)
            if total > MAX_TOTAL or len(data) > MAX_FILE:
                raise ValueError("Asset budget exceeded")
            print(f"{local}: {len(data):,} bytes")
            return {
                "path": "/assets/" + local,
                "download": url,
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }

        for name, (slug, products) in MODELS.items():
            source = "https://www.innerscene.com/tools/library/3d-parts/" + slug
            response = client.get(source)
            response.raise_for_status()
            blocks = re.findall(
                r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>',
                response.text,
                re.DOTALL,
            )
            entries = [
                entry
                for block in blocks
                for entry in (
                    json.loads(block)
                    if isinstance(json.loads(block), list)
                    else [json.loads(block)]
                )
            ]
            meta = next(entry for entry in entries if entry.get("@type") == "3DModel")
            if (
                meta.get("license") != CC0
                or meta.get("creator", {}).get("name") != "Innerscene - original model"
            ):
                raise ValueError(f"Unverified publisher/license for {name}")
            info = download(
                f"https://www.innerscene.com/api/library/{slug}/download",
                f"models/{name}.glb",
            )
            manifest["assets"].append(
                {
                    "id": name,
                    "name": meta["name"],
                    "author": "Innerscene",
                    "source": source,
                    "license": "CC0-1.0",
                    "licenseUrl": CC0,
                    "licenseEvidence": "https://www.innerscene.com/tools/library/terms",
                    "attributionRequired": False,
                    "modifications": "Source GLB unmodified. Runtime static mesh merging and uniform fit. Generic visual proxy, not a merchant product."
                    + (
                        " Bookcase includes project-authored ceramic/book details inside the catalogue envelope."
                        if name == "bookshelf"
                        else ""
                    ),
                    "files": [info],
                }
            )
            for product in products:
                registry["models"].append(
                    {
                        "id": name + ":" + product,
                        "productId": product,
                        "url": info["path"],
                        "source": source,
                        "license": "CC0-1.0",
                        "author": "Innerscene",
                        "licenseUrl": CC0,
                        "minFootprintFill": 0.65,
                    }
                )

        for kind, name in TEXTURES.items():
            files = client.get("https://api.polyhaven.com/files/" + name).json()
            meta = client.get("https://api.polyhaven.com/info/" + name).json()
            maps = {}
            records = []
            for key, channel in [
                ("Diffuse", "map"),
                ("nor_gl", "normalMap"),
                ("Rough", "roughnessMap"),
            ]:
                file = files[key]["1k"]["jpg"]
                info = download(file["url"], f"textures/{name}/{channel}.jpg")
                records.append(info)
                maps[channel] = info["path"]
            source = "https://polyhaven.com/a/" + name
            registry["materials"].append(
                {
                    "id": name,
                    "finish": kind,
                    "source": source,
                    "license": "CC0-1.0",
                    "author": ", ".join(meta["authors"]),
                    "tileMeters": meta["dimensions"][0] / 1000,
                    **maps,
                }
            )
            manifest["assets"].append(
                {
                    "id": name,
                    "author": ", ".join(meta["authors"]),
                    "source": source,
                    "license": "CC0-1.0",
                    "licenseUrl": CC0,
                    "licenseEvidence": "https://polyhaven.com/license",
                    "attributionRequired": False,
                    "resolution": "1k",
                    "files": records,
                }
            )

        name = "brown_photostudio_02"
        file = client.get("https://api.polyhaven.com/files/" + name).json()["hdri"][
            "1k"
        ]["hdr"]
        info = download(file["url"], f"environments/{name}_1k.hdr")
        registry["environment"] = {
            "url": info["path"],
            "source": "https://polyhaven.com/a/" + name,
            "license": "CC0-1.0",
            "author": "Sergej Majboroda",
        }
        manifest["assets"].append(
            {
                "id": name,
                "author": "Sergej Majboroda",
                "source": "https://polyhaven.com/a/" + name,
                "license": "CC0-1.0",
                "licenseUrl": CC0,
                "licenseEvidence": "https://polyhaven.com/license",
                "attributionRequired": False,
                "files": [info],
            }
        )
    manifest["totalBytes"] = total
    (ASSETS / "registry.json").write_text(
        json.dumps(registry, indent=2) + "\n", encoding="utf-8"
    )
    (ASSETS / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Total curated assets: {total / 1024 / 1024:.2f} MiB")


if __name__ == "__main__":
    main()
