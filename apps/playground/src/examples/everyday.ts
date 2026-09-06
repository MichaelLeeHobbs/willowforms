import { prop } from '@formsmith/core'
import {
  check,
  choices,
  date,
  email,
  field,
  form,
  grid,
  node,
  notes,
  number,
  repeat,
  required,
  section,
  step,
  text,
  when,
} from './builders.js'

export const eventRegistration = form(
  'event-registration',
  'Community conference',
  'Make it your day. Choose how you will join us and tell us what will help you feel welcome.',
  [
    {
      ...node(
        'Box',
        'conferenceBanner',
        {
          backgroundImage: 'images/community-banner.svg',
          backgroundFit: 'cover',
          backgroundOverlay: 'dark',
          padding: 24,
          radius: 8,
        },
        [
          node('Heading', 'conferenceWelcome', {
            text: 'A day of ideas and connection',
            level: 'h2',
          }),
          node('Text', 'conferenceInvitation', {
            text: 'In person or online. Everyone is welcome.',
          }),
        ],
      ),
      css: { any: 'color: #fff; min-height: 130px' },
    },
    section('attendee', 'Your place at the table', [
      grid('attendeeName', [
        text('firstName', 'First name', required),
        text('lastName', 'Last name', required),
      ]),
      email('email'),
      grid('ticket', [
        choices('attendance', 'How will you attend?', ['In person', 'Online'], true),
        choices('track', 'Your main interest', ['Design', 'Technology', 'Community'], true),
      ]),
    ]),
    when(
      section('inPerson', 'On the day', [
        choices('meal', 'Lunch preference', [
          'No preference',
          'Vegetarian',
          'Vegan',
          'Bringing my own',
        ]),
        notes(
          'accessNeeds',
          'Access and dietary requests',
          'Tell the organizing team what would make the event easier to attend.',
        ),
        repeat(
          'guests',
          'Guest',
          [text('guestName', 'Guest name', required), email('guestEmail', 'Guest email')],
          'Add each person attending with you.',
        ),
      ]),
      'attendance',
      'In person',
    ),
    check('updates', 'Send me the program and event updates'),
  ],
)

export const customerFeedback = form(
  'customer-feedback',
  'Tell us how we did',
  'A few thoughtful answers help us improve the experience for everyone.',
  [
    section('experience', 'Your experience', [
      field('RadioGroup', 'rating', 'How was your experience?', required, {
        direction: 'row',
        options: ['Excellent', 'Good', 'Okay', 'Poor'].map((value) => ({ label: value, value })),
      }),
      choices('area', 'What are you giving feedback on?', [
        'Product',
        'Support',
        'Delivery',
        'Something else',
      ]),
      notes('worked', 'What worked well?'),
      notes('improve', 'What could we do better?'),
    ]),
    section('followUp', 'Keep the conversation going', [
      check('contactMe', 'I would like someone to follow up'),
      when(email('replyEmail'), 'contactMe', true),
      when(text('replyName', 'Your name'), 'contactMe', true),
    ]),
  ],
)

export const jobApplication = form(
  'job-application',
  'Join the team',
  'Tell us about your experience, how you like to work, and what you would bring to the team.',
  [
    step('aboutYou', 'About you', [
      section('candidate', 'Contact and role', [
        grid('candidateName', [
          text('fullName', 'Full name', required),
          text('pronouns', 'Pronouns (optional)'),
        ]),
        email('email'),
        grid('candidateRole', [
          choices(
            'role',
            'Role',
            ['Product designer', 'Software engineer', 'Customer success', 'Open application'],
            true,
          ),
          text('location', 'City / time zone'),
        ]),
        text('portfolio', 'Portfolio or professional profile', [{ key: 'url' }]),
      ]),
    ]),
    step('experienceStep', 'Experience and interests', [
      repeat(
        'experience',
        'Experience',
        [
          text('employer', 'Organization', required),
          text('jobTitle', 'Role', required),
          grid('employmentDates', [
            date('started', 'Started'),
            date('ended', 'Ended (leave blank if current)'),
          ]),
          notes('achievements', 'What did you contribute?'),
        ],
        'Include paid work, independent projects, or volunteering.',
      ),
      notes('motivation', 'Why this team?'),
      notes('strengths', 'A project you are proud of'),
    ]),
    step('practicalities', 'Practical details', [
      grid('availability', [
        date('availableFrom', 'Available from'),
        choices('workStyle', 'Preferred work arrangement', [
          'Remote',
          'Hybrid',
          'On site',
          'Flexible',
        ]),
      ]),
      notes('interviewNeeds', 'Interview accommodations or scheduling needs'),
      field('Checkbox', 'permission', 'You may contact me about this application', required),
    ]),
  ],
)

