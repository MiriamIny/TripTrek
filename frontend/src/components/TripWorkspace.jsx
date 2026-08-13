import { useCallback, useEffect, useRef, useState } from 'react'
import { tripApiFetch } from '../api/tripApi'
import './TripWorkspace.css'

const EMPTY_WORKSPACE = { notes: '', todos: [], packingItems: [] }

const TOOLS = {
  notes: { label: 'Notes', field: 'notes' },
  todos: { label: 'To-do', field: 'todos' },
  packing: { label: 'Packing', field: 'packingItems' },
}

const makeId = () => (
  globalThis.crypto?.randomUUID?.()
  || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`
)

function ToolIcon({ tool }) {
  if (tool === 'notes') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6V3Z" /><path d="M15 3v4h4M9 11h6M9 15h6" /></svg>
  }
  if (tool === 'todos') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 2 2 3-4M11 7h9M4 14l2 2 3-4M11 14h9M11 20h9" /></svg>
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M7 11v6M17 11v6M3 13h18" /></svg>
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
}

function DeleteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /></svg>
}

const workspacePath = (trip) => {
  const query = new URLSearchParams({ tripId: trip.id })
  if (trip.ownerId) query.set('ownerId', trip.ownerId)
  return `tripWorkspace?${query}`
}

export default function TripWorkspace({ trip, canEdit }) {
  const [activeTool, setActiveTool] = useState(null)
  const [workspace, setWorkspace] = useState(EMPTY_WORKSPACE)
  const [newItem, setNewItem] = useState('')
  const [loading, setLoading] = useState(false)
  const [saveState, setSaveState] = useState('idle')
  const [error, setError] = useState('')
  const notesReady = useRef(false)
  const savedNotes = useRef('')

  useEffect(() => {
    let ignore = false
    notesReady.current = false
    setLoading(true)
    setError('')
    tripApiFetch(workspacePath(trip))
      .then((response) => response.json())
      .then((data) => {
        if (ignore) return
        const next = {
          notes: typeof data.notes === 'string' ? data.notes : '',
          todos: Array.isArray(data.todos) ? data.todos : [],
          packingItems: Array.isArray(data.packingItems) ? data.packingItems : [],
        }
        savedNotes.current = next.notes
        setWorkspace(next)
        notesReady.current = true
      })
      .catch((loadError) => {
        if (!ignore) setError(loadError.message || 'Unable to load your trip tools.')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => { ignore = true }
  }, [trip])

  const saveField = useCallback(async (field, value) => {
    setSaveState('saving')
    setError('')
    try {
      await tripApiFetch(workspacePath(trip), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (field === 'notes') savedNotes.current = value
      setSaveState('saved')
      window.setTimeout(() => setSaveState((current) => (current === 'saved' ? 'idle' : current)), 1800)
      return true
    } catch (saveError) {
      setSaveState('error')
      setError(saveError.message || 'Unable to save that change.')
      return false
    }
  }, [trip])

  useEffect(() => {
    if (!notesReady.current || !canEdit || workspace.notes === savedNotes.current) return undefined
    setSaveState('saving')
    const timer = window.setTimeout(() => saveField('notes', workspace.notes), 700)
    return () => window.clearTimeout(timer)
  }, [canEdit, saveField, workspace.notes])

  const updateList = async (field, updater) => {
    const previous = workspace[field]
    const next = updater(previous)
    setWorkspace((current) => ({ ...current, [field]: next }))
    const saved = await saveField(field, next)
    if (!saved) setWorkspace((current) => ({ ...current, [field]: previous }))
  }

  const addItem = (event, field) => {
    event.preventDefault()
    const text = newItem.trim()
    if (!text) return
    setNewItem('')
    updateList(field, (items) => [...items, { id: makeId(), text, completed: false }])
  }

  const tool = activeTool ? TOOLS[activeTool] : null
  const items = tool && tool.field !== 'notes' ? workspace[tool.field] : []
  const completedCount = items.filter((item) => item.completed).length

  return (
    <aside className="trip-workspace" aria-label="Trip tools">
      {tool && (
        <section className="trip-workspace-panel" aria-labelledby={`trip-workspace-${activeTool}-title`}>
          <header className="trip-workspace-header">
            <span className={`trip-workspace-header-icon is-${activeTool}`}><ToolIcon tool={activeTool} /></span>
            <div>
              <h2 id={`trip-workspace-${activeTool}-title`}>{tool.label}</h2>
              <p>{canEdit ? 'Saved with this trip' : 'View only'}</p>
            </div>
            <button type="button" className="trip-workspace-close" onClick={() => setActiveTool(null)} aria-label={`Close ${tool.label}`}>
              <CloseIcon />
            </button>
          </header>

          <div className="trip-workspace-body">
            {loading ? (
              <div className="trip-workspace-loading" role="status"><span /> Loading…</div>
            ) : activeTool === 'notes' ? (
              <div className="trip-workspace-notes">
                <label htmlFor="trip-workspace-notes">Trip notes</label>
                <textarea
                  id="trip-workspace-notes"
                  value={workspace.notes}
                  onChange={(event) => setWorkspace((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Confirmation numbers, ideas, reminders…"
                  maxLength={12000}
                  readOnly={!canEdit}
                />
              </div>
            ) : (
              <>
                {canEdit && (
                  <form className="trip-workspace-add" onSubmit={(event) => addItem(event, tool.field)}>
                    <label className="sr-only" htmlFor={`trip-workspace-add-${activeTool}`}>Add {activeTool === 'todos' ? 'a to-do' : 'a packing item'}</label>
                    <input
                      id={`trip-workspace-add-${activeTool}`}
                      value={newItem}
                      onChange={(event) => setNewItem(event.target.value)}
                      placeholder={activeTool === 'todos' ? 'Add a task…' : 'Add an item…'}
                      maxLength={240}
                    />
                    <button type="submit" aria-label={activeTool === 'todos' ? 'Add to-do' : 'Add packing item'}>+</button>
                  </form>
                )}

                {items.length ? (
                  <ul className="trip-workspace-list">
                    {items.map((item) => (
                      <li key={item.id} className={item.completed ? 'is-complete' : ''}>
                        <label>
                          <input
                            type="checkbox"
                            checked={item.completed}
                            disabled={!canEdit}
                            onChange={() => updateList(tool.field, (currentItems) => currentItems.map((candidate) => (
                              candidate.id === item.id ? { ...candidate, completed: !candidate.completed } : candidate
                            )))}
                          />
                          <span className="trip-workspace-check" aria-hidden="true"><svg viewBox="0 0 14 14"><path d="m3 7 2.3 2.4L11 4" /></svg></span>
                          <span>{item.text}</span>
                        </label>
                        {canEdit && (
                          <button
                            type="button"
                            className="trip-workspace-delete"
                            onClick={() => updateList(tool.field, (currentItems) => currentItems.filter((candidate) => candidate.id !== item.id))}
                            aria-label={`Remove ${item.text}`}
                          >
                            <DeleteIcon />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="trip-workspace-empty">
                    <ToolIcon tool={activeTool} />
                    <strong>{activeTool === 'todos' ? 'Nothing on your list yet' : 'Your suitcase is still empty'}</strong>
                    <p>{canEdit ? 'Add the first item above.' : 'No items have been added.'}</p>
                  </div>
                )}
              </>
            )}
          </div>

          <footer className="trip-workspace-footer">
            {activeTool !== 'notes' && items.length > 0 && <span>{completedCount} of {items.length} complete</span>}
            <span className={`trip-workspace-save-state is-${saveState}`} role="status">
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved' : ''}
            </span>
          </footer>
          {error && <p className="trip-workspace-error" role="alert">{error}</p>}
        </section>
      )}

      <div className="trip-workspace-rail">
        {Object.entries(TOOLS).map(([key, item]) => (
          <button
            key={key}
            type="button"
            className={`trip-workspace-tool is-${key}${activeTool === key ? ' is-active' : ''}`}
            onClick={() => {
              setNewItem('')
              setActiveTool((current) => (current === key ? null : key))
            }}
            aria-label={`Open ${item.label}`}
            aria-expanded={activeTool === key}
            data-label={item.label}
          >
            <ToolIcon tool={key} />
            {key !== 'notes' && workspace[item.field].length > 0 && (
              <span>{workspace[item.field].filter((listItem) => !listItem.completed).length}</span>
            )}
          </button>
        ))}
      </div>
    </aside>
  )
}
