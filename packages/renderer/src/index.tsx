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
import type {
  ComponentNode,
  Evaluator,
  FormData,
  FormDocument,
  FormErrors,
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

  const handleChange = useCallback(
    (value: JsonValue) => onChange(node.key, value),
    [onChange, node.key],
  )

  const nodeProps = useMemo<NodeAttributes>(
    () => ({ 'data-fs-key': node.key, 'data-fs-type': node.type }),
    [node.key, node.type],
  )

  if (node.renderWhen) {
    const visible = resolveProp(node.renderWhen, translations, data, evaluate)
    if (!visible) return null
  }

  const Component = kit.renderers[node.type] ?? kit.fallback ?? MissingType

  const children = node.children?.map((child) => <RenderNode key={child.key} node={child} />)

  return (
    <Component
      node={node}
      props={props}
      nodeProps={nodeProps}
      value={data[node.key]}
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
  onChange: (key: string, value: JsonValue) => void
}

export function FormRenderer({
  document,
  kit,
  data,
  errors = {},
  language,
  evaluate,
  onChange,
}: FormRendererProps): ReactNode {
  const translations = document.translations[language ?? document.defaultLanguage] ?? {}

  const ctx = useMemo<RenderContext>(
    () => ({ kit, data, errors, translations, evaluate, onChange }),
    [kit, data, errors, translations, evaluate, onChange],
  )

  return (
    <Ctx.Provider value={ctx}>
      <RenderNode node={document.root} />
    </Ctx.Provider>
  )
}