export const projectBrief = form(
  'project-brief',
  'Start something good',
  'A shared brief for a new website, product, or service. Capture the outcome before getting lost in the details.',
  [
    step('projectOverview', 'The big picture', [
      section('project', 'Project essentials', [
        text('projectName', 'Project name', required),
        grid('projectContact', [text('contactName', 'Your name', required), email('email')]),
        notes('problem', 'What problem are we solving?'),
        notes('audience', 'Who is this for?'),
      ]),
    ]),
    step('projectScope', 'Scope and constraints', [
      repeat(
        'deliverables',
        'Deliverable',
        [
          text('deliverableName', 'What should we deliver?', required),
          choices('priority', 'Priority', ['Essential', 'Important', 'Nice to have']),
          notes('acceptance', 'How will we know it is ready?'),
        ],
        'Break the project into a few concrete outcomes.',
      ),
      grid('projectConstraints', [
        choices('budget', 'Indicative budget (USD)', [
          'Under $5,000',
          '$5,000–$20,000',
          '$20,000–$50,000',
          '$50,000+',
          'Still exploring',
        ]),
        date('targetDate', 'Target launch date'),
      ]),
      notes('constraints', 'Constraints and dependencies'),
    ]),
    step('projectSuccess', 'What success looks like', [
      notes('success', 'What should be different after launch?'),
      notes('references', 'Useful references or inspiration'),
      notes('stakeholders', 'Who needs to be involved?'),
    ]),
  ],
)

export const expenseReport = form(
  'expense-report',
  'Expense report',
  'Keep the purpose, dates, and supporting references together for a straightforward reimbursement review.',
  [
    section('claimant', 'Claim details', [
      grid('claimantDetails', [
        text('employeeName', 'Your name', required),
        text('department', 'Team / department', required),
      ]),
      grid('claimDetails', [
        text('purpose', 'Business purpose', required),
        choices('currency', 'Currency', ['USD', 'CAD', 'EUR', 'GBP'], true),
      ]),
    ]),
    repeat(
      'expenses',
      'Expense',
      [
        grid('expenseDetails', [
          date('expenseDate', 'Date', required),
          text('merchant', 'Merchant', required),
        ]),
        grid('expenseCost', [
          choices(
            'category',
            'Category',
            ['Travel', 'Accommodation', 'Meals', 'Supplies', 'Other'],
            true,
          ),
          field('NumberField', 'amount', 'Amount', [...required, { key: 'min', value: 0 }]),
        ]),
        text('receiptReference', 'Receipt reference or link'),
        notes('expenseNotes', 'Notes'),
      ],
      'Add one row per expense. Use the currency selected above for every amount.',
    ),
    notes('reviewNotes', 'Anything the reviewer should know?'),
    field(
      'Checkbox',
      'accurate',
      'These expenses are accurate and have not already been reimbursed',
      required,
    ),
  ],
)

export const volunteerSignup = form(
  'volunteer-signup',
  'Give a little time',
  'Find a volunteering opportunity that fits your interests and availability.',
  [
    section('volunteer', 'Introduce yourself', [
      grid('volunteerContact', [text('name', 'Name', required), email('email')]),
      text('phone', 'Phone (optional)'),
      choices('interest', 'Where would you like to help?', [
        'Community garden',
        'Food pantry',
        'Event support',
        'Mentoring',
        'Wherever I am needed',
      ]),
    ]),
    repeat(
      'availability',
      'Availability',
      [
        grid('availabilityDetails', [
          choices(
            'day',
            'Day',
            ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
            true,
          ),
          choices('time', 'Time of day', ['Morning', 'Afternoon', 'Evening'], true),
        ]),
      ],
      'Add the days and times that generally work for you.',
    ),
    notes('skills', 'Skills or interests you would like to share'),
    notes('support', 'What would help you participate?'),
    field('Checkbox', 'contactPermission', 'The volunteer coordinator may contact me', required),
  ],
)

