import { useEffect, useRef, useState } from 'react';
import { ArrowRight, FileUp, Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { RoomRequirement } from './types';

export interface ProjectInput {
  name: string;
  mode: 'generate' | 'upload';
  width_m: number;
  depth_m: number;
  budget_mad: number;
  style: string;
  rooms: RoomRequirement[];
  prompt: string;
  use_model: boolean;
  file: File | null;
  page: number;
}

interface Props {
  initialMode: 'generate' | 'upload';
  modelConfigured: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onCreate: (input: ProjectInput) => Promise<void>;
}

export default function ProjectDialog({
  initialMode,
  modelConfigured,
  busy,
  error,
  onClose,
  onCreate,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [input, setInput] = useState<ProjectInput>({
    name: 'Apartment study',
    mode: initialMode,
    width_m: 8,
    depth_m: 6,
    budget_mad: 20000,
    style: 'Warm minimal',
    rooms: [
      { type: 'living', min_area_m2: 16 },
      { type: 'bedroom', min_area_m2: 12 },
      { type: 'kitchen', min_area_m2: 8 },
      { type: 'bathroom', min_area_m2: 4 },
    ],
    prompt: '',
    use_model: false,
    file: null,
    page: 1,
  });
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const changeRoom = (index: number, patch: Partial<RoomRequirement>) =>
    setInput({
      ...input,
      rooms: input.rooms.map((room, i) =>
        i === index ? { ...room, ...patch } : room,
      ),
    });
  return (
    <dialog
      ref={ref}
      className="project-dialog"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onCreate(input);
        }}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">A SPACE TO MAKE YOUR OWN</span>
            <h2 id="dialog-title">Start a new project</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close new project"
          >
            <X size={19} />
          </button>
        </div>
        <div className="mode-picker">
          <button
            type="button"
            className={input.mode === 'generate' ? 'selected' : ''}
            onClick={() => setInput({ ...input, mode: 'generate' })}
            disabled={busy}
          >
            <Sparkles size={17} /> Generate a plan
          </button>
          <button
            type="button"
            className={input.mode === 'upload' ? 'selected' : ''}
            onClick={() => setInput({ ...input, mode: 'upload' })}
            disabled={busy}
          >
            <FileUp size={17} /> Upload a plan
          </button>
        </div>
        <fieldset disabled={busy} className="dialog-fields">
          <label>
            Project name
            <input
              required
              maxLength={100}
              value={input.name}
              onChange={(event) =>
                setInput({ ...input, name: event.target.value })
              }
            />
          </label>
          {input.mode === 'generate' ? (
            <>
              <div className="form-row">
                <label>
                  Width (m)
                  <input
                    type="number"
                    min="3"
                    max="25"
                    step="0.1"
                    required
                    value={input.width_m}
                    onChange={(event) =>
                      setInput({
                        ...input,
                        width_m: Number(event.target.value),
                      })
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
                    value={input.depth_m}
                    onChange={(event) =>
                      setInput({
                        ...input,
                        depth_m: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <div className="section-label">
                <span>Room requirements</span>
                <span className="muted">Minimum area</span>
              </div>
              <div className="room-requirements">
                {input.rooms.map((room, index) => (
                  <div className="room-requirement" key={index}>
                    <select
                      aria-label={`Room ${index + 1} type`}
                      value={room.type}
                      onChange={(event) =>
                        changeRoom(index, {
                          type: event.target.value as RoomRequirement['type'],
                        })
                      }
                    >
                      <option value="living">Living room</option>
                      <option value="bedroom">Bedroom</option>
                      <option value="kitchen">Kitchen</option>
                      <option value="bathroom">Bathroom</option>
                      <option value="office">Office</option>
                    </select>
                    <label className="area-input">
                      <input
                        aria-label={`Room ${index + 1} minimum area`}
                        type="number"
                        min="3"
                        max="400"
                        step="0.5"
                        required
                        value={room.min_area_m2}
                        onChange={(event) =>
                          changeRoom(index, {
                            min_area_m2: Number(event.target.value),
                          })
                        }
                      />
                      <span>m²</span>
                    </label>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove room ${index + 1}`}
                      disabled={input.rooms.length === 1}
                      onClick={() =>
                        setInput({
                          ...input,
                          rooms: input.rooms.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="text-button"
                disabled={input.rooms.length >= 8}
                onClick={() =>
                  setInput({
                    ...input,
                    rooms: [
                      ...input.rooms,
                      { type: 'bedroom', min_area_m2: 10 },
                    ],
                  })
                }
              >
                <Plus size={14} /> Add room
              </button>
              <div className="form-row">
                <label>
                  Interior style
                  <select
                    value={input.style}
                    onChange={(event) =>
                      setInput({ ...input, style: event.target.value })
                    }
                  >
                    <option>Warm minimal</option>
                    <option>Scandinavian</option>
                    <option>Contemporary</option>
                  </select>
                </label>
                <label>
                  Budget (MAD)
                  <input
                    type="number"
                    min="0"
                    max="10000000"
                    required
                    value={input.budget_mad}
                    onChange={(event) =>
                      setInput({
                        ...input,
                        budget_mad: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <details className="brief-details">
                <summary>Interpret a text brief with Qwen</summary>
                <p className="hint">
                  {modelConfigured
                    ? 'Qwen extracts requirements and proposes a room order; the solver calculates the layout. Style guides catalogue ranking.'
                    : 'Set OLLAMA_REQUIREMENTS_MODEL in backend/.env to enable text interpretation. You can generate from the room list now.'}
                </p>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={input.use_model}
                    disabled={!modelConfigured}
                    onChange={(event) =>
                      setInput({ ...input, use_model: event.target.checked })
                    }
                  />{' '}
                  Use text instead of the room list
                </label>
                <textarea
                  aria-label="Design brief"
                  placeholder="A living room, two bedrooms, a kitchen, and a bathroom…"
                  disabled={!input.use_model}
                  required={input.use_model}
                  maxLength={2000}
                  value={input.prompt}
                  onChange={(event) =>
                    setInput({ ...input, prompt: event.target.value })
                  }
                />
              </details>
            </>
          ) : (
            <>
              <label className="file-drop">
                <FileUp size={30} />
                <strong>{input.file?.name || 'Choose your floor plan'}</strong>
                <span>PDF, PNG, or JPG · up to 10 MB</span>
                <input
                  type="file"
                  aria-label="Floor plan file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  required
                  onChange={(event) =>
                    setInput({
                      ...input,
                      file: event.target.files?.[0] || null,
                    })
                  }
                />
              </label>
              <label>
                PDF page
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={input.page}
                  onChange={(event) =>
                    setInput({ ...input, page: Number(event.target.value) })
                  }
                />
              </label>
              <p className="hint">
                Import a reference, then confirm its full footprint dimensions.
                Automated room extraction is not available yet. Crop margins
                before importing for accurate alignment.
              </p>
            </>
          )}
        </fieldset>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="dialog-actions">
          <span className="hint">
            {input.mode === 'generate'
              ? 'A proposal for you to review. Nothing is approved automatically.'
              : 'Your reference stays on this computer.'}
          </span>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy
              ? 'Working…'
              : input.mode === 'generate'
                ? 'Generate layout'
                : 'Import reference'}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </dialog>
  );
}
