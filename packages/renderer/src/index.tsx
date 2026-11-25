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
  expressionData,
  isRowScope,
  isRequired,
  itemLimits,
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
} from '@willowforms/core'
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
} from '@willowforms/core'

export { bool, changed, num, requiredProps, str } from './kit-props.js'

export type FormDensity = 'comfortable' | 'compact'

export interface NodeRendererProps {
  /** `undefined` preserves the kit's host defaults. */
  density?: FormDensity | undefined
  node: ComponentNode
  props: Record<string, JsonValue>
  /**
   * Spread onto the outermost DOM element: the designer hit-tests the canvas with
   * `closest('[data-fs-key]')`, so a component that drops these cannot be selected on the
   * canvas.
   */
  nodeProps: NodeAttributes
  value: JsonValue | undefined
  error: string | undefined
  required?: boolean | undefined
  itemLimits?: { min: number; max: number } | undefined
  onChange: (value: JsonValue) => void
  events?: NodeEventHandlers | undefined
  navigation?: NodeNavigation | undefined
  children?: ReactNode
}

export type NodeEventHandlers = Partial<Record<EventName, (value?: JsonValue) => void>>

export interface NodeNavigation {
  /** One-based, among the steps reachable with the current answers. */
  position: number
  back?: (() => void) | undefined
  next?: (() => void) | undefined
}

export interface NodeAttributes {
  'data-fs-density'?: FormDensity
  'data-fs-key': string
  'data-fs-type': string
  /**
   * Set when this node's `renderWhen` says hide it but the host asked to see it
   * anyway. Absent otherwise, so `[data-fs-hidden]` selects exactly the nodes a
   * person filling in the form would not be shown.
   */
  'data-fs-hidden'?: 'true'
  /**
   * A key is unique only within its document: without this, one form's stylesheet styles
   * another's nodes. Per rendered form, not per document, because the same document can be
   * rendered twice.
   */
  'data-fs-scope': string
  /**
   * Separate from `data-fs-key`: per-component CSS has to reach every row, while a click
   * has to land on one.
   */
  'data-fs-row'?: string
}

export type NodeRenderer = ComponentType<NodeRendererProps>

export interface RendererKit {
  id: string
  renderers: Record<string, NodeRenderer>
  fallback?: NodeRenderer
}

interface RenderContext {
  scope: string
  revealHidden: boolean
  kit: RendererKit
  data: FormData
  errors: FormErrors
  translations: Record<string, string>
  options: EvalOptions
  navigation: ReadonlyMap<string, NodeNavigation>
  dispatch: (node: ComponentNode, event: EventName, address: string, value?: JsonValue) => void
  onChange: (address: string, value: JsonValue) => void
  onError: ((error: Error, key: string) => void) | undefined
}

const Ctx = createContext<RenderContext | null>(null)
const DensityCtx = createContext<FormDensity | undefined>(undefined)

// Identity must hold across renders: `NodeBoundary` retries a failed node when the context
// changes, so a fresh literal loops if the host sets state in `onError`.
const NO_ERRORS: FormErrors = Object.freeze({})
const NO_TRANSLATIONS: Record<string, string> = Object.freeze({})
const NO_NAVIGATION: ReadonlyMap<string, NodeNavigation> = new Map()
const NO_DATA: FormData = Object.freeze({})

