import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  Box,
  Check,
  Download,
  Package,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api, post } from './api';
import { money } from './geometry';
import type { Product, Project } from './types';

interface ShoppingItem {
  object_id: string;
  product_id: string;
  name: string;
  room_id: string;
  quantity: number;
  unit: string;
  width_m: number;
  depth_m: number;
  height_m: number;
  unit_price_mad: number;
  subtotal_mad: number;
  price_status: string;
  surface: string | null;
  area_m2: number | null;
  waste_fraction: number | null;
  product_url: string | null;
}
interface ShoppingList {
  items: ShoppingItem[];
  total_mad: number;
  budget_mad: number;
  over_budget_mad: number;
  sample_total_mad: number;
  confirmed_total_mad: number;
  estimated_total_mad: number;
  alternatives: {
    replace_id: string;
    product_id: string;
    name: string;
    saving_mad: number;
    room_id: string;
    surface: string;
  }[];
}
interface Comparison {
  product: Product;
  fits_room_dimensions: boolean | null;
  can_place_now: boolean | null;
}
interface Props {
  project: Project | null;
  products: Product[];
  onChange: (project: Project) => void;
  onClose: () => void;
  onPreview: () => void;
  initialRoomId?: string;
  initialReplaceId?: string;
  initialSection?: 'catalogue' | 'recommendations' | 'shopping';
  initialKind?: 'furniture' | 'material';
}

function ProductPreview({ product }: { product: Product }) {
  if (product.image_url)
    return <img src={product.image_url} alt={product.name} loading="lazy" />;
  return (
    <svg
      viewBox="0 0 180 105"
      role="img"
      aria-label={`${product.name} generic illustration`}
    >
      {product.kind === 'material' ? (
        <>
          <path
            d="m40 68 48-35 55 23-48 35Z"
            fill={product.color}
            stroke="#f0ebdf"
            strokeOpacity=".3"
          />
          <path d="m40 68 55 23v5L40 73Z" fill="#5d6654" />
          <path d="m95 91 48-35v5l-48 35Z" fill="#808675" />
          <path
            d="m55 74 48-35m-28 44 48-35"
            stroke="#243020"
            strokeOpacity=".18"
          />
        </>
      ) : (
        <>
          <ellipse
            cx="90"
            cy="88"
            rx="59"
            ry="7"
            fill="#0c170a"
            fillOpacity=".18"
          />
          <path
            d="M42 66v19m92-18v19M59 45v15m59-17v15"
            stroke="#7e886e"
            strokeWidth="4"
          />
          <path
            d="m37 50 35-21 72 25-36 23Z"
            fill={product.color}
            stroke="#e6eddb"
            strokeOpacity=".25"
          />
          <path d="M37 50v19l71 24V77Z" fill={product.color} />
          <path
            d="m108 77 36-23v19l-36 20Z"
            fill={product.color}
            filter="brightness(.75)"
          />
          {product.category === 'sofa' && (
            <path
              d="M37 50V28l35-18 72 24v20L72 29Z"
              fill={product.color}
              stroke="#e6eddb"
              strokeOpacity=".35"
            />
          )}
        </>
      )}
    </svg>
  );
}

