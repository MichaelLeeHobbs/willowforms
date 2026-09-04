# Actions and events

**Status: built.** Components raise declared events, the designer wires ordered action references, core
turns them into a validated effect batch, and the renderer hands that batch to the host.

## Security boundary

Formsmith never evaluates stored action source. A host that wants code actions must inject an
`ActionEvaluator` backed by a sandbox with no ambient page, network, or server capabilities. The source
must not be passed to `eval`, `Function`, or an equivalent main-realm executor.

Built-in actions need no evaluator. Code actions are skipped when no evaluator is supplied, without
throwing or preventing the rest of the form from rendering.

```ts
type ActionEvaluator = (
  body: string,
  data: FormData,
  context: FormContext | undefined,
  params: Record<string, JsonValue>,
  invocation: ActionInvocation,
) => JsonValue
```

`invocation` identifies the event, node, current value when there is one, and the field address. The
address includes a repeater coordinate such as `addresses[1].line1`, so code running for a repeated row
does not have to infer which row raised the event.

## Model

```ts
type EventName = 'onChange' | 'onClick' | 'onBlur' | 'onFocus' | 'onMount' | 'onUnmount'

interface ActionRef {
  name: string
  type: 'code' | 'builtin'
  params?: Record<string, JsonValue>
}

interface CodeAction {
  name: string
  body: string
  params: Record<string, JsonValue>
}
```

A node's `events` maps each event to an ordered list of references. Code actions live in
`FormDocument.actions` so they can be shared. Reference parameters override the action's default
parameters for that invocation.

`validateDocument` rejects unknown event names, action-reference kinds, built-in names, and code-action
references that do not exist.

## Effects

Actions return data; they do not receive mutable form or host capabilities. Core accepts this closed
effect vocabulary:

```ts
type Effect =
  | { kind: 'setValue'; address: string; value: JsonValue }
  | { kind: 'clearValue'; address: string }
  | { kind: 'focus'; nodeKey: string }
  | { kind: 'announce'; message: string }
  | { kind: 'setContext'; path: string; value: JsonValue }
  | { kind: 'validate'; scope?: string }
  | { kind: 'emit'; event: string; payload?: JsonValue }
  | { kind: 'halt'; reason?: string }
```

The namespaces are intentional: form data uses an address, interface effects use a unique node key,
and host context uses a path. `setContext` only requests a change to the browser-side context; the
server must reconstruct trusted context from its own session.

Every returned value is checked as bounded JSON. An unknown or malformed effect rejects the complete
batch before `onEffects` is called. `halt` keeps effects through itself and discards later effects.

The host receives the checked batch once and decides how to apply it. Formsmith therefore makes no
claim that effects across DOM, form-data, and host-context owners are transactional. Programmatic writes
do not synthesize component events, which prevents action loops inside the renderer.

## Renderer API

```tsx
<FormRenderer
  document={document}
  kit={kit}
  data={data}
  onChange={(address, value) => setData((current) => applyChange(current, address, value))}
  evaluateAction={sandbox.evaluateAction}
  onEffects={(effects, invocation) => applyEffects(effects, invocation)}
  onActionError={(message, invocation) => report(message, invocation)}
/>
```

`onEffects` is called only with a fully validated batch. `onActionError` reports bad references,
evaluator failures, and invalid evaluator output without throwing through the form.

## Authoring

The component inspector's Actions tab lists only events declared by the selected kit component. Each
event has an ordered list with add, remove, and move controls. Parameters are JSON objects.

Document Settings owns code-action names, source, and default parameters. The editor states that the
source requires a host-injected sandbox; saving a source string does not make it executable.

## Host responsibilities

- Isolate code-action evaluation and enforce time and resource limits.
- Apply or reject an effect batch as one host decision.
- Use `applyChange` for addressed form-data writes.
- Treat `emit` as a request subject to the host's authorization and network policy.
- Rebuild trusted server context; never accept browser context as authority.
