/**
 * The runtime renderer.
 *
 * Ships independently of the designer, because most consumers embed a form
 * without ever embedding the builder. It knows how to walk a document and
 * resolve property bindings; it knows nothing about which component library
 * draws the result. That comes in as a RendererKit.
 */

import { Component, createContext, useCallback, useContext, useId, useMemo } from 'react'
import type { ComponentType, ErrorInfo, ReactNode } from 'react'
import {
  MAX_ROWS,
  NO_ROWS,
  addressOf,
  dataKeyOf,
  encodeRow,
  evaluateCondition,
  isRowScope,
  isVisible,
  pushRow,
  rowContext,
  rowsOf,
  styleSheetFor,
  unreadableTag,
  valueOf,
} from '@formsmith/core'
import type {
  ComponentNode,
  EvalOptions,
  RowContext,
  RowPath,
  Evaluator,
  FormContext,
  FormData,
  FormDocument,
  FormErrors,
  Device,
  JsonValue,
  PropValue,
} from '@formsmith/core'

export interface NodeRendererProps {
  node: ComponentNode
  /** Property values with bindings already resolved to plain JSON. */
  props: Record<string, JsonValue>
  /**
   * Attributes the kit must spread onto its outermost DOM element. This is how
   * a rendered element maps back to a document node: the designer hit-tests the
   * canvas with `closest('[data-fs-key]')`, and there is nothing else in the DOM
   * that identifies a node. A kit that drops these still renders, but its
   * components cannot be selected on the canvas.
   */
  nodeProps: NodeAttributes
  /** Current value for data-bound components. */
  value: JsonValue | undefined
  /** Validation message for this node, if any. */
  error: string | undefined
  onChange: (value: JsonValue) => void
  children?: ReactNode
}

export interface NodeAttributes {
  'data-fs-key': string
  'data-fs-type': string
  /**
   * Set when this node's `renderWhen` says hide it but the host asked to see it
   * anyway. Absent otherwise, so `[data-fs-hidden]` selects exactly the nodes a
   * person filling in the form would not be shown.
   */
  'data-fs-hidden'?: 'true'
  /**
   * Which rendered form this element belongs to.
   *
   * A key identifies a node inside its document and nowhere else, so two forms
   * on one page both have a `root` and usually an `email`. Per-component CSS is
   * selected by key, so without this the first form's stylesheet styles the
   * second. Per render rather than per document, because the same document
   * rendered twice has the same problem.
   */
  'data-fs-scope': string
  /**
   * Which row of which repeater this element is in: `addresses[1]`.
   *
   * Absent outside a repeater, so every existing selector matches exactly what
   * it matched before. Separate from `data-fs-key` on purpose, because the two
   * are wanted in opposite directions: per-component CSS is authored once and
   * has to reach every row, while a click has to land on one.
   */
  'data-fs-row'?: string
}

export type NodeRenderer = ComponentType<NodeRendererProps>

/** The rendering half of a kit. Its metadata half is a `Kit` from @formsmith/core. */
export interface RendererKit {
  id: string
  renderers: Record<string, NodeRenderer>
  /** Drawn when a document references a type this kit does not implement. */
  fallback?: NodeRenderer
}

interface RenderContext {
  scope: string
  revealHidden: boolean
  kit: RendererKit
  data: FormData
  errors: FormErrors
  translations: Record<string, string>
  /*
   * The evaluator and the host's context travel together, because every call
   * that needs one needs the other: a computed binding is handed the context
   * too, and a condition reads it without an evaluator at all.
   */
  options: EvalOptions
  onChange: (address: string, value: JsonValue) => void
  /** Told when a node's render threw, so a host can put it in its own telemetry. */
  onError: ((error: Error, key: string) => void) | undefined
}

const Ctx = createContext<RenderContext | null>(null)

/*
 * Shared empty objects, so an absent `errors` prop or a language with no
 * translations does not allocate a fresh literal on every render. A new object
 * identity there would change the context value every render and make the
 * useMemo below do nothing at all, re-rendering every node in the form.
 */
const NO_ERRORS: FormErrors = Object.freeze({})
const NO_TRANSLATIONS: Record<string, string> = Object.freeze({})

