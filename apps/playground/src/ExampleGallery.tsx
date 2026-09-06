import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { EXAMPLES } from './examples/index.js'
import { ExamplePreview } from './ExamplePreview.js'

export function ExampleGallery({
  activeId,
  onChoose,
}: {
  activeId: string
  onChoose: (id: string) => void
}): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All examples')
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
      >
        <div className="pg-gallery__shell">
          <header className="pg-gallery__header">
            <div>
              <h2 id="pg-gallery-title">Find your starting point.</h2>
              <p id="pg-gallery-description">
                Choose a form to explore, customize, and try in Preview.
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
          <div className="pg-gallery__grid">
            {matches.map((example) => (
              <article
                key={example.id}
                className={
                  'pg-example' + (example.category === 'Adventure' ? ' pg-example--featured' : '')
                }
                aria-labelledby={'pg-example-' + example.id}
              >
                <ExamplePreview document={example.document} />
                <div className="pg-example__top">
                  <span className="pg-eyebrow">{example.category}</span>
                  {activeId === example.id && <span className="pg-example__current">Open now</span>}
                </div>
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
                  Open example
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
            <button type="button" onClick={() => choose('')}>
              Back to your draft
            </button>
          </footer>
        </div>
      </dialog>
    </>
  )
}
