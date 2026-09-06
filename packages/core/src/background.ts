import type { JsonValue } from './types.js'
import type { PropSchema } from './kit.js'
import { safeImageSource } from './image.js'

const POSITIONS = [
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'left top',
  'right top',
  'left bottom',
  'right bottom',
]

export const backgroundImageDefaults = {
  backgroundImage: '',
  backgroundFit: 'cover',
  backgroundPosition: 'center',
  backgroundOverlay: 'none',
}

export const backgroundImageProps: PropSchema[] = [
  {
    name: 'backgroundImage',
    label: 'Background image',
    editor: 'image',
    section: 'style',
    hint: 'Decorative only. Use an Image component for meaningful content.',
  },
  {
    name: 'backgroundFit',
    label: 'Image fit',
    editor: 'select',
    section: 'style',
    options: [
      { label: 'Cover', value: 'cover' },
      { label: 'Contain', value: 'contain' },
      { label: 'Tile', value: 'tile' },
    ],
  },
  {
    name: 'backgroundPosition',
    label: 'Image position',
    editor: 'select',
    section: 'style',
    options: POSITIONS.map((value) => ({ label: value[0]!.toUpperCase() + value.slice(1), value })),
  },
  {
    name: 'backgroundOverlay',
    label: 'Readability overlay',
    editor: 'select',
    section: 'style',
    options: [
      { label: 'None', value: 'none' },
      { label: 'Light', value: 'light' },
      { label: 'Dark', value: 'dark' },
    ],
  },
]

/** Only for a React inline style object, never interpolated into a stylesheet. */
export function backgroundImageStyle(props: Record<string, JsonValue>): Record<string, string> {
  const source = safeImageSource(props['backgroundImage'])
  if (!source) return {}
  const rawPosition = props['backgroundPosition']
  const position =
    typeof rawPosition === 'string' && POSITIONS.includes(rawPosition) ? rawPosition : 'center'
  const overlay =
    props['backgroundOverlay'] === 'light'
      ? 'rgb(255 255 255 / 70%)'
      : props['backgroundOverlay'] === 'dark'
        ? 'rgb(0 0 0 / 60%)'
        : ''
  const url = `url(${JSON.stringify(source)})`
  return {
    backgroundImage: overlay ? `linear-gradient(${overlay}, ${overlay}), ${url}` : url,
    backgroundSize:
      props['backgroundFit'] === 'tile'
        ? 'auto'
        : props['backgroundFit'] === 'contain'
          ? 'contain'
          : 'cover',
    backgroundRepeat: props['backgroundFit'] === 'tile' ? 'repeat' : 'no-repeat',
    backgroundPosition: position,
  }
}
