/**
 * Palette metadata for the Material UI kit.
 *
 * This half of a kit is pure data with no React import, so the designer can list
 * a palette and build a properties panel without loading any component library.
 */

import type { Kit, PropSchema } from '@formsmith/core'

/** Every user-facing string is localizable; that is the whole reason it is a prop. */
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

export const muiKit: Kit = {
  id: 'mui',
  label: 'Material UI',
  components: [
    {
      type: 'Screen',
      label: 'Screen',
      icon: 'screen',
      group: 'layout',
      container: true,
      root: true,
      defaultProps: { maxWidth: 640, gap: 2 },
      props: [
        { name: 'maxWidth', label: 'Max width', editor: 'number', section: 'style' },
        { name: 'gap', label: 'Gap', editor: 'number', section: 'style' },
      ],
      events: ['onMount', 'onUnmount'],
    },
    {
      type: 'Stack',
      label: 'Stack',
      icon: 'stack',
      group: 'layout',
      container: true,
      defaultProps: { direction: 'column', gap: 2 },
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
      icon: 'heading',
      group: 'display',
      defaultProps: { text: 'Heading', level: 'h5' },
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
      icon: 'text',
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
      icon: 'number',
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
      icon: 'checkbox',
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
      icon: 'select',
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
      icon: 'button',
      group: 'inputs',
      defaultProps: { text: 'Submit', variant: 'contained' },
      props: [
        { name: 'text', label: 'Text', editor: 'string', localizable: true },
        {
          name: 'variant',
          label: 'Variant',
          editor: 'select',
          options: [
            { label: 'Contained', value: 'contained' },
            { label: 'Outlined', value: 'outlined' },
            { label: 'Text', value: 'text' },
          ],
        },
        disabled,
      ],
      events: ['onClick'],
    },
  ],
}
