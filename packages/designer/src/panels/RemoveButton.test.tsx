/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'

import { Icon } from '../Icon.js'
import { RemoveButton } from './RemoveButton.js'

// `e2e/remove-buttons.spec.ts` checks that every place draws this one.
it('draws the trash icon and names what it removes', () => {
  const trash = render(<Icon name="trash" size={13} />).container.innerHTML
  render(<RemoveButton name="Required" className="fs-rule__remove" />)

  const button = screen.getByRole('button', { name: 'Remove Required' })
  expect(button.innerHTML).toBe(trash)
  expect(button.className).toBe('fs-remove fs-rule__remove')
})
