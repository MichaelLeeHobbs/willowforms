# Product

## Mission

WillowForms enables applications to let users create and update forms on demand, and lets other users complete those forms through a clear, accessible experience. It makes everyday form building straightforward, produces reliable results, and fits naturally into the application's existing design and workflows.

This is a statement of intent and carries no implementation status. The [product principles](README.md#product-principles) guide every contract in this specification.

## Why it exists

Applications need to collect information through forms that their users can create and change without a developer building each one. WillowForms supplies an embeddable visual designer and runtime renderer, both MIT-licensed, so applications can offer that capability within their own product.

## Who uses it

**The form author.** Creates questions, arranges sections, configures choices and validation, and previews the result. Common tasks should be understandable without programming or editing JSON.

**The respondent.** Completes a form another user created. Needs clear labels and instructions, accessible controls, predictable navigation, understandable errors, and answers that survive ordinary interactions.

**The developer embedding it.** Integrates the designer and renderer with the application's design system, storage, permissions, and submission workflow. Needs documented boundaries, a renderer that ships independently of the designer, and shared browser/server validation.

**The translator.** Supplies localized labels, instructions, and validation messages through ordinary property editors. Translation is part of form authoring and should not require JSON editing.

The host identifies and authorizes these users. WillowForms does not supply accounts or sessions.

## The everyday workflow

1. The host opens a new or stored form definition in the designer.
2. An author adds fields and sections, configures their ordinary properties and structured conditions, and previews the form.
3. The designer emits the definition; the host saves it and decides who can use it.
4. Respondents complete the form in the host application using the runtime renderer.
5. The host validates and handles the submitted answers using the same form definition and compatible evaluation context.

Translation, repeaters, and steps support this workflow when the form needs them. Expressions and code actions are specialized host integrations; ordinary form creation must not depend on them.

## Ownership boundaries

**WillowForms owns form behavior.** The document model, visual authoring, runtime rendering, structured conditions, validation, localization, and the kit contract belong here. Ordinary configuration should produce accessible output, with verification recorded in [accessibility.md](../accessibility.md).

**The host owns the application.** Storage, accounts, permissions, publishing and distribution, networking, submission processing, and business workflows stay with the embedding application. `onChange` emits documents and answers; it does not prescribe where they go. The playground and demo server demonstrate integration rather than define a backend product.

**Kits own their markup and design system.** Metadata drives the designer's property editors; each kit implements rendering and accessibility wiring. The designer does not import a component library or restyle kit internals.

**The host owns code execution.** Core provides no default evaluator. A host enabling expressions or code actions supplies the evaluator and owns isolation and resource limits. The library's structured conditions and built-in validation work without one.

**Both designer and renderer stay MIT.** There is no planned proprietary designer, enterprise tier, or paid advanced package.

## What good means

Authors can build useful forms through understandable controls. Respondents can complete them with clear feedback and keyboard operation. Labels, descriptions, required state, and errors are wired by the kits from ordinary properties. The supported keyboard authoring path provides equivalent operations through the Tree and panels.

Refused edits explain why, undo restores an edit, malformed imports report actionable problems, and unsupported host capabilities are identified. A working visual preview alone is not evidence that a form's validation or accessibility is correct.

Existing verification includes cross-kit contracts, shared validation tests, keyboard browser checks, contrast checks, and axe over the designer in twelve states. [accessibility.md](../accessibility.md) distinguishes those checks from coverage still missing; this mission is not a claim of complete conformance.

## Scope of this specification

The contracts cover the library packages. The playground demonstrates authoring and preview, and the demo server demonstrates persistence and shared server validation. Neither app commits the library to hosting forms, managing users, or providing a backend.

Proposed additions are evaluated against the [product principles](README.md#product-principles). A capability that already exists remains supported under the [compatibility policy](../COMPATIBILITY.md) until a separate change is approved; narrowing future scope does not silently remove APIs or invalidate stored forms.
