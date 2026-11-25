export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

export type Device = 'any' | 'desktop' | 'tablet' | 'mobile'

export type EventName = 'onChange' | 'onClick' | 'onBlur' | 'onFocus' | 'onMount' | 'onUnmount'

export type PropValue =
  | { kind: 'static'; value: JsonValue }
  /** A JS expression evaluated against the live form at render time. */
  | { kind: 'computed'; expression: string }
  | { kind: 'i18n'; key: string }
  /**
   * Evaluated by core with no sandbox. Resolves to a boolean, so on a label it renders as
   * `true` or `false`.
   */
  | { kind: 'condition'; condition: Condition }

/**
 * Closed on purpose: evaluated without executing anything. See
 * [01-document-model.md](../../../docs/spec/01-document-model.md).
 */
export type Condition =
  | { op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'; left: Operand; right: Operand }
  | { op: 'empty' | 'notEmpty' | 'truthy' | 'falsy'; value: Operand }
  | { op: 'in' | 'notIn'; value: Operand; options: JsonValue[] }
  | { op: 'and' | 'or'; conditions: Condition[] }
  | { op: 'not'; condition: Condition }

export type Operand =
  | { kind: 'literal'; value: JsonValue }
  | {
      kind: 'ref'
      dataKey: string
      /** Inside a repeater, `row` reads the enclosing row. Absent means `form`. */
      scope?: 'form' | 'row'
    }
  | { kind: 'context'; path: string }

export interface ActionRef {
  /** Name of a {@link CodeAction} on the document, or a built-in. */
  name: string
  type: 'code' | 'builtin'
  params?: Record<string, JsonValue>
}

export type Effect =
  | { kind: 'setValue'; address: string; value: JsonValue }
  | { kind: 'clearValue'; address: string }
  | { kind: 'focus'; nodeKey: string }
  | { kind: 'announce'; message: string }
  | { kind: 'setContext'; path: string; value: JsonValue }
  | { kind: 'validate'; scope?: string }
  | { kind: 'emit'; event: string; payload?: JsonValue }
  | { kind: 'halt'; reason?: string }

export interface CodeAction {
  name: string
  /** JavaScript source passed only to a host-injected sandbox evaluator. */
  body: string
  params: Record<string, JsonValue>
}

export interface Language {
  /** BCP 47 primary subtag, e.g. `en`. */
  code: string
  /** Region subtag, e.g. `US`. */
  dialect?: string
  name: string
  bidi: 'ltr' | 'rtl'
}

export interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'file'

  validations?: ValidationRule[]
  /** Validate on change rather than only on submit. */
  autoValidate?: boolean
}

export type ValidationRule =
  | { key: 'required'; message?: string | PropValue; when?: PropValue }
  | { key: 'minLength'; value: number; message?: string | PropValue; when?: PropValue }
  | { key: 'maxLength'; value: number; message?: string | PropValue; when?: PropValue }
  | { key: 'minItems'; value: number; message?: string | PropValue; when?: PropValue }
  | { key: 'maxItems'; value: number; message?: string | PropValue; when?: PropValue }
  | { key: 'min'; value: number; message?: string | PropValue; when?: PropValue }
  | { key: 'max'; value: number; message?: string | PropValue; when?: PropValue }
  | {
      key: 'matches' | 'after'
      field: string
      scope?: 'form' | 'row'
      message?: string | PropValue
      when?: PropValue
    }
  | { key: 'pattern'; value: string; message?: string | PropValue; when?: PropValue }
  | { key: 'email'; message?: string | PropValue; when?: PropValue }
  | { key: 'url'; message?: string | PropValue; when?: PropValue }
  | { key: 'uuid'; message?: string | PropValue; when?: PropValue }
  | { key: 'custom'; expression: string; message?: string | PropValue; when?: PropValue }

export type ValidationKey = ValidationRule['key']

export interface ComponentNode {
  /** Unique within the document. */
  key: string
  /**
   * Defaults to `key`, and may repeat: two fields behind opposite `renderWhen` guards can
   * write one answer. Errors are reported against `key`.
   */
  dataKey?: string
  type: string
  props: Record<string, PropValue>
  /** Present only on data-bound components. */
  schema?: FieldSchema
  events?: Partial<Record<EventName, ActionRef[]>>
  /** Absent means the component cannot take children. */
  children?: ComponentNode[]
  css?: Partial<Record<Device, string>>
  /** Absent means always rendered. */
  renderWhen?: PropValue
}

export type FormSettings = Record<string, never>

export interface FormDocument {
  version: '1'
  id: string
  name: string
  /** Always a container. */
  root: ComponentNode
  actions: Record<string, CodeAction>
  languages: Language[]
  /** Must match a `code` (plus optional `-dialect`) in `languages`. */
  defaultLanguage: string
  /** lang tag -> translation key -> text */
  translations: Record<string, Record<string, string>>
  settings: FormSettings
}

/**
 * Keyed by data key: read a node at `dataKeyOf(node)`, not `node.key`. A repeater's rows
 * are each a `FormData` of their own, nested under the repeater's data key.
 */
export type FormData = Record<string, JsonValue>

/**
 * Never submitted. JSON only: `renderWhen` gates validation, so a server must be able to
 * hold the same context as the browser, or it silently skips fields the browser checked.
 * See [12-api.md](../../../docs/spec/12-api.md#state-that-is-not-an-answer).
 */

export type FormContext = Readonly<Record<string, JsonValue>>
/** Runtime validation errors, keyed by component key. */
export type FormErrors = Record<string, string>
