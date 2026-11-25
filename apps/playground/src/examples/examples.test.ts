import { describe, expect, it } from 'vitest'
import {
  applyChange,
  contextValues,
  DEFAULT_MESSAGES,
  evaluatorKeys,
  flatten,
  languageTag,
  loadDocument,
  validateForm,
} from '@willowforms/core'
import { htmlKit } from '@willowforms/kit-html'
import { muiKit } from '@willowforms/kit-mui'
import { EXAMPLES } from './index.js'

describe('playground example documents', () => {
  it.each(EXAMPLES)('$title loads unchanged and uses components in both kits', ({ document }) => {
    const loaded = loadDocument(JSON.parse(JSON.stringify(document)))
    expect(loaded).toMatchObject({ ok: true })
    expect(loaded.ok && loaded.document).toEqual(document)
    for (const { node } of flatten(document.root)) {
      expect(htmlKit.components.some((def) => def.type === node.type)).toBe(true)
      expect(muiKit.components.some((def) => def.type === node.type)).toBe(true)
    }
    expect(evaluatorKeys(document.root)).toEqual([])
  })

  it.each(EXAMPLES)('$title has text in every language for what it translates', ({ document }) => {
    const keys = flatten(document.root)
      .flatMap(({ node }) => [
        ...Object.values(node.props),
        ...(node.schema?.validations ?? []).map((rule) => rule.message),
      ])
      .flatMap((value) => (typeof value === 'object' && value.kind === 'i18n' ? [value.key] : []))

    for (const language of document.languages) {
      const bundle = document.translations[languageTag(language)] ?? {}
      expect(keys.filter((key) => !(key in bundle))).toEqual([])
    }
  })

  it('words a missing answer itself only in the example that translates it', () => {
    const errors = (id: string, key: string): string | undefined => {
      const { root, translations, defaultLanguage } = EXAMPLES.find(
        (example) => example.id === id,
      )!.document
      const messages = translations[defaultLanguage] ?? {}
      return validateForm(root, {}, { context: { step: 'About you' }, messages })[key]
    }
    expect(errors('job-application', 'fullName')).toBe(DEFAULT_MESSAGES.required)
    expect(errors('workshop-enrollment', 'participant')).toBe('Please complete this field.')
  })

  it('keeps example identifiers distinct for independent saved designs', () => {
    expect(new Set(EXAMPLES.map((example) => example.id)).size).toBe(EXAMPLES.length)
  })

  it('applies conditional follow-up requirements only when requested', () => {
    const document = EXAMPLES.find((example) => example.id === 'customer-feedback')!.document
    expect(validateForm(document.root, { rating: 'Good', contactMe: false })).toEqual({})
    expect(validateForm(document.root, { rating: 'Good', contactMe: true })).toHaveProperty(
      'replyEmail',
    )
    expect(
      validateForm(document.root, {
        rating: 'Good',
        contactMe: true,
        replyEmail: 'reader@example.com',
      }),
    ).toEqual({})
  })

  it('addresses expense answers and errors in the correct repeated row', () => {
    const document = EXAMPLES.find((example) => example.id === 'expense-report')!.document
    const data = applyChange({ expenses: [{}] }, 'expenses[0].amount', -5)
    expect(data).toEqual({ expenses: [{ amount: -5 }] })
    expect(validateForm(document.root, data)).toHaveProperty('expenses[0].amount')
  })

  it('declares three distinct pages for the application', () => {
    const document = EXAMPLES.find((example) => example.id === 'job-application')!.document
    expect(contextValues(document.root, 'step')).toEqual([
      'About you',
      'Experience and interests',
      'Practical details',
    ])
    expect(validateForm(document.root, {}, { context: { step: 'About you' } })).toHaveProperty(
      'fullName',
    )
    expect(
      validateForm(document.root, {}, { context: { step: 'Practical details' } }),
    ).not.toHaveProperty('fullName')
  })
})
