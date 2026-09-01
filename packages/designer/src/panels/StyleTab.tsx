/**
 * The Style tab: per-component CSS, and the kit properties that are styling.
 *
 * Two ways to write one string. Structured controls for the handful of things
 * most authors change, and a raw field underneath for everything else, both
 * editing the same declarations. Storing them apart would be two sources for
 * one value and a merge nobody can specify.
 *
 * Both, rather than either, because they fail in opposite directions. Raw text
 * alone makes padding a typing exercise and offers nothing to discover; a
 * structured form alone turns every gap in its vocabulary into a wall, and the
 * vocabulary is never finished.
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  indexKit,
  keyScopesFor,
  readDeclaration,
  safeDeclarations,
  setDeclaration,
} from '@formsmith/core'
import type { Device, Kit } from '@formsmith/core'

import type { DesignerApi } from '../store.js'
import { PropRows } from './Properties.js'

/**
 * The controls that earn a widget.
 *
 * Deliberately small, and chosen the way a component property is: by being
 * something a form author changes, not by existing. Anything else is the raw
 * field's job.
 */
const CONTROLS: { name: string; label: string; placeholder: string }[] = [
  { name: 'padding', label: 'Padding', placeholder: '8px, or 8px 16px' },
  { name: 'margin', label: 'Margin', placeholder: '0, or 8px auto' },
  { name: 'text-align', label: 'Align', placeholder: 'start, center, end' },
  { name: 'width', label: 'Width', placeholder: '100%, 320px' },
  { name: 'background', label: 'Background', placeholder: 'var(--brand), #eee' },
  { name: 'border', label: 'Border', placeholder: '1px solid #ccc' },
  { name: 'border-radius', label: 'Radius', placeholder: '6px' },
]

const DEVICE_LABEL: Record<Device, string> = {
  any: 'Every width',
  desktop: 'Desktop only',
  tablet: 'Tablet only',
  mobile: 'Mobile only',
}

export interface StyleTabProps {
  api: DesignerApi
  kit: Kit
  /** Which breakpoint is being edited, which is the canvas's simulated device. */
  device: Device
  onDevice: (next: Device) => void
}

export function StyleTab({ api, kit, device, onDevice }: StyleTabProps): ReactNode {
  const node = api.selectedNode

  if (!node) {
    return (
      <section className="fs-style">
        <p className="fs-empty">Select a component to style it.</p>
      </section>
    )
  }

  const def = indexKit(kit).get(node.type)
  const styleProps = (def?.props ?? []).filter((prop) => prop.section === 'style')
  /*
   * The stored text, if it is text.
   *
   * `node.css` comes out of a document, so the entry for a device can be a
   * number or an object -- and `readDeclaration` walks it as a string, which
   * throws out of the render of the panel somebody opened to repair it. An
   * unreadable entry reads as empty here; the raw box below shows what a person
   * can then overwrite.
   */
  const stored = node.css?.[device]
  const text = typeof stored === 'string' ? stored : ''
  // A style property can be bound to a condition too, and one authored inside a
  // repeater has to be able to name that row's answers.
  const scopes = keyScopesFor(api.document.root, node.key)

  return (
    <section className="fs-style">
      {/*
       * The kit's own styling properties come first: a Stack's gap is a better
       * answer than a hand-written margin, and an author who writes the CSS
       * first will not discover the property afterwards.
       */}
      {styleProps.length > 0 && (
        <>
          <h3 className="fs-style__heading">From this component</h3>
          <PropRows api={api} node={node} schemas={styleProps} scopes={scopes} />
        </>
      )}

      <h3 className="fs-style__heading">Custom CSS</h3>

      <div className="fs-prop-row">
        <label htmlFor="fs-style-device">Applies to</label>
        <div className="fs-prop-row__control">
          <select
            id="fs-style-device"
            value={device}
            onChange={(e) => onDevice(e.target.value as Device)}
          >
            {(['any', 'desktop', 'tablet', 'mobile'] as const).map((name) => (
              <option key={name} value={name}>
                {DEVICE_LABEL[name]}
              </option>
            ))}
          </select>
        </div>
        <p className="fs-prop-row__hint">
          {device === 'any'
            ? 'The base layer, applied at every width. A device overrides it at its own.'
            : 'Overrides the base layer at this width. The canvas is showing it.'}
        </p>
      </div>

      {CONTROLS.map((control) => (
        <DeclarationField
          key={node.key + ':' + device + ':' + control.name}
          control={control}
          value={readDeclaration(text, control.name)}
          onCommit={(next) => {
            /*
             * Through the same refusal the raw box enforces.
             *
             * `RawCss` refuses a block `safeDeclarations` will not emit and says
             * so, and these controls wrote straight past it -- so a brace typed
             * into the Radius field was stored, the renderer then dropped the
             * whole block, and the component lost every other declaration on
             * that layer with nothing on screen explaining why. One sink, one
             * rule.
             */
            const written = setDeclaration(text, control.name, next)
            if (written && !safeDeclarations(written)) return false
            api.setNodeCss(node.key, device, written)
            return true
          }}
        />
      ))}

      <RawCss
        key={node.key + ':' + device}
        value={text}
        onCommit={(next) => api.setNodeCss(node.key, device, next)}
      />
    </section>
  )
}

/**
 * One declaration, committed on blur rather than on every keystroke.
 *
 * The control used to be `value={readDeclaration(...)}` with an `onChange` that
 * wrote straight through, which reads as the obvious controlled input and is
 * the third instance of Trap 10 in this repository. `setDeclaration` parses and
 * normalises, and the parse trims — so the space in `8px auto` was removed as
 * it was typed, the next character landed against `8px`, and the field stored
 * `8pxauto`. Its own placeholder could not be entered into it.
 *
 * The same draft-and-resync shape as `RawCss` below, the JSON editor and the
 * key field. Committing on blur *and* on Enter, because a single-line field is
 * a place people press Enter.
 */
