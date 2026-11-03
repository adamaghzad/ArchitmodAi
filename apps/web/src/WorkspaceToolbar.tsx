import {
  Eye,
  Grid3X3,
  Hand,
  MousePointer2,
  Move,
  RotateCw,
  Ruler,
} from 'lucide-react';
import type { EditorTool, ViewSettings } from './editorTypes';

export default function WorkspaceToolbar({
  tool,
  onTool,
  view,
  settings,
  onSettings,
  busy,
}: {
  tool: EditorTool;
  onTool: (tool: EditorTool) => void;
  view: '2d' | '3d';
  settings: ViewSettings;
  onSettings: (settings: ViewSettings) => void;
  busy: boolean;
}) {
  const tools = [
    ['select', 'Select objects', MousePointer2],
    ['pan', 'Pan view', Hand],
    ['move', 'Move furniture', Move],
    ['rotate', 'Rotate furniture', RotateCw],
    ['measure', 'Measure distances', Ruler],
  ] as const;
  return (
    <div className="workspace-toolbar">
      <div role="group" aria-label="Design tools">
        {tools.map(([name, label, Icon]) => (
          <button
            key={name}
            className={tool === name ? 'active' : ''}
            aria-label={label}
            title={label}
            aria-pressed={tool === name}
            disabled={busy || (view === '3d' && name === 'measure')}
            onClick={() => onTool(name)}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
      <span>
        {tool === 'move'
          ? 'Drag an object to move it'
          : tool === 'rotate'
            ? 'Click furniture to rotate 90°'
            : tool === 'measure'
              ? 'Pick two points to measure'
              : view === '3d'
                ? 'Orbit · Pan · Explore'
                : 'Select, refine, and plan'}
      </span>
      <div role="group" aria-label="View visibility">
        <button
          aria-label="Toggle construction grid"
          title="Construction grid"
          aria-pressed={settings.grid}
          onClick={() => onSettings({ ...settings, grid: !settings.grid })}
        >
          <Grid3X3 size={17} />
        </button>
        {view === '3d' && (
          <button
            aria-label="Toggle cutaway walls"
            title="Cutaway walls"
            aria-pressed={settings.cutaway}
            onClick={() =>
              onSettings({ ...settings, cutaway: !settings.cutaway })
            }
          >
            <Eye size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
