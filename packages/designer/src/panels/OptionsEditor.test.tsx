/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { OptionsEditor } from './OptionsEditor.js'

it('preserves distinct JSON types and extra fields when their displayed values collide', () => {
  const onChange = vi.fn()
  render(
    <OptionsEditor
      id="choices"
      value={[
        { label: 'Number', value: 0 },
        { label: 'Text', value: '0', disabled: true },
        { label: 'Empty', value: null },
      ]}
      onChange={onChange}
    />,
  )
  fireEvent.change(
    within(screen.getByRole('group', { name: 'Option 2' })).getByLabelText('Label'),
    { target: { value: 'Zero text' } },
  )
  expect(onChange).toHaveBeenLastCalledWith([
    { label: 'Number', value: 0 },
    { label: 'Zero text', value: '0', disabled: true },
    { label: 'Empty', value: null },
  ])
})