function useRenderContext(): RenderContext {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('Formsmith renderer components must be used inside <FormRenderer>.')
  return ctx
}

/** Resolve one binding to a plain value. */
export function resolveProp(
  value: PropValue,
  translations: Record<string, string>,
  data: FormData,
  options: EvalOptions = {},
): JsonValue {
  /*
   * A shape check before the switch, which the docblock's "total over an
   * untrusted document" already promised. `props` comes straight from JSON, so
   * a prop holding a string or `null` reached `value.kind` and threw during
   * render -- and a throw during render is what the boundary exists for, which
   * is a heavy answer to a prop that is simply not a binding.
   */
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  switch (value.kind) {
    case 'static':
      return value.value
    case 'i18n':
      /*
       * An own-property read. A plain lookup finds `Object.prototype`, so an
       * `i18n` key of `toString` resolved to a *function* — which React renders
       * as nothing, so the label silently disappeared. The same rule `valueOf`
       * and `readPath` follow everywhere else in this project.
       */
      return Object.hasOwn(translations, value.key)
        ? (translations[value.key] ?? value.key)
        : value.key
    /*
     * Resolves to a boolean. Meant for renderWhen, and harmless anywhere else.
     *
     * `options.row` is passed, and used not to be — so a prop bound to a
     * condition could not read its own row while `renderWhen` could. That makes
     * `rowScopeProblems`' advice, "set the test to read this row", work for one
     * and silently do nothing for the other.
     */
    case 'condition':
      return evaluateCondition(value.condition, data, options.context, options.row)
    case 'computed':
      // No sandbox means no evaluation. Render the field rather than crash the form.
      if (!options.evaluate) return null
      /*
       * And a throw gets the same answer, for the same reason.
       *
       * This was the last render-time evaluator call site in the project without
       * a `try`. `visibility.ts` wraps it and says why; `validation.ts`'s two
       * sites were wrapped in item 8. An expression is authored in a document
       * and the evaluator belongs to the host, so a throw here is neither side's
       * to own -- and it took the form down through a path the boundary did not
       * cover either.
       *
       * `null`, not the boundary's fallback. A single bad prop expression is not
       * a reason to replace a working component with an error box, and this line
       * already promised exactly this answer for a host that supplied no
       * evaluator at all.
       */
      try {
        return options.evaluate(value.expression, data, options.context)
      } catch {
        return null
      }

    /*
     * A kind this code does not have. `null` rather than falling off the end
     * returning `undefined`, so a kit reading this prop gets a JSON value like
     * every other branch does — and, more to the point, so the compiler keeps
     * checking this switch. Without the `default` the closed union is what made
     * the missing tail legal, and a document is not a value the compiler made.
     *
     * `validateDocument` refuses such a document up front. This is what happens
     * to the one that never went through it.
     */
    default:
      return unreadableTag(value, null)
  }
}

function resolveProps(
  node: ComponentNode,
  translations: Record<string, string>,
  data: FormData,
  options: EvalOptions,
): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {}

  /*
   * Guarded, because this is the only layer that was not total over an
   * untrusted document. `Object.entries(5)` is `[]` but `Object.entries(null)`
   * throws, and one node missing `props` used to take the whole form with it.
   */
  const props =
    node.props && typeof node.props === 'object' && !Array.isArray(node.props) ? node.props : {}

  for (const [name, value] of Object.entries(props)) {
    out[name] = resolveProp(value, translations, data, options)
  }
  return out
}

/**
 * Drawn when a document names a component type the kit does not have.
 *
 * It carries the error, and that is not decoration. `validateForm` validates a
 * node whatever its type, so a document naming a missing type still produces
 * errors for it — and a required one blocks the submit. Without this the person
 * filling in the form gets a rejected submit and nothing on screen that says
 * which field, which is the failure this project treats as the worst.
 */
function MissingType({ node, nodeProps, error }: NodeRendererProps): ReactNode {
  return (
    <div
      {...nodeProps}
      role="alert"
      style={{ padding: 8, border: '1px dashed currentColor', opacity: 0.7 }}
    >
      No renderer for component type <code>{node.type}</code> (key <code>{node.key}</code>).
      {error ? <div>{error}</div> : null}
    </div>
  )
}

