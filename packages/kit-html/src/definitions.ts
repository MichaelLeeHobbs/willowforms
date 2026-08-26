/**
 * Palette metadata for the HTML kit.
 *
 * A kit's metadata half is pure data with no React import, which is what lets
 * the designer build a palette and a properties panel without loading any
 * component library. This kit exists to prove that claim: it was added as a new
 * package, with no change to core, the renderer, or the designer.
 *
 * The component types match `@formsmith/kit-mui` on purpose, so a document
 * authored against one kit renders against the other. Nothing in the contract
 * requires that; it is a courtesy this repo keeps because it makes swapping kits
 * a one-line change in the host rather than a migration.
 */

import type { Kit, PropSchema } from '@formsmith/core'

const label: PropSchema = {
  name: 'label',
  label: 'Label',
  editor: 'string',
  localizable: true,
}

const helperText: PropSchema = {
  name: 'helperText',
  label: 'Helper text',
  editor: 'string',
  localizable: true,
  hint: 'Shown beneath the field when there is no error.',
}

const disabled: PropSchema = {
  name: 'disabled',
  label: 'Disabled',
  editor: 'boolean',
  section: 'advanced',
}

export const htmlKit: Kit = {
  id: 'html',
  label: 'HTML',
  components: [
    {
      type: 'Screen',
      label: 'Screen',
      group: 'layout',
      container: true,
      root: true,
      defaultProps: { maxWidth: 640, gap: 16 },
      props: [
        { name: 'maxWidth', label: 'Max width', editor: 'number', section: 'style' },
        { name: 'gap', label: 'Gap', editor: 'number', section: 'style' },
      ],
      events: ['onMount', 'onUnmount'],
    },
    {
      type: 'Stack',
      label: 'Stack',
      group: 'layout',
      container: true,
      defaultProps: { direction: 'column', gap: 16 },
      props: [
        {
          name: 'direction',
          label: 'Direction',
          editor: 'select',
          options: [
            { label: 'Column', value: 'column' },
            { label: 'Row', value: 'row' },
          ],
        },
        { name: 'gap', label: 'Gap', editor: 'number', section: 'style' },
      ],
      events: [],
    },
    {
      type: 'Heading',
      label: 'Heading',
      group: 'display',
      defaultProps: { text: 'Heading', level: 'h2' },
      props: [
        { name: 'text', label: 'Text', editor: 'string', localizable: true },
        {
          name: 'level',
          label: 'Level',
          editor: 'select',
          options: (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const).map((v) => ({
            label: v.toUpperCase(),
            value: v,
          })),
        },
      ],
      events: [],
    },
    {
      type: 'TextField',
      label: 'Text field',
      group: 'inputs',
      dataBound: true,
      dataType: 'string',
      defaultProps: { label: 'Label', placeholder: '', helperText: '', multiline: false },
      props: [
        label,
        { name: 'placeholder', label: 'Placeholder', editor: 'string', localizable: true },
        helperText,
        { name: 'multiline', label: 'Multiline', editor: 'boolean' },
        disabled,
      ],
      events: ['onChange', 'onBlur', 'onFocus'],
    },
    {
      type: 'NumberField',
      label: 'Number field',
      group: 'inputs',
      dataBound: true,
      dataType: 'number',
      defaultProps: { label: 'Label', helperText: '' },
      props: [label, helperText, disabled],
      events: ['onChange', 'onBlur'],
    },
    {
      type: 'Checkbox',
      label: 'Checkbox',
      group: 'selection',
      dataBound: true,
      dataType: 'boolean',
      defaultProps: { label: 'Checkbox label' },
      props: [label, disabled],
      events: ['onChange'],
    },
    {
      type: 'Select',
      label: 'Select',
      group: 'selection',
      dataBound: true,
      dataType: 'string',
      defaultProps: { label: 'Label', options: [] },
      props: [
        label,
        {
          name: 'options',
          label: 'Options',
          editor: 'json',
          hint: 'Array of { label, value }. Bind to an expression to load remotely.',
        },
        helperText,
        disabled,
      ],
      events: ['onChange'],
    },
    {
      type: 'Button',
      label: 'Button',
      group: 'inputs',
      defaultProps: { text: 'Submit', variant: 'solid' },
      props: [
        { name: 'text', label: 'Text', editor: 'string', localizable: true },
        {
          name: 'variant',
          label: 'Variant',
          editor: 'select',
          options: [
            { label: 'Solid', value: 'solid' },
            { label: 'Outline', value: 'outline' },
            { label: 'Plain', value: 'plain' },
          ],
        },
        disabled,
      ],
      events: ['onClick'],
    },
  ],
}
