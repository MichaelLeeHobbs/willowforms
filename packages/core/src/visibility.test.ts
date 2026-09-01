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
    expect(isVisible(field('a', { kind: 'computed', expression: 'yes' }), {}, { evaluate })).toBe(
      true,
    )
    expect(isVisible(field('a', { kind: 'computed', expression: 'no' }), {}, { evaluate })).toBe(
      false,
    )
  })

  it('hands the host context to the evaluator', () => {
    /*
     * The three evaluators in this file pin the expression and the data and
     * never read the third parameter, so it could be dropped at the call site
     * in `runs` and nothing here would say so. A `renderWhen` reading
     * `context.user.role` would then evaluate against `undefined`, come back
     * falsy, and take the node and its whole subtree out of `validateForm` --
     * a required answer becoming optional on the server, which is the failure
     * this module's header names.
     */
    const evaluate: Evaluator = (expression, _data, context) =>
      expression === 'admin' &&
      (context?.['user'] as { role?: string } | undefined)?.role === 'admin'

    const node = field('a', { kind: 'computed', expression: 'admin' })

    expect(isVisible(node, {}, { evaluate, context: { user: { role: 'admin' } } })).toBe(true)
    expect(isVisible(node, {}, { evaluate, context: { user: { role: 'guest' } } })).toBe(false)
  })

  it('keeps a hidden subtree out of validateForm when the context is what hid it', () => {
    // The consequence, spelled out where it lands: this is the reason the
    // argument above matters at all.
    const evaluate: Evaluator = (expression, _data, context) =>
      expression === 'admin' &&
      (context?.['user'] as { role?: string } | undefined)?.role === 'admin'

    const root: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [field('vat', { kind: 'computed', expression: 'admin' })],
    }

    expect(validateForm(root, {}, { evaluate, context: { user: { role: 'admin' } } })).toEqual({
      vat: 'This field is required.',
    })
    expect(validateForm(root, {}, { evaluate, context: { user: { role: 'guest' } } })).toEqual({})
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

  it('validates nothing at all when the root it was given is itself hidden', () => {
    /*
     * `validateForm(stepNode, data)` is the documented way to validate one step
     * of a wizard, and a `Step` carries a `renderWhen` comparing `context.step`
     * against its own key. Hand it no context and the root is hidden, so the
     * whole form reports zero errors and a submit sails through.
     *
     * That is the silent-permissive answer this library takes deliberately over
     * a crash, and no test gave the root a condition of its own, so nothing
     * pinned it. It is pinned here in both directions: hidden root, nothing
     * checked; the same root with the context it wanted, everything checked.
     */
    const step: ComponentNode = {
      key: 'who',
      type: 'Step',
      props: {},
      renderWhen: {
        kind: 'condition',
        condition: {
          op: 'eq',
          left: { kind: 'context', path: 'step' },
          right: { kind: 'literal', value: 'who' },
        },
      },
      children: [field('name')],
    }

    expect(validateForm(step, {}), 'a form nobody can see reports nothing').toEqual({})
    expect(validateForm(step, {}, { context: { step: 'who' } })).toEqual({
      name: 'This field is required.',
    })
  })

  it('starts validating a field once its condition turns true', () => {
    const conditional: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [field('why', { kind: 'computed', expression: 'other' })],
    }
    const evaluate: Evaluator = (_expression, data) => data['other'] === 'yes'

    expect(validateForm(conditional, {}, { evaluate })['why']).toBeUndefined()
    expect(validateForm(conditional, { other: 'yes' }, { evaluate })['why']).toBe(
      'This field is required.',
    )
  })
})

