export interface StyleRule {
  selector: string
  /** In source order; a property declared twice appears twice. */
  declarations: [property: string, value: string][]
}

/**
 * Every rule that holds declarations, including those inside an at-rule. Deliberately crude: these
 * are stylesheets this repo owns, and none puts a brace or a semicolon inside a value.
 */
export function styleRules(css: string): StyleRule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')

  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? '').trim().replace(/\s+/g, ' '),
    declarations: (match[2] ?? '')
      .split(';')
      .map((declaration) => declaration.split(/:(.*)/s))
      .filter(([property, value]) => property?.trim() && value?.trim())
      .map(([property, value]) => [(property ?? '').trim(), (value ?? '').trim()]),
  }))
}
