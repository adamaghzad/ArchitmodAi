import { useState } from 'react';
import {
  AlertTriangle,
  Package,
  CheckCircle2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { area, money } from './geometry';
import CompletenessPanel from './CompletenessPanel';
import type { RenderAuditEntry } from './types';
import { wallAtRoom } from './sceneGeometry';
import {
  RoomDetails,
  FurnitureDetails,
  OtherSelection,
  LinkedProducts,
} from './ContextProperties';
import type { Operation, Product, Project, Scene } from './types';

interface Props {
  renderAudit?: RenderAuditEntry[];
  project: Project;
  scene: Scene | null;
  products: Product[];
  selected: string | null;
  busy: boolean;
  onEdit: (operation: Operation) => Promise<void>;
  onSelect: (id: string) => void;
  onMarketplace: (roomId?: string, replaceId?: string) => void;
  onTryProduct: (
    productId: string,
    roomId: string,
    replaceId?: string,
  ) => Promise<void>;
  onRecheck: () => Promise<void>;
  onAnalyze: () => Promise<void>;
  onRepair: () => Promise<void>;
  onCalibrate: (
    width: number,
    depth: number,
    confirmed: boolean,
  ) => Promise<void>;
  tab: 'properties' | 'validation' | 'catalogue';
  setTab: (tab: 'properties' | 'validation' | 'catalogue') => void;
}

function ObjectProperties({
  scene,
  products,
  selected,
  busy,
  onEdit,
  project,
  onTryProduct,
  onSelect,
}: Pick<
  Props,
  | 'scene'
  | 'products'
  | 'selected'
  | 'busy'
  | 'onEdit'
  | 'project'
  | 'onTryProduct'
  | 'onSelect'
>) {
  const furniture = scene?.furniture.find((item) => item.id === selected);
  const room = scene?.rooms.find((item) => item.id === selected);
  const wall = scene?.walls.find((item) => item.id === selected);
  const [x, setX] = useState(furniture?.position[0] ?? wall?.start[0] ?? 0);
  const [y, setY] = useState(furniture?.position[1] ?? wall?.start[1] ?? 0);
  const [endX, setEndX] = useState(wall?.end[0] ?? 0);
  const [endY, setEndY] = useState(wall?.end[1] ?? 0);
  const [rotation, setRotation] = useState(furniture?.rotation_deg ?? 0);
  const [color, setColor] = useState(room?.color ?? '#b5ad97');
  const [wallHeight, setWallHeight] = useState(wall?.height || 2.8),
    [thickness, setThickness] = useState(wall?.thickness || 0.15);
  if (room)
    return (
      <>
        <div className="object-heading">
          <span className={`room-symbol ${room.type}`} />
          <div>
            <span className="eyebrow">ROOM</span>
            <h3>{room.name}</h3>
          </div>
        </div>
        <dl className="property-list">
          <div>
            <dt>Floor area</dt>
            <dd>{area(room.polygon).toFixed(1)} m²</dd>
          </div>
          <div>
            <dt>Boundary</dt>
            <dd>{room.polygon.length} points</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              {room.provenance === 'user_corrected'
                ? 'User reviewed'
                : 'Generated'}
            </dd>
          </div>
        </dl>
        {scene && (
          <RoomDetails
            key={`${room.id}:${scene.materials
              .filter((item) => item.room_id === room.id)
              .map((item) => item.product_id)
              .join(',')}`}
            room={room}
            scene={scene}
            products={products}
            onTryProduct={onTryProduct}
            busy={busy}
          />
        )}
        <details className="advanced-tint">
          <summary>Advanced surface tint</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onEdit({ type: 'set_material', object_id: room.id, color });
            }}
          >
            <fieldset
              disabled={
                busy ||
                scene?.materials.some(
                  (item) =>
                    item.room_id === room.id && item.surface === 'floor',
                )
              }
            >
              <label>
                Surface tint
                <div className="color-field">
                  <input
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                  />
                  <span>{color.toUpperCase()}</span>
                </div>
              </label>
              <p className="hint">
                {scene?.materials.some(
                  (item) =>
                    item.room_id === room.id && item.surface === 'floor',
                )
                  ? 'The selected floor product controls this finish. Choose a different floor material above.'
                  : 'Visual finish only. No material SKU or finish cost is assigned.'}
              </p>
              <button className="secondary-button full-width" type="submit">
                Apply finish
              </button>
            </fieldset>
          </form>
        </details>
      </>
    );
  if (furniture) {
    const product = products.find(
      (product) => product.id === furniture.product_id,
    );
    return (
      <>
        <div className="object-heading">
          <Package size={25} />
          <div>
            <span className="eyebrow">FURNITURE PROXY</span>
            <h3>{product?.name || furniture.product_id}</h3>
          </div>
        </div>
        <dl className="property-list">
          <div>
            <dt>Dimensions</dt>
            <dd>
              {product?.width_m} × {product?.depth_m} m
            </dd>
          </div>
          <div>
            <dt>Sample price</dt>
            <dd>{money(product?.price_mad || 0)} MAD</dd>
          </div>
        </dl>
        <FurnitureDetails
          product={product}
          project={project}
          itemId={furniture.id}
        />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onEdit({
              type: 'move_furniture',
              object_id: furniture.id,
              position: [x, y],
              rotation_deg: rotation,
            });
          }}
        >
          <fieldset disabled={busy}>
            <div className="form-row">
              <label>
                X (m)
                <input
                  type="number"
                  step="any"
                  min="-100"
                  max="100"
                  value={x}
                  required
                  onChange={(event) => setX(Number(event.target.value))}
                />
              </label>
              <label>
                Y (m)
                <input
                  type="number"
                  step="any"
                  min="-100"
                  max="100"
                  value={y}
                  required
                  onChange={(event) => setY(Number(event.target.value))}
                />
              </label>
            </div>
            <label>
              Rotation
              <select
                value={rotation}
                onChange={(event) =>
                  setRotation(Number(event.target.value) as typeof rotation)
                }
              >
                {[0, 90, 180, 270].map((angle) => (
                  <option key={angle} value={angle}>
                    {angle}°
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">
              Position is the local footprint origin. Rotations are checked
              against room boundaries.
            </p>
            <button type="submit" className="secondary-button full-width">
              Apply position
            </button>
          </fieldset>
        </form>
        <button
          className="text-button danger"
          disabled={busy}
          onClick={() =>
            void onEdit({ type: 'delete_furniture', object_id: furniture.id })
          }
        >
          <Trash2 size={14} /> Remove item
        </button>
      </>
    );
  }
  if (wall) {
    const roomIds =
      scene?.rooms
        .filter((room) => wallAtRoom(wall, room))
        .map((room) => room.id) || [];
    const materialNames =
      scene?.materials
        .filter(
          (item) => item.surface === 'walls' && roomIds.includes(item.room_id),
        )
        .map(
          (item) =>
            products.find((product) => product.id === item.product_id)?.name,
        )
        .filter(Boolean) || [];
    return (
      <>
        <div className="object-heading">
          <SlidersHorizontal size={24} />
          <div>
            <span className="eyebrow">WALL</span>
            <h3>{wall.id.replace('_', ' ')}</h3>
          </div>
        </div>
        <dl className="property-list">
          <div>
            <dt>Height</dt>
            <dd>{wall.height} m</dd>
          </div>
          <div>
            <dt>Thickness</dt>
            <dd>{wall.thickness} m</dd>
          </div>
        </dl>
        <dl className="property-list extended-properties">
          <div>
            <dt>Length</dt>
            <dd>
              {Math.hypot(
                wall.end[0] - wall.start[0],
                wall.end[1] - wall.start[1],
              ).toFixed(2)}{' '}
              m
            </dd>
          </div>
          <div>
            <dt>Attached doors</dt>
            <dd>
              {scene?.openings.filter(
                (item) => item.wall_id === wall.id && item.type === 'door',
              ).length || 0}
            </dd>
          </div>
          <div>
            <dt>Attached windows</dt>
            <dd>
              {scene?.openings.filter(
                (item) => item.wall_id === wall.id && item.type === 'window',
              ).length || 0}
            </dd>
          </div>
          <div>
            <dt>Finish</dt>
            <dd>{materialNames.join(' / ') || 'Painted plaster preview'}</dd>
          </div>
        </dl>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onEdit({
              type: 'update_wall',
              object_id: wall.id,
              start: [x, y],
              end: [endX, endY],
              height: wallHeight,
              thickness,
            });
          }}
        >
          <fieldset disabled={busy}>
            <div className="form-row">
              <label>
                Wall height (m)
                <input
                  type="number"
                  min=".1"
                  max="10"
                  step=".01"
                  required
                  value={wallHeight}
                  onChange={(event) =>
                    setWallHeight(Number(event.target.value))
                  }
                />
              </label>
              <label>
                Wall thickness (m)
                <input
                  type="number"
                  min=".01"
                  max="1"
                  step=".01"
                  required
                  value={thickness}
                  onChange={(event) => setThickness(Number(event.target.value))}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Start X (m)
                <input
                  type="number"
                  step="0.1"
                  min="-100"
                  max="100"
                  value={x}
                  required
                  onChange={(event) => setX(Number(event.target.value))}
                />
              </label>
              <label>
                Start Y (m)
                <input
                  type="number"
                  step="0.1"
                  min="-100"
                  max="100"
                  value={y}
                  required
                  onChange={(event) => setY(Number(event.target.value))}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                End X (m)
                <input
                  type="number"
                  step="0.1"
                  min="-100"
                  max="100"
                  value={endX}
                  required
                  onChange={(event) => setEndX(Number(event.target.value))}
                />
              </label>
              <label>
                End Y (m)
                <input
                  type="number"
                  step="0.1"
                  min="-100"
                  max="100"
                  value={endY}
                  required
                  onChange={(event) => setEndY(Number(event.target.value))}
                />
              </label>
            </div>
            <p className="hint">
              Wall edits do not reshape rooms automatically. Inconsistent
              boundaries block approval.
            </p>
            <button className="secondary-button full-width" type="submit">
              Apply wall correction
            </button>
          </fieldset>
        </form>
      </>
    );
  }
  return scene ? (
    <OtherSelection
      project={project}
      scene={scene}
      products={products}
      selected={selected}
      onSelect={onSelect}
      onEdit={onEdit}
      busy={busy}
    />
  ) : (
    <p className="hint">Select a scene object to inspect it.</p>
  );
}

