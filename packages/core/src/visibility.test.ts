import { describe, expect, it } from 'vitest'
import type { ComponentNode, Condition, Evaluator } from './index.js'
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

describe('a structured condition needs no sandbox', () => {
  const node = (condition: Condition): ComponentNode => ({
    key: 'extra',
    type: 'TextField',
    props: {},
    renderWhen: { kind: 'condition', condition },
  })

  it('decides visibility with no evaluator injected at all', () => {
    /*
     * The whole reason the vocabulary exists. Before this, the only conditional
     * form of renderWhen was an expression, so a form that hid its second field
     * until the first was answered required the host to stand up a JavaScript
     * sandbox. Note the absent third argument.
     */
    const when: Condition = {
      op: 'eq',
      left: { kind: 'ref', dataKey: 'country' },
      right: { kind: 'literal', value: 'GB' },
    }

    expect(isVisible(node(when), { country: 'GB' })).toBe(true)
    expect(isVisible(node(when), { country: 'FR' })).toBe(false)
  })

  it('ignores an evaluator when one is present, rather than preferring it', () => {
    const explode = (): never => {
      throw new Error('a structured condition must not reach the sandbox')
    }
    const when: Condition = { op: 'truthy', value: { kind: 'ref', dataKey: 'consent' } }

    expect(isVisible(node(when), { consent: true }, explode)).toBe(true)
  })

  it('hides rather than throws on a condition the document got wrong', () => {
    // isVisible is called by the renderer and by validateForm, so a throw here
    // takes the form off screen for someone who cannot edit the document.
    const broken = { op: 'nonsense' } as unknown as Condition
    expect(() => isVisible(node(broken), {})).not.toThrow()
    expect(isVisible(node(broken), {})).toBe(false)
  })
})
