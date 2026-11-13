import type * as Re2js from 're2js'
import { describe, expect, it, vi } from 'vitest'

import type { ComponentNode, FormData } from './types.js'
import { DEFAULT_MESSAGES, MAX_ROWS, validateForm } from './validation.js'

const compiled = vi.hoisted(() => [] as string[])

vi.mock('re2js', async (importOriginal) => {
  const actual = await importOriginal<typeof Re2js>()
  const compile = actual.RE2JS.compile.bind(actual.RE2JS)
  actual.RE2JS.compile = (regex: string, flags?: number) => {
    compiled.push(regex)
    return compile(regex, flags)
  }
  return actual
})

/**
 * A repeater applies one pattern to every row, and the request body chooses the
 * row count. Compiling per value would multiply compile cost by that count.
 */
describe('a pattern rule across repeater rows', () => {
  const pattern = '^[A-Z]{2}\\d{4}$'

  const root: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'codeList',
        dataKey: 'codes',
        type: 'Repeater',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [
          {
            key: 'codeField',
            dataKey: 'code',
            type: 'TextField',
            props: {},
            schema: { type: 'string', validations: [{ key: 'pattern', value: pattern }] },
          },
        ],
      },
    ],
  }

  it('compiles the pattern once for every row and every later submission', () => {
    const data: FormData = {
      codes: Array.from({ length: MAX_ROWS }, (_, row) => ({
        code: row === 0 ? 'nope' : 'AB1234',
      })),
    }

    expect(validateForm(root, data)).toEqual({ 'codes[0].codeField': DEFAULT_MESSAGES.pattern })
    expect(validateForm(root, data)).toEqual({ 'codes[0].codeField': DEFAULT_MESSAGES.pattern })
    expect(compiled.filter((source) => source === pattern)).toHaveLength(1)
  })
})
