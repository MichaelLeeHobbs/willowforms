# Demo examples

Run `pnpm dev` and open the **Examples** gallery in the playground. Search by topic or feature, or filter by category. Every example is a normal Formsmith document: edit its layout and properties, inspect or export its JSON, and try it in **Preview** with either the Material UI or Plain HTML kit.

The following links use the default development port. On another deployment, keep the `?example=…` query string and replace the origin.

| Example                                                                     | What to explore                                                                                                                                           |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [D&D character sheet](http://localhost:5180/?example=dnd-character-sheet)   | Eight pages, character statistics, all six abilities and eighteen skills, combat, equipment, features, spellcasting, backstory, and an adventure journal. |
| [Contact request](http://localhost:5180/?example=contact-request)           | A compact starting point with contact details, a subject, and a message.                                                                                  |
| [Event registration](http://localhost:5180/?example=event-registration)     | Attendance options, conditional in-person details, accessibility needs, and repeatable guests.                                                            |
| [Customer feedback](http://localhost:5180/?example=customer-feedback)       | Ratings and a reply address that becomes required only when follow-up is requested.                                                                       |
| [Job application](http://localhost:5180/?example=job-application)           | Three pages with contact details, repeatable experience, interests, and availability.                                                                     |
| [Project brief](http://localhost:5180/?example=project-brief)               | Three pages covering the project, scope, deliverables, budget, and success criteria.                                                                      |
| [Expense report](http://localhost:5180/?example=expense-report)             | Repeatable expenses with dates, categories, amounts, receipt references, and an acknowledgement.                                                          |
| [Volunteer signup](http://localhost:5180/?example=volunteer-signup)         | Interests, repeatable availability, skills, and support needs.                                                                                            |
| [Equipment inspection](http://localhost:5180/?example=equipment-inspection) | Inspection checks with conditional findings and follow-up details.                                                                                        |
| [Workshop enrollment](http://localhost:5180/?example=workshop-enrollment)   | English and French labels, introductory text, and validation messages. Switch the canvas language before entering Preview.                                |

## Drafts and preview

Each example saves its design edits separately in this browser. **Back to your draft** restores the playground document you were editing before opening an example. A direct link selects an example and restores its local design draft if one exists. **Reset this example** asks before replacing that example's edits with the original design.

Preview answers are temporary. Switching examples or kits, resetting an example, or reloading the page discards them; **Back to editing** retains them in the current designer session. The gallery does not submit responses to a backend. Export JSON to keep a form design independently of browser storage. If storage is unavailable, edits remain available while switching examples in the current session, and the playground explains that local saving is unavailable.

## Character sheet scope

The D&D example is a detailed editable record sheet. It includes repeatable classes, attacks, features, resources, inventory, spells, connections, quests, and session notes. The spellcasting page can be enabled for characters who use spells and records slots for levels one through nine, Pact Magic, preparation, components, and casting details.

Players enter modifiers, totals, progression, and resource counts themselves. The sheet demonstrates ordinary form fields, conditions, repeaters, validation, and page navigation; it does not implement a rules engine or calculate a legal character build. Spell and feature descriptions are personal notes rather than a bundled rules database.

The example includes attribution to the [System Reference Document 5.2.1](https://www.dndbeyond.com/srd), available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). That attribution is part of the form document and remains in exported designs.
