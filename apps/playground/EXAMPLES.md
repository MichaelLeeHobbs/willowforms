# Demo examples

Run `pnpm dev` and open the **Examples** gallery in the playground. Search by topic or feature, or filter by category. Every example is a normal Formsmith document: edit its layout and properties, inspect or export its JSON, and try it in **Preview** with either the Material UI or Plain HTML kit.

For your own layouts, try **Starting layouts** in the Components tab. Each preset inserts ordinary editable controls. New Grids fill their available width; change **Fill width** in Style when needed. Choose **Form density** in Settings, or override density for an individual group in Style. Preview hides the authoring panels; **Diagnostics** reveals the current answers and errors.

The following links use the default development port. On another deployment, keep the `?example=…` query string and replace the origin.

| Example                                                                     | What to explore                                                                                                                                                  |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [D&D character sheet](http://localhost:5180/?example=dnd-character-sheet)   | Main play sheet plus five supporting pages: all six abilities and eighteen skills, combat, equipment, classes, features, spellcasting, backstory, and a journal. |
| [Contact request](http://localhost:5180/?example=contact-request)           | A compact starting point with contact details, a subject, and a message.                                                                                         |
| [Event registration](http://localhost:5180/?example=event-registration)     | Attendance options, conditional in-person details, accessibility needs, and repeatable guests.                                                                   |
| [Customer feedback](http://localhost:5180/?example=customer-feedback)       | Ratings and a reply address that becomes required only when follow-up is requested.                                                                              |
| [Job application](http://localhost:5180/?example=job-application)           | Three pages with contact details, repeatable experience, interests, and availability.                                                                            |
| [Project brief](http://localhost:5180/?example=project-brief)               | Three pages covering the project, scope, deliverables, budget, and success criteria.                                                                             |
| [Expense report](http://localhost:5180/?example=expense-report)             | Repeatable expenses with dates, categories, amounts, receipt references, and an acknowledgement.                                                                 |
| [Volunteer signup](http://localhost:5180/?example=volunteer-signup)         | Interests, repeatable availability, skills, and support needs.                                                                                                   |
| [Equipment inspection](http://localhost:5180/?example=equipment-inspection) | Inspection checks with conditional findings and follow-up details.                                                                                               |
| [Workshop enrollment](http://localhost:5180/?example=workshop-enrollment)   | English and French labels, introductory text, and validation messages. Switch the canvas language before entering Preview.                                       |

## Drafts and preview

Each example saves its design edits separately in this browser. **Back to your draft** restores the playground document you were editing before opening an example. A direct link selects an example and restores its local design draft if one exists. **Reset example** sits beside **Examples** in the header while an example is active, in both editing and Preview. It asks before replacing that example's edits and preview answers with the latest bundled design. Cancel or Escape preserves your work.

Preview answers are temporary. Switching examples or kits, resetting an example, or reloading the page discards them; **Back to editing** retains them in the current designer session. The gallery does not submit responses to a backend. Export JSON to keep a form design independently of browser storage. If storage is unavailable, edits remain available while switching examples in the current session, and the playground explains that local saving is unavailable.

## Character sheet scope

The D&D example is a detailed editable record sheet. It includes repeatable classes, attacks, features, resources, inventory, spells, connections, quests, and session notes. The spellcasting page can be enabled for characters who use spells and records slots for levels one through nine, Pact Magic, preparation, components, and casting details.

Players enter modifiers, totals, progression, and resource counts themselves. The sheet demonstrates ordinary form fields, conditions, repeaters, validation, and page navigation; it does not implement a rules engine or calculate a legal character build. Spell and feature descriptions are personal notes rather than a bundled rules database.

The sheet targets desktop play, with a 1,120px minimum document width and a 1,320px maximum. The main page puts identity above three unequal columns: an ability-and-save rail, eighteen compact skill rows with passive awareness, and combat statistics with prominent hit points and conditions. Attacks use full-width records below. Five supporting pages hold classes and features, equipment, spells, background, and the journal. Use a desktop browser at least 1,280px wide for full-width Preview; narrower canvases scroll horizontally. The other examples keep their own responsive layouts.

Its Grid and Box layouts, inline field labels, ruled sections, Cambria headings, and compact density remain editable and export with the document. Both kits honor density; change **Settings → Form density**, or override a group's Density on its Style tab. The playground's Material UI theme in `src/character-theme.ts` supplies the paper, ink, and copper palette and omits empty helper rows. A host importing the JSON supplies its own theme or reuses that theme.

For paper-oriented forms, choose **Fixed size** beside Desktop, Tablet, and Mobile. Letter, Legal, A4, and A3 presets support portrait and landscape, with custom pixel dimensions available. These are authoring guides; content can extend past the page boundary. Printing, pagination, and PDF output are future work. The desktop character sheet does not automatically shrink to fit a paper preset.

If you have opened an older version, choose **Reset example → Reset design** in the header to load the updated design. Export any edits you want to retain first. Preview hides authoring panels automatically; use **Diagnostics** when you want to inspect answers and errors.

The example includes attribution to the [System Reference Document 5.2.1](https://www.dndbeyond.com/srd), available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). That attribution is part of the form document and remains in exported designs.
