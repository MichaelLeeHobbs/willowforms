import { describe, expect, it } from 'vitest'
import type { ComponentNode, Evaluator } from './index.js'
import { isVisible, validateForm } from './index.js'

const required = { type: 'string' as const, validations: [{ key: 'required' as const }] }

function field(key: string, renderWhen?: ComponentNode['renderWhen']): ComponentNode {
  return renderWhen
    ? { key, type: 'Field', props: {}, schema: required, renderWhen }
    : { key, type: 'Field', props: {}, schema: required }
}

describe('isVisible', () => {
  it('shows a component with no condition', () => {
    expect(isVisible(field('a'), {})).toBe(true)
  })

  it('reads a static condition', () => {
    expect(isVisible(field('a', { kind: 'static', value: true }), {})).toBe(true)
    expect(isVisible(field('a', { kind: 'static', value: false }), {})).toBe(false)
  })

  it('uses the injected evaluator for a computed condition', () => {
    const evaluate: Evaluator = (expression) => expression === 'yes'
    expect(isVisible(field('a', { kind: 'computed', expression: 'yes' }), {}, evaluate)).toBe(true)
    expect(isVisible(field('a', { kind: 'computed', expression: 'no' }), {}, evaluate)).toBe(false)
  })

  it('hides a computed condition when no evaluator is injected', () => {
    // The renderer resolves a computed binding to null without a sandbox, and a
    // null condition renders nothing. Validation has to agree with that.
    expect(isVisible(field('a', { kind: 'computed', expression: 'anything' }), {})).toBe(false)
  })

  it('treats a translation key as no condition at all', () => {
    // Otherwise a missing translation bundle would silently hide components.
    expect(isVisible(field('a', { kind: 'i18n', key: 'x' }), {})).toBe(true)
  })
})

describe('validateForm and visibility', () => {
  const root: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      field('visible'),
      field('hidden', { kind: 'static', value: false }),
      {
        key: 'hiddenGroup',
        type: 'Stack',
        props: {},
        renderWhen: { kind: 'static', value: false },
        children: [field('buried'), field('deeper')],
      },
    ],
  }

  it('never blocks a submit on a field the user cannot see', () => {
    const errors = validateForm(root, {})
    expect(errors['hidden']).toBeUndefined()
  })

  it('skips everything inside a hidden container', () => {
    // Hiding a container hides its children; validating them anyway would fail a
    // submit with errors that have no visible cause.
    const errors = validateForm(root, {})
    expect(errors['buried']).toBeUndefined()
    expect(errors['deeper']).toBeUndefined()
  })

  it('still validates what is on screen', () => {
    expect(validateForm(root, {})['visible']).toBe('This field is required.')
    expect(validateForm(root, { visible: 'filled' })).toEqual({})
  })

  it('starts validating a field once its condition turns true', () => {
    const conditional: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [field('why', { kind: 'computed', expression: 'other' })],
    }
    const evaluate: Evaluator = (_expression, data) => data['other'] === 'yes'

    expect(validateForm(conditional, {}, evaluate)['why']).toBeUndefined()
    expect(validateForm(conditional, { other: 'yes' }, evaluate)['why']).toBe(
      'This field is required.',
    )
  })
})
