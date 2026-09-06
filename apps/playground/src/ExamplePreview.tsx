import { flatten } from '@formsmith/core'
import type { FormDocument } from '@formsmith/core'
import type { ReactNode } from 'react'

export function ExamplePreview({ document }: { document: FormDocument }): ReactNode {
  const fields = flatten(document.root)
    .map(({ node }) => {
      const label = node.props['label']
      return {
        node,
        label:
          label?.kind === 'static' && typeof label.value === 'string'
            ? label.value
            : label?.kind === 'i18n'
              ? (document.translations[document.defaultLanguage]?.[label.key] ?? '')
              : '',
      }
    })
    .filter(({ node, label }) => node.schema && node.schema.type !== 'array' && label)
  const abilities = fields.filter(({ label }) => label.endsWith(' score'))
  const character = abilities.length === 6
  const shown = (character ? abilities : fields).slice(0, character ? 6 : 4)
  return (
    <svg className="pg-example__preview" viewBox="0 0 320 166" aria-hidden="true">
      <rect x="16" y="10" width="288" height="156" rx="4" fill="var(--pg-surface)" />
      <rect x="16" y="10" width="288" height="4" fill="var(--pg-accent)" />
      <text x="32" y="40" fill="var(--pg-text)" fontSize="13" fontWeight="600">
        {document.name.length > 35 ? document.name.slice(0, 34) + '…' : document.name}
      </text>
      {shown.map(({ node, label }, index) => {
        const x = character ? 32 + index * 43 : 32 + (index % 2) * 134
        const y = character ? 65 : 66 + Math.floor(index / 2) * 48
        return (
          <g key={node.key}>
            <text x={x} y={y} fill="var(--pg-muted)" fontSize="9">
              {character ? label.slice(0, 3) : label.length > 24 ? label.slice(0, 23) + '…' : label}
            </text>
            <rect
              x={x}
              y={y + 7}
              width={character ? 36 : node.schema?.type === 'boolean' ? 14 : 120}
              height={character ? 43 : 23}
              rx="3"
              fill="var(--pg-soft)"
              stroke="var(--pg-border)"
            />
            {character && (
              <path d={`M${String(x + 13)} ${String(y + 27)}h10`} stroke="var(--pg-muted)" />
            )}
          </g>
        )
      })}
      {character && <path d="M32 135h255M32 148h180" stroke="var(--pg-border)" />}
    </svg>
  )
}
