import { useState } from 'react';
import { DoorOpen, Layers3, Package, Paintbrush } from 'lucide-react';
import { money } from './geometry';
import { perimeter, roomSurface, wallAtRoom } from './sceneGeometry';
import type { Operation, Product, Project, Room, Scene } from './types';

export function RoomDetails({
  room,
  scene,
  products,
  onTryProduct,
  busy,
}: {
  room: Room;
  scene: Scene;
  products: Product[];
  onTryProduct: (
    productId: string,
    roomId: string,
    replaceId?: string,
  ) => Promise<void>;
  busy: boolean;
}) {
  const floor = roomSurface(scene, room.id, products, 'floor'),
    wall = roomSurface(scene, room.id, products, 'walls');
  const [floorId, setFloorId] = useState(floor?.id || ''),
    [wallId, setWallId] = useState(wall?.id || '');
  const furniture = scene.furniture.filter((item) => item.room_id === room.id);
  const total =
    furniture.reduce(
      (sum, item) =>
        sum +
        (products.find((product) => product.id === item.product_id)
          ?.price_mad || 0),
      0,
    ) +
    scene.materials
      .filter((item) => item.room_id === room.id)
      .reduce(
        (sum, item) =>
          sum +
          item.units *
            (products.find((product) => product.id === item.product_id)
              ?.price_mad || 0),
        0,
      );
  const heights = scene.walls
    .filter((wall) => wallAtRoom(wall, room))
    .map((item) => item.height);
  return (
    <>
      <dl className="property-list extended-properties">
        <div>
          <dt>Room type</dt>
          <dd>{room.type}</dd>
        </div>
        <div>
          <dt>Perimeter</dt>
          <dd>{perimeter(room.polygon).toFixed(2)} m</dd>
        </div>
        <div>
          <dt>Wall height</dt>
          <dd>
            {heights.length
              ? `${Math.max(...heights).toFixed(2)} m`
              : 'Not defined'}
          </dd>
        </div>
        <div>
          <dt>Furniture</dt>
          <dd>{furniture.length} items</dd>
        </div>
        <div>
          <dt>Selected products</dt>
          <dd>{money(total)} MAD</dd>
        </div>
      </dl>
      <section className="room-finishes">
        <h4>
          <Paintbrush size={15} /> Finish
        </h4>
        {(['floor', 'walls'] as const).map((surface) => {
          const value = surface === 'floor' ? floorId : wallId,
            change = surface === 'floor' ? setFloorId : setWallId;
          const assigned = surface === 'floor' ? floor : wall;
          const options = products.filter(
            (product) =>
              product.kind === 'material' &&
              (surface === 'floor'
                ? product.category === 'flooring'
                : product.category !== 'flooring') &&
              product.room_types.includes(room.type),
          );
          return (
            <form
              key={surface}
              onSubmit={(event) => {
                event.preventDefault();
                void onTryProduct(value, room.id);
              }}
            >
              <label>
                {surface === 'floor' ? 'Floor material' : 'Wall finish'}
                <select
                  value={value}
                  disabled={busy}
                  onChange={(event) => change(event.target.value)}
                >
                  <option value="">
                    {surface === 'floor'
                      ? 'Procedural preview · no product assigned'
                      : 'Painted plaster preview'}
                  </option>
                  {options.map((product) => (
                    <option value={product.id} key={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
              {assigned && (
                <p className="hint">
                  {assigned.mock_data ? 'Sample catalogue' : 'Catalogue'} ·{' '}
                  {money(assigned.price_mad)} MAD / {assigned.unit}
                </p>
              )}
              <button
                className="secondary-button full-width"
                type="submit"
                disabled={busy || !value || value === assigned?.id}
              >
                <Paintbrush size={14} />
                {surface === 'floor'
                  ? 'Apply floor material'
                  : 'Apply wall finish'}
              </button>
            </form>
          );
        })}
      </section>
    </>
  );
}

export function FurnitureDetails({
  product,
  project,
  itemId,
}: {
  product: Product | undefined;
  project: Project;
  itemId: string;
}) {
  if (!product) return null;
  const errors =
    project.report?.issues.filter(
      (issue) =>
        issue.severity === 'error' &&
        (issue.object_id === itemId ||
          issue.related_object_ids?.includes(itemId)),
    ) || [];
  return (
    <dl className="property-list extended-properties">
      <div>
        <dt>Category</dt>
        <dd>{product.category}</dd>
      </div>
      <div>
        <dt>Height</dt>
        <dd>{product.height_m.toFixed(2)} m</dd>
      </div>
      <div>
        <dt>Material</dt>
        <dd>{product.material}</dd>
      </div>
      <div>
        <dt>Catalogue source</dt>
        <dd>{product.source_provider.replaceAll('_', ' ')}</dd>
      </div>
      <div>
        <dt>Price provenance</dt>
        <dd>
          {product.mock_data
            ? 'Sample price'
            : product.checked_at
              ? 'Checked price'
              : 'Estimate'}
        </dd>
      </div>
      <div>
        <dt>Fit / collision checks</dt>
        <dd className={errors.length ? 'text-danger' : 'text-success'}>
          {!project.report
            ? 'Not evaluated'
            : errors.length
              ? 'Failed'
              : 'Passed'}
        </dd>
      </div>
    </dl>
  );
}

export function OtherSelection({
  project,
  scene,
  products,
  selected,
  onSelect,
  onEdit,
  busy,
}: {
  project: Project;
  scene: Scene;
  products: Product[];
  selected: string | null;
  onSelect: (id: string) => void;
  onEdit: (operation: Operation) => Promise<void>;
  busy: boolean;
}) {
  const opening = scene.openings.find((item) => item.id === selected),
    material = scene.materials.find((item) => item.id === selected);
  const [offset, setOffset] = useState(opening?.offset_m || 0),
    [width, setWidth] = useState(opening?.width_m || 0.9),
    [height, setHeight] = useState(opening?.height_m || 2.1),
    [sill, setSill] = useState(opening?.sill_m || 0);
  if (opening)
    return (
      <>
        <div className="object-heading">
          <DoorOpen size={27} />
          <div>
            <span className="eyebrow">{opening.type.toUpperCase()}</span>
            <h3>
              {opening.type === 'door' ? 'Door opening' : 'Window opening'}
            </h3>
          </div>
        </div>
        <dl className="property-list">
          <div>
            <dt>Attached wall</dt>
            <dd>
              <button
                className="text-button"
                onClick={() => onSelect(opening.wall_id)}
              >
                {opening.wall_id}
              </button>
            </dd>
          </div>
          <div>
            <dt>Dimensions</dt>
            <dd>
              {opening.width_m.toFixed(2)} × {opening.height_m.toFixed(2)} m
            </dd>
          </div>
          <div>
            <dt>Opening checks</dt>
            <dd>
              {project.report?.issues.some(
                (issue) =>
                  issue.object_id === opening.id && issue.severity === 'error',
              )
                ? 'Failed'
                : 'See Checks'}
            </dd>
          </div>
        </dl>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onEdit({
              type: 'update_opening',
              object_id: opening.id,
              offset_m: offset,
              width_m: width,
              height_m: height,
              sill_m: sill,
            });
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Wall offset (m)
              <input
                type="number"
                min="0"
                max="100"
                step=".01"
                required
                value={offset}
                onChange={(event) => setOffset(Number(event.target.value))}
              />
            </label>
            <div className="form-row">
              <label>
                Opening width (m)
                <input
                  type="number"
                  min=".1"
                  max="10"
                  step=".01"
                  required
                  value={width}
                  onChange={(event) => setWidth(Number(event.target.value))}
                />
              </label>
              <label>
                Opening height (m)
                <input
                  type="number"
                  min=".1"
                  max="10"
                  step=".01"
                  required
                  value={height}
                  onChange={(event) => setHeight(Number(event.target.value))}
                />
              </label>
            </div>
            <label>
              Sill height (m)
              <input
                type="number"
                min="0"
                max="10"
                step=".01"
                required
                value={sill}
                onChange={(event) => setSill(Number(event.target.value))}
              />
            </label>
            <button className="secondary-button" type="submit">
              Apply opening changes
            </button>
          </fieldset>
        </form>
      </>
    );
  if (material) {
    const product = products.find(
      (product) => product.id === material.product_id,
    );
    return (
      <>
        <div className="object-heading">
          <Layers3 size={26} />
          <div>
            <span className="eyebrow">{material.surface} MATERIAL</span>
            <h3>{product?.name || material.product_id}</h3>
          </div>
        </div>
        <dl className="property-list">
          <div>
            <dt>Surface area</dt>
            <dd>{material.area_m2.toFixed(2)} m²</dd>
          </div>
          <div>
            <dt>Waste allowance</dt>
            <dd>{(material.waste_fraction * 100).toFixed(0)}%</dd>
          </div>
          <div>
            <dt>Coverage per unit</dt>
            <dd>{product?.coverage_m2_per_unit} m²</dd>
          </div>
          <div>
            <dt>Purchase quantity</dt>
            <dd>
              {material.units} {product?.unit}
            </dd>
          </div>
          <div>
            <dt>Estimated cost</dt>
            <dd>{money(material.units * (product?.price_mad || 0))} MAD</dd>
          </div>
          <div>
            <dt>Price provenance</dt>
            <dd>{product?.mock_data ? 'Sample price' : 'Catalogue price'}</dd>
          </div>
        </dl>
        <p className="hint">{product?.coverage_note}</p>
        <button
          className="text-button"
          onClick={() => onSelect(material.room_id)}
        >
          Inspect assigned room
        </button>
      </>
    );
  }
  return (
    <div className="selection-hint">
      <Package size={26} />
      <h3>A closer look</h3>
      <p>
        Select a room, wall, opening, furniture item, or finish to inspect it.
      </p>
    </div>
  );
}

export function LinkedProducts({
  scene,
  products,
  selected,
  onSelect,
  onMarketplace,
  onTryProduct,
  busy,
}: {
  scene: Scene;
  products: Product[];
  selected: string | null;
  onSelect: (id: string) => void;
  onMarketplace: (roomId?: string, replaceId?: string) => void;
  onTryProduct: (
    productId: string,
    roomId: string,
    replaceId?: string,
  ) => Promise<void>;
  busy: boolean;
}) {
  const item = scene.furniture.find((item) => item.id === selected);
  const material = scene.materials.find((item) => item.id === selected);
  const roomId =
    item?.room_id ||
    material?.room_id ||
    scene.rooms.find((room) => room.id === selected)?.id ||
    scene.rooms[0]?.id;
  const linked = products.find(
    (product) => product.id === (item?.product_id || material?.product_id),
  );
  const selections = [...scene.furniture, ...scene.materials].filter(
    (item) => item.room_id === roomId,
  );
  const alternatives = linked
    ? products
        .filter(
          (product) =>
            product.kind === linked.kind &&
            product.category === linked.category &&
            product.id !== linked.id,
        )
        .sort((a, b) => a.price_mad - b.price_mad)
        .slice(0, 3)
    : [];
  return (
    <>
      <div className="section-intro">
        <span className="eyebrow">CONNECTED CATALOGUE</span>
        <h3>
          {linked?.name ||
            scene.rooms.find((room) => room.id === roomId)?.name ||
            'Your products'}
        </h3>
        <p>Selections and prices come from the project catalogue.</p>
      </div>
      {linked && (
        <dl className="property-list">
          <div>
            <dt>Dimensions</dt>
            <dd>
              {linked.width_m} × {linked.depth_m} × {linked.height_m} m
            </dd>
          </div>
          <div>
            <dt>Stored price</dt>
            <dd>{money(linked.price_mad)} MAD</dd>
          </div>
          <div>
            <dt>Provenance</dt>
            <dd>{linked.mock_data ? 'Sample data' : 'Catalogue'}</dd>
          </div>
        </dl>
      )}
      <button
        className="secondary-button full-width"
        onClick={() => onMarketplace(roomId, item?.id)}
      >
        Explore {linked ? 'alternatives' : 'products'}
      </button>
      {alternatives.map((product) => (
        <div className="linked-product" key={product.id}>
          <span
            className="product-swatch"
            style={{ background: product.color }}
          >
            <Package size={20} />
          </span>
          <div>
            <strong>{product.name}</strong>
            <small>
              {product.width_m} × {product.depth_m} m ·{' '}
              {money(product.price_mad)} MAD
            </small>
            <button
              className="text-button"
              disabled={busy || !roomId}
              onClick={() => void onTryProduct(product.id, roomId, item?.id)}
            >
              Try in my room
            </button>
          </div>
        </div>
      ))}
      <h4 className="selection-list-title">Selected in this room</h4>
      {selections.map((selection) => {
        const product = products.find(
          (product) => product.id === selection.product_id,
        );
        return (
          <button
            className="selected-product-row"
            key={selection.id}
            onClick={() => onSelect(selection.id)}
          >
            <span style={{ background: product?.color }} />
            <strong>{product?.name || selection.product_id}</strong>
            <small>
              {'units' in selection ? selection.units : 1} ×{' '}
              {money(product?.price_mad || 0)} MAD
            </small>
          </button>
        );
      })}
      {!selections.length && (
        <p className="hint">No products selected for this room yet.</p>
      )}
    </>
  );
}
