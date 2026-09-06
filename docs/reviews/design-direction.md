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

The D&D example targets desktop use during play. Preserve its eight pages and answer keys. Use a wide document with all six abilities on one row, compact saves and skills, paired record sections, and clear separation of identity, combat, resources, equipment, and spells. A phone-specific arrangement is not an acceptance requirement for this example.

Use deep ink, clean paper, and restrained copper accents, with Cambria for folio headings and the kit's readable UI text for fields. Keep decoration at the document and section level; do not give every field its own ornamental container. The designer's appearance remains independent of the form's theme.

## Review before implementation

The initial idea of stronger card borders would repeat the current interface's main problem: all controls competing at equal weight. Use quiet secondary actions, a clear Preview action, and grouped palette items instead. The D&D sheet keeps the density and width useful to a desktop player; making every page squeeze into a phone would undermine this brief. Verify real screenshots, keyboard focus, labels, errors, and light/dark contrast throughout.
