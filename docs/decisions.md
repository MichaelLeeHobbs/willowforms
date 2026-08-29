# Decisions

Choices made under delegated design authority that would otherwise have been questions. Newest first.

The field that earns this file is **Reversal**: it says which entries deserve a second look.

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
