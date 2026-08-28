/**
 * The runtime renderer.
 *
 * Ships independently of the designer, because most consumers embed a form
 * without ever embedding the builder. It knows how to walk a document and
 * resolve property bindings; it knows nothing about which component library
 * draws the result. That comes in as a RendererKit.
 */

import { createContext, useCallback, useContext, useMemo } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { dataKeyOf, evaluateCondition, isVisible, styleSheetFor, valueOf } from '@formsmith/core'
import type {
  ComponentNode,
  Evaluator,
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
  kit: RendererKit
  data: FormData
  errors: FormErrors
  translations: Record<string, string>
  evaluate: Evaluator | undefined
  onChange: (key: string, value: JsonValue) => void
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
  evaluate?: Evaluator,
): JsonValue {
  switch (value.kind) {
    case 'static':
      return value.value
    case 'i18n':
      return translations[value.key] ?? value.key
    // Resolves to a boolean. Meant for renderWhen, and harmless anywhere else.
    case 'condition':
      return evaluateCondition(value.condition, data)
    case 'computed':
      // No sandbox means no evaluation. Render the field rather than crash the form.
      return evaluate ? evaluate(value.expression, data) : null
  }
}

function resolveProps(
  node: ComponentNode,
  translations: Record<string, string>,
  data: FormData,
  evaluate?: Evaluator,
): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {}
  for (const [name, value] of Object.entries(node.props)) {
    out[name] = resolveProp(value, translations, data, evaluate)
  }
  return out
}

function MissingType({ node, nodeProps }: NodeRendererProps): ReactNode {
  return (
    <div
      {...nodeProps}
      role="alert"
      style={{ padding: 8, border: '1px dashed currentColor', opacity: 0.7 }}
    >
      No renderer for component type <code>{node.type}</code> (key <code>{node.key}</code>).
    </div>
  )
}

export function RenderNode({ node }: { node: ComponentNode }): ReactNode {
  const ctx = useRenderContext()
  const { kit, data, errors, translations, evaluate, onChange } = ctx

  const props = useMemo(
    () => resolveProps(node, translations, data, evaluate),
    [node, translations, data, evaluate],
  )

  // On the derived string, not on the node. Depending on the node re-creates
  // this on any edit to it, which defeats memoisation in every kit component
  // that compares props by identity.
  const dataKey = dataKeyOf(node)
  const handleChange = useCallback(
    (value: JsonValue) => onChange(dataKey, value),
    [onChange, dataKey],
  )

  const nodeProps = useMemo<NodeAttributes>(
    () => ({ 'data-fs-key': node.key, 'data-fs-type': node.type }),
    [node.key, node.type],
  )

  // Shared with validateForm, so a hidden field is never validated behind the
  // user's back.
  if (!isVisible(node, data, evaluate)) return null

  const Component = kit.renderers[node.type] ?? kit.fallback ?? MissingType

  const children = node.children?.map((child) => <RenderNode key={child.key} node={child} />)

  return (
    <Component
      node={node}
      props={props}
      nodeProps={nodeProps}
      // Value by data key, error by node key. Two components may share a data
      // key; they can still fail for different reasons.
      value={valueOf(data, dataKey)}
      error={errors[node.key]}
      onChange={handleChange}
    >
      {children}
    </Component>
  )
}

export interface FormRendererProps {
  document: FormDocument
  kit: RendererKit
  data: FormData
  errors?: FormErrors
  /** Language tag to draw translations from. Defaults to the document default. */
  language?: string
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
  onChange: (key: string, value: JsonValue) => void
}

export function FormRenderer({
  document,
  kit,
  data,
  errors = NO_ERRORS,
  language,
  evaluate,
  device,
  onChange,
}: FormRendererProps): ReactNode {
  const translations = useMemo(
    () => document.translations[language ?? document.defaultLanguage] ?? NO_TRANSLATIONS,
    [document.translations, document.defaultLanguage, language],
  )

  const ctx = useMemo<RenderContext>(
    () => ({ kit, data, errors, translations, evaluate, onChange }),
    [kit, data, errors, translations, evaluate, onChange],
  )

  /*
   * One stylesheet for the whole document rather than a style attribute per
   * node: a kit owns its components' `style`, and writing there would fight it.
   * Every rule is scoped to a `data-fs-key`, which every renderer already
   * spreads, so this reaches exactly the elements the document names.
   */
  const sheet = useMemo(() => styleSheetFor(document.root, device), [document.root, device])

  return (
    <Ctx.Provider value={ctx}>
      {sheet && <style>{sheet}</style>}
      <RenderNode node={document.root} />
    </Ctx.Provider>
  )
}
