/**
 * What a consumer can actually use.
 *
 * `Palette`, `Canvas` and `Tree` were exported and could not be constructed by
 * anybody: their props name `DragController`, `useDrag`, `Viewport`,
 * `CanvasProps`, `TreeProps` and `PaletteProps`, none of which were exported,
 * and `package.json` exposes only `.` and `./styles.css`. So they were four
 * names that promised a composable shell, delivered nothing, and made every
 * internal refactor of them a breaking change for no stated reason.
 *
 * `Designer` and `useDesigner` are the surface. A consumer wanting to compose
 * the panels themselves needs a decision about what that contract is, which is
 * a thing to design rather than a thing to leak.
 */
export { Designer } from './Designer.js'
export type { DesignerProps } from './Designer.js'
export { useDesigner, MAX_HISTORY } from './store.js'
export type { DesignerApi, RenameResult } from './store.js'
