/**
 * Palette metadata for the Material UI kit.
 *
 * This half of a kit has no React import, so the designer can list a palette and
 * build a properties panel without loading any component library.
 *
 * Data with one exception, and the exception is deliberate: `defaultRenderWhen`
 * is a function, because a `Step`'s condition names the node's own key and the
 * key is not known until the node is made. So a `Kit` does not round-trip
 * through JSON, and nothing here relies on it doing so -- a kit is code a host
 * imports, not a document it stores.
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
      icon: 'stack',
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

      props: [label, helperText, disabled],
      events: ['onChange'],
    },
    {
      type: 'Select',
      label: 'Select',
      icon: 'select',
      group: 'selection',
      dataBound: true,
      dataType: 'string',
      defaultProps: { label: 'Label', options: [], placeholder: 'Choose…' },
      props: [
        label,
        {
          name: 'options',
          label: 'Options',
          editor: 'json',
          hint: 'Array of { label, value }. Bind to an expression to load remotely.',
        },
        /*
         * The empty choice, and the reason it is a property.
         *
         * One kit hardcoded the English "Choose…" and the other drew no empty
         * option at all, so a MUI select could not be returned to unanswered
         * once somebody had picked something -- and neither string could be
         * translated, on a builder whose whole point is that user-facing copy is
         * a localizable prop.
         */
        {
          name: 'placeholder',
          label: 'Placeholder',
          editor: 'string',
          localizable: true,
          hint: 'The empty choice, shown until somebody picks one.',
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
    {
      type: 'Grid',
      label: 'Grid',
      icon: 'grid',
      group: 'layout',
      container: true,
      defaultProps: { columns: 2, gap: 16, minColumnWidth: 200 },
      props: [
        { name: 'columns', label: 'Columns', editor: 'number', section: 'style' },
        { name: 'gap', label: 'Gap', editor: 'number', section: 'style' },
        {
          name: 'minColumnWidth',
          label: 'Min column width',
          editor: 'number',
          section: 'style',
          hint: 'Columns wrap below this width, so the grid is responsive without breakpoints.',
        },
      ],
      events: [],
    },
    {
      type: 'Step',
      label: 'Step',
      icon: 'box',
      group: 'layout',
      container: true,
      /*
       * A step is a container shown when `context.step` equals its own key.
       * That condition is the whole difference between a step and a box, so it
       * is stated here rather than left for every author to write by hand and
       * get the path right. It is a starting value: the Rules tab edits it
       * afterwards like any other visibility rule.
       */
      defaultRenderWhen: (key) => ({
        kind: 'condition',
        condition: {
          op: 'eq',
          left: { kind: 'context', path: 'step' },
          right: { kind: 'literal', value: key },
        },
      }),
      // Pixels, like Screen, Stack and Grid. The comment here used to say "MUI's
      // spacing scale ... 16 here would be 128px", which stopped being true when
      // `renderers.tsx` moved gaps to pixels and left every default eight times
      // too tight.
      defaultProps: { gap: 16 },
      props: [{ name: 'gap', label: 'Gap', editor: 'number', section: 'style' }],
      events: [],
    },
    {
      type: 'Repeater',
      label: 'Repeater',
      icon: 'repeat',
      group: 'layout',
      container: true,
      /*
       * Data-bound *and* an array, which is the pairing core recognises -- so it
       * never has to learn the type string `Repeater`.
       *
       * Not the only data-bound container: `RadioGroup` is one too, and it stays
       * out of `isRowScope` because its `dataType` is a string rather than by
       * anything about the pairing. Read that as the rule it is: a container
       * whose answer is a list *is* a repeater, whatever it is called, and a kit
       * adding one has declared repetition whether or not it meant to.
       */
      dataBound: true,
      dataType: 'array',
      defaultProps: { label: 'Items', helperText: '', gap: 16 },
      props: [label, helperText, { name: 'gap', label: 'Gap', editor: 'number', section: 'style' }],
      events: [],
    },
    {
      type: 'Box',
      label: 'Box',
      icon: 'box',
      group: 'layout',
      container: true,
      defaultProps: { padding: 16, background: '', radius: 0 },
      props: [
        { name: 'padding', label: 'Padding', editor: 'number', section: 'style' },
        {
          name: 'background',
          label: 'Background',
          editor: 'color',
          section: 'style',
          hint: 'Any CSS colour, including a custom property.',
        },
        { name: 'radius', label: 'Corner radius', editor: 'number', section: 'style' },
      ],
      events: [],
    },
    {
      type: 'Card',
      label: 'Card',
      icon: 'card',
      group: 'layout',
      container: true,
      defaultProps: { title: '', subtitle: '', variant: 'outlined' },
      props: [
        { name: 'title', label: 'Title', editor: 'string', localizable: true },
        { name: 'subtitle', label: 'Subtitle', editor: 'string', localizable: true },
        {
          name: 'variant',
          label: 'Variant',
          editor: 'select',
          section: 'style',
          options: [
            { label: 'Outlined', value: 'outlined' },
            { label: 'Elevated', value: 'elevated' },
          ],
        },
      ],
      events: [],
    },
    {
      type: 'Text',
      label: 'Text',
      icon: 'paragraph',
      group: 'display',
      defaultProps: { text: 'Text', variant: 'body', align: 'start' },
      props: [
        { name: 'text', label: 'Text', editor: 'multiline', localizable: true },
        {
          name: 'variant',
          label: 'Variant',
          editor: 'select',
          section: 'style',
          options: [
            { label: 'Body', value: 'body' },
            { label: 'Small', value: 'small' },
            { label: 'Caption', value: 'caption' },
          ],
        },
        {
          name: 'align',
          label: 'Align',
          editor: 'select',
          section: 'style',
          options: [
            { label: 'Start', value: 'start' },
            { label: 'Center', value: 'center' },
            { label: 'End', value: 'end' },
          ],
        },
      ],
      events: [],
    },
    {
      type: 'Divider',
      label: 'Divider',
      icon: 'divider',
      group: 'display',
      defaultProps: { orientation: 'horizontal' },
      props: [
        {
          name: 'orientation',
          label: 'Orientation',
          editor: 'select',
          section: 'style',
          options: [
            { label: 'Horizontal', value: 'horizontal' },
            { label: 'Vertical', value: 'vertical' },
          ],
        },
      ],
      events: [],
    },
    {
      type: 'Image',
      label: 'Image',
      icon: 'image',
      group: 'display',
      defaultProps: { src: '', alt: '', fit: 'cover', width: 0 },
      props: [
        {
          name: 'src',
          label: 'Source',
          editor: 'string',
          // The same allowlist `Link.href` documents, and the same sink:
          // `safeHref`. Saying it on one and not the other made the rule
          // look like a property of links rather than of addresses.
          hint: 'http, https, mailto, tel, or a path. Anything else is refused.',
        },
        {
          name: 'alt',
          label: 'Alt text',
          editor: 'string',
          localizable: true,
          hint: 'What the image says. Empty means decorative, which is a choice, not an omission.',
        },
        {
          name: 'fit',
          label: 'Fit',
          editor: 'select',
          section: 'style',
          options: [
            { label: 'Cover', value: 'cover' },
            { label: 'Contain', value: 'contain' },
            { label: 'Fill', value: 'fill' },
          ],
        },
        {
          name: 'width',
          label: 'Width',
          editor: 'number',
          section: 'style',
          hint: 'Zero means full width.',
        },
      ],
      events: [],
    },
    {
      type: 'TextArea',
      label: 'Text area',
      icon: 'textarea',
      group: 'inputs',
      dataBound: true,
      dataType: 'string',
      defaultProps: { label: 'Label', placeholder: '', helperText: '', rows: 4 },
      props: [
        label,
        { name: 'placeholder', label: 'Placeholder', editor: 'string', localizable: true },
        helperText,
        { name: 'rows', label: 'Rows', editor: 'number', section: 'style' },
        disabled,
      ],
      events: ['onChange', 'onBlur', 'onFocus'],
    },
    {
      type: 'ButtonGroup',
      label: 'Button group',
      icon: 'button',
      group: 'inputs',
      container: true,
      defaultProps: { orientation: 'horizontal' },
      props: [
        {
          name: 'orientation',
          label: 'Orientation',
          editor: 'select',
          section: 'style',
          options: [
            { label: 'Horizontal', value: 'horizontal' },
            { label: 'Vertical', value: 'vertical' },
          ],
        },
      ],
      events: [],
    },
    {
      type: 'Switch',
      label: 'Switch',
      icon: 'switch',
      group: 'selection',
      dataBound: true,
      dataType: 'boolean',
      defaultProps: { label: 'Switch label' },
      props: [label, helperText, disabled],
      events: ['onChange'],
    },
    {
      type: 'RadioGroup',
      label: 'Radio group',
      icon: 'radio',
      group: 'selection',
      container: true,
      dataBound: true,
      dataType: 'string',
      defaultProps: { label: 'Label', options: [], direction: 'column', helperText: '' },
      props: [
        label,
        {
          name: 'options',
          label: 'Options',
          editor: 'json',
          hint: 'Array of { label, value }. Leave empty and add Radio item children instead.',
        },
        {
          name: 'direction',
          label: 'Direction',
          editor: 'select',
          section: 'style',
          options: [
            { label: 'Column', value: 'column' },
            { label: 'Row', value: 'row' },
          ],
        },
        helperText,
        disabled,
      ],
      events: ['onChange'],
    },
    {
      type: 'RadioItem',
      label: 'Radio item',
      icon: 'radio',
      group: 'selection',
      defaultProps: { label: 'Option', value: '' },
      props: [label, { name: 'value', label: 'Value', editor: 'string' }, disabled],
      events: [],
    },
    {
      type: 'DatePicker',
      label: 'Date picker',
      icon: 'date',
      group: 'inputs',
      dataBound: true,
      dataType: 'date',
      defaultProps: { label: 'Label', helperText: '', min: '', max: '' },
      props: [
        label,
        helperText,
        { name: 'min', label: 'Earliest', editor: 'string', hint: 'ISO date, such as 2026-01-31.' },
        { name: 'max', label: 'Latest', editor: 'string', hint: 'ISO date, such as 2026-12-31.' },
        disabled,
      ],
      events: ['onChange', 'onBlur'],
    },
    {
      type: 'Alert',
      label: 'Alert',
      icon: 'alert',
      group: 'feedback',
      defaultProps: { text: 'Something worth saying.', severity: 'info', title: '' },
      props: [
        { name: 'title', label: 'Title', editor: 'string', localizable: true },
        { name: 'text', label: 'Text', editor: 'multiline', localizable: true },
        {
          name: 'severity',
          label: 'Severity',
          editor: 'select',
          options: [
            { label: 'Info', value: 'info' },
            { label: 'Success', value: 'success' },
            { label: 'Warning', value: 'warning' },
            { label: 'Error', value: 'error' },
          ],
        },
      ],
      events: [],
    },
    {
      type: 'Progress',
      label: 'Progress',
      icon: 'progress',
      group: 'feedback',
      defaultProps: { variant: 'linear', label: 'Progress' },
      props: [
        label,
        {
          name: 'variant',
          label: 'Variant',
          editor: 'select',
          section: 'style',
          options: [
            { label: 'Linear', value: 'linear' },
            { label: 'Circular', value: 'circular' },
          ],
        },
        {
          name: 'value',
          label: 'Value',
          editor: 'number',
          hint: 'Percent complete. Leave empty for an indeterminate bar.',
        },
      ],
      events: [],
    },
    {
      type: 'Link',
      label: 'Link',
      icon: 'link',
      group: 'navigation',
      defaultProps: { text: 'Link', href: '', target: 'self' },
      props: [
        { name: 'text', label: 'Text', editor: 'string', localizable: true },
        {
          name: 'href',
          label: 'Address',
          editor: 'string',
          hint: 'http, https, mailto, tel, or a path. Anything else is refused.',
        },
        {
          name: 'target',
          label: 'Opens in',
          editor: 'select',
          options: [
            { label: 'Same tab', value: 'self' },
            { label: 'New tab', value: 'blank' },
          ],
        },
      ],
      events: ['onClick'],
    },
    {
      type: 'Breadcrumbs',
      label: 'Breadcrumbs',
      icon: 'tabs',
      group: 'navigation',
      defaultProps: { items: [], label: '' },
      props: [
        {
          name: 'items',
          label: 'Items',
          editor: 'json',
          hint: 'Array of { label, href }. The last one is the current page and is not a link.',
        },
        {
          name: 'label',
          label: 'Landmark name',
          editor: 'string',
          localizable: true,
          hint: 'What a screen reader calls this navigation. Defaults to "Breadcrumb".',
        },
      ],
      events: [],
    },
  ],
}
