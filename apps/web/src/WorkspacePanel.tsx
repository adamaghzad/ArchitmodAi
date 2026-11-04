import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  FolderOpen,
  History,
  X,
} from 'lucide-react';
import { api } from './api';
import StyleSelect from './StyleSelect';
import type { Project, Scene } from './types';
import type { ViewSettings } from './editorTypes';

export type WorkspacePage =
  'projects' | 'brief' | 'versions' | 'exports' | 'settings';
interface Snapshot {
  revision: number;
  approved_at: string | null;
  scene: Scene;
}
interface Props {
  page: WorkspacePage;
  project: Project | null;
  projects: Project[];
  settings: ViewSettings;
  onSettings: (settings: ViewSettings) => void;
  onClose: () => void;
  onProject: (id: string) => void;
  onAction: (route: string, body?: object) => Promise<boolean>;
  onExport: () => void;
  busy: boolean;
}
const titles = {
  projects: 'Your projects',
  brief: 'Design brief',
  versions: 'Project snapshots',
  exports: 'Project exports',
  settings: 'Workspace settings',
};

export default function WorkspacePanel({
  page,
  project,
  projects,
  settings,
  onSettings,
  onClose,
  onProject,
  onAction,
  onExport,
  busy,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null),
    scene = project?.candidate_scene || project?.committed_scene;
  const [budget, setBudget] = useState(scene?.budget_mad || 0),
    [style, setStyle] = useState(scene?.style || 'Warm minimal');
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    if (page !== 'versions' || !project) return;
    let active = true;
    api<Snapshot[]>(`/projects/${project.id}/snapshots`)
      .then((result) => {
        if (active) setSnapshots(result);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [page, project]);
  return (
    <dialog
      ref={ref}
      className="workspace-dialog"
      aria-labelledby="workspace-panel-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">PERSONAL WORKSPACE</span>
          <h2 id="workspace-panel-title">{titles[page]}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close workspace panel"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {page === 'projects' ? (
        <div className="saved-project-grid">
          {projects.length ? (
            projects.map((item) => {
              const saved = item.candidate_scene || item.committed_scene;
              return (
                <button
                  className="saved-project-card"
                  key={item.id}
                  disabled={busy}
                  onClick={() => onProject(item.id)}
                >
                  {saved ? (
                    <svg
                      viewBox={`-.5 -.5 ${saved.width_m + 1} ${saved.depth_m + 1}`}
                      aria-label={`${item.name} plan thumbnail`}
                      role="img"
                    >
                      {saved.rooms.map((room) => (
                        <polygon
                          key={room.id}
                          points={room.polygon
                            .map((point) => point.join(','))
                            .join(' ')}
                          fill={room.color}
                          fillOpacity=".4"
                          stroke="#becdb1"
                          strokeWidth=".06"
                        />
                      ))}
                    </svg>
                  ) : (
                    <FolderOpen size={36} />
                  )}
                  <strong>{item.name}</strong>
                  <span>
                    {item.candidate_scene
                      ? 'Draft'
                      : item.committed_scene
                        ? 'Approved'
                        : 'Imported reference'}{' '}
                    ·{' '}
                    {saved
                      ? `${saved.rooms.length} rooms`
                      : 'Awaiting calibration'}
                  </span>
                  <small>
                    {new Date(item.updated_at).toLocaleDateString()}
                  </small>
                </button>
              );
            })
          ) : (
            <p className="hint">
              No projects yet. Start with New project to create or import a
              floor plan.
            </p>
          )}
        </div>
      ) : !scene && page !== 'settings' ? (
        <p className="hint">Create or open a project to use this panel.</p>
      ) : (
        <>
          {page === 'brief' && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void onAction('brief', { budget_mad: budget, style }).then(
                  (success) => {
                    if (success) onClose();
                  },
                );
              }}
            >
              <fieldset disabled={busy}>
                <h3>{project?.name}</h3>
                <p className="hint">
                  Your brief guides catalogue recommendations. Changes remain a
                  draft until approval.
                </p>
                <div className="form-row">
                  <label>
                    Project budget (MAD)
                    <input
                      type="number"
                      min="0"
                      max="10000000"
                      required
                      value={budget}
                      onChange={(event) =>
                        setBudget(Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    Interior style
                    <StyleSelect value={style} onChange={setStyle} />
                  </label>
                </div>
                <dl className="property-list">
                  <div>
                    <dt>Footprint</dt>
                    <dd>
                      {scene?.width_m.toFixed(2)} × {scene?.depth_m.toFixed(2)}{' '}
                      m
                    </dd>
                  </div>
                  <div>
                    <dt>Rooms</dt>
                    <dd>{scene?.rooms.length}</dd>
                  </div>
                </dl>
                <button className="primary-button" type="submit">
                  <Check size={16} /> Save brief to draft
                </button>
              </fieldset>
            </form>
          )}
          {page === 'versions' && (
            <div className="snapshot-list">
              <p className="hint">
                Approved scenes are saved as snapshots. Restoring creates a
                reviewable draft and preserves the current approved scene.
              </p>
              {snapshots.map((snapshot) => (
                <article key={snapshot.revision}>
                  <History size={20} />
                  <div>
                    <h3>Saved scene · revision {snapshot.revision}</h3>
                    <p>
                      {snapshot.scene.rooms.length} rooms ·{' '}
                      {snapshot.scene.width_m.toFixed(2)} ×{' '}
                      {snapshot.scene.depth_m.toFixed(2)} m
                    </p>
                    <small>
                      {snapshot.approved_at
                        ? new Date(snapshot.approved_at).toLocaleString()
                        : 'Approval time unavailable for this existing scene'}
                    </small>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() =>
                      void onAction(
                        `snapshots/${snapshot.revision}/restore`,
                      ).then((success) => {
                        if (success) onClose();
                      })
                    }
                  >
                    Restore as draft <ArrowRight size={14} />
                  </button>
                </article>
              ))}
              {!snapshots.length && (
                <p className="hint">
                  No approved snapshots yet. Review and approve a draft to save
                  one.
                </p>
              )}
            </div>
          )}
          {page === 'exports' && (
            <div className="export-options">
              <p className="hint">
                Exports use the current draft when one is present, otherwise the
                approved scene.
              </p>
              <button className="secondary-button" onClick={onExport}>
                <ArrowDownToLine size={17} /> Download scene JSON
              </button>
              <a
                className="secondary-button"
                href={`/api/projects/${project?.id}/shopping-list/export?format=csv`}
                download
              >
                <ArrowDownToLine size={17} /> Shopping list CSV
              </a>
              <a
                className="secondary-button"
                href={`/api/projects/${project?.id}/shopping-list/export?format=pdf`}
                download
              >
                <ArrowDownToLine size={17} /> Shopping list PDF
              </a>
            </div>
          )}
          {page === 'settings' && (
            <div className="view-preferences">
              <p className="hint">
                View preferences are saved in this browser. Visibility changes
                do not modify the design or budget.
              </p>
              {(
                [
                  ['grid', 'Construction grid'],
                  ['furniture', 'Furniture visibility'],
                  ['cutaway', 'Cutaway front walls in 3D'],
                  ['ceilings', 'Ceilings in 3D'],
                ] as const
              ).map(([key, label]) => (
                <label className="checkbox-label" key={key}>
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    onChange={(event) =>
                      onSettings({ ...settings, [key]: event.target.checked })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
        </>
      )}
    </dialog>
  );
}
