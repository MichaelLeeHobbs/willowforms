import type { FormDocument } from '@formsmith/core'
import { prop } from '@formsmith/core'

/** Boots the playground with something non-trivial to poke at, not an empty canvas. */
export const SAMPLE_DOCUMENT: FormDocument = {
  version: '1',
  id: 'sample',
  name: 'Contact request',
  root: {
    key: 'root',
    type: 'Screen',
    props: { maxWidth: prop(560) },
    children: [
      {
        key: 'heading',
        type: 'Heading',
        props: { text: prop('Contact request'), level: prop('h5') },
      },
      {
        key: 'name',
        type: 'Stack',
        // Pixels, like every other length in both kits. This shipped the 2 that
        // the MUI defaults used to carry, so the demo showed the defect.
        props: { direction: prop('row'), gap: prop(16) },
        children: [
          {
            key: 'firstName',
            type: 'TextField',
            props: { label: prop('First name') },
            schema: { type: 'string', validations: [{ key: 'required' }] },
          },
          {
            key: 'lastName',
            type: 'TextField',
            props: { label: prop('Last name') },
            schema: { type: 'string', validations: [{ key: 'required' }] },
          },
        ],
      },
      {
        key: 'email',
        type: 'TextField',
        props: { label: prop('Email'), helperText: prop('We only use this to reply.') },
        schema: {
          type: 'string',
          validations: [{ key: 'required' }, { key: 'email' }],
        },
      },
      {
        key: 'website',
        type: 'TextField',
        props: { label: prop('Website') },
        /*
         * Optional on purpose: a blank value passes.
         *
         * Only `required` fails on an empty value -- invariant 5 -- so a field
         * carrying a `url` rule and nothing else is "optional, but must be a
         * URL if given". A builder that folds requiredness into every other
         * rule cannot express that at all, and the prior-art study found one
         * that does not; naming it belongs in `docs/prior-art`, not in a
         * sample document this repository publishes.
         */
        schema: { type: 'string', validations: [{ key: 'url' }] },
      },
      {
        key: 'topic',
        type: 'Select',
        props: {
          label: prop('Topic'),
          options: prop([
            { label: 'Sales', value: 'sales' },
            { label: 'Support', value: 'support' },
            { label: 'Something else', value: 'other' },
          ]),
        },
        schema: { type: 'string', validations: [{ key: 'required' }] },
      },
      {
        key: 'message',
        type: 'TextField',
        props: { label: prop('Message'), multiline: prop(true) },
        schema: {
          type: 'string',
          validations: [{ key: 'required' }, { key: 'minLength', value: 20 }],
        },
      },
      {
        key: 'subscribe',
        type: 'Checkbox',
        props: { label: prop('Send me occasional product updates') },
        schema: { type: 'boolean', validations: [] },
      },
      { key: 'submit', type: 'Button', props: { text: prop('Send') } },
    ],
  },
  actions: {},
  languages: [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }],
  defaultLanguage: 'en-US',
  translations: {},
  settings: {},
}
