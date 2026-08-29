# Decisions

Choices made under delegated design authority that would otherwise have been questions. Newest first.

The field that earns this file is **Reversal**: it says which entries deserve a second look.

### Edit mode draws what a condition hides; preview does not

- **Decided:** `FormRenderer` takes `revealHidden`, and the designer passes it while editing and never
  in preview. A revealed node carries `data-fs-hidden="true"`. Validation is untouched: `validateForm`
  calls the same `isVisible`, so this changes what is drawn and never what is checked.
- **Why:** A component with `renderWhen` set was absent from the canvas DOM, so it could not be seen,
  selected there, or dropped into — the tree was the only way to reach it. Arranging a form means
  arranging every component in it, including the ones a given user will not see. Showing what a user
  sees is what Preview is for.
- **Rejected:** A sample-data box on the canvas bar, which makes an author simulate a user to reach
  their own components and cannot help at all with a condition reading host context. Also rejected:
  dimming the revealed node from `designer.css`, which invariant 3's test forbids — its bar is that an
  exception gives a component back something the designer took, never an appearance decision on the
  kit's behalf. The marker is an attribute; what to draw with it is still open.
- **Reversal:** Cheap. One prop, one branch in `RenderNode`, one optional attribute on `NodeAttributes`.
  Kits spread `nodeProps`, so none of them had to change.
- **When:** 2026-08-28, on `feat/context`.

### The context an effect writes is the browser's, never the server's

- **Decided:** `setContext` writes to the browser's copy of `FormContext` only. The server builds its own
  context from its own session and never reads one out of a request body. A rule guarding anything that
  matters must read a path the server can derive for itself.
- **Why:** The spec had said the same rule "evaluates on the server, where the context is whatever the
  request supplied", which reads as an instruction to trust the payload and contradicts the security
  model two files over. An effect is authored in a document, and a document must not be able to grant
  itself privilege on the server.
- **Rejected:** Letting an effect's context travel with the submit. It is convenient and it makes a
  document able to tell the server what to believe about the person filling it in.
- **Reversal:** Free today. `setContext` is a sketch in `09-actions.md`, not code. It gets expensive the
  moment an action vocabulary ships against the looser reading.
- **When:** 2026-08-28, on `feat/context`.