/**
 * The row the nodes beneath it are being drawn in.
 *
 * A repeater provides one per row. Nothing else touches it, so a form with no
 * repeater never leaves the default and behaves exactly as it did.
 */
const RowCtx = createContext<RowContext | undefined>(undefined)

/**
 * One node's blast radius.
 *
 * A kit is third-party code and a host's evaluator is arbitrary JavaScript, so
 * a render here can throw for reasons this package does not control. React 19
 * unmounts the whole tree when nothing catches that, which means one bad
 * component blanks whatever page the form was embedded in — and there was no
 * boundary anywhere in this repository.
 *
 * Per node rather than around the form, and the difference is not academic. A
 * form-level boundary saves the host's page and still throws away every answer
 * already typed into the fields that were fine. On the canvas it is worse: the
 * component that broke becomes unselectable, and selecting it is the one thing
 * an author needs in order to delete it.
 *
 * So the fallback carries `data-fs-key` and `data-fs-type` itself. The canvas
 * hit-tests with `closest('[data-fs-key]')` and there is nothing else in the DOM
 * that identifies a node; without them a broken component is unreachable from
 * both the canvas and the tree.
 *
 * A class, because that is the only way to catch a render error in React. It is
 * the only one in this repository and it is not a style anybody should copy.
 */
interface NodeBoundaryProps {
  node: ComponentNode
  scope: string
  /**
   * The row the failed node was drawn in, when it was drawn in one.
   *
   * The fallback carried `data-fs-key`, `data-fs-type` and `data-fs-scope` so a
   * broken component stays selectable, and omitted this one -- so inside a
   * repeater the designer could find *a* copy of the node and not the one that
   * broke. It is the fourth symptom of one missing field, and the other three
   * are in the drag pipeline.
   */
  row: string | undefined
  /**
   * Whether the node it wraps is one `renderWhen` hides, drawn anyway.
   *
   * The same reason as `row` above: the canvas selects by these attributes, and
   * `[data-fs-hidden]` is how it tells a revealed node from an ordinary one. A
   * fallback without it reads as a component the form is really asking for.
   */
  hidden: boolean
  onError: ((error: Error, key: string) => void) | undefined
  children: ReactNode
}

class NodeBoundary extends Component<
  NodeBoundaryProps,
  { failed: boolean; forKey: string; forType: string }
> {
  override state = { failed: false, forKey: this.props.node.key, forType: this.props.node.type }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  /**
   * A different node here is a fresh chance to render.
   *
   * `failed` was never cleared, so a component that threw once stayed an error
   * box for the life of the mount. On the canvas that is the ordinary case
   * rather than a rare one: an author writes a property value that breaks a
   * renderer, fixes it, and the box stays -- with nothing to click that would
   * bring the component back, because the box is what replaced it.
   *
   * Keyed on the node's identity rather than on every render, because retrying
   * on each render is an infinite loop when the cause has not gone away. A key
   * or a type change means this boundary is being asked about a different
   * component, which is a different question.
   */
  static getDerivedStateFromProps(
    props: NodeBoundaryProps,
    state: { failed: boolean; forKey: string; forType: string },
  ): { failed: boolean; forKey: string; forType: string } | null {
    if (props.node.key === state.forKey && props.node.type === state.forType) return null
    return { failed: false, forKey: props.node.key, forType: props.node.type }
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    /*
     * Reported rather than logged. A host that is watching wants this in its own
     * telemetry, and React has already written its own copy to the console — so
     * swallowing it here would hide it and logging it again would double it.
     */
    this.props.onError?.(error, this.props.node.key)
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children

    return (
      <div
        role="alert"
        data-fs-key={this.props.node.key}
        data-fs-type={this.props.node.type}
        data-fs-scope={this.props.scope}
        {...(this.props.row === undefined ? {} : { 'data-fs-row': this.props.row })}
        {...(this.props.hidden ? { 'data-fs-hidden': 'true' } : {})}
        /*
         * And a mark saying it is the fallback, which the three attributes above
         * cannot say.
         *
         * They exist so a broken component stays selectable, and that is right.
         * The cost is that every one of them is also emitted by a component that
         * did not render: `test/kit-contract.test.tsx` read `data-fs-key`,
         * `data-fs-type` and `data-fs-scope` to prove a kit spreads `nodeProps`,
         * and a kit renderer replaced by `throw new Error()` satisfied all three
         * from here. Two contract rules could not fail, and nobody noticed
         * because they had been green since before this class existed.
         *
         * So the fallback says which one it is. An assertion that a kit rendered
         * something can now check it is not this.
         */
        data-fs-failed=""
        style={{ padding: 8, border: '1px dashed currentColor', opacity: 0.7 }}
      >
        <code>{this.props.node.type}</code> (key <code>{this.props.node.key}</code>) could not be
        rendered.
      </div>
    )
  }
}

