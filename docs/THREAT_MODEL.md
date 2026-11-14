# Threat model

## Trust boundaries

- A form document may be supplied by a different party from the person filling it in.
- Submitted data is untrusted and must be validated and projected on the server.
- Host context is trusted only when the host derives it; it is never accepted from submitted data.
- A component kit is application code and has the same privileges as its host.
- Computed expressions, custom rules, and code actions are author-controlled code.

## Required controls

- Core does not provide an `eval`-based evaluator. Hosts that enable expressions must isolate execution,
  enforce time and memory limits, and use equivalent policy on client and server.
- Document CSS is limited to declarations that cannot escape the component rule or initiate fetching.
- Document URLs are restricted to schemes appropriate for navigation and media use. Image and decorative background properties permit http/https, relative paths, and base64 PNG/JPEG/WebP/GIF up to 2 MiB per image. Embedded SVG and non-image data URLs are refused; linked SVGs use image contexts. Hosts control asset access and image CSP. Background URLs are escaped into React inline styles and never interpolated into stylesheet text.
- Validation and submission traverse bounded tree depth and bounded repeater rows.
- Server code validates the document, validates submitted value types and rules, checks required context,
  and stores only `submittedData` or `submittedAcross` output.
- Pattern validation must use an engine with bounded execution. JavaScript regular-expression heuristics
  are not a security boundary. Core bounds pattern source length, compiled program size, and input
  length, so validation work is linear in submitted text with a capped constant. Hosts must still cap
  request body size.

## Out of scope

WillowForms cannot make a malicious host application or component kit safe. It also cannot make author
code safe when a host executes it with access to page, network, filesystem, process, or secrets.

Security regression tests may contain representative hostile inputs. Runtime comments and public API
documentation should describe the enforced invariant without reproducing exploit payloads.