/**
 * Unknown kinds count as reading `data`: the other guess resolves a prop against an empty
 * form.
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

function signatureOf(node: ComponentNode): string {
  try {
    return JSON.stringify(node) ?? ''
  } catch {
    return ''
  }
}

function useRenderContext(): RenderContext {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('WillowForms renderer components must be used inside <FormRenderer>.')
  return ctx
}

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
      return Object.hasOwn(translations, value.key)
        ? (translations[value.key] ?? value.key)
        : value.key
    case 'condition':
      return evaluateCondition(value.condition, data, options.context, options.row)
    case 'computed':
      if (!options.evaluate) return null

      try {
        const scoped = expressionData(data, options.row)
        return options.evaluate(value.expression, scoped, options.context)
      } catch {
        return null
      }

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

  const props =
    node.props && typeof node.props === 'object' && !Array.isArray(node.props) ? node.props : {}

  for (const [name, value] of Object.entries(props)) {
    out[name] = resolveProp(value, translations, data, options)
  }
  return out
}

/**
 * Shows the node's error: `validateForm` still validates a node of unknown
 * type, so a required one can block the submit.
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

const RowCtx = createContext<RowContext | undefined>(undefined)

interface NodeBoundaryProps {
  node: ComponentNode
  runtime: RenderContext
  scope: string

  row: string | undefined
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
  // `signature` stays `null` until the render after a throw records it:
  // `getDerivedStateFromError` has no props to compute it from.
  override state: BoundaryState = { failed: false, signature: null, runtime: null }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  static getDerivedStateFromProps(
    props: NodeBoundaryProps,
    state: BoundaryState,
  ): BoundaryState | null {
    if (!state.failed) return null

    const signature = signatureOf(props.node)
    if (state.signature === null) {
      return { failed: true, signature, runtime: props.runtime }
    }
    if (signature === state.signature && props.runtime === state.runtime) return null
    return { failed: false, signature: null, runtime: null }
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    // Reported, not logged: React already writes caught errors to the console.
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
         * The attributes above keep a broken node selectable, so they do not
         * prove a kit rendered; an assertion that one did must check this too.
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

// Junk entries are dropped, not drawn as a fallback: without a `key` one cannot be named or selected.
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
  const inheritedDensity = useContext(DensityCtx)
  const ctx = useRenderContext()
  const { scope, revealHidden, kit, data, errors, translations, options, onChange, dispatch } = ctx
  const row = useContext(RowCtx)

  // Row included, or the renderer and validateForm disagree about what is on screen.
  const scoped = useMemo<EvalOptions>(
    () => ({ ...options, ...(row ? { row } : {}) }),
    [options, row],
  )

  const visible = isVisible(node, data, scoped)

  const forProps = readsData(node) ? data : NO_DATA
  const props = useMemo(
    () => resolveProps(node, translations, forProps, scoped),
    [node, translations, forProps, scoped],
  )
  const density =
    props['density'] === 'compact' || props['density'] === 'comfortable'
      ? props['density']
      : inheritedDensity

  const dataKey = dataKeyOf(node)
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
      ...(density ? { 'data-fs-density': density } : {}),
      ...(row ? { 'data-fs-row': encodeRow(row.path) } : {}),
      ...(visible ? {} : { 'data-fs-hidden': 'true' as const }),
    }),
    [node.key, node.type, scope, visible, row, density],
  )

  if (!visible && !revealHidden) return null

  const Component = kit.renderers[node.type] ?? kit.fallback ?? MissingType

  /* Rows are keyed by address index because submitted data has no stable row id. */

  const repeats = isRowScope(node)
  const all = repeats ? rowsOf(valueOf(row?.values ?? data, dataKey)) : EMPTY_ROWS
  const rows = all.length > MAX_ROWS ? all.slice(0, MAX_ROWS) : all
  const drawn = revealHidden && repeats && rows.length === 0 ? AUTHORED_ROW : rows

  const children = repeats
    ? drawn.map((value, index) => (
        <Row key={index} path={row?.path ?? NO_ROWS} name={dataKey} index={index} value={value}>
          {childrenOf(node).map((child) => (
            <RenderNode key={child.key} node={child} />
          ))}
        </Row>
      ))
    : childrenOf(node).map((child) => <RenderNode key={child.key} node={child} />)

  return (
    <NodeLifecycle nodeKey={node.key} events={events}>
      <DensityCtx.Provider value={density}>
        <Component
          density={density}
          node={node}
          props={props}
          nodeProps={nodeProps}
          value={valueOf(row?.values ?? data, dataKey)}
          error={errorAt(errors, addressOf(row?.path ?? NO_ROWS, node.key))}
          required={isRequired(node, data, scoped)}
          itemLimits={repeats ? itemLimits(node, data, scoped) : undefined}
          onChange={handleChange}
          events={events}
          navigation={ctx.navigation.get(node.key)}
        >
          {children}
        </Component>
      </DensityCtx.Provider>
    </NodeLifecycle>
  )
}