/**
 * One error, read as an own property.
 *
 * A node keyed `constructor` made `errors['constructor']` a function, so `error`
 * was truthy: the kit put the field into an error state and drew a message that
 * renders as nothing. A red field with no text and no way to clear it.
 */
function errorAt(errors: FormErrors, address: string): string | undefined {
  return Object.hasOwn(errors, address) ? errors[address] : undefined
}

/**
 * One row's scope, as a context value that only changes when the row does.
 *
 * The provider used to build its value inline, so every row got a new object
 * identity on every render of the repeater — which defeats the four `useMemo`s
 * in every descendant, because each of them lists `row` in its dependencies.
 * A fifty-row repeater therefore re-ran `isVisible` and `resolveProps` for every
 * node beneath it on every keystroke.
 *
 * A component rather than a `useMemo` at the call site, because the call site is
 * inside a `.map` and a hook cannot go there.
 */
function Row({
  path,
  name,
  index,
  value,
  children,
}: {
  path: RowPath
  name: string
  index: number
  value: JsonValue
  children: ReactNode
}): ReactNode {
  const context = useMemo(
    () => rowContext(pushRow(path, { key: name, index }), value),
    [path, name, index, value],
  )

  return <RowCtx.Provider value={context}>{children}</RowCtx.Provider>
}

/**
 * One node, inside its boundary.
 *
 * The boundary used to wrap `<Component>` and nothing else, so everything below
 * this line -- the kit lookup, `isVisible`, `resolveProps`, the row mapping --
 * ran outside it. A kit is third-party code, which is the premise the boundary's
 * own comment argues from, and `kit.renderers[node.type]` is a property read on
 * an object this package did not write.
 *
 * Split in two so the boundary is a parent rather than a wrapper around the last
 * expression. `RenderNode` now reads the context and returns the boundary;
 * everything else is here, where a throw is caught.
 */
/**
 * A node's children, whatever the document put there.
 *
 * `node.children?.map(...)` assumed an array, while core guards the identical
 * shape everywhere it walks a document -- `Array.isArray(node.children)` appears
 * in `rows.ts`, `context.ts` and `tree.ts`. A document is data, so `children`
 * can be a string, and `.map` on one throws during render.
 */
function childrenOf(node: ComponentNode): ComponentNode[] {
  return Array.isArray(node.children) ? node.children : []
}

