import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { EXAMPLES } from './examples/index.js'

export function ExampleGallery({
  activeId,
  onChoose,
  onReset,
}: {
  activeId: string
  onChoose: (id: string) => void
  onReset: () => void
}): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All examples')
  const [confirmReset, setConfirmReset] = useState(false)
  const cancelReset = useRef<HTMLButtonElement>(null)
  const resetButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (confirmReset) cancelReset.current?.focus()
  }, [confirmReset])
  const matches = EXAMPLES.filter(
    (example) =>
      (category === 'All examples' || example.category === category) &&
      [example.title, example.description, ...example.features]
        .join(' ')
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  )
  const choose = (id: string): void => {
    onChoose(id)
    dialog.current?.close()
  }

  return (
    <>
      <button
        className="pg-examples-button"
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        Examples <span>{EXAMPLES.length}</span>
      </button>
      <dialog
        ref={dialog}
        className="pg-gallery"
        aria-labelledby="pg-gallery-title"
        aria-describedby="pg-gallery-description"
        onClose={() => setConfirmReset(false)}
      >
        <div className="pg-gallery__shell">
          <header className="pg-gallery__header">
            <div>
              <p className="pg-eyebrow">Made with Formsmith</p>
              <h2 id="pg-gallery-title">Find your starting point.</h2>
              <p id="pg-gallery-description">
                Explore real forms, try them in Preview, and make them your own.
              </p>
            </div>
            <button
              className="pg-gallery__close"
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close examples"
            >
              ×
            </button>
          </header>
          <div className="pg-gallery__filters">
            <label className="pg-gallery__search">
              Search examples
              <input
                type="search"
                placeholder="Try “repeaters” or “feedback”"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label>
              Category
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {['All examples', 'Everyday', 'Work', 'Community', 'Adventure'].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="pg-gallery__results" role="status">
            {matches.length} {matches.length === 1 ? 'example' : 'examples'}
          </div>
          {confirmReset && (
            <div className="pg-gallery__reset">
              <p role="alert">
                Reset this example to its original design? Your edits to this example will be
                replaced.
              </p>
              <button
                ref={cancelReset}
                type="button"
                onClick={() => {
                  setConfirmReset(false)
                  resetButton.current?.focus()
                }}
              >
                Cancel reset
              </button>
              <button
                type="button"
                onClick={() => {
                  onReset()
                  dialog.current?.close()
                }}
              >
                Reset design
              </button>
            </div>
          )}
          <div className="pg-gallery__grid">
            {matches.map((example) => (
              <article
                key={example.id}
                className={
                  'pg-example' + (example.category === 'Adventure' ? ' pg-example--featured' : '')
                }
                aria-labelledby={'pg-example-' + example.id}
              >
                <div className="pg-example__top">
                  <span className="pg-eyebrow">{example.category}</span>
                  {activeId === example.id && <span className="pg-example__current">Open now</span>}
                </div>
                {example.category === 'Adventure' && (
                  <svg
                    className="pg-example__die"
                    viewBox="0 0 100 110"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M50 4 94 29v52L50 106 6 81V29Zm0 0L25 70l69-41M6 29l69 41L50 4M6 81l19-11 25 36 25-36 19 11M25 70h50"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <text
                      x="50"
                      y="58"
                      textAnchor="middle"
                      fill="currentColor"
                      stroke="none"
                      fontSize="23"
                      fontFamily="Georgia, serif"
                    >
                      20
                    </text>
                  </svg>
                )}
                <h3 id={'pg-example-' + example.id}>{example.title}</h3>
                <p>{example.description}</p>
                <ul className="pg-example__features" aria-label="Highlights">
                  {example.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => choose(example.id)}
                  aria-label={'Open ' + example.title}
                >
                  Open example <span aria-hidden="true">→</span>
                </button>
              </article>
            ))}
            {matches.length === 0 && (
              <div className="pg-gallery__empty">
                <h3>No examples found</h3>
                <p>Try a different search or category.</p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    setCategory('All examples')
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
          <footer className="pg-gallery__footer">
            <p>
              Each example keeps its own design edits in this browser. Preview answers are
              temporary.
            </p>
            {activeId && (
              <button ref={resetButton} type="button" onClick={() => setConfirmReset(true)}>
                Reset this example
              </button>
            )}
            <button type="button" onClick={() => choose('')}>
              Back to your draft
            </button>
          </footer>
        </div>
      </dialog>
    </>
  )
}
