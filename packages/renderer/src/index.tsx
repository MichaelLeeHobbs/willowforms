/**
 * The runtime renderer.
 *
 * Ships independently of the designer, because most consumers embed a form
 * without ever embedding the builder. It knows how to walk a document and
 * resolve property bindings; it knows nothing about which component library
 * draws the result. That comes in as a RendererKit.
 */

import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react'
import type { ComponentType, ErrorInfo, ReactNode } from 'react'
import {
  MAX_ROWS,
  NO_ROWS,
  addressOf,
  contextValues,
  dataKeyOf,
  encodeRow,
  evaluateCondition,
  isRowScope,
  isVisible,
  keyProblem,
  pushRow,
  rowContext,
  readPath,
  runActions,
  rowsOf,
  styleSheetFor,
  same,
  unreadableTag,
  valueOf,
  walk,
} from '@formsmith/core'
import type {
  ActionEvaluator,
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
  Effect,
  EventName,
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
  /** Event callbacks connected to this node's configured actions. */
  events?: NodeEventHandlers | undefined
  /** Controlled step navigation for a node identified as a step by its condition. */
  navigation?: NodeNavigation | undefined
  children?: ReactNode
}

export type NodeEventHandlers = Partial<Record<EventName, (value?: JsonValue) => void>>

export interface NodeNavigation {
  /** One-based position among the steps reachable with the current answers. */
  position: number
  back?: (() => void) | undefined
  next?: (() => void) | undefined
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
  navigation: ReadonlyMap<string, NodeNavigation>
  dispatch: (node: ComponentNode, event: EventName, address: string, value?: JsonValue) => void
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
const NO_NAVIGATION: ReadonlyMap<string, NodeNavigation> = new Map()

/*
 * One frozen empty object, for every node whose props read no answers.
 *
 * Frozen so nothing can write into the shared instance, and shared so its
 * identity holds across renders -- which is the whole point, since the identity
 * is what lets a props memo survive a keystroke.
 */
const NO_DATA: FormData = Object.freeze({})

/**
 * Whether resolving this node's props needs to look at the form's answers.
 *
 * `static` and `i18n` resolve from the node and the translation bundle alone.
 * `computed` and `condition` read `data`, and so does anything this does not
 * recognise -- the pessimistic direction on purpose, because being wrong the
 * other way resolves a prop against an empty form. A missed memo costs a
 * render; a prop resolved against nothing is a wrong label on screen.
 */
function readsData(node: ComponentNode): boolean {
  const props: unknown = node.props
  if (!props || typeof props !== 'object') return false

  return Object.values(props as Record<string, unknown>).some((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const kind: unknown = (value as { kind?: unknown }).kind
    return kind !== 'static' && kind !== 'i18n'
  })
}

/** Stable content used to retry a failed renderer after the document changes. */
function signatureOf(node: ComponentNode): string {
  try {
    return JSON.stringify(node) ?? ''
  } catch {
    return ''
  }
}

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

