import { useColorScheme } from '@mui/material/styles'
import { htmlRendererKit } from '@willowforms/kit-html'
import type { NodeRendererProps, RendererKit } from '@willowforms/renderer'
import type { ReactNode } from 'react'

const Screen = htmlRendererKit.renderers['Screen']!

function ThemedScreen(input: NodeRendererProps): ReactNode {
  const { mode } = useColorScheme()
  const nodeProps = { ...input.nodeProps, 'data-fsh-theme': mode }
  return <Screen {...input} nodeProps={nodeProps} />
}

export const playgroundHtmlRendererKit: RendererKit = {
  ...htmlRendererKit,
  renderers: { ...htmlRendererKit.renderers, Screen: ThemedScreen },
}