function RenderNodeBody({ node }: { node: ComponentNode }): ReactNode {
  const ctx = useRenderContext()
  const { scope, revealHidden, kit, data, errors, translations, options, onChange } = ctx
  const row = useContext(RowCtx)

  // Everything a rule reads has to know which row it is in, or the renderer and
  // validateForm disagree about what is on screen.
  const scoped = useMemo<EvalOptions>(
    () => ({ ...options, ...(row ? { row } : {}) }),
    [options, row],
  )

  /*
   * Shared with validateForm, so a hidden field is never validated behind the
   * user's back. Computed up here because the node's attributes depend on it.
   */
  const visible = isVisible(node, data, scoped)

  const props = useMemo(
    () => resolveProps(node, translations, data, scoped),
    [node, translations, data, scoped],
  )

  // On the derived string, not on the node. Depending on the node re-creates
  // this on any edit to it, which defeats memoisation in every kit component
  // that compares props by identity.
  const dataKey = dataKeyOf(node)
  /*
   * An address, not a bare key. Outside a repeater the two are the same string,
   * so a host that never adds one sees no change; inside one it names the row,
   * and `applyChange` in core is the writer that places it.
   */
  const address = useMemo(() => addressOf(row?.path ?? NO_ROWS, dataKey), [row, dataKey])
  const handleChange = useCallback(
    (value: JsonValue) => onChange(address, value),
    [onChange, address],
  )

  const nodeProps = useMemo<NodeAttributes>(
    () => ({
      'data-fs-key': node.key,
      'data-fs-type': node.type,
      'data-fs-scope': scope,
      ...(row ? { 'data-fs-row': encodeRow(row.path) } : {}),
      ...(visible ? {} : { 'data-fs-hidden': 'true' as const }),
    }),
    [node.key, node.type, scope, visible, row],
  )

  if (!visible && !revealHidden) return null

  const Component = kit.renderers[node.type] ?? kit.fallback ?? MissingType

  /*
   * A repeater draws its children once per row, each under that row's scope.
   * The rows come out of the data, so the count is never something a caller
   * claims.
   *
   * Keyed by index, and here is what that actually costs. This comment used to
   * say index keys "remount rows below a deletion", which is the opposite of
   * what React does: it *reuses* the component instance at each index and
   * unmounts only the last one. So after deleting row 0, the instance that drew
   * row 0 now draws row 1.
   *
   * Everything a kit derives from `value` follows the data and is fine. Anything
   * the browser owns does not: the file a `type="file"` input is holding, an IME
   * composition in progress, a text selection, the scroll position of a long
   * control. Those stay with the index and now belong to the wrong row.
   *
   * There is no better key available, and that is a consequence of a decision
   * rather than an oversight. A key would have to be stable for the row's
   * lifetime, and the two candidates both fail: a generated row id would be a
   * non-answer living inside `data` and in the payload, which `12-api.md`
   * refuses by name, and the row object's own identity changes every time that
   * row is edited, which would remount it on every keystroke.
   *
   * Recorded in `docs/build-out/triage.md` with what closing it would take.
   */
  /*
   * An authoring surface draws one row for an empty repeater.
   *
   * The canvas renders with empty data, so a repeater has no rows there and its
   * children never render: the authored subtree would be invisible and nothing
   * could be dropped into it. That is the same hole `revealHidden` was added to
   * close for a conditional component, so it is the same flag. A person filling
   * in the form still sees no rows until there are some.
   */
  /*
   * Computed only for a repeater, which is what asks for it. Every node in the
   * document used to read its own value out of the data and build a row list
   * from it, on every render, to answer a question only a row scope asks.
   */
  const repeats = isRowScope(node)
  /*
   * The same cap `validateForm` applies, and for the same reason one layer over.
   *
   * Validation refuses a repeater past `MAX_ROWS` rather than checking a prefix,
   * because a row nobody checked passing silently is the permissive failure this
   * project is organised against. The renderer had no cap at all, so a body with
   * a hundred thousand rows drew a hundred thousand subtrees -- the browser tab
   * rather than the server, and from the same request.
   *
   * Sliced rather than refused, because a renderer's job is to stay on screen:
   * the rows past the cap are the ones validation has already declined to check.
   */
  const all = repeats ? rowsOf(valueOf(row?.values ?? data, dataKey)) : EMPTY_ROWS
  const rows = all.length > MAX_ROWS ? all.slice(0, MAX_ROWS) : all
  /*
   * `AUTHORED_ROW`, not a fresh `[{}]`.
   *
   * A new array holding a new object on every render is a new `value` for
   * `Row`, whose `useMemo` lists it -- so the memo that exists to stop
   * `isVisible` and `resolveProps` running for every node beneath a row on
   * every keystroke never held for the one row an empty repeater draws on the
   * canvas, which is the row an author is looking at while they type.
   */
  const drawn = revealHidden && repeats && rows.length === 0 ? AUTHORED_ROW : rows

  const children = repeats
    ? drawn.map((value, index) => (
        <Row
          key={index}
          path={row?.path ?? NO_ROWS}
          // The same `dataKey` computed above, not a second call: two readings
          // of one node's name are two things that can drift.
          name={dataKey}
          index={index}
          value={value}
        >
          {childrenOf(node).map((child) => (
            <RenderNode key={child.key} node={child} />
          ))}
        </Row>
      ))
    : childrenOf(node).map((child) => <RenderNode key={child.key} node={child} />)

  return (
    <Component
      node={node}
      props={props}
      nodeProps={nodeProps}
      // Value by data key, error by node key. Two components may share a data
      // key; they can still fail for different reasons.
      value={valueOf(row?.values ?? data, dataKey)}
      error={errorAt(errors, addressOf(row?.path ?? NO_ROWS, node.key))}
      onChange={handleChange}
    >
      {children}
    </Component>
  )
}

