import type {
  ActionRef,
  CodeAction,
  Effect,
  EventName,
  FormContext,
  FormData,
  JsonValue,
} from './types.js'

export interface ActionInvocation {
  event: EventName
  nodeKey: string
  /** Address of the component's value, including its repeated-row coordinate. */
  address: string
  value?: JsonValue
}

export type ActionEvaluator = (
  body: string,
  data: FormData,
  context: FormContext | undefined,
  params: Record<string, JsonValue>,
  invocation: ActionInvocation,
) => JsonValue

export type ActionRunResult =
  { ok: true; effects: Effect[] } | { ok: false; error: string; action?: string }

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** Most JSON values one action parameter or effect payload may contain. */
const ACTION_VALUE_LIMIT = 10_000

export type JsonShape = 'json' | 'not-json' | 'too-large'

/** Classify a value as plain JSON within `limit` values, without recursion. */
export function jsonShape(value: unknown, limit: number): JsonShape {
  try {
    return walkJson(value, limit)
  } catch {
    return 'not-json'
  }
}

function jsonValue(value: unknown): value is JsonValue {
  return walkJson(value, ACTION_VALUE_LIMIT) === 'json'
}

function walkJson(value: unknown, limit: number): JsonShape {
  const pending: unknown[] = [value]
  const seen = new WeakSet<object>()
  let visited = 0

  while (pending.length > 0) {
    if (++visited > limit) return 'too-large'
    const current = pending.pop()
    if (
      current === null ||
      typeof current === 'string' ||
      typeof current === 'boolean' ||
      (typeof current === 'number' && Number.isFinite(current))
    ) {
      continue
    }
    if (!current || typeof current !== 'object' || seen.has(current)) return 'not-json'
    seen.add(current)
    if (Array.isArray(current)) {
      for (const item of current as unknown[]) pending.push(item)
    } else {
      for (const item of Object.values(current as Record<string, unknown>)) pending.push(item)
    }
  }
  return 'json'
}

export function isJsonValue(value: unknown): value is JsonValue {
  try {
    return jsonValue(value)
  } catch {
    return false
  }
}

function optionalText(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

export const BUILTIN_ACTION_NAMES = [
  'setValue',
  'clearValue',
  'focus',
  'announce',
  'setContext',
  'validate',
  'emit',
  'halt',
] as const

function effectOf(value: unknown): Effect | undefined {
  if (!object(value) || typeof value['kind'] !== 'string') return undefined

  switch (value['kind']) {
    case 'setValue':
      return typeof value['address'] === 'string' && jsonValue(value['value'])
        ? { kind: 'setValue', address: value['address'], value: value['value'] }
        : undefined
    case 'clearValue':
      return typeof value['address'] === 'string'
        ? { kind: 'clearValue', address: value['address'] }
        : undefined
    case 'focus':
      return typeof value['nodeKey'] === 'string'
        ? { kind: 'focus', nodeKey: value['nodeKey'] }
        : undefined
    case 'announce':
      return typeof value['message'] === 'string'
        ? { kind: 'announce', message: value['message'] }
        : undefined
    case 'setContext':
      return typeof value['path'] === 'string' && jsonValue(value['value'])
        ? { kind: 'setContext', path: value['path'], value: value['value'] }
        : undefined
    case 'validate':
      return optionalText(value['scope'])
        ? { kind: 'validate', ...(value['scope'] ? { scope: value['scope'] } : {}) }
        : undefined
    case 'emit':
      return typeof value['event'] === 'string' &&
        (!Object.hasOwn(value, 'payload') || jsonValue(value['payload']))
        ? ({
            kind: 'emit',
            event: value['event'],
            ...(Object.hasOwn(value, 'payload') ? { payload: value['payload'] } : {}),
          } as Effect)
        : undefined
    case 'halt':
      return optionalText(value['reason'])
        ? { kind: 'halt', ...(value['reason'] ? { reason: value['reason'] } : {}) }
        : undefined
    default:
      return undefined
  }
}

function builtin(ref: ActionRef): Effect | undefined {
  try {
    return effectOf({ ...(ref.params ?? {}), kind: ref.name })
  } catch {
    return undefined
  }
}

export function runActions(
  refs: readonly ActionRef[],
  actions: Record<string, CodeAction>,
  data: FormData,
  invocation: ActionInvocation,
  options: {
    context?: FormContext | undefined
    evaluate?: ActionEvaluator | undefined
  } = {},
): ActionRunResult {
  const effects: Effect[] = []

  for (const ref of refs) {
    if (!ref || typeof ref !== 'object' || typeof ref.name !== 'string') {
      return { ok: false, error: 'Unreadable action reference.' }
    }
    if (ref.params !== undefined && (!object(ref.params) || !isJsonValue(ref.params))) {
      return { ok: false, error: 'Unreadable action parameters.', action: ref.name }
    }

    if (ref.type === 'builtin') {
      const effect = builtin(ref)
      if (!effect) return { ok: false, error: 'Invalid built-in action.', action: ref.name }
      effects.push(effect)
      if (effect.kind === 'halt') return { ok: true, effects }
      continue
    }

    if (ref.type !== 'code') {
      return { ok: false, error: 'Unknown action type.', action: ref.name }
    }
    if (!Object.hasOwn(actions, ref.name)) {
      return { ok: false, error: 'Unknown code action.', action: ref.name }
    }
    if (!options.evaluate) continue

    const action = actions[ref.name]
    if (
      !action ||
      typeof action.body !== 'string' ||
      !object(action.params) ||
      !isJsonValue(action.params)
    ) {
      return { ok: false, error: 'Unreadable code action.', action: ref.name }
    }

    let returned: JsonValue
    try {
      const params = { ...action.params, ...(ref.params ?? {}) }
      returned = options.evaluate(action.body, data, options.context, params, invocation)
    } catch {
      return { ok: false, error: 'Code action failed.', action: ref.name }
    }
    if (!Array.isArray(returned)) {
      return { ok: false, error: 'Code action did not return an effect list.', action: ref.name }
    }
    try {
      for (const candidate of returned) {
        const effect = effectOf(candidate)
        if (!effect)
          return { ok: false, error: 'Code action returned an invalid effect.', action: ref.name }
        effects.push(effect)
        if (effect.kind === 'halt') return { ok: true, effects }
      }
    } catch {
      return { ok: false, error: 'Code action returned an invalid effect.', action: ref.name }
    }
  }

  return { ok: true, effects }
}