/**
 * Code outside the boundary (`encodeRow`, `isVisible`, the boundary's own props) must not
 * throw for any document.
 */
export function RenderNode({ node }: { node: ComponentNode }): ReactNode {
  const runtime = useRenderContext()
  const { scope, onError, data, options, revealHidden } = runtime
  const row = useContext(RowCtx)

  return (
    <NodeBoundary
      node={node}
      runtime={runtime}
      scope={scope}
      row={row ? encodeRow(row.path) : undefined}
      hidden={revealHidden && !isVisible(node, data, { ...options, ...(row ? { row } : {}) })}
      onError={onError}
    >
      <RenderNodeBody node={node} />
    </NodeBoundary>
  )
}

const EMPTY_ROWS: FormData[] = []

const AUTHORED_ROW: FormData[] = [{}]

export interface FormNavigation {
  /** Context path whose literal comparisons define the flow. Defaults to `step`. */
  path?: string
  /** The host owns the navigation state; this only reports the destination. */
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

  const destinations: JsonValue[] = []
  for (const { value } of entries) {
    if (!destinations.some((destination) => same(destination, value))) destinations.push(value)
  }
  const current = readPath(context, path)
  const active = destinations.findIndex((value) => same(value, current))
  if (active < 0) return NO_NAVIGATION

  const previous = destinations[active - 1]
  const following = destinations[active + 1]
  const navigation: NodeNavigation = {
    position: active + 1,
    ...(previous !== undefined ? { back: () => onNavigate(previous) } : {}),
    ...(following !== undefined ? { next: () => onNavigate(following) } : {}),
  }
  return new Map(
    entries.filter(({ value }) => same(value, current)).map(({ key }) => [key, navigation]),
  )
}

export interface FormRendererProps {
  document: FormDocument
  kit: RendererKit
  data: FormData
  errors?: FormErrors
  /** A language tag. Defaults to the document default. */
  language?: string

  revealHidden?: boolean
  /** Sandbox for computed bindings. Omit to render computed props as null. */
  evaluate?: Evaluator
  /**
   * For a canvas that simulates a device by sizing a frame. Omit on a real page, or the
   * viewport no longer decides.
   */
  device?: Device
  /**
   * Never submitted. A path this does not hold quietly hides the component that reads it,
   * and on a server also skips validating it: call `missingContext(document.root, context)`
   * at startup.
   */
  context?: FormContext
  navigation?: FormNavigation
  /** Sandbox boundary for code actions. Built-in actions do not require it. */
  evaluateAction?: ActionEvaluator
  /** Receives one fully validated effect batch. The host decides how to apply it. */
  onEffects?: (effects: Effect[], dispatch: ActionDispatch) => void
  onActionError?: (message: string, dispatch: ActionDispatch) => void
  /**
   * A node's render threw, and its component was replaced with a notice. React writes its
   * own copy to the console, and nothing else here reports it.
   */
  onError?: (error: Error, key: string) => void
  /**
   * Per-component styling is one `<style>` element, which a `style-src` of `'self'` blocks:
   * every authored `css` is then missing, and `onError` does not see it. Pass the nonce the
   * response header carries.
   */
  nonce?: string
  /**
   * Inside a repeater the address carries the row, `addresses[1].line1`. Write it with
   * `applyChange` from `@willowforms/core`: `{ ...data, [address]: value }` silently loses
   * an answer given inside a repeater.
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

  // One stylesheet, not a `style` attribute per node: a kit owns its components' `style`.
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
      {/* No default nonce: one this library made up would not match the host's CSP header. */}
      {sheet && <style {...(nonce === undefined ? {} : { nonce })}>{sheet}</style>}
      <DensityCtx.Provider value={undefined}>
        <RenderNode node={document.root} />
      </DensityCtx.Provider>
    </Ctx.Provider>
  )
}