function DeclarationField({
  control,
  value,
  onCommit,
}: {
  control: { name: string; label: string; placeholder: string }
  value: string
  /** Answers whether the value was written. A refusal keeps the typed text. */
  onCommit: (next: string) => boolean
}): ReactNode {
  const [draft, setDraft] = useState(value)
  const [committed, setCommitted] = useState(value)

  /*
   * Re-sync when the document changes underneath, without losing an edit in
   * progress: only the version this control last saw is replaced. Undo, redo,
   * and the raw field rewriting this same declaration all reach here.
   */
  const [refused, setRefused] = useState('')

  if (value !== committed) {
    setCommitted(value)
    setDraft(value)
    /*
     * And the refusal goes with the value it was about.
     *
     * `refused` survived this resync, so a field that had refused `6px}` stayed
     * `aria-invalid` with its alert on screen after an undo, a redo or an edit
     * through the raw box put a *valid* value back. The control then said the
     * text in it was wrong when it was not -- and a message that outlives its
     * cause is how somebody learns to ignore the messages.
     */
    setRefused('')
  }

  const commit = (): void => {
    if (draft === committed) {
      /*
       * Nothing to write, but there may still be something to withdraw.
       *
       * The refusal is about the text in the box, and the text in the box is
       * back to the value that was written -- so refuse `6px}`, delete the
       * brace, blur, and this returned early with the alert still up and the
       * field still `aria-invalid`, describing text nobody could see any more.
       * The only way out was to type a *different* valid value, because that
       * is the one path that reaches the write below.
       */
      setRefused('')
      return
    }

    /*
     * The refusal is shown, and the typed text is kept.
     *
     * This set `committed` to `draft` and called `onCommit`, which returns
     * early when `safeDeclarations` refuses the block -- so `api.setNodeCss`
     * was never called, the `value` prop did not move, and the re-render
     * overwrote `draft` with the stale value. Type `6px}` into Radius and press
     * Enter: the field blanked back to its previous value, with no reason given
     * and no chance to delete the stray character.
     *
     * The raw box beside it explains the identical refusal, which is what makes
     * this one hard to defend: one sink, one rule, and only one of the two
     * controls told the author anything.
     */
    const ok = onCommit(draft)
    if (!ok) {
      setRefused(
        'That value cannot be written as CSS. Braces, angle brackets, at-signs, comments and ' +
          'backslashes are refused, and quotes have to be closed.',
      )
      return
    }

    setRefused('')
    setCommitted(draft)
  }

  return (
    <div className="fs-prop-row">
      <label htmlFor={'fs-style-' + control.name}>{control.label}</label>
      <div className="fs-prop-row__control">
        <input
          id={'fs-style-' + control.name}
          type="text"
          placeholder={control.placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          aria-invalid={refused ? true : undefined}
          aria-describedby={refused ? 'fs-style-' + control.name + '-error' : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') {
              setDraft(value)
              setRefused('')
            }
          }}
        />
        {/*
          Mounted when there is something to say, rather than a `role="alert"`
          added to an element that is already there.

          A role applied to a live element is unreliably announced -- assistive
          technology watches a live region for *mutations*, and changing what an
          element is is not one it can be relied on to report. So the one
          control in this panel that refused input silently would also have been
          the one whose refusal might not be spoken. Every other error in this
          slice mounts a new element; this now does too.
        */}
        {refused && (
          <p id={'fs-style-' + control.name + '-error'} className="fs-prop-row__error" role="alert">
            {refused}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * The raw declarations, committed on blur.
 *
 * A draft rather than a controlled value derived from the parse, for the reason
 * the options box in the condition editor learned: re-deriving the text on
 * every keystroke normalises away what is being typed before it is finished.
 */
function RawCss({
  value,
  onCommit,
}: {
  value: string
  onCommit: (next: string) => void
}): ReactNode {
  const [draft, setDraft] = useState(value)
  const [committed, setCommitted] = useState(value)

  // Re-sync when the document changes underneath, without losing an edit in
  // progress. Undo, redo, and a structured control above all reach here.
  if (value !== committed) {
    setCommitted(value)
    setDraft(value)
  }

  const refused = draft.trim() !== '' && safeDeclarations(draft) === undefined

  return (
    <div className="fs-prop-row">
      <label htmlFor="fs-style-raw">CSS</label>
      <div className="fs-prop-row__control">
        <textarea
          id="fs-style-raw"
          className="fs-code__area"
          rows={5}
          spellCheck={false}
          placeholder="padding: 8px;&#10;color: var(--brand);"
          aria-invalid={refused ? true : undefined}
          aria-describedby="fs-style-raw-hint"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            /*
             * Refused text stays in the box and out of the document.
             *
             * It used to be committed anyway, with the message beside it saying
             * it would not be applied -- so the document carried declarations
             * the renderer drops, which is the "worst of both" this row's own
             * comment warns about, and a host reading `node.css` for itself
             * would have got the unsanitised string. The draft is kept so the
             * stray brace can be taken out rather than retyped, which is the
             * same bargain `KeyField` makes with a name that is already used.
             */
            if (refused) return
            setCommitted(draft)
            onCommit(draft)
          }}
        />
      </div>
      <p
        id="fs-style-raw-hint"
        className={'fs-prop-row__hint' + (refused ? ' is-error' : '')}
        {...(refused ? { role: 'alert' as const } : {})}
      >
        {refused
          ? 'Declarations only. A brace, an at-rule or a < would let this styling leave the component, so it will not be applied.'
          : 'Declarations only, applied to this component. Selectors cannot reach inside it.'}
      </p>
    </div>
  )
}
