# Formsmith visual direction

Formsmith is a working tool for composing and consuming forms. The interface should make the authored document the main object, distinguish editing tools from form controls, and help people recognize useful examples before opening them.

## Workbench

Retain the accessible palette: ink `#1c1f23`, paper `#ffffff`, canvas `#f5f6f8`, secondary text `#5b6470`, action blue `#0b6fa4`, and control outline `#7c838d`. Use the existing system UI type stack for compact, familiar controls; give document titles stronger weight and more room. Use a small geometric form mark for the brand. Align labels and tools to the left; center the document within its available canvas.

```text
Formsmith                         Examples / Kit / Save status
Document title                    History / JSON / Appearance
Components | Tree | Settings      Preview           Properties
Quiet tools                       Form canvas      Field settings
```

The gallery should show recognizable miniature form structures with actual field labels. A generic marketing hero or a grid of description-only cards would obscure the product's purpose. Keep existing search, categories, saved drafts, and reset behavior.

## Desktop character folio

The D&D example targets desktop use during play. The supplied [Obvious Mimic sheet](https://obviousmimic.com/en-us/products/free-5e-character-sheet-printable-fillable-template), [Kobold Press sheet](https://koboldpress.com/kpstore/wp-content/uploads/TOHCS1.png), and [RPG Musings sheets](https://rpgmusings.com/wp-content/uploads/2013/09/5e-sheets-1-to-3.png) establish the important proportions: compact identity fields, a narrow ability rail, dense skill rows, prominent health, and wide attack records. Bring these onto one main play page; keep class records, equipment, spells, background, and journal on five supporting pages. Preserve all answer keys. A phone-specific arrangement is not an acceptance requirement.

Use deep ink, clean paper, and restrained copper accents, with Cambria for folio headings and the kit's readable UI text for fields. Keep decoration at the document and section level; do not give every field its own ornamental container. The designer's appearance remains independent of the form's theme.

Tokens: paper `#ffffff`, ink `#292723`, secondary ink `#625d55`, copper `#80542f`, and rule accent `#a47449`. Use Cambria at 17–26px for headings and the kit's 13–14px UI type for controls. Align labels left, reserve small control widths for numbers, and allow record descriptions to use the available width.

```text
Character name        Species       Background      Player     Level
Abilities & saves     Skills & awareness            Combat
┌ Strength ─────┐     Skill bonus [ ] Training [ ]   AC / Initiative / Speed
│ Score / Mod.  │     Eighteen compact rows          Proficiency / Inspiration
│ Save / Prof.  │                                   ┌ Hit points ────────────┐
└───────────────┘     Passive awareness              │ Current / Max. / Temp.│
  Six ability cards   Senses                         │ Death saves           │
                                                    └───────────────────────┘
                                                    Conditions / Movement
Attacks: weapon       bonus     damage     type      range      properties
```

Review: the previous eight-page design separated information needed in the same encounter and treated too many values as equally large questionnaire fields. Change the information layout before changing decoration. These proportions are specific to play at the table; other example forms keep their own layouts. Fixed Letter, Legal, A4, and A3 canvas guides support future paper-oriented authoring without promising printing or automatic pagination.

## Review before implementation

The initial idea of stronger card borders would repeat the current interface's main problem: all controls competing at equal weight. Use quiet secondary actions, a clear Preview action, and grouped palette items instead. The D&D sheet keeps the density and width useful to a desktop player; making every page squeeze into a phone would undermine this brief. Verify real screenshots, keyboard focus, labels, errors, and light/dark contrast throughout.
