import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  Armchair,
  FileText,
  History,
  LayoutDashboard,
  Settings2,
  Undo2,
  Redo2,
  ArrowDownToLine,
  ArrowRight,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  DraftingCompass,
  Expand,
  FileUp,
  FolderOpen,
  Grid2X2,
  Layers3,
  LoaderCircle,
  Minus,
  MousePointer2,
  Plus,
  RotateCcw,
  Sparkles,
  Store,
  X,
} from 'lucide-react';
import { api, post } from './api';
import { area } from './geometry';
import Inspector from './Inspector';
import PlanView from './PlanView';
import ProjectDialog, { type ProjectInput } from './ProjectDialog';
import type { Operation, Product, Project, RenderAuditEntry } from './types';
import Marketplace from './Marketplace';
import WorkspaceToolbar from './WorkspaceToolbar';
import WorkspacePanel from './WorkspacePanel';
import type { WorkspacePage } from './WorkspacePanel';
import type { EditorTool, ViewSettings } from './editorTypes';

const DEFAULT_VIEW: ViewSettings = {
  grid: true,
  cutaway: true,
  ceilings: false,
  furniture: true,
};
const SceneView = lazy(() => import('./SceneView'));

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [modelConfigured, setModelConfigured] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'generate' | 'upload' | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [tab, setTab] = useState<'properties' | 'validation' | 'catalogue'>(
    'properties',
  );
  const [zoom, setZoom] = useState(1);
  const [showReference, setShowReference] = useState(true);
  const [showProjects, setShowProjects] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [marketplace, setMarketplace] = useState(false);
  const [marketContext, setMarketContext] = useState<{
    roomId?: string;
    replaceId?: string;
    section?: 'catalogue' | 'recommendations' | 'shopping';
    kind?: 'furniture' | 'material';
  }>({});
  const [panel, setPanel] = useState<WorkspacePage | null>(null);
  const [tool, setTool] = useState<EditorTool>('select');
  const [fitToken, setFitToken] = useState(0);
  const [aiPreview, setAiPreview] = useState(false);
  const [renderAudit, setRenderAudit] = useState<RenderAuditEntry[]>([]);
  const [settings, setSettings] = useState<ViewSettings>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem('archai-view-settings') || '{}',
      );
      return Object.fromEntries(
        Object.entries(DEFAULT_VIEW).map(([key, value]) => [
          key,
          typeof saved[key] === 'boolean' ? saved[key] : value,
        ]),
      ) as unknown as ViewSettings;
    } catch {
      return DEFAULT_VIEW;
    }
  });
  const changeSettings = (next: ViewSettings) => {
    setSettings(next);
    localStorage.setItem('archai-view-settings', JSON.stringify(next));
  };
  const chooseObject = useCallback((id: string) => {
    setSelected(id);
    setTab('properties');
  }, []);
  const openMarket = (
    roomId?: string,
    replaceId?: string,
    section: 'catalogue' | 'recommendations' | 'shopping' = 'catalogue',
    kind?: 'furniture' | 'material',
  ) => {
    setMarketContext({
      roomId:
        roomId ||
        scene?.rooms.find((room) => room.id === selected)?.id ||
        scene?.furniture.find((item) => item.id === selected)?.room_id ||
        scene?.materials.find((item) => item.id === selected)?.room_id,
      replaceId,
      section,
      kind,
    });
    setMarketplace(true);
  };
  const scene = project?.candidate_scene || project?.committed_scene || null;

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Project[]>('/projects'),
      api<Product[]>('/catalogue'),
      api<{ model_configured: boolean }>('/health'),
    ])
      .then(([saved, catalogue, health]) => {
        if (!active) return;
        setProjects(saved);
        setProducts(catalogue);
        setModelConfigured(health.model_configured);
        setConnected(true);
        const savedId = localStorage.getItem('archai-project');
        const last = saved.find((item) => item.id === savedId);
        if (last) {
          setProject(last);
          setSelected(
            (last.candidate_scene || last.committed_scene)?.rooms[0]?.id ||
              null,
          );
        }
      })
      .catch(() => {
        if (active)
          setError(
            'Cannot connect to the local API. Start both services with npm run dev, then reload.',
          );
      });
    return () => {
      active = false;
    };
  }, []);

  const selectProject = (next: Project) => {
    setProject(next);
    localStorage.setItem('archai-project', next.id);
    setSelected(
      (next.candidate_scene || next.committed_scene)?.rooms[0]?.id || null,
    );
    setView('2d');
    setZoom(1);
    setShowProjects(false);
    setPanel(null);
    setTool('select');
    setAiPreview(false);
  };

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setProjects(await api<Project[]>('/projects'));
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Something went wrong. Please try again.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const create = async (input: ProjectInput) => {
    await run(async () => {
      const created = await post<Project>('/projects', { name: input.name });
      let next: Project;
      try {
        if (input.mode === 'generate') {
          const {
            name: _name,
            mode: _mode,
            file: _file,
            page: _page,
            ...request
          } = input;
          void _name;
          void _mode;
          void _file;
          void _page;
          next = await post<Project>(`/projects/${created.id}/generate-plan`, {
            ...request,
            furnish: Boolean(request.prompt.trim()),
            expected_revision: created.revision,
          });
        } else {
          if (!input.file) throw new Error('Choose a floor plan file first.');
          const form = new FormData();
          form.append('file', input.file);
          form.append('page', String(input.page - 1));
          form.append('expected_revision', String(created.revision));
          next = await api<Project>(`/projects/${created.id}/upload-plan`, {
            method: 'POST',
            body: form,
          });
        }
      } catch (cause) {
        await api(`/projects/${created.id}`, { method: 'DELETE' }).catch(
          () => undefined,
        );
        throw cause;
      }
      selectProject(next);
      setTab('properties');
      setDialog(null);
    });
  };

  const mutate = useCallback(
    async (route: string, fields: object = {}) => {
      if (!project) return false;
      return run(async () => {
        const next = await post<Project>(`/projects/${project.id}/${route}`, {
          expected_revision: project.revision,
          ...fields,
        });
        setProject(next);
        if (next.report && !next.report.valid) setTab('validation');
        setAiPreview(false);
      });
    },
    [project, run],
  );
  const edit = useCallback(
    async (operation: Operation) => {
      await mutate('operations', operation);
    },
    [mutate],
  );
  const recheck = async () => {
    if (!project) return;
    await run(async () => {
      const report = await post<Project['report']>(
        `/projects/${project.id}/validate`,
        { expected_revision: project.revision },
      );
      setProject({ ...project, report });
      setTab('validation');
    });
  };
  const tryProduct = async (
    productId: string,
    roomId: string,
    replaceId?: string,
  ) => {
    const product = products.find((item) => item.id === productId);
    const ok = await mutate('products', {
      product_id: productId,
      room_id: roomId,
      replace_id: replaceId || null,
      surface: product?.category === 'flooring' ? 'floor' : 'walls',
    });
    if (ok) {
      setView('3d');
      setTool((current) => (current === 'measure' ? 'select' : current));
    }
  };
  const exportScene = () => {
    if (!scene || !project) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { project: project.name, revision: project.revision, scene },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'scene'}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const openDialog = (mode: 'generate' | 'upload') => {
    setError('');
    setDialog(mode);
  };
  const explore = () =>
    create({
      name: 'Courtyard apartment',
      mode: 'generate',
      width_m: 10,
      depth_m: 8,
      budget_mad: 20000,
      style: 'Warm minimal',
      prompt: '',
      use_model: false,
      file: null,
      page: 1,
      rooms: [
        { type: 'living', min_area_m2: 22 },
        { type: 'bedroom', min_area_m2: 12 },
        { type: 'bedroom', min_area_m2: 12 },
        { type: 'kitchen', min_area_m2: 10 },
        { type: 'bathroom', min_area_m2: 5 },
      ],
    });

  return (
    <div className="studio-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="ArchAI Studio home">
          <span className="brand-mark">
            <DraftingCompass size={24} strokeWidth={1.5} />
          </span>
          <span>
            ArchAI<span className="brand-light"> Studio</span>
          </span>
        </a>
        <button
          className="workspace-label"
          onClick={() => setPanel('projects')}
          aria-label="Choose workspace project"
        >
          <span className="workspace-dot" />
          Personal workspace
          <ChevronDown size={13} />
        </button>
        <div className="header-actions">
          <button className="text-button" onClick={() => openMarket()}>
            <Store size={16} /> Marketplace
          </button>
          <button
            className="text-button projects-toggle"
            onClick={() => setShowProjects(!showProjects)}
          >
            <FolderOpen size={16} /> Projects
          </button>
          <button
            className="icon-button"
            onClick={() => setShowHelp(!showHelp)}
            aria-label="Workspace help"
          >
            <CircleHelp size={18} />
          </button>
          <details className="account-menu">
            <summary className="avatar" aria-label="Account menu">
              A
            </summary>
            <div>
              <strong>Personal workspace</strong>
              <p>Saved on this computer</p>
              <button onClick={() => setPanel('settings')}>
                Workspace settings
              </button>
              <button onClick={() => setPanel('projects')}>My projects</button>
            </div>
          </details>
        </div>
      </header>
      <aside
        className={`sidebar ${showProjects ? 'mobile-open' : ''}`}
        aria-label="Projects and layers"
      >
        <div className="sidebar-intro">
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h2>Spaces, considered.</h2>
          <p>From a floor plan to a place.</p>
        </div>
        <button
          className="new-project-button"
          onClick={() => openDialog('generate')}
          disabled={busy || !connected}
        >
          <Plus size={17} /> New project <span>＋</span>
        </button>
        <nav className="workspace-navigation" aria-label="Workspace navigation">
          {(
            [
              ['projects', 'Projects', FolderOpen],
              ['workspace', 'Design workspace', LayoutDashboard],
              ['brief', 'Design brief', FileText],
              ['library', 'Furniture library', Armchair],
              ['market', 'Marketplace', Store],
              ['versions', 'Project versions', History],
              ['exports', 'Exports', ArrowDownToLine],
              ['settings', 'Settings', Settings2],
            ] as const
          ).map(([page, label, Icon]) => (
            <button
              key={page}
              className={
                page ===
                (marketplace
                  ? marketContext.kind === 'furniture'
                    ? 'library'
                    : 'market'
                  : panel || 'workspace')
                  ? 'active'
                  : ''
              }
              aria-current={
                page ===
                (marketplace
                  ? marketContext.kind === 'furniture'
                    ? 'library'
                    : 'market'
                  : panel || 'workspace')
                  ? 'page'
                  : undefined
              }
              onClick={() => {
                if (page === 'workspace') {
                  setPanel(null);
                  setShowProjects(false);
                } else if (page === 'library' || page === 'market') {
                  setPanel(null);
                  openMarket(
                    undefined,
                    undefined,
                    'catalogue',
                    page === 'library' ? 'furniture' : undefined,
                  );
                } else setPanel(page);
              }}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-section-title">
          <span>RECENT PROJECTS</span>
          <span>{projects.length.toString().padStart(2, '0')}</span>
        </div>
        <div className="project-list">
          {projects.length ? (
            projects.map((item) => (
              <button
                key={item.id}
                className={`project-link ${project?.id === item.id ? 'active' : ''}`}
                disabled={busy}
                onClick={() =>
                  void run(async () =>
                    selectProject(await api<Project>(`/projects/${item.id}`)),
                  )
                }
              >
                <FolderOpen size={16} />
                <span>{item.name}</span>
                {project?.id === item.id && <span className="active-dot" />}
              </button>
            ))
          ) : (
            <p className="sidebar-empty">Your next space starts here.</p>
          )}
        </div>
        {scene && (
          <>
            <div className="sidebar-section-title">
              <span>SCENE LAYERS</span>
              <Layers3 size={13} />
            </div>
            <div className="layer-list">
              {scene.rooms.map((room) => (
                <button
                  key={room.id}
                  className={selected === room.id ? 'selected' : ''}
                  onClick={() => {
                    setSelected(room.id);
                    setTab('properties');
                  }}
                >
                  <span
                    className="layer-color"
                    style={{ background: room.color }}
                  />
                  <span>{room.name}</span>
                  <small>{area(room.polygon).toFixed(1)}</small>
                </button>
              ))}
            </div>
            <div className="scene-object-count">
              <span>{scene.walls.length} walls</span>
              <span>{scene.openings.length} openings</span>
            </div>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="local-label">
            <span className={`connection-dot ${connected ? 'online' : ''}`} />
            {connected
              ? 'Local workspace connected'
              : 'Connecting to local API'}
          </div>
          <p>Concept design. Human judgment.</p>
        </div>
      </aside>
      <main className="workspace">
        <div className="project-topline">
          <div className="breadcrumbs">
            <span>Projects</span>
            <ChevronRight size={13} />
            <strong>{project?.name || 'Your next space'}</strong>
            {project && (
              <span
                className={`status-pill ${project.candidate_scene ? 'draft' : ''}`}
              >
                {project.candidate_scene
                  ? 'Draft'
                  : project.committed_scene
                    ? 'Approved'
                    : 'Reference'}
              </span>
            )}
          </div>
          <div className="project-actions">
            <button
              className="icon-button"
              aria-label="Undo last change"
              title="Undo"
              disabled={!project?.undo_stack?.length || busy}
              onClick={() => void mutate('undo')}
            >
              <Undo2 size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Redo last change"
              title="Redo"
              disabled={!project?.redo_stack?.length || busy}
              onClick={() => void mutate('redo')}
            >
              <Redo2 size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Export scene JSON"
              disabled={!scene || busy}
              onClick={exportScene}
            >
              <ArrowDownToLine size={17} />
            </button>
            {project?.candidate_scene && (
              <button
                className="icon-button"
                aria-label="Discard draft"
                onClick={() => void mutate('discard')}
                disabled={busy}
              >
                <RotateCcw size={16} />
              </button>
            )}
            <button
              className="primary-button approve-button"
              disabled={
                !project?.candidate_scene || !project.report?.valid || busy
              }
              onClick={() => void mutate('approve')}
            >
              <Check size={15} /> Approve draft
            </button>
          </div>
        </div>
        {error && !dialog && (
          <div role="alert" className="error-banner">
            {error}
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError('')}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {showHelp && (
          <div className="help-banner">
            <div>
              <strong>One scene. Two ways to see it.</strong>
              <p>
                Generate a layout or import a reference. Select objects to
                inspect and correct them, run furnishing, review checks, then
                approve. Drafts save locally. In 3D, drag to orbit and scroll to
                zoom.
              </p>
            </div>
            <button
              className="icon-button"
              aria-label="Close help"
              onClick={() => setShowHelp(false)}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className={`editor-layout ${project ? '' : 'without-inspector'}`}>
          <section className="canvas-panel" aria-label="Design workspace">
            <div className="canvas-topline">
              <div>
                <span className="eyebrow">
                  {scene
                    ? 'DESIGN WORKSPACE'
                    : project?.reference
                      ? 'IMPORTED REFERENCE'
                      : 'THE BEGINNING OF SOMETHING'}
                </span>
                <h1>
                  {scene
                    ? 'Every detail, in perspective.'
                    : project?.reference
                      ? 'Give your plan a scale.'
                      : 'Make room for your ideas.'}
                </h1>
                <p className="canvas-description">
                  {scene
                    ? 'Design, refine, and furnish your space with precision.'
                    : 'Bring your ideas into perspective.'}
                </p>
              </div>
              {scene && (
                <div
                  className="view-toggle"
                  role="group"
                  aria-label="Scene view"
                >
                  <button
                    className={view === '2d' ? 'active' : ''}
                    aria-pressed={view === '2d'}
                    onClick={() => setView('2d')}
                  >
                    <Grid2X2 size={14} /> 2D plan
                  </button>
                  <button
                    className={view === '3d' ? 'active' : ''}
                    aria-pressed={view === '3d'}
                    onClick={() => setView('3d')}
                  >
                    <Box size={14} /> 3D view
                  </button>
                </div>
              )}
            </div>
            {scene && (
              <WorkspaceToolbar
                tool={tool}
                onTool={setTool}
                view={view}
                settings={settings}
                onSettings={changeSettings}
                busy={busy}
              />
            )}
            {scene && aiPreview && project?.candidate_scene && (
              <div className="proposal-review" role="status">
                <div>
                  <strong>AI furnishing proposal</strong>
                  <p>
                    {scene.furniture.length} catalogue items ·{' '}
                    {project.report?.valid
                      ? 'Geometry and budget checks passed'
                      : 'Review the reported issues'}{' '}
                    · Review before approving.
                  </p>
                </div>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void mutate('undo')}
                >
                  Reject proposal
                </button>
                <button
                  className="primary-button"
                  disabled={busy || !project.report?.valid}
                  onClick={() => void mutate('approve')}
                >
                  Approve proposal
                </button>
              </div>
            )}
            <div
              className={`viewport ${scene ? 'has-scene' : ''} ${settings.grid ? '' : 'hide-grid'}`}
            >
              {scene ? (
                <>
                  {view === '2d' && (
                    <div className="viewport-corner">
                      <span className="north-arrow">↑</span>
                      <span>PLAN UP</span>
                    </div>
                  )}
                  {view === '2d' ? (
                    <PlanView
                      key={`${project?.id}-${fitToken}`}
                      scene={scene}
                      tool={tool}
                      onEdit={edit}
                      onZoom={setZoom}
                      busy={busy}
                      showFurniture={settings.furniture}
                      reference={project?.reference || null}
                      products={products}
                      selected={selected}
                      onSelect={chooseObject}
                      zoom={zoom}
                      showReference={showReference}
                      perception={project?.perception || null}
                    />
                  ) : (
                    <Suspense
                      fallback={
                        <div className="viewport-loading">
                          <LoaderCircle className="spin" /> Loading 3D view…
                        </div>
                      }
                    >
                      <SceneView
                        scene={scene}
                        products={products}
                        selected={selected}
                        onSelect={chooseObject}
                        onEdit={edit}
                        tool={tool}
                        busy={busy}
                        settings={settings}
                        onAudit={setRenderAudit}
                      />
                    </Suspense>
                  )}
                  {view === '2d' && (
                    <div className="canvas-tools">
                      <span
                        className="tool-selected"
                        aria-label="Selection mode"
                      >
                        <MousePointer2 size={17} />
                      </span>
                      <span className="tool-divider" />
                      <button
                        className="icon-button"
                        disabled={busy}
                        aria-label="Zoom out"
                        onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                      >
                        <Minus size={16} />
                      </button>
                      <span className="zoom-level">
                        {view === '2d' ? `${Math.round(zoom * 100)}%` : 'Orbit'}
                      </span>
                      <button
                        className="icon-button"
                        disabled={busy}
                        aria-label="Zoom in"
                        onClick={() => setZoom(Math.min(2, zoom + 0.1))}
                      >
                        <Plus size={16} />
                      </button>
                      <span className="tool-divider" />
                      <button
                        className="icon-button"
                        disabled={busy}
                        aria-label="Fit plan to view"
                        onClick={() => {
                          setZoom(1);
                          setFitToken((token) => token + 1);
                        }}
                      >
                        <Expand size={16} />
                      </button>
                    </div>
                  )}
                  <span className="scale-caption">
                    {scene.width_m.toFixed(1)} × {scene.depth_m.toFixed(1)} m
                    <span />
                    Metric scene
                  </span>
                </>
              ) : project?.reference ? (
                <div className="reference-preview">
                  <svg
                    role="img"
                    aria-label="Imported floor plan reference awaiting scale calibration"
                    viewBox={`0 0 ${project.reference.width_px} ${project.reference.height_px}`}
                  >
                    <image
                      href={project.reference.url}
                      width={project.reference.width_px}
                      height={project.reference.height_px}
                    />
                    {project.perception?.wall_candidates.map((line, index) => (
                      <line
                        key={index}
                        x1={line[0][0]}
                        y1={line[0][1]}
                        x2={line[1][0]}
                        y2={line[1][1]}
                        stroke="#dc733b"
                        strokeWidth={Math.max(
                          1,
                          project.reference!.width_px / 500,
                        )}
                      />
                    ))}
                  </svg>
                  <span>
                    {project.reference.filename} · page{' '}
                    {project.reference.page + 1}
                  </span>
                </div>
              ) : (
                <div className="welcome">
                  <div className="architectural-glyph" aria-hidden="true">
                    <div className="glyph-dimension">
                      A SPACE FOR POSSIBILITY
                    </div>
                    <svg viewBox="0 0 320 210" fill="none">
                      <path
                        d="M48 175V45h222v130H48Z M180 45v85h90 M48 120h80v55 M180 130v45"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <path
                        d="M128 120h20 M180 130h24"
                        stroke="#1a241e"
                        strokeWidth="5"
                      />
                      <path
                        d="M128 120v20a20 20 0 0 0 20-20 M204 130v20a20 20 0 0 0 20-20"
                        stroke="currentColor"
                        strokeOpacity=".5"
                      />
                      <path
                        d="M38 28h242 M30 37v146 M48 21v14 M270 21v14"
                        stroke="currentColor"
                        strokeOpacity=".25"
                      />
                      <rect
                        x="65"
                        y="57"
                        width="74"
                        height="30"
                        rx="3"
                        fill="currentColor"
                        fillOpacity=".06"
                        stroke="currentColor"
                        strokeOpacity=".4"
                      />
                      <rect
                        x="212"
                        y="60"
                        width="39"
                        height="52"
                        rx="3"
                        fill="currentColor"
                        fillOpacity=".06"
                        stroke="currentColor"
                        strokeOpacity=".4"
                      />
                      <path
                        d="M216 75h31"
                        stroke="currentColor"
                        strokeOpacity=".25"
                      />
                    </svg>
                    <span className="glyph-dot" />
                  </div>
                  <span className="eyebrow">
                    YOUR IDEAS. A NEW PERSPECTIVE.
                  </span>
                  <h2>
                    Good spaces start
                    <br />
                    with a clear plan.
                  </h2>
                  <p>
                    Bring a floor plan, or build from a brief.
                    <br />
                    Explore the space. Make it your own.
                  </p>
                  <div className="start-options">
                    <button
                      onClick={() => openDialog('generate')}
                      disabled={busy || !connected}
                    >
                      <span className="start-icon">
                        <Sparkles size={21} />
                      </span>
                      <strong>Generate a plan</strong>
                      <span>Start with your room requirements</span>
                      <ArrowRight size={17} />
                    </button>
                    <button
                      onClick={() => openDialog('upload')}
                      disabled={busy || !connected}
                    >
                      <span className="start-icon">
                        <FileUp size={21} />
                      </span>
                      <strong>Upload a plan</strong>
                      <span>Bring a PDF, PNG, or JPG reference</span>
                      <ArrowRight size={17} />
                    </button>
                  </div>
                  <button
                    className="text-button sample-link"
                    disabled={busy || !connected}
                    onClick={() => void explore()}
                  >
                    Or explore a sample project <ArrowRight size={13} />
                  </button>
                </div>
              )}
              {busy && (
                <div className="busy-indicator" role="status">
                  <LoaderCircle size={16} className="spin" /> Working on your
                  space…
                </div>
              )}
            </div>
            {scene && (
              <div className="design-actions">
                <div>
                  <span className="sparkle-badge">
                    <Sparkles size={18} />
                  </span>
                  <div>
                    <strong>A place for everything.</strong>
                    <p>Find furniture that fits your space and budget.</p>
                  </div>
                </div>
                <div className="furnishing-actions">
                  <button
                    className="secondary-button"
                    onClick={() => void mutate('design-interior')}
                    disabled={busy || !project?.report?.valid}
                  >
                    Furnish space <ArrowRight size={14} />
                  </button>
                  <button
                    className="primary-button"
                    disabled={
                      busy || !project?.report?.valid || !modelConfigured
                    }
                    onClick={() =>
                      void mutate('design-interior', { use_ai: true }).then(
                        (success) => {
                          if (success) setAiPreview(true);
                        },
                      )
                    }
                  >
                    <Sparkles size={16} /> Auto-furnish with AI
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      openMarket(undefined, undefined, 'recommendations')
                    }
                  >
                    Match products
                  </button>
                </div>
              </div>
            )}
            {project?.reference && scene && (
              <label className="reference-toggle checkbox-label">
                <input
                  type="checkbox"
                  checked={showReference}
                  onChange={(event) => setShowReference(event.target.checked)}
                />{' '}
                Show imported reference · calibrated outline, not detected
                geometry
              </label>
            )}
          </section>
          {project && (
            <Inspector
              renderAudit={view === '3d' ? renderAudit : []}
              key={project.id}
              project={project}
              scene={scene}
              products={products}
              selected={selected}
              busy={busy}
              onEdit={edit}
              onSelect={chooseObject}
              onMarketplace={openMarket}
              onTryProduct={tryProduct}
              onRecheck={recheck}
              onAnalyze={async () => {
                await mutate('analyze-plan');
              }}
              onRepair={async () => {
                await mutate('repair');
              }}
              onCalibrate={async (width_m, depth_m, scale_confirmed) => {
                await mutate('calibrate', {
                  width_m,
                  depth_m,
                  scale_confirmed,
                });
              }}
              tab={tab}
              setTab={setTab}
            />
          )}
        </div>
        <footer className="statusbar">
          <span>
            <span className={`connection-dot ${connected ? 'online' : ''}`} />
            {busy
              ? 'Saving changes…'
              : project
                ? project.candidate_scene
                  ? 'Draft saved locally'
                  : project.committed_scene
                    ? 'Approved snapshot saved locally'
                    : project.reference
                      ? 'Reference saved locally'
                      : 'Project saved locally'
                : 'Ready when you are'}
          </span>
          <div>
            {scene && (
              <>
                <span>{scene.rooms.length} rooms</span>
                <span>{scene.furniture.length} objects</span>
                <span>
                  {(scene.width_m * scene.depth_m).toFixed(1)} m² footprint
                </span>
              </>
            )}
            <span>Concept design</span>
          </div>
        </footer>
      </main>
      {panel && (
        <WorkspacePanel
          key={`${panel}-${project?.id}`}
          page={panel}
          project={project}
          projects={projects}
          settings={settings}
          onSettings={changeSettings}
          onClose={() => setPanel(null)}
          onProject={(id) =>
            void run(async () =>
              selectProject(await api<Project>(`/projects/${id}`)),
            )
          }
          onAction={mutate}
          onExport={exportScene}
          busy={busy}
        />
      )}
      {marketplace && (
        <Marketplace
          project={project}
          products={products}
          initialRoomId={marketContext.roomId}
          initialReplaceId={marketContext.replaceId}
          initialSection={marketContext.section}
          initialKind={marketContext.kind}
          onClose={() => setMarketplace(false)}
          onPreview={() => {
            setMarketplace(false);
            setView('3d');
            setTool((current) => (current === 'measure' ? 'select' : current));
          }}
          onChange={(next) => {
            setAiPreview(false);
            setProject(next);
            setProjects((previous) =>
              previous.map((item) => (item.id === next.id ? next : item)),
            );
          }}
        />
      )}
      {dialog && (
        <ProjectDialog
          initialMode={dialog}
          modelConfigured={modelConfigured}
          busy={busy}
          error={error}
          onClose={() => {
            setDialog(null);
            setError('');
          }}
          onCreate={create}
        />
      )}
    </div>
  );
}
