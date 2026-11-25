import type { ComponentProps, ReactNode } from 'react'

import { Icon } from '../Icon.js'

export interface RemoveButtonProps extends Omit<
  ComponentProps<'button'>,
  'aria-label' | 'children' | 'title' | 'type'
> {
  /** What it removes, for its accessible name. */
  name: string
}

/** How the designer draws removing something, so that × only ever closes. */
export function RemoveButton({ name, className, ...rest }: RemoveButtonProps): ReactNode {
  return (
    <button
      {...rest}
      type="button"
      className={'fs-remove' + (className ? ' ' + className : '')}
      aria-label={'Remove ' + name}
      title="Remove"
    >
      <Icon name="trash" size={13} />
    </button>
  )
}
