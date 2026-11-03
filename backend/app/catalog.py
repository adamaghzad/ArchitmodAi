import importlib
import json
import math
import os
from decimal import Decimal
from functools import lru_cache
from typing import Literal, Protocol

from pydantic import Field, TypeAdapter, model_validator

from .inference import embed_texts
from .models import Furniture, Model, RoomType
from .settings import ROOT, model_for, ollama_url


class Product(Model):
    id: str
    name: str
    kind: Literal["furniture", "material"]
    category: str
    room_types: list[RoomType]
    brand: str
    width_m: float = Field(gt=0)
    depth_m: float = Field(gt=0)
    height_m: float = Field(gt=0)
    price_mad: float = Field(ge=0)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    material: str
    design_style: str
    image_url: str | None = None
    model_3d_path: str | None = None
    product_url: str | None = None
    verified_url: bool = False
    source_provider: str
    mock_data: bool
    availability_status: Literal["mock_data", "in_stock", "out_of_stock", "unknown"]
    checked_at: str | None = None
    coverage_m2_per_unit: float | None = Field(default=None, gt=0)
    pack_size: int = Field(default=1, ge=1)
    unit: str = "piece"
    coverage_note: str | None = None

    @model_validator(mode="after")
    def source_integrity(self):
        if self.mock_data and (
            self.product_url or self.verified_url or self.availability_status != "mock_data"
        ):
            raise ValueError("Mock records cannot claim commercial links or verified availability")
        if self.kind == "material" and not self.coverage_m2_per_unit:
            raise ValueError("Materials need stored effective coverage per purchase unit")
        if self.product_url and not self.product_url.startswith("https://"):
            raise ValueError("Product links must use HTTPS")
        return self


class CatalogueProvider(Protocol):
    def list_products(self) -> list[Product]: ...


class JsonCatalogueProvider:
    def list_products(self) -> list[Product]:
        path = ROOT / os.getenv("CATALOGUE_JSON_PATH", "data/catalogue.json")
        return TypeAdapter(list[Product]).validate_python(
            json.loads(path.read_text(encoding="utf-8"))
        )


def load_catalogue() -> list[Product]:
    if os.getenv("CATALOGUE_PROVIDER", "local_json") == "local_json":
        provider = JsonCatalogueProvider()
    else:
        module, factory = os.environ["CATALOGUE_PROVIDER_FACTORY"].split(":", 1)
        provider = getattr(importlib.import_module(module), factory)()
    products = [Product.model_validate(product) for product in provider.list_products()]
    if len({product.id for product in products}) != len(products):
        raise ValueError("Catalogue product IDs must be unique")
    return products


PRODUCTS = load_catalogue()
CATALOG = {product.id: product for product in PRODUCTS}


def catalogue_records():
    return [product.model_dump() for product in PRODUCTS]


def total_cost(items: list[Furniture]) -> float:
    return float(
        sum((Decimal(str(CATALOG[item.product_id].price_mad)) for item in items), Decimal(0))
    )


def fits(product: Product, width: float | None, depth: float | None) -> bool:
    if product.kind == "material":
        return True
    return (
        (width is None or product.width_m <= width) and (depth is None or product.depth_m <= depth)
    ) or (
        (width is None or product.depth_m <= width) and (depth is None or product.width_m <= depth)
    )


def description(product: Product) -> str:
    return f"{product.name}. {product.category}. {product.material}. {product.design_style}. {product.color}. Suitable for {', '.join(product.room_types)}."


@lru_cache(maxsize=4)
def catalogue_vectors(endpoint: str, model: str, descriptions: tuple[str, ...]):
    return embed_texts(list(descriptions))


def search_products(
    query: str = "",
    category: str | None = None,
    style: str | None = None,
    material: str | None = None,
    brand: str | None = None,
    color: str | None = None,
    min_price: float = 0,
    max_price: float | None = None,
    width: float | None = None,
    depth: float | None = None,
    height: float | None = None,
    kind: str | None = None,
    room_type: str | None = None,
    semantic: bool = False,
    sort: str = "name",
) -> list[Product]:
    candidates = [
        product
        for product in PRODUCTS
        if (not category or product.category == category)
        and (not kind or product.kind == kind)
        and (not room_type or room_type in product.room_types)
        and (not style or product.design_style == style)
        and (not material or material.lower() in product.material.lower())
        and (not brand or brand.lower() in product.brand.lower())
        and (not color or product.color.lower() == color.lower())
        and product.price_mad >= min_price
        and (max_price is None or product.price_mad <= max_price)
        and (height is None or product.height_m <= height)
        and fits(product, width, depth)
    ]
    if query and semantic and candidates:
        vectors = catalogue_vectors(
            ollama_url(), model_for("embedding"), tuple(description(p) for p in candidates)
        )
        vector = embed_texts([query])[0]

        def score(index):
            other = vectors[index]
            if len(vector) != len(other):
                raise ValueError(
                    "Embedding dimensions changed. Restart the API to refresh the index."
                )
            norm = math.sqrt(sum(n * n for n in vector) * sum(n * n for n in other))
            return sum(a * b for a, b in zip(vector, other, strict=True)) / norm if norm else 0

        candidates = [
            candidates[i] for i in sorted(range(len(candidates)), key=score, reverse=True)
        ]
    elif query:
        candidates = [
            product
            for product in candidates
            if all(term in description(product).lower() for term in query.lower().split())
        ]
    if sort == "price_asc":
        candidates.sort(key=lambda product: product.price_mad)
    elif sort == "price_desc":
        candidates.sort(key=lambda product: product.price_mad, reverse=True)
    elif not (query and semantic):
        candidates.sort(key=lambda product: product.name)
    return candidates