export default function Marketplace({
  project,
  products,
  onChange,
  onClose,
  onPreview,
  initialRoomId,
  initialReplaceId,
  initialSection,
  initialKind,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const scene = project?.candidate_scene || project?.committed_scene;
  const [section, setSection] = useState<
    'catalogue' | 'recommendations' | 'shopping'
  >(initialSection || 'catalogue');
  const [roomId, setRoomId] = useState(
    initialRoomId || scene?.rooms[0]?.id || '',
  );
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [kind, setKind] = useState(initialKind || '');
  const [style, setStyle] = useState('');
  const [material, setMaterial] = useState('');
  const [brand, setBrand] = useState('');
  const [color, setColor] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [width, setWidth] = useState('');
  const [depth, setDepth] = useState('');
  const [height, setHeight] = useState('');
  const [sort, setSort] = useState('name');
  const [semantic, setSemantic] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [waste, setWaste] = useState(10);
  const [results, setResults] = useState(
    products.filter((product) => !initialKind || product.kind === initialKind),
  );
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<Comparison[]>([]);
  const [shopping, setShopping] = useState<ShoppingList | null>(null);
  const [replaceId, setReplaceId] = useState<string | null>(
    initialReplaceId || null,
  );
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [section]);
  useEffect(() => {
    if (!project || !scene) return;
    let active = true;
    api<ShoppingList>(`/projects/${project.id}/shopping-list`)
      .then((list) => {
        if (active) setShopping(list);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [project, scene]);

  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request failed.');
    } finally {
      setBusy(false);
    }
  };
  const mutation = async (route: string, body: object) => {
    if (!project) throw new Error('Create a design project first.');
    const next = await post<Project>(`/projects/${project.id}/${route}`, {
      expected_revision: project.revision,
      ...body,
    });
    onChange(next);
    return next;
  };
  const search = () =>
    perform(async () => {
      const params = new URLSearchParams({
        query,
        sort,
        semantic: String(semantic),
      });
      for (const [key, value] of Object.entries({
        category,
        kind,
        style,
        material,
        brand,
        color,
        min_price: minPrice,
        max_price: maxPrice,
        width,
        depth,
        height,
      }))
        if (value) params.set(key, value);
      setResults(await api<Product[]>(`/products?${params}`));
    });
  const add = (product: Product, preview = false) =>
    perform(async () => {
      await mutation('products', {
        product_id: product.id,
        room_id: roomId,
        surface: product.category === 'flooring' ? 'floor' : 'walls',
        waste_fraction: waste / 100,
        replace_id: replaceId,
      });
      setNotice(
        `${product.name} ${replaceId ? 'replaced the selected item' : 'added to your design'}. Budget and shopping list updated.`,
      );
      setReplaceId(null);
      setComparison([]);
      if (preview) onPreview();
    });
  const compare = () =>
    perform(async () => {
      const params = new URLSearchParams({ ids: comparisonIds.join(',') });
      if (project && scene) {
        params.set('project_id', project.id);
        params.set('room_id', roomId);
        if (replaceId) params.set('replace_id', replaceId);
      }
      setComparison(await api<Comparison[]>(`/products/compare?${params}`));
    });
  const productMap = new Map(products.map((product) => [product.id, product]));
  const unique = (
    key: 'category' | 'design_style' | 'material' | 'brand' | 'color',
  ) => [...new Set(products.map((product) => product[key]))].sort();

  return (
    <dialog
      ref={dialog}
      className="marketplace-dialog"
      aria-labelledby="market-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="market-header">
        <div>
          <span className="eyebrow">DESIGN TO SHOPPING</span>
          <h2 id="market-title">Furniture & materials</h2>
          <p>
            {products.length} mock products. Stored dimensions. One connected
            design.
          </p>
        </div>
        <div className="market-header-actions">
          <button
            className="secondary-button"
            disabled={!scene || busy}
            onClick={onPreview}
          >
            <Box size={15} /> Preview in 3D
          </button>
          <button
            className="icon-button"
            aria-label="Close marketplace"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
      </div>
      <div className="market-toolbar">
        <div
          className="market-tabs"
          role="tablist"
          aria-label="Marketplace sections"
        >
          {(['catalogue', 'recommendations', 'shopping'] as const).map(
            (item) => (
              <button
                key={item}
                role="tab"
                aria-selected={section === item}
                className={section === item ? 'active' : ''}
                onClick={() => setSection(item)}
              >
                {item === 'catalogue'
                  ? 'Catalogue'
                  : item === 'recommendations'
                    ? 'Recommendations'
                    : `Shopping list${shopping ? ` (${shopping.items.length})` : ''}`}
              </button>
            ),
          )}
        </div>
        <label>
          Design room
          <select
            aria-label="Marketplace room"
            value={roomId}
            disabled={!scene || busy}
            onChange={(event) => {
              setRoomId(event.target.value);
              setComparison([]);
            }}
          >
            <option value="" disabled>
              Select a room
            </option>
            {scene?.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(error || notice) && (
        <div
          className={error ? 'form-error market-notice' : 'market-success'}
          role={error ? 'alert' : 'status'}
        >
          {error || notice}
        </div>
      )}
      {!scene && (
        <div className="market-empty-notice">
          Browse and compare products now. Create or import a plan to add
          products to a design.
        </div>
      )}
      {replaceId && (
        <div className="replacement-banner">
          Choose a replacement for{' '}
          {shopping?.items.find((item) => item.object_id === replaceId)?.name ||
            'the selected item'}
          .
          <button className="text-button" onClick={() => setReplaceId(null)}>
            Cancel replacement
          </button>
        </div>
      )}
      <div className="market-body" ref={body}>
        {section === 'catalogue' && (
          <>
            <form
              className="market-filters"
              onSubmit={(event) => {
                event.preventDefault();
                void search();
              }}
            >
              <label className="market-search">
                Search products
                <div>
                  <Search size={16} />
                  <input
                    value={query}
                    maxLength={300}
                    placeholder="Oak, linen, a compact sofa…"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              </label>
              <label>
                Category
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="">All categories</option>
                  {unique('category').map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Collection
                <select
                  value={kind}
                  onChange={(event) => setKind(event.target.value)}
                >
                  <option value="">Furniture & materials</option>
                  <option value="furniture">Furniture</option>
                  <option value="material">Materials</option>
                </select>
              </label>
              <label>
                Style
                <select
                  value={style}
                  onChange={(event) => setStyle(event.target.value)}
                >
                  <option value="">All styles</option>
                  {unique('design_style').map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Material
                <select
                  value={material}
                  onChange={(event) => setMaterial(event.target.value)}
                >
                  <option value="">All materials</option>
                  {unique('material').map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Brand
                <select
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                >
                  <option value="">All brands</option>
                  {unique('brand').map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Color
                <select
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                >
                  <option value="">All colors</option>
                  {unique('color').map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <label>
                  Min price (MAD)
                  <input
                    type="number"
                    min="0"
                    value={minPrice}
                    onChange={(event) => setMinPrice(event.target.value)}
                  />
                </label>
                <label>
                  Max price (MAD)
                  <input
                    type="number"
                    min="0"
                    value={maxPrice}
                    onChange={(event) => setMaxPrice(event.target.value)}
                  />
                </label>
              </div>
              <div className="dimension-filters">
                <label>
                  Max width (m)
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={width}
                    onChange={(event) => setWidth(event.target.value)}
                  />
                </label>
                <label>
                  Max depth (m)
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={depth}
                    onChange={(event) => setDepth(event.target.value)}
                  />
                </label>
                <label>
                  Max height (m)
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={height}
                    onChange={(event) => setHeight(event.target.value)}
                  />
                </label>
              </div>
              <label>
                Sort by
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="name">Name</option>
                  <option value="price_asc">Price: low to high</option>
                  <option value="price_desc">Price: high to low</option>
                  <option value="relevance">Semantic relevance</option>
                </select>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={semantic}
                  onChange={(event) => setSemantic(event.target.checked)}
                />{' '}
                Semantic search with local Ollama
              </label>
              <button className="primary-button" disabled={busy} type="submit">
                {busy ? 'Searching…' : 'Apply filters'}
                <ArrowRight size={15} />
              </button>
              <p className="hint">
                Dimensions filter furniture footprints, including a
                quarter-turn. Materials are filtered by price and attributes,
                not pack footprint.
              </p>
              <label>
                Material waste allowance (%)
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="1"
                  value={waste}
                  onChange={(event) => setWaste(Number(event.target.value))}
                />
              </label>
            </form>
            <section className="market-results" aria-label="Catalogue results">
              <div className="results-topline">
                <span>{results.length} products · mock_data</span>
                <button
                  className="secondary-button"
                  disabled={!comparisonIds.length || busy}
                  onClick={() => void compare()}
                >
                  <ArrowLeftRight size={14} /> Compare ({comparisonIds.length}
                  /4)
                </button>
              </div>
              {comparison.length > 0 && (
                <div className="comparison-wrap">
                  <h3>Product comparison</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>W × D × H</th>
                        <th>Material / style</th>
                        <th>MAD</th>
                        <th>Fits room</th>
                        <th>Space available</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.map((row) => (
                        <tr key={row.product.id}>
                          <td>{row.product.name}</td>
                          <td>
                            {row.product.width_m} × {row.product.depth_m} ×{' '}
                            {row.product.height_m} m
                          </td>
                          <td>
                            {row.product.material}
                            <br />
                            {row.product.design_style}
                          </td>
                          <td>{money(row.product.price_mad)}</td>
                          <td>
                            {row.fits_room_dimensions === null
                              ? 'Choose a room'
                              : row.fits_room_dimensions
                                ? 'Yes'
                                : 'No'}
                          </td>
                          <td>
                            {row.can_place_now === null
                              ? '—'
                              : row.can_place_now
                                ? 'Yes'
                                : 'No'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="product-grid">
                {results.map((product) => (
                  <article className="market-product" key={product.id}>
                    <div className="market-product-preview">
                      <ProductPreview product={product} />
                      <span className="sample-tag">mock_data</span>
                    </div>
                    <div className="market-product-content">
                      <span className="eyebrow">{product.category}</span>
                      <h3>{product.name}</h3>
                      <p>
                        {product.width_m} × {product.depth_m} ×{' '}
                        {product.height_m} m
                      </p>
                      <p>
                        {product.material} · {product.design_style}
                      </p>
                      <strong className="product-price">
                        {money(product.price_mad)}{' '}
                        <small>MAD / {product.unit}</small>
                      </strong>
                      <details>
                        <summary>Product details & source</summary>
                        <dl>
                          <dt>Brand</dt>
                          <dd>{product.brand}</dd>
                          <dt>Source</dt>
                          <dd>{product.source_provider}</dd>
                          <dt>Availability</dt>
                          <dd>{product.availability_status}</dd>
                          <dt>Representation</dt>
                          <dd>Generic dimensional geometry</dd>
                          {product.coverage_m2_per_unit && (
                            <>
                              <dt>Coverage</dt>
                              <dd>
                                {product.coverage_m2_per_unit} m² /{' '}
                                {product.unit}
                              </dd>
                              <dt>Coverage note</dt>
                              <dd>{product.coverage_note}</dd>
                            </>
                          )}
                        </dl>
                        {product.product_url &&
                          product.verified_url &&
                          !product.mock_data && (
                            <a
                              href={product.product_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Verified product page
                            </a>
                          )}
                      </details>
                      <div className="product-card-actions">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            aria-label={`Compare ${product.name}`}
                            checked={comparisonIds.includes(product.id)}
                            disabled={
                              !comparisonIds.includes(product.id) &&
                              comparisonIds.length >= 4
                            }
                            onChange={(event) =>
                              setComparisonIds(
                                event.target.checked
                                  ? [...comparisonIds, product.id]
                                  : comparisonIds.filter(
                                      (id) => id !== product.id,
                                    ),
                              )
                            }
                          />{' '}
                          Compare
                        </label>
                        <button
                          className="secondary-button"
                          disabled={!scene || !roomId || busy}
                          onClick={() => void add(product)}
                        >
                          {replaceId ? 'Replace item' : 'Add to design'}
                          <PlusIcon />
                        </button>
                      </div>
                      <button
                        className="text-button try-room-button"
                        disabled={!scene || !roomId || busy}
                        onClick={() => void add(product, true)}
                      >
                        Try in my room <ArrowRight size={12} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!results.length && (
                <p className="empty-results">
                  No products match these filters. Try a broader search.
                </p>
              )}
            </section>
          </>
        )}
        {section === 'recommendations' && (
          <section className="recommendation-panel">
            <div className="recommendation-intro">
              <Sparkles size={24} />
              <h3>Suggestions for your space</h3>
              <p>
                Hard filters check stored dimensions, available space, style,
                and remaining budget. Suggestions stay separate until you accept
                them.
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={useAI}
                  onChange={(event) => setUseAI(event.target.checked)}
                />{' '}
                Ask the local Furniture and Materials agents to rank and explain
                the eligible products
              </label>
              <button
                className="primary-button"
                disabled={!scene || busy}
                onClick={() =>
                  void perform(async () => {
                    await mutation('recommendations', {
                      room_id: roomId || null,
                      use_ai: useAI,
                    });
                    setNotice('Recommendations ready for review.');
                  })
                }
              >
                {busy
                  ? 'Finding matches…'
                  : useAI
                    ? 'Ask local agents'
                    : 'Find matching products'}
                <Sparkles size={14} />
              </button>
            </div>
            <div className="suggestion-grid">
              {project?.recommendations.map((suggestion) => {
                const product = productMap.get(suggestion.product_id);
                if (!product) return null;
                return (
                  <article className="suggestion-card" key={suggestion.id}>
                    <ProductPreview product={product} />
                    <div>
                      <span className="sample-tag">mock_data</span>
                      <h3>{product.name}</h3>
                      <p>{suggestion.reason}</p>
                      <strong>
                        {money(product.price_mad)} MAD / {product.unit}
                      </strong>
                      <div className="suggestion-actions">
                        {suggestion.status === 'pending' ? (
                          <>
                            <button
                              className="secondary-button"
                              disabled={busy}
                              onClick={() =>
                                void perform(async () => {
                                  await mutation(
                                    `recommendations/${suggestion.id}`,
                                    { accept: true },
                                  );
                                  setNotice(
                                    'Suggestion accepted into the draft.',
                                  );
                                })
                              }
                            >
                              <Check size={14} /> Accept
                            </button>
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() =>
                                void perform(async () => {
                                  await mutation(
                                    `recommendations/${suggestion.id}`,
                                    { accept: false },
                                  );
                                })
                              }
                            >
                              Reject
                            </button>
                          </>
                        ) : (
                          <span className="suggestion-state">
                            {suggestion.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
        {section === 'shopping' && (
          <section className="shopping-panel">
            <div className="shopping-heading">
              <div>
                <h3>Your project shopping list</h3>
                <p>
                  Selections are stored with the design. All current prices are
                  simulated and labelled mock_data.
                </p>
              </div>
              {scene && (
                <div className="export-buttons">
                  <a
                    className="secondary-button"
                    href={`/api/projects/${project!.id}/shopping-list/export?format=csv`}
                    download
                  >
                    <Download size={14} /> CSV
                  </a>
                  <a
                    className="secondary-button"
                    href={`/api/projects/${project!.id}/shopping-list/export?format=pdf`}
                    download
                  >
                    <Download size={14} /> PDF
                  </a>
                </div>
              )}
            </div>
            <div className="shopping-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product / room</th>
                    <th>Quantity</th>
                    <th>Dimensions / coverage</th>
                    <th>Unit price</th>
                    <th>Subtotal</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shopping?.items.map((item) => (
                    <tr key={item.object_id}>
                      <td>
                        <strong>{item.name}</strong>
                        <small>
                          {
                            scene?.rooms.find(
                              (room) => room.id === item.room_id,
                            )?.name
                          }{' '}
                          · {item.price_status}
                        </small>
                        {item.product_url && (
                          <a
                            href={item.product_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Verified product page
                          </a>
                        )}
                      </td>
                      <td>
                        {item.quantity} {item.unit}
                      </td>
                      <td>
                        {item.width_m} × {item.depth_m} × {item.height_m} m
                        {item.area_m2 !== null && (
                          <small>
                            {item.area_m2.toFixed(1)} m² ·{' '}
                            {Math.round((item.waste_fraction || 0) * 100)}%
                            waste
                          </small>
                        )}
                      </td>
                      <td>{money(item.unit_price_mad)} MAD</td>
                      <td>{money(item.subtotal_mad)} MAD</td>
                      <td>
                        <div className="shopping-actions">
                          <button
                            className="icon-button"
                            aria-label={`Replace ${item.name}`}
                            disabled={busy}
                            onClick={() => {
                              setReplaceId(item.object_id);
                              setRoomId(item.room_id);
                              setSection('catalogue');
                              setComparison([]);
                            }}
                          >
                            <ArrowLeftRight size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Remove ${item.name}`}
                            disabled={busy}
                            onClick={() =>
                              void perform(async () => {
                                await mutation('remove-product', {
                                  object_id: item.object_id,
                                });
                              })
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!shopping?.items.length && (
              <p className="empty-results">
                No selected products yet. Add furniture or materials from the
                catalogue.
              </p>
            )}
            {shopping && (
              <div className="shopping-totals">
                <dl>
                  <div>
                    <dt>Confirmed prices</dt>
                    <dd>{money(shopping.confirmed_total_mad)} MAD</dd>
                  </div>
                  <div>
                    <dt>Sample prices</dt>
                    <dd>{money(shopping.sample_total_mad)} MAD</dd>
                  </div>
                  <div>
                    <dt>Other estimates</dt>
                    <dd>{money(shopping.estimated_total_mad)} MAD</dd>
                  </div>
                  <div>
                    <dt>Project estimate</dt>
                    <dd>{money(shopping.total_mad)} MAD</dd>
                  </div>
                  <div>
                    <dt>Declared budget</dt>
                    <dd>{money(shopping.budget_mad)} MAD</dd>
                  </div>
                </dl>
                {shopping.over_budget_mad > 0 && (
                  <div className="form-error">
                    Over budget by {money(shopping.over_budget_mad)} MAD.
                    Replace or remove items before approval.
                    {shopping.alternatives.map((option) => (
                      <button
                        className="secondary-button"
                        key={option.replace_id}
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            await mutation('products', {
                              product_id: option.product_id,
                              room_id: option.room_id,
                              replace_id: option.replace_id,
                              surface: option.surface,
                            });
                          })
                        }
                      >
                        Use {option.name} · save {money(option.saving_mad)} MAD
                      </button>
                    ))}
                  </div>
                )}
                <p className="hint">
                  Excludes shipping, installation, and any unselected finishes.
                  Quantities use stored effective coverage plus your declared
                  waste allowance.
                </p>
              </div>
            )}
          </section>
        )}
      </div>
      <footer className="market-footer">
        <span>
          <Package size={14} /> Local sample catalogue · no commercial feed
          connected
        </span>
        <span>
          {shopping
            ? `${money(shopping.total_mad)} / ${money(shopping.budget_mad)} MAD`
            : 'Create a project to start a shopping list'}
        </span>
      </footer>
    </dialog>
  );
}

function PlusIcon() {
  return <ArrowRight size={13} />;
}
