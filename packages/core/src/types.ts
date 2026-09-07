/**
 * The WillowForms document model.
 *
 * A form is a recursive tree of {@link ComponentNode}. The tree is the source of
 * truth; JSON Schema is an export format, not the storage format, because JSON
 * Schema cannot express layout or nesting.
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

/** Breakpoints a style value can be scoped to. */
export type Device = 'any' | 'desktop' | 'tablet' | 'mobile'

/** Lifecycle hooks a component can subscribe to. */
export type EventName = 'onChange' | 'onClick' | 'onBlur' | 'onFocus' | 'onMount' | 'onUnmount'

/**
 * A property value is a tagged union rather than a bag discriminated by the
 * presence of an optional field. Every consumer switches on `kind` exhaustively,
 * so adding a fourth binding mode is a compile error at every call site.
 */
export type PropValue =
  | { kind: 'static'; value: JsonValue }
  /** A JS expression evaluated against the live form at render time. */
  | { kind: 'computed'; expression: string }
  /** A lookup into the active language's translation bundle. */
  | { kind: 'i18n'; key: string }
  /**
   * A structured condition, evaluated by core with no sandbox.
   *
   * Resolves to a boolean, so it is meant for `renderWhen`, a rule's `when`
   * guard, and properties that take one. Nothing stops it being set on a label,
   * where it renders as `true` or `false`; the panel only offers it where it
   * makes sense, which is the same way `i18n` is offered only on copy.
   */
  | { kind: 'condition'; condition: Condition }

/**
 * The closed set of comparisons a document can express.
 *
 * Closed on purpose. This is a vocabulary, not a language: it can be
 * enumerated, drawn as a picker, and evaluated without executing anything. See
 * `evaluateCondition`, and [01-document-model.md](../../../docs/spec/01-document-model.md).
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
      /**
       * Which answer this names when it is evaluated inside a repeater's row.
       *
       * `form` reads the top level and `row` reads the enclosing row. Absent
       * means `form`, which is what every `ref` written before repeaters existed
       * already meant, so no document has to change.
       *
       * A discriminant rather than a path grammar in the document. Once a name
       * could mean either, something has to decide which, and every mechanism
       * for deciding reads plausibly and tests something else — which is how a
       * library ends up with eight flavours of path per component.
       */
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
  /** Region subtag, e.g. `US`. Optional for languages without one. */
  dialect?: string
  name: string
  bidi: 'ltr' | 'rtl'
}

/** The data-shape contract for a component that participates in form data. */
export interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'file'

  validations?: ValidationRule[]
  /** Validate on change rather than only on submit. */
  autoValidate?: boolean
}

/**
 * Validation rules carry their parameters in the type.
 *
 * A discriminated union rather than an untyped `{ key, message? }`: the latter
 * cannot say that `minLength` has a number and `required` has nothing, so the
 * parameter travels in a side channel and every reader guesses. The comparison
 * that motivated this is in `docs/prior-art`, which is where competitive
 * material belongs; this is a public type in an MIT package.
 */
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
  /** Unique within the document. Doubles as the data key unless overridden. */
  key: string
  /**
   * The name this component's value takes in submitted data. Defaults to `key`.
   *
   * `key` is identity: unique within the document, the link from a DOM element
   * back to a node, and what an error is reported against. `dataKey` is the name
   * a form author chose for the value, and it is allowed to repeat: two fields
   * behind opposite `renderWhen` guards writing one answer is a real pattern,
   * and forbidding it would buy nothing.
   *
   * That split is why errors stay keyed by `key`. An error belongs to a
   * component on screen, and two components sharing a `dataKey` still need to be
   * able to say different things.
   */
  dataKey?: string
  /** Kit-scoped component id, e.g. `TextField`, `Stack`. */
  type: string
  props: Record<string, PropValue>
  /** Present only on data-bound components. */
  schema?: FieldSchema
  events?: Partial<Record<EventName, ActionRef[]>>
  /** Containers only. Absent means the component cannot take children. */
  children?: ComponentNode[]
  /** Raw CSS text per breakpoint. */
  css?: Partial<Record<Device, string>>
  /** Conditional visibility. Absent means always rendered. */
  renderWhen?: PropValue
}

/** Reserved for versioned document-wide settings. Version 1 defines none. */
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
 * Runtime form data, keyed by **data key**.
 *
 * `dataKeyOf(node)`, which is `node.dataKey ?? node.key` -- so a field the
 * author renamed is read and submitted under the name they chose, and two
 * fields deliberately sharing a data key are one answer. Errors are the other
 * way round and stay keyed by component key, for the reason `dataKey`'s own
 * comment gives; this line said "component key" and a host reading only it
 * writes `data[node.key]` and silently misses every renamed field.
 *
 * Inside a repeater the keys are the row's, not the form's: a row is a
 * `FormData` of its own, nested under the repeater's data key.
 */
export type FormData = Record<string, JsonValue>

/**
 * What the host knows that the form did not ask.
 *
 * The signed-in user's role, a feature flag, the tenant's country, how many
 * addresses a lookup returned. A condition can read it, and it is never part of
 * the payload, because it is not an answer to anything.
 *
 * It is JSON, and that is a rule rather than a convenience. `renderWhen` gates
 * validation, so a server running `validateForm` on the same document has to
 * reach the same answer as the browser did. A value the server cannot be handed
 * is a value the two will disagree about, and they disagree silently: the field
 * is simply not checked. So anything a condition can read has to survive being
 * sent to Node, which means JSON and nothing else.
 *
 * That is also why a `File`, an `AbortController` or a spinner's own boolean
 * does not live here. Those belong to the component holding them, they are the
 * kit's business, and no condition can read them. See
 * [12-api.md](../../../docs/spec/12-api.md#state-that-is-not-an-answer).
 */

export type FormContext = Readonly<Record<string, JsonValue>>
/** Runtime validation errors, keyed by component key. */
export type FormErrors = Record<string, string>