export const equipmentInspection = form(
  'equipment-inspection',
  'Equipment inspection',
  'Record a routine check, flag issues, and leave clear notes for the next person.',
  [
    section('inspection', 'Inspection details', [
      grid('asset', [
        text('assetId', 'Asset / equipment ID', required),
        text('inspector', 'Inspector', required),
      ]),
      grid('inspectionDate', [
        date('checkedOn', 'Inspection date', required),
        text('site', 'Location'),
      ]),
    ]),
    section('checks', 'Condition check', [
      ...['Exterior', 'Controls', 'Connections', 'Accessories'].map((label) =>
        choices(
          label.toLowerCase() + 'Status',
          label,
          ['Pass', 'Needs attention', 'Not applicable'],
          true,
        ),
      ),
      check('hasIssues', 'There are issues to record'),
    ]),
    when(
      section('issues', 'Follow-up required', [
        node('Alert', 'issueNotice', {
          severity: 'warning',
          text: 'Record the issue and follow your organization’s process before returning the equipment to use.',
        }),
        repeat(
          'findings',
          'Finding',
          [
            text('finding', 'Issue', required),
            choices('severity', 'Priority', ['Routine', 'Soon', 'Urgent'], true),
            notes('action', 'Recommended action'),
          ],
          'Describe each issue separately so it can be followed up.',
        ),
      ]),
      'hasIssues',
      true,
    ),
    notes('inspectionNotes', 'Additional observations'),
  ],
)

export const workshopEnrollment = form(
  'workshop-enrollment',
  'Creative workshop',
  'Choose English or French in Preview to see the same form in another language.',
  [
    section('workshopDetails', 'Your booking', [
      text('participant', 'Participant name', required),
      email('email'),
      date('preferredDate', 'Preferred date'),
      number('places', 'Number of places', 1, 8),
      notes('goals', 'What would you like to learn?'),
      check('materials', 'I would like to borrow materials'),
    ]),
  ],
)
workshopEnrollment.languages.push({ code: 'fr', dialect: 'CA', name: 'Français', bidi: 'ltr' })
workshopEnrollment.translations = {
  'en-US': {
    checkAnswers: 'Check answers',
    submit: 'Enroll',
    heading: 'Creative workshop',
    introduction:
      'Make space for something creative. Tell us who is joining and what you would like to explore.',
    booking: 'Your booking',
    participant: 'Participant name',
    email: 'Email',
    preferredDate: 'Preferred date',
    places: 'Number of places',
    goals: 'What would you like to learn?',
    materials: 'I would like to borrow materials',
    required: 'Please complete this field.',
    emailError: 'Enter a valid email address.',
    minPlaces: 'Book at least one place.',
    maxPlaces: 'Book up to eight places.',
  },
  'fr-CA': {
    checkAnswers: 'Vérifier les réponses',
    submit: 'S’inscrire',
    heading: 'Atelier créatif',
    introduction:
      'Faites place à la créativité. Dites-nous qui participe et ce que vous aimeriez explorer.',
    booking: 'Votre réservation',
    participant: 'Nom de la personne participante',
    email: 'Courriel',
    preferredDate: 'Date souhaitée',
    places: 'Nombre de places',
    goals: 'Que souhaitez-vous apprendre?',
    materials: 'Je souhaite emprunter du matériel',
    required: 'Veuillez remplir ce champ.',
    emailError: 'Entrez une adresse courriel valide.',
    minPlaces: 'Réservez au moins une place.',
    maxPlaces: 'Réservez un maximum de huit places.',
  },
}
function localize(): void {
  const visit = (entries: (typeof workshopEnrollment.root)[]): void => {
    for (const entry of entries) {
      const property = ['heading', 'introduction', 'checkAnswers', 'submit'].includes(entry.key)
        ? 'text'
        : entry.key === 'workshopDetails'
          ? 'title'
          : 'label'
      const key = entry.key === 'workshopDetails' ? 'booking' : entry.key
      if (workshopEnrollment.translations['en-US']?.[key])
        entry.props[property] = { kind: 'i18n', key }
      for (const rule of entry.schema?.validations ?? [])
        rule.message = {
          kind: 'i18n',
          key:
            rule.key === 'email'
              ? 'emailError'
              : rule.key === 'min'
                ? 'minPlaces'
                : rule.key === 'max'
                  ? 'maxPlaces'
                  : 'required',
        }
      visit(entry.children ?? [])
    }
  }
  visit([workshopEnrollment.root])
}
localize()
workshopEnrollment.root.props['maxWidth'] = prop(720)