export default function Inspector({
  renderAudit = [],
  project,
  scene,
  products,
  selected,
  busy,
  onEdit,
  onCalibrate,
  onAnalyze,
  onRepair,
  onSelect,
  onMarketplace,
  onTryProduct,
  onRecheck,
  tab,
  setTab,
}: Props) {
  const [width, setWidth] = useState(8);
  const [depth, setDepth] = useState(6);
  const [confirmed, setConfirmed] = useState(false);
  const report = project.report;
  return (
    <aside className="inspector" aria-label="Inspector">
      <div
        className="inspector-tabs"
        role="tablist"
        aria-label="Inspector sections"
      >
        {(['properties', 'validation', 'catalogue'] as const).map((item) => (
          <button
            role="tab"
            aria-selected={tab === item}
            className={tab === item ? 'active' : ''}
            key={item}
            onClick={() => setTab(item)}
          >
            {item === 'properties'
              ? 'Properties'
              : item === 'validation'
                ? 'Checks'
                : 'Products'}
            {item === 'validation' && project.report && (
              <span className="check-count" aria-hidden="true">
                {project.report.issues.length}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="inspector-content">
        {project.reference && (
          <div className="cv-controls">
            <button
              type="button"
              className="secondary-button full-width"
              disabled={busy}
              onClick={() => void onAnalyze()}
            >
              Analyze reference with OpenCV
            </button>
            {project.perception && (
              <p className="hint">
                {project.perception.wall_candidates.length} unreviewed line
                proposals · {project.perception.provider}. No rooms or openings
                inferred.
              </p>
            )}
          </div>
        )}
        <CompletenessPanel
          report={project.report?.completeness}
          audit={renderAudit}
        />
        {tab === 'properties' && (
          <>
            {project.reference && !scene ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void onCalibrate(width, depth, confirmed);
                }}
              >
                <h3>Calibrate reference</h3>
                <p className="hint">
                  Enter the real dimensions of the entire cropped footprint.
                  This creates a rectangular review outline, not a
                  reconstruction.
                </p>
                <fieldset disabled={busy}>
                  <div className="form-row">
                    <label>
                      Width (m)
                      <input
                        type="number"
                        min="3"
                        max="25"
                        step="0.1"
                        required
                        value={width}
                        onChange={(event) =>
                          setWidth(Number(event.target.value))
                        }
                      />
                    </label>
                    <label>
                      Depth (m)
                      <input
                        type="number"
                        min="3"
                        max="25"
                        step="0.1"
                        required
                        value={depth}
                        onChange={(event) =>
                          setDepth(Number(event.target.value))
                        }
                      />
                    </label>
                  </div>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      required
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />{' '}
                    I confirm these full-footprint dimensions.
                  </label>
                  <button
                    className="primary-button full-width"
                    disabled={!confirmed}
                    type="submit"
                  >
                    Create review outline
                  </button>
                </fieldset>
              </form>
            ) : (
              <ObjectProperties
                key={`${selected}-${project.revision}`}
                scene={scene}
                products={products}
                selected={selected}
                busy={busy}
                onEdit={onEdit}
                project={project}
                onSelect={onSelect}
                onTryProduct={onTryProduct}
              />
            )}
            {scene && (
              <div className="design-brief">
                <span className="eyebrow">DESIGN BRIEF</span>
                <h3>{scene.style}</h3>
                <dl className="property-list">
                  <div>
                    <dt>Budget</dt>
                    <dd>{money(scene.budget_mad)} MAD</dd>
                  </div>
                  <div>
                    <dt>Rooms</dt>
                    <dd>{scene.rooms.length}</dd>
                  </div>
                  <div>
                    <dt>Units</dt>
                    <dd>Metres</dd>
                  </div>
                </dl>
              </div>
            )}
          </>
        )}
        {tab === 'validation' && (
          <>
            <div className={`check-summary ${report?.valid ? 'passed' : ''}`}>
              {report?.valid ? (
                <CheckCircle2 size={27} />
              ) : (
                <AlertTriangle size={27} />
              )}
              <h3>
                {report
                  ? report.valid
                    ? 'Geometry checks pass'
                    : 'Review needed'
                  : 'No scene to check'}
              </h3>
              <p>
                {report?.valid
                  ? 'The implemented hard constraints pass. Review the remaining limitations.'
                  : 'Resolve errors before approving this draft.'}
              </p>
            </div>
            <button
              className="secondary-button full-width recheck-button"
              disabled={busy || !scene}
              onClick={() => void onRecheck()}
            >
              Run checks again
            </button>
            {report && (
              <div className="check-groups">
                {[
                  [
                    'Room geometry',
                    [
                      'invalid_room',
                      'empty_scene',
                      'room_outside',
                      'room_overlap',
                      'unclosed_room',
                      'wall_outside',
                    ],
                  ],
                  [
                    'Doors & windows',
                    ['missing_wall', 'opening_outside', 'opening_overlap'],
                  ],
                  [
                    'Furniture fit',
                    [
                      'furniture_outside',
                      'furniture_overlap',
                      'furniture_wall_collision',
                      'unknown_product',
                    ],
                  ],
                  ['Door clearance', ['door_obstruction']],
                  ['Budget', ['over_budget']],
                  ['Reference scale', ['scale_unconfirmed']],
                ].map(([label, codes]) => {
                  const failed = report.issues.some(
                    (issue) =>
                      issue.severity === 'error' &&
                      (codes as string[]).includes(issue.code),
                  );
                  return (
                    <div key={label as string}>
                      <span>{label as string}</span>
                      <strong
                        className={failed ? 'text-danger' : 'text-success'}
                      >
                        {failed ? 'Failed' : 'Passed'}
                      </strong>
                    </div>
                  );
                })}
                <div>
                  <span>Building rules / circulation</span>
                  <strong className="muted">Not evaluated</strong>
                </div>
              </div>
            )}
            {report?.issues.map((issue, i) => (
              <button
                type="button"
                className={`validation-issue ${issue.severity}`}
                key={`${issue.code}-${i}`}
                disabled={!issue.object_id}
                onClick={() => {
                  if (issue.object_id) onSelect(issue.object_id);
                }}
                aria-label={`${issue.code.replaceAll('_', ' ')}${issue.object_id ? ' ? inspect object' : ''}`}
              >
                <span>
                  {issue.severity === 'error' ? (
                    <AlertTriangle size={15} />
                  ) : (
                    <span className="warning-dot" />
                  )}
                </span>
                <div>
                  <strong>{issue.code.replaceAll('_', ' ')}</strong>
                  <p>{issue.message}</p>
                </div>
              </button>
            ))}
            {scene && report && !report.valid && (
              <button
                className="secondary-button full-width"
                disabled={busy}
                onClick={() => void onRepair()}
              >
                Ask local correction agent
              </button>
            )}
            {scene?.notes.map((note) => (
              <p key={note} className="scene-note">
                {note}
              </p>
            ))}
          </>
        )}
        {tab === 'catalogue' && scene && (
          <LinkedProducts
            scene={scene}
            products={products}
            selected={selected}
            onSelect={onSelect}
            onMarketplace={onMarketplace}
            onTryProduct={onTryProduct}
            busy={busy}
          />
        )}
      </div>
      <div className="budget-summary">
        <div>
          <span className="eyebrow">DESIGN ESTIMATE</span>
          <strong>
            {money(report?.total_mad || 0)} <small>MAD</small>
          </strong>
        </div>
        <span className="sample-tag">Sample prices</span>
        {scene && (
          <>
            <div className="budget-track">
              <span
                style={{
                  width: `${Math.min(100, scene.budget_mad ? ((report?.total_mad || 0) / scene.budget_mad) * 100 : 0)}%`,
                }}
              />
            </div>
            <p>
              of {money(scene.budget_mad)} MAD budget · selected finishes
              included
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