/**
 * One node's blast radius, and it now covers the whole node.
 *
 * Nothing here can throw for a reason a document controls: it reads a context
 * and returns a boundary. `RenderNodeBody` does the work, inside it.
 *
 * This is also what gives the document root a boundary. `FormRenderer` renders
 * `<RenderNode node={document.root} />` with nothing above it, so a throw at the
 * root unmounted the whole tree -- a blank page in whatever host embedded the
 * form, which is the one outcome the boundary exists to prevent, at the one node
 * it did not cover.
 */
export function RenderNode({ node }: { node: ComponentNode }): ReactNode {
  const { scope, onError, data, options, revealHidden } = useRenderContext()
  // The same coordinate the body puts on `nodeProps`, so a fallback is findable
  // in the row that broke rather than in whichever row drew first.
  const row = useContext(RowCtx)

  return (
    <NodeBoundary
      node={node}
      scope={scope}
      row={row ? encodeRow(row.path) : undefined}
      hidden={revealHidden && !isVisible(node, data, { ...options, ...(row ? { row } : {}) })}
      onError={onError}
    >
      <RenderNodeBody node={node} />
    </NodeBoundary>
  )
}

/** Shared, so a node that is not a repeater allocates no row list at all. */
const EMPTY_ROWS: FormData[] = []

/**
 * The one row an empty repeater draws while it is being authored.
 *
 * Shared for the same reason as `EMPTY_ROWS`, and it matters more: this one is
 * a `value` a memo compares by identity.
 */
const AUTHORED_ROW: FormData[] = [{}]

export interface FormRendererProps {
  document: FormDocument
  kit: RendererKit
  data: FormData
  errors?: FormErrors
  /** Language tag to draw translations from. Defaults to the document default. */
  language?: string
  /**
   * Draw components their `renderWhen` would hide, marked with `data-fs-hidden`.
   *
   * For an authoring surface, and wrong anywhere a person is filling in a form.
   * The designer's canvas renders with empty data and swallows pointer events so
   * a click can select rather than type, so a conditional component was absent
   * from the DOM: it could not be seen, positioned, or dropped into, and the
   * only way to reach it was the tree. Arranging a form means arranging every
   * component in it, including the ones a given user will not see. Showing what
   * a user sees is what Preview is for.
   *
   * Validation is untouched. `validateForm` calls the same `isVisible`, so this
   * changes what is drawn and never what is checked.
   */
  revealHidden?: boolean
  /** Sandbox for computed bindings. Omit to render computed props as null. */
  evaluate?: Evaluator
  /**
   * Render per-component styling for one device instead of by media query.
   *
   * The designer's canvas simulates a device by sizing a frame, so a media
   * query there would answer about the browser window and ignore the frame.
   * A real page has no frame, so omitting this is what a host wants: every
   * device becomes its own query and the viewport decides.
   */
  device?: Device
  /**
   * What the host knows that the form did not ask: a role, a flag, a lookup's
   * result. Conditions can read it and it is never submitted.
   *
   * A document that reads a path this does not hold hides the component that
   * reads it, quietly, and on a server that also skips validating it. Call
   * `missingContext(document.root, context)` once at startup rather than
   * discovering that per submit.
   */
  context?: FormContext
  /**
   * A node's render threw, and its component was replaced with a notice.
   *
   * The form keeps rendering and the answers already typed are kept. Passing
   * this is how a host learns it happened at all: React writes its own copy to
   * the console and nothing else here does.
   */
  onError?: (error: Error, key: string) => void
  /**
   * The CSP nonce for the stylesheet this renders.
   *
   * Per-component styling is one `<style>` element, and a host serving
   * `style-src 'self'` drops it -- with no error, because a blocked style is not
   * one. The form then renders with every authored style missing and nothing
   * says why. Pass the same nonce the response header carries.
   */
  nonce?: string
  /**
   * One field changed, reported at an address.
   *
   * Outside a repeater the address is the bare key, which is why this went
   * unnoticed. Inside one it carries the row: `addresses[1].line1`. The
   * parameter is named `address` rather than `key` because the old name is an
   * invitation to write `{ ...data, [key]: value }`, which then creates a
   * property called `addresses[1].line1` and silently drops every answer in the
   * repeater. Write it with `applyChange` from `@formsmith/core`.
   */
  onChange: (address: string, value: JsonValue) => void
}

