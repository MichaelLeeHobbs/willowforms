export interface StyleRule {
  selector: string
  /** In source order; a property declared twice appears twice. */
  declarations: [property: string, value: string][]
}

/**
 * Every rule that holds declarations, including those inside an at-rule. Deliberately crude: these
 * are stylesheets this repo owns, and none puts a brace or a semicolon inside a value. Throws on a
 * rule nested in another, whose outer declarations it would skip.
 */
export function styleRules(css: string): StyleRule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')

  const open: string[] = []
  for (const [, before = '', brace] of withoutComments.matchAll(/([^{}]*)([{}])/g)) {
    const prelude = (before.split(';').pop() ?? '').trim()
    if (brace === '}') open.pop()
    else if (open.some((outer) => !outer.startsWith('@'))) {
      throw new Error('A nested rule, which this reader cannot read: ' + prelude)
    } else open.push(prelude)
  }

  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? '').trim().replace(/\s+/g, ' '),
    declarations: (match[2] ?? '')
      .split(';')
      .map((declaration) => declaration.split(/:(.*)/s))
      .filter(([property, value]) => property?.trim() && value?.trim())
      .map(([property, value]) => [(property ?? '').trim(), (value ?? '').trim()]),
  }))
}
