import type { FormDocument } from '@formsmith/core'
import { SAMPLE_DOCUMENT } from '../sample.js'
import { characterSheet } from './character-sheet.js'
import {
  customerFeedback,
  equipmentInspection,
  eventRegistration,
  expenseReport,
  jobApplication,
  projectBrief,
  volunteerSignup,
  workshopEnrollment,
} from './everyday.js'

export interface ExampleForm {
  id: string
  title: string
  description: string
  category: 'Everyday' | 'Work' | 'Community' | 'Adventure'
  features: string[]
  document: FormDocument
}

export const EXAMPLES: ExampleForm[] = [
  {
    id: characterSheet.id,
    title: 'D&D character sheet',
    description:
      'A desktop character folio: abilities, all 18 skills, combat, inventory, spells, backstory, and a session journal.',
    category: 'Adventure',
    features: ['Desktop layout', '6 pages', 'Repeaters'],
    document: characterSheet,
  },
  {
    id: 'contact-request',
    title: 'Contact request',
    description:
      'A friendly first form with contact details, topic selection, and an optional newsletter.',
    category: 'Everyday',
    features: ['Validation', 'Simple layout'],
    document: SAMPLE_DOCUMENT,
  },
  {
    id: eventRegistration.id,
    title: 'Event registration',
    description:
      'A community conference with an image banner, guest details, and online or in-person attendance.',
    category: 'Community',
    features: ['Background images', 'Conditional sections', 'Repeaters'],
    document: eventRegistration,
  },
  {
    id: customerFeedback.id,
    title: 'Customer feedback',
    description: 'Gather a quick rating and thoughtful feedback, with optional follow-up details.',
    category: 'Everyday',
    features: ['Radio groups', 'Conditional fields'],
    document: customerFeedback,
  },
  {
    id: jobApplication.id,
    title: 'Job application',
    description: 'A three-step application covering contact details, experience, and availability.',
    category: 'Work',
    features: ['Steps', 'Repeaters'],
    document: jobApplication,
  },
  {
    id: projectBrief.id,
    title: 'Project brief',
    description:
      'Turn an idea into a shared brief with deliverables, constraints, and measures of success.',
    category: 'Work',
    features: ['Steps', 'Repeaters'],
    document: projectBrief,
  },
  {
    id: expenseReport.id,
    title: 'Expense report',
    description: 'Organize itemized expenses, currencies, and receipt references for review.',
    category: 'Work',
    features: ['Repeaters', 'Number validation'],
    document: expenseReport,
  },
  {
    id: volunteerSignup.id,
    title: 'Volunteer signup',
    description:
      'Match interests and recurring availability with meaningful opportunities to help.',
    category: 'Community',
    features: ['Repeaters', 'Consent'],
    document: volunteerSignup,
  },
  {
    id: equipmentInspection.id,
    title: 'Equipment inspection',
    description: 'Walk through a checklist and reveal an issue log when something needs attention.',
    category: 'Work',
    features: ['Conditional sections', 'Alerts'],
    document: equipmentInspection,
  },
  {
    id: workshopEnrollment.id,
    title: 'Bilingual workshop',
    description: 'Switch between English and French, including labels and validation messages.',
    category: 'Community',
    features: ['Translations', 'Validation'],
    document: workshopEnrollment,
  },
]