      try {
        const scoped = options.row ? { ...data, ...options.row.values } : data
        return options.evaluate(value.expression, scoped, options.context)
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

interface NodeBoundaryProps {
  node: ComponentNode
  runtime: RenderContext
  scope: string

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

type BoundaryState = {
  failed: boolean
  signature: string | null
  runtime: RenderContext | null
}

class NodeBoundary extends Component<NodeBoundaryProps, BoundaryState> {
  // `null` is "no failure to compare against yet", not a signature. The
  // signature is only read while failed, so computing one here would be work
  // for nothing -- and `getDerivedStateFromError` has no props to compute it
  // from, which is why the first failed render records it instead.
  override state: BoundaryState = { failed: false, signature: null, runtime: null }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  /** Retry after either document content or runtime inputs change. */
  static getDerivedStateFromProps(
    props: NodeBoundaryProps,
    state: BoundaryState,
  ): BoundaryState | null {
    if (!state.failed) return null

    const signature = signatureOf(props.node)
    // The render right after the throw. Record what failed; do not read the
    // fallback as a repair.
    if (state.signature === null) {
      return { failed: true, signature, runtime: props.runtime }
    }
    if (signature === state.signature && props.runtime === state.runtime) return null
    return { failed: false, signature: null, runtime: null }
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
 * A node's children, whatever the document put there.
 *
 * `node.children?.map(...)` assumed an array, while core guards the identical
 * shape everywhere it walks a document -- `Array.isArray(node.children)` appears
 * in `rows.ts`, `context.ts` and `tree.ts`. A document is data, so `children`
 * can be a string, and `.map` on one throws during render.
 *
 * The elements are checked too, and that is a blast-radius question rather than
 * a crash one. Guarding only the array left a `null` element to throw at
 * `child.key` inside `RenderNodeBody` -- above every child's own boundary, so
 * the *parent's* caught it and one bad entry replaced the whole container and
 * every sibling under it. The boundary is per node on purpose; a junk element
 * should cost the junk element.
 *
 * Dropped rather than rendered as a fallback box, because there is no node to
 * describe: an entry with no `key` cannot be named, addressed or selected.
 */
function childrenOf(node: ComponentNode): ComponentNode[] {
  if (!Array.isArray(node.children)) return []
  return node.children.filter(
    (child): child is ComponentNode =>
      Boolean(child) && typeof child === 'object' && typeof child.key === 'string',
  )
}

const EVENT_NAMES: EventName[] = [
  'onChange',
  'onClick',
  'onBlur',
  'onFocus',
  'onMount',
  'onUnmount',
]

function NodeLifecycle({
  nodeKey,
  events,
  children,
}: {
  nodeKey: string
  events: NodeEventHandlers
  children: ReactNode
}): ReactNode {
  const latest = useRef(events)

  useEffect(() => {
    latest.current = events
  }, [events])

  useEffect(() => {
    latest.current.onMount?.()
    return () => latest.current.onUnmount?.()
  }, [nodeKey])

  return children
}

function RenderNodeBody({ node }: { node: ComponentNode }): ReactNode {
  const ctx = useRenderContext()
  const { scope, revealHidden, kit, data, errors, translations, options, onChange, dispatch } = ctx
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

  /*
   * `data` only when a prop actually reads it.
   *
   * The memo's dependency list held `data`, which is a new object on every
   * keystroke, so for the case that matters it could never hit: a repeater near
   * the `MAX_ROWS` cap re-ran `resolveProps` and allocated a fresh props
   * identity for every node under every row on each keystroke, defeating
   * exactly the identity comparison a memoising kit component does.
   *
   * `static` and `i18n` props resolve without looking at `data` at all, and
   * that is most props in most documents. For those this passes a frozen empty
   * object whose identity never changes, and the memo holds across a keystroke.
   *
   * `readsData` is deliberately pessimistic -- anything it does not recognise
   * counts as reading -- so the failure it can have is a missed memo rather
   * than a prop resolved against the wrong data.
   */
  const forProps = readsData(node) ? data : NO_DATA
  const props = useMemo(
    () => resolveProps(node, translations, forProps, scoped),
    [node, translations, forProps, scoped],
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
  const events = useMemo<NodeEventHandlers>(() => {
    const handlers: NodeEventHandlers = {}
    for (const event of EVENT_NAMES) {
      if (!Array.isArray(node.events?.[event]) || node.events[event]?.length === 0) continue
      handlers[event] = (value) => dispatch(node, event, address, value)
    }
    return handlers
  }, [node, address, dispatch])

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

  /* Rows are keyed by address index because submitted data has no stable row id. */

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
    <NodeLifecycle nodeKey={node.key} events={events}>
      <Component
        node={node}
        props={props}
        nodeProps={nodeProps}
        // Value by data key, error by node key. Two components may share a data
        // key; they can still fail for different reasons.
        value={valueOf(row?.values ?? data, dataKey)}
        error={errorAt(errors, addressOf(row?.path ?? NO_ROWS, node.key))}
        onChange={handleChange}
        events={events}
        navigation={ctx.navigation.get(node.key)}
      >
        {children}
      </Component>
    </NodeLifecycle>
  )
}

/**
 * One node's blast radius, and it now covers the whole node.
 *
 * Almost nothing here can throw for a reason a document controls: it reads a
 * context and returns a boundary, and `RenderNodeBody` does the work inside it.
 * Not a guarantee this code enforces, though -- `encodeRow`, `isVisible` and
 * `NodeBoundary`'s own construction all run out here. Each is total against a
 * document today, and each is a line that could stop being.
 *
 * This is also what gives the document root a boundary. `FormRenderer` renders
 * `<RenderNode node={document.root} />` with nothing above it, so a throw at the
 * root unmounted the whole tree -- a blank page in whatever host embedded the
 * form, which is the one outcome the boundary exists to prevent, at the one node
 * it did not cover.
 */
export function RenderNode({ node }: { node: ComponentNode }): ReactNode {
  const runtime = useRenderContext()
  const { scope, onError, data, options, revealHidden } = runtime
  // The same coordinate the body puts on `nodeProps`, so a fallback is findable
  // in the row that broke rather than in whichever row drew first.
  const row = useContext(RowCtx)

  return (
    <NodeBoundary
      node={node}
      runtime={runtime}
      scope={scope}
      row={row ? encodeRow(row.path) : undefined}
      /*
       * Evaluated here and again in `RenderNodeBody`, but only on the canvas.
       * `revealHidden` short-circuits first, so a host renderer calls
       * `isVisible` once per node; the designer pays twice to draw the node it
       * is about to mark hidden, which is the price of the boundary owning the
       * attribute rather than the body that would otherwise have to hoist it
       * out through a context.
       */
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

export interface FormNavigation {
  /** Context path whose literal comparisons define the flow. Defaults to `step`. */
  path?: string
  /** Called with the destination value; the host remains the owner of navigation state. */
  onNavigate: (value: JsonValue) => void
}

export interface ActionDispatch {
  nodeKey: string
  event: EventName
  address: string
}

function contextWith(
  current: FormContext | undefined,
  path: string,
  value: JsonValue,
): FormContext | undefined {
  const parts = path.split('.')
  if (parts.length === 0 || parts.some((part) => keyProblem(part))) return undefined

  const write = (source: JsonValue | undefined, at: number): JsonValue => {
    const part = parts[at]
    if (!part) return value
    const record =
      source && typeof source === 'object' && !Array.isArray(source)
        ? source
        : ({} as Record<string, JsonValue>)
    const next = at === parts.length - 1 ? value : write(record[part], at + 1)
    return { ...record, [part]: next }
  }

  return write(current, 0) as FormContext
}

function navigationFor(
  root: ComponentNode,
  data: FormData,
  context: FormContext | undefined,
  path: string,
  onNavigate: (value: JsonValue) => void,
): ReadonlyMap<string, NodeNavigation> {
  const entries: { key: string; value: JsonValue }[] = []

  walk(root, (node) => {
    if (!node.renderWhen) return
    const shell: ComponentNode = {
      key: node.key,
      type: node.type,
      props: {},
      renderWhen: node.renderWhen,
    }
    for (const value of contextValues(shell, path)) {
      const candidate = contextWith(context, path, value)
      if (!candidate || !isVisible(node, data, { context: candidate })) continue
      if (!entries.some((entry) => entry.key === node.key && same(entry.value, value))) {
        entries.push({ key: node.key, value })
      }
    }
  })

  const current = readPath(context, path)
  const active = entries.findIndex((entry) => same(entry.value, current))
  if (active < 0) return NO_NAVIGATION

  const result = new Map<string, NodeNavigation>()
  entries.forEach((entry, index) => {
    const previous = entries[index - 1]
    const following = entries[index + 1]
    result.set(entry.key, {
      position: index + 1,
      ...(previous ? { back: () => onNavigate(previous.value) } : {}),
      ...(following ? { next: () => onNavigate(following.value) } : {}),
    })
  })
  return result
}

export interface FormRendererProps {
  document: FormDocument
  kit: RendererKit
  data: FormData
  errors?: FormErrors
  /** Language tag to draw translations from. Defaults to the document default. */
  language?: string

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
  /** Optional controlled navigation for condition-defined steps. */
  navigation?: FormNavigation
  /** Sandbox boundary for code actions. Built-in actions do not require it. */
  evaluateAction?: ActionEvaluator
  /** Receives one fully validated effect batch. The host decides how to apply it. */
  onEffects?: (effects: Effect[], dispatch: ActionDispatch) => void
  /** Reports an action reference, evaluator, or effect failure. */
  onActionError?: (message: string, dispatch: ActionDispatch) => void
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
  navigation,
  evaluateAction,
  onEffects,
  onActionError,
  onError,
  nonce,
  onChange,
}: FormRendererProps): ReactNode {
  const translations = useMemo(() => {
    const bundles: unknown = document.translations
    if (!bundles || typeof bundles !== 'object' || Array.isArray(bundles)) return NO_TRANSLATIONS
    const bundle: unknown = (bundles as Record<string, unknown>)[
      language ?? document.defaultLanguage
    ]
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return NO_TRANSLATIONS

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
  const nodeNavigation = useMemo(
    () =>
      navigation
        ? navigationFor(
            document.root,
            data,
            context,
            navigation.path ?? 'step',
            navigation.onNavigate,
          )
        : NO_NAVIGATION,
    [document.root, data, context, navigation],
  )
  const dispatch = useCallback(
    (node: ComponentNode, event: EventName, address: string, value?: JsonValue): void => {
      const refs = node.events?.[event]
      if (!Array.isArray(refs) || refs.length === 0) return
      const stored: unknown = document.actions
      const actions =
        stored && typeof stored === 'object' && !Array.isArray(stored)
          ? (stored as FormDocument['actions'])
          : {}
      const invocation = {
        event,
        nodeKey: node.key,
        address,
        ...(value === undefined ? {} : { value }),
      }
      const result = runActions(refs, actions, data, invocation, {
        context,
        evaluate: evaluateAction,
      })
      const meta: ActionDispatch = { nodeKey: node.key, event, address }
      if (!result.ok) {
        onActionError?.(result.error, meta)
        return
      }
      if (result.effects.length > 0) onEffects?.(result.effects, meta)
    },
    [document.actions, data, context, evaluateAction, onEffects, onActionError],
  )

  const ctx = useMemo<RenderContext>(
    () => ({
      scope,
      revealHidden,
      kit,
      data,
      errors,
      translations,
      options,
      navigation: nodeNavigation,
      dispatch,
      onChange,
      onError,
    }),
    [
      scope,
      revealHidden,
      kit,
      data,
      errors,
      translations,
      options,
      nodeNavigation,
      dispatch,
      onChange,
      onError,
    ],
  )

  /*
   * One stylesheet for the whole document rather than a style attribute per
   * node: a kit owns its components' `style`, and writing there would fight it.
   * Every rule is scoped to a `data-fs-key`, which every renderer already
   * spreads, so this reaches exactly the elements the document names.
   */

  const root: unknown = document.root
  const rooted =
    Boolean(root) && typeof root === 'object' && typeof (root as { key?: unknown }).key === 'string'

  const sheet = useMemo(
    () => (rooted ? styleSheetFor(document.root, { device, scope }) : ''),
    [rooted, document.root, device, scope],
  )

  if (!rooted) {
    return (
      <div role="alert" data-fs-scope={scope} data-fs-failed="">
        This form has no root component.
      </div>
    )
  }

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