export function FormRenderer({
  document,
  kit,
  data,
  errors = NO_ERRORS,
  language,
  revealHidden = false,
  evaluate,
  device,
  context,
  onError,
  nonce,
  onChange,
}: FormRendererProps): ReactNode {
  /*
   * Total against a document that never passed the gate.
   *
   * `validateDocument` reports a malformed `translations`, and a host is
   * supposed to call it — but the designer renders a document the instant it is
   * pasted, and a host is free not to. An unguarded index here throws during
   * render, and a throw during render in React 19 unmounts the whole tree
   * rather than the one node, so the page a form was embedded in goes blank.
   *
   * A bundle that is not an object holds no translation for anything, so it
   * reads as none: `resolveProp` then falls back to the key, which is what an
   * untranslated string already does.
   */
  const translations = useMemo(() => {
    const bundles: unknown = document.translations
    if (!bundles || typeof bundles !== 'object' || Array.isArray(bundles)) return NO_TRANSLATIONS
    const bundle: unknown = (bundles as Record<string, unknown>)[
      language ?? document.defaultLanguage
    ]
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return NO_TRANSLATIONS
    /*
     * The strings in it, not the object as it stands.
     *
     * This asserted a type after checking only that the bundle was a non-array
     * object, so `translations: { en: { greeting: { a: 1 } } }` reached a kit
     * as a label -- and both in-repo kits swallow a non-string to `''` through
     * `str()`, so the label silently disappeared instead of falling back to the
     * key. A translation that is not text is a translation nobody wrote.
     */
    const strings: Record<string, string> = {}
    for (const [key, value] of Object.entries(bundle)) {
      if (typeof value === 'string') strings[key] = value
    }
    return strings
  }, [document.translations, document.defaultLanguage, language])

  // Stable across renders, unique per instance, and the same on the server and
  // the client, which a counter or a random string would not be.
  const scope = useId()

  const options = useMemo<EvalOptions>(() => ({ evaluate, context }), [evaluate, context])

  const ctx = useMemo<RenderContext>(
    () => ({ scope, revealHidden, kit, data, errors, translations, options, onChange, onError }),
    [scope, revealHidden, kit, data, errors, translations, options, onChange, onError],
  )

  /*
   * One stylesheet for the whole document rather than a style attribute per
   * node: a kit owns its components' `style`, and writing there would fight it.
   * Every rule is scoped to a `data-fs-key`, which every renderer already
   * spreads, so this reaches exactly the elements the document names.
   */
  const sheet = useMemo(
    () => styleSheetFor(document.root, { device, scope }),
    [document.root, device, scope],
  )

  return (
    <Ctx.Provider value={ctx}>
      {/*
       * `nonce`, because a host with `style-src 'self'` drops this element and
       * every per-component style with it -- silently, since a blocked style is
       * not an error anybody sees. There is no default: a nonce this library
       * invented would not match the header the host sent, and pretending
       * otherwise is worse than saying nothing.
       */}
      {sheet && <style {...(nonce === undefined ? {} : { nonce })}>{sheet}</style>}
      <RenderNode node={document.root} />
    </Ctx.Provider>
  )
}