describe('what validateForm hands down to a condition', () => {
  it('forwards the context, so a condition can read what the host knows', () => {
    /*
     * Verified only through outcomes before: `options.context` reaching a
     * `renderWhen` is what makes a per-role field validate or not, and a walk
     * that dropped it would hide every context-gated field and report nothing.
     */
    const gated: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'salary',
          type: 'TextField',
          props: {},
          schema: { type: 'string', validations: [{ key: 'required' }] },
          renderWhen: {
            kind: 'condition',
            condition: {
              op: 'eq',
              left: { kind: 'context', path: 'user.role' },
              right: { kind: 'literal', value: 'admin' },
            },
          },
        },
      ],
    }

    expect(validateForm(gated, {})).toEqual({})
    expect(validateForm(gated, {}, { context: { user: { role: 'guest' } } })).toEqual({})
    expect(validateForm(gated, {}, { context: { user: { role: 'admin' } } })).toEqual({
      salary: 'This field is required.',
    })
  })

  it('hides a container by a condition, not only by a static false', () => {
    /*
     * The hidden-container case used a `static` false, which is the one shape
     * that needs no evaluation at all -- so the walk could have skipped reading
     * a container's condition entirely and every test here stayed green.
     */
    const root: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'group',
          type: 'Stack',
          props: {},
          renderWhen: {
            kind: 'condition',
            condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'wanted' } },
          },
          children: [field('buried')],
        },
      ],
    }

    expect(validateForm(root, {})).toEqual({})
    expect(validateForm(root, { wanted: true })).toEqual({ buried: 'This field is required.' })
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

    expect(isVisible(node(when), { consent: true }, { evaluate: explode })).toBe(true)
  })

  it('hides rather than throws on a condition the document got wrong', () => {
    // isVisible is called by the renderer and by validateForm, so a throw here
    // takes the form off screen for someone who cannot edit the document.
    const broken = { op: 'nonsense' } as unknown as Condition
    expect(() => isVisible(node(broken), {})).not.toThrow()
    expect(isVisible(node(broken), {})).toBe(false)
  })
})

/**
 * A `renderWhen` whose kind this code does not recognise.
 *
 * TypeScript permits the missing tail return because `PropValue` is a closed
 * union — and a document is data, so a one-character typo reaches it. `kind:
 * 'conditon'` fell off the switch and returned `undefined`, which every caller
 * reads as *hidden*: the node and its whole subtree left the DOM and left
 * `validateForm`, so a required answer quietly became advisory on the server.
 *
 * Shown is the safe reading, and it is the reading this function already gives
 * a kind that is not a condition: `i18n` returns true with the comment that a
 * translation key expresses no condition. An unrecognised kind expresses none
 * either. Being shown when you should not be is a question the user can see;
 * being unvalidated is not.
 *
 * This does not contradict `evaluateCondition`, which is false for an
 * unreadable condition. That one is asked whether a condition *holds*, and an
 * unreadable one does not hold. This one is asked whether a rule was expressed.
 */
describe('a renderWhen this code cannot read', () => {
  const typo = {
    kind: 'conditon',
    condition: { op: 'truthy', value: { kind: 'literal', value: 1 } },
  }

  it('shows the component rather than dropping it silently', () => {
    expect(isVisible(field('a', typo as unknown as ComponentNode['renderWhen']), {})).toBe(true)
  })

  it('never answers undefined for any tag, which is what made this invisible', () => {
    /*
     * The failure was not "the wrong boolean", it was "not a boolean at all".
     *
     * Asserting that on the same fixture as the test above adds nothing:
     * `toBe(true)` already excludes `undefined`, so this could not fail unless
     * that one did first. The tags here are the other shapes a hand-edited
     * document produces -- a missing kind, a kind that is not text, a
     * `renderWhen` that is not an object at all -- and each of them used to
     * fall off the switch.
     */
    const shapes: unknown[] = [
      { kind: 'conditon', condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'a' } } },
      { kind: 42 },
      {},
      'always',
      [],
    ]

    for (const shape of shapes) {
      const answer = isVisible(field('a', shape as ComponentNode['renderWhen']), {})
      expect(typeof answer, JSON.stringify(shape)).toBe('boolean')
    }
  })

  it('keeps the field in validation, which is the point', () => {
    const root: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [field('a', typo as unknown as ComponentNode['renderWhen'])],
    }

    // Hidden meant unvalidated. A required answer must not stop being required
    // because somebody mistyped a tag.
    expect(Object.keys(validateForm(root, {}))).toEqual(['a'])
  })
})

/**
 * A host's evaluator is arbitrary JavaScript, and it can throw.
 *
 * `matchesPattern` two files over catches for exactly this, and its comment
 * records the incident: an uncaught throw "took Preview down in the browser and
 * surfaced as an unhandled 500 on the server". This called `options.evaluate`
 * with nothing around it, so an author's half-written expression did the same
 * thing from a different place.
 */
describe('an evaluator that throws', () => {
  const boom: Evaluator = () => {
    throw new Error('half-written expression')
  }

  const computed = (): ComponentNode => field('a', { kind: 'computed', expression: 'data.x.y' })

  it('does not take the caller down', () => {
    expect(() => isVisible(computed(), {}, { evaluate: boom })).not.toThrow()
  })

  it('reads as hidden, which is what no answer already means here', () => {
    // The same answer a missing evaluator gets, one case up: this function
    // agrees with what the renderer draws, and the renderer draws nothing.
    expect(isVisible(computed(), {}, { evaluate: boom })).toBe(false)
  })

  it('still uses an evaluator that works', () => {
    const evaluate: Evaluator = () => true
    expect(isVisible(computed(), {}, { evaluate })).toBe(true)
  })
})

