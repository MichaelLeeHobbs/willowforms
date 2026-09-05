import type { FormDocument } from '@formsmith/core'
import { prop } from '@formsmith/core'

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
        // Optional, but must be a URL when supplied.
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
