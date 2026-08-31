/**
 * The designer's icon set.
 *
 * Core names the vocabulary and this draws it. The designer imports no component
 * library, which rules out every icon package as surely as it rules out MUI, so
 * these are hand-authored and inline. That is the price of the seam and it is a
 * small one: a form builder needs about twenty glyphs, not a thousand.
 *
 * Every glyph is a 24x24 stroke drawing on `currentColor`, so it takes the
 * colour of whatever it sits in and needs no token of its own.
 */

import type { IconName } from '@formsmith/core'
import type { ReactNode } from 'react'

/**
 * One entry per name in `IconName`.
 *
 * Typed as a total record, so adding a name to the vocabulary in core fails to
 * compile here until it is drawn. A palette entry silently rendering nothing is
 * exactly the failure this project treats as worst.
 */
const GLYPHS: Record<IconName, ReactNode> = {
  text: (
    <>
      <path d="M5 7V5h14v2" />
      <path d="M12 5v14" />
      <path d="M9 19h6" />
    </>
  ),
  textarea: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 10h10M7 14h6" />
    </>
  ),
  number: (
    <>
      <path d="M8 4 6 20M18 4l-2 16" />
      <path d="M4 9h16M3 15h16" />
    </>
  ),
  date: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  file: (
    <>
      <path d="M13 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8z" />
      <path d="M13 3v5h5" />
    </>
  ),
  checkbox: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  radio: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  select: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="m9 11 3 3 3-3" />
    </>
  ),
  switch: (
    <>
      <rect x="2" y="7" width="20" height="10" rx="5" />
      <circle cx="16" cy="12" r="3" />
    </>
  ),
  button: (
    <>
      <rect x="3" y="8" width="18" height="9" rx="3" />
      <path d="M8 12.5h8" />
    </>
  ),
  heading: (
    <>
      <path d="M6 4v16M18 4v16M6 12h12" />
    </>
  ),
  paragraph: (
    <>
      <path d="M4 6h16M4 11h16M4 16h10" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m5 17 4.5-4.5L13 16l3-2.5L20 17" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.66 0l2.5-2.5a4 4 0 0 0-5.66-5.66L11 7.34" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-2.5 2.5a4 4 0 0 0 5.66 5.66L13 16.66" />
    </>
  ),
  divider: (
    <>
      <path d="M3 12h18" />
      <path d="M6 7h12M6 17h12" opacity="0.4" />
    </>
  ),
  stack: (
    <>
      <rect x="4" y="4" width="16" height="4" rx="1" />
      <rect x="4" y="10" width="16" height="4" rx="1" />
      <rect x="4" y="16" width="16" height="4" rx="1" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>
  ),
  box: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
    </>
  ),
  screen: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M9 21h6M12 17v4" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 4h4M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  progress: (
    <>
      <path d="M4 12h16" opacity="0.35" />
      <path d="M4 12h9" />
      <circle cx="13" cy="12" r="2.5" />
    </>
  ),
  chevron: (
    <>
      <path d="m9 5 7 7-7 7" />
    </>
  ),
  tablet: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M10 18.5h4" />
    </>
  ),
  mobile: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  repeat: (
    <>
      <path d="M4 9a5 5 0 0 1 5-5h11" />
      <path d="m17 1 3 3-3 3" />
      <path d="M20 15a5 5 0 0 1-5 5H4" />
      <path d="m7 23-3-3 3-3" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 2.5 20h19z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  tabs: (
    <>
      <path d="M3 9h18v11H3z" />
      <path d="M3 9V5h7v4" />
    </>
  ),
}

export interface IconProps {
  name: IconName
  /** Pixel size of the square. Defaults to 16, the palette's size. */
  size?: number
}

/**
 * Decorative by default.
 *
 * Every place an icon appears here, it sits beside the same word it stands for,
 * so naming it would make a screen reader read the label twice.
 */
export function Icon({ name, size = 16 }: IconProps): ReactNode {
  /*
   * A name outside the vocabulary draws nothing at all, rather than an empty
   * 16px square. The type says this cannot happen and a kit is third-party
   * code, so it can: an unknown name used to reserve the space an icon would
   * take and leave a hole beside the label, which looks like a glyph that
   * failed to load. Drawing nothing lets the label stand on its own, which is
   * what a kit shipping without icons already gets.
   */
  const glyph = GLYPHS[name]
  if (!glyph) return null

  return (
    <svg
      className="fs-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyph}
    </svg>
  )
}

/**
 * Every name the vocabulary declares, for tests and for a future icon picker.
 *
 * The assertion is real and stays. `Object.keys` is typed `string[]` because a
 * value can carry keys its type does not declare, so no amount of typing on
 * `GLYPHS` makes TypeScript hand back `IconName[]` on its own -- `Object.entries`
 * does not either, which is what an earlier version of this comment claimed
 * while its `.map()` still asserted on every element. A comment that says a cast
 * is gone, with the cast on the next line, has now been written here twice.
 *
 * What makes the assertion safe is the annotation on `GLYPHS`: `Record<IconName,
 * ReactNode>` is missing-key checked, so a name added to `IconName` in core
 * stops this file compiling until a glyph exists for it.
 */
export const ICON_NAMES: IconName[] = Object.keys(GLYPHS) as IconName[]