/**
 * A computed condition on a field inside a repeater.
 *
 * `runs` handed the top-level data to the evaluator, so an expression reading a
 * per-row answer read the (usually absent) form-level key instead, came back
 * falsy, and hid that field in every row -- taking it out of `validateForm`
 * with it, which is a required answer quietly becoming optional. The
 * `condition` branch beside it has always passed the row.
 */
describe('a computed renderWhen inside a row', () => {
  const evaluate: Evaluator = (expression, data) => data[expression] === 'yes'

  const root: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'addressList',
        dataKey: 'addresses',
        type: 'Repeater',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [
          {
            key: 'reason',
            dataKey: 'why',
            type: 'Field',
            props: {},
            schema: { type: 'string', validations: [{ key: 'required' }] },
            renderWhen: { kind: 'computed', expression: 'other' },
          },
        ],
      },
    ],
  }

  it('reads the row it is drawn in', () => {
    // Row 0 says yes and row 1 does not, so exactly one row asks the question.
    const data = { addresses: [{ other: 'yes' }, { other: 'no' }] }

    expect(validateForm(root, data, { evaluate })).toEqual({
      'addresses[0].reason': 'This field is required.',
    })
  })

  it('still reads a form-level answer the row does not shadow', () => {
    // The other half of the same scoping rule the `custom` rule follows: the
    // row's answers first, the form's underneath.
    const data = { other: 'yes', addresses: [{}, {}] }

    expect(Object.keys(validateForm(root, data, { evaluate }))).toEqual([
      'addresses[0].reason',
      'addresses[1].reason',
    ])
  })
})

/**
 * The two shapes this function is handed by a walk that does not filter.
 *
 * `isVisible` is the first thing `validateForm`'s walk calls and the renderer
 * calls it per node, and it dereferenced whatever arrived -- unlike every other
 * document walker in the package. `validateForm` filters its children now, so
 * the node guard is unreachable from there; the renderer's `childrenOf` guards
 * that `children` is an array and not what is in it, so it is reachable from
 * the other caller. Driven directly here rather than through either, because a
 * guard tested only through a caller that filters is a guard nothing executes.
 */
describe('a node or a condition that is not there at all', () => {
  it('does not throw on a child that is not a node', () => {
    const notANode = null as unknown as ComponentNode

    expect(() => isVisible(notANode, {})).not.toThrow()
  })

  it('shows it rather than hiding it', () => {
    /*
     * Visible, in the direction this file argues for everywhere else. Hidden
     * would take a subtree out of validation, and there is nothing here to
     * hide in the first place.
     */
    expect(isVisible(null as unknown as ComponentNode, {})).toBe(true)
    expect(isVisible(7 as unknown as ComponentNode, {})).toBe(true)
  })

  it('shows a condition kind that carries no condition', () => {
    /*
     * The case the malformed-condition test above does not reach: it varies the
     * `op` inside a condition that is present. This one has no `condition`
     * property at all, which `tree.ts` permits into a document and nothing on
     * the validate path gates.
     *
     * By this file's stated rule -- asked whether a rule was *expressed*, not
     * whether one holds -- that is shown. It answered hidden, so the node and
     * everything under it left validateForm and a required answer became
     * advisory on the server.
     */
    // Cast on the whole node: `exactOptionalPropertyTypes` is on, so a
    // `renderWhen` typed as possibly-undefined is not assignable to the
    // optional property, and the shape under test is one the type forbids.
    const bare = {
      key: 'x',
      type: 'Field',
      props: {},
      renderWhen: { kind: 'condition' },
    } as unknown as ComponentNode

    expect(isVisible(bare, {})).toBe(true)
  })

  it('still hides on a condition that is present and false', () => {
    // The control. Answering true for everything would pass all three above.
    const when = { op: 'truthy', value: { kind: 'literal', value: false } } as unknown as Condition
    const guarded: ComponentNode = {
      key: 'x',
      type: 'Field',
      props: {},
      renderWhen: { kind: 'condition', condition: when },
    }

    expect(isVisible(guarded, {})).toBe(false)
  })
})
