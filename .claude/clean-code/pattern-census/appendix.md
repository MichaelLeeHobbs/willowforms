# Pattern census appendix

Commit 8e92d4cdbf476b77b614611d869ec24e35919337, definitions e66b4a14fa6c519206fc1ed52441c45ce9b4c47d61ca60c746fde7b4a573e0f2. Written by the run that wrote report.md.

## Families

| Job | Family | Sites | Files | Owners | Off-pattern |
| --- | --- | --- | --- | --- | --- |
| docload | `server:storageFaults>storageFaults` | 5 | 1 | history: Michael Hobbs 100% |  |
| docload | `handler:loadDocument>loadDocument` | 2 | 2 | history: Michael Hobbs 100% |  |
| docload | `effect:validateDocument>validateDocument` | 1 | 1 | history: Michael Hobbs 100% |  |
| docload | `render:loadDocument>loadDocument` | 1 | 1 | history: Michael Hobbs 100% |  |
| docload | `server:validateDocument>validateDocument` | 1 | 1 | history: Michael Hobbs 100% |  |
| evalcode | `other:host-evaluator>host-evaluator` | 6 | 4 | history: Michael Hobbs 100% |  |
| kitprops | `render:str>str` | 79 | 2 | history: Michael Hobbs 100% |  |
| kitprops | `render:num>num` | 37 | 2 | history: Michael Hobbs 100% |  |
| kitprops | `render:bool>bool` | 29 | 2 | history: Michael Hobbs 100% |  |
| kitprops | `handler:changed>onChange` | 17 | 2 | history: Michael Hobbs 100% |  |
| kitprops | `render:requiredProps>requiredProps` | 15 | 2 | history: Michael Hobbs 100% |  |
| kitprops | `handler:onChange>onChange` | 4 | 2 | history: Michael Hobbs 100% | yes |
| kitprops | `other:str>str` | 3 | 2 | history: Michael Hobbs 100% |  |
| kitprops | `render:oneOf>oneOf` | 3 | 1 | history: Michael Hobbs 100% | yes |
| kitprops | `handler:changed>changed` | 1 | 1 | history: Michael Hobbs 100% |  |
| kitprops | `other:bool>bool` | 1 | 1 | history: Michael Hobbs 100% |  |
| kitprops | `other:num>num` | 1 | 1 | history: Michael Hobbs 100% |  |
| kitprops | `other:requiredProps>requiredProps` | 1 | 1 | history: Michael Hobbs 100% |  |
| log | `module:console.error>console.error` | 11 | 2 | history: Michael Hobbs 100% |  |
| log | `module:console.log>console.log` | 5 | 5 | history: Michael Hobbs 100% |  |
| log | `effect:console.warn>console.warn` | 1 | 1 | history: Michael Hobbs 100% |  |
| log | `other:console.log>console.log` | 1 | 1 | history: Michael Hobbs 100% |  |
| safeurl | `render:backgroundImageStyle>backgroundImageStyle` | 14 | 2 | history: Michael Hobbs 100% |  |
| safeurl | `render:safeImageSource>safeImageSource` | 5 | 3 | history: Michael Hobbs 100% |  |
| safeurl | `render:safeHref>safeHref` | 4 | 2 | history: Michael Hobbs 100% |  |
| safeurl | `render:safeDeclarations>safeDeclarations` | 2 | 2 | history: Michael Hobbs 100% |  |
| safeurl | `handler:safeDeclarations>safeDeclarations` | 1 | 1 | history: Michael Hobbs 100% |  |
| safeurl | `handler:safeImageSource>safeImageSource` | 1 | 1 | history: Michael Hobbs 100% |  |
| safeurl | `other:safeDeclarations>safeDeclarations` | 1 | 1 | history: Michael Hobbs 100% |  |
| safeurl | `other:safeHref>safeHref` | 1 | 1 | history: Michael Hobbs 100% |  |
| safeurl | `other:safeImageSource>safeImageSource` | 1 | 1 | history: Michael Hobbs 100% |  |
| safeurl | `render:safeStyleValue>safeStyleValue` | 1 | 1 | history: Michael Hobbs 100% |  |
| safeurl | `render:styleSheetFor>styleSheetFor` | 1 | 1 | history: Michael Hobbs 100% |  |

## Conduits

All declared after escape round one; the tool found none itself.

| Symbol | Job | Terminal | Source | Uses |
| --- | --- | --- | --- | --- |
| `apps/demo-server/src/index.ts#held` | docload | storageFaults | declared | 3 |
| `apps/demo-server/src/index.ts#isStoredDocument` | docload | storageFaults | declared | 2 |
| `apps/playground/src/App.tsx#loadDraft` | docload | loadDocument | declared | 2 |
| `packages/core/src/validation.ts#isUrl` | safeurl | safeHref | declared | 1 |
| `packages/core/src/visibility.ts#runs` | evalcode | host-evaluator | declared | 1 |
| `packages/kit-html/src/renderers.tsx#RadioContext.onSelect` | kitprops | changed | declared | 1 |
| `packages/kit-html/src/renderers.tsx#RadioGroupNode.onSelect` | kitprops | changed | declared | 0 |
| `packages/kit-html/src/renderers.tsx#boxBackground` | safeurl | backgroundImageStyle | declared | 1 |

`boxBackground` calls both `safeStyleValue` and `backgroundImageStyle`; the conduit carries the second, which it always returns. `RadioGroupNode.onSelect` has no direct uses: it is called through `RadioContext.onSelect`.

## Escapes

| Round | Job | Place | Ruling |
| --- | --- | --- | --- |
| 1 | docload | apps/demo-server/src/index.ts:294, 301, 343, 366 | real: calls of `isStoredDocument` and `held`; both declared as conduits |
| 1 | docload | packages/renderer/src/index.tsx:789 | real: hand-written check with no sink |
| 1 | docload | packages/designer/src/store.ts:296 | rejected as the same document as site 312; confirmed when round two reported it again |
| 1 | evalcode | packages/core/src/visibility.ts:41 | real: calls `runs`; declared as a conduit |
| 1 | kitprops | packages/kit-html/src/renderers.tsx:519, 703, 800 | real: `oneOf`; added as a sink |
| 1 | kitprops | packages/kit-html/src/renderers.tsx:755 | real: `group.onSelect`; declared as a conduit |
| 1 | kitprops | packages/kit-mui/src/renderers.tsx:391, 660 | rejected as reading an option entry, not a prop; confirmed when round two reported it again |
| 1 | safeurl | packages/kit-html/src/renderers.tsx:487 | real: calls `boxBackground`; declared as a conduit |
| 1 | safeurl, docload | packages/core/src/validation.ts:365; apps/playground/src/App.tsx:99, 128 | not reported as misses; `isUrl` and `loadDraft` declared as conduits for consistency |
| 2 | docload | packages/renderer/src/index.tsx:788 | real, counted |
| 2 | docload | packages/designer/src/store.ts:296 | real, counted: the document is in use before any check |
| 2 | kitprops | packages/kit-mui/src/renderers.tsx:391, 660 | real, counted once for the file |

## Audit disagreements

| Site | Scanner | Reader | Ruling |
| --- | --- | --- | --- |
| packages/kit-html/src/renderers.tsx:273:1:kitprops | `handler:changed>onChange` | `handler:changed>changed` | scanner |
| packages/kit-html/src/renderers.tsx:279:1:kitprops | `handler:changed>onChange` | `handler:changed>changed` | scanner |
| packages/kit-html/src/renderers.tsx:318:1:kitprops | `handler:changed>onChange` | `handler:changed>changed` | scanner |
| packages/kit-html/src/renderers.tsx:348:1:kitprops | `handler:changed>onChange` | `handler:changed>changed` | scanner |
| packages/kit-html/src/renderers.tsx:396:1:kitprops | `handler:changed>onChange` | `handler:changed>changed` | scanner |
| packages/kit-html/src/renderers.tsx:592:1:kitprops | `handler:changed>onChange` | `handler:changed>changed` | scanner |
| packages/kit-html/src/renderers.tsx:640:1:kitprops | `handler:changed>onChange` | `handler:changed>changed` | scanner |
| packages/kit-html/src/renderers.tsx:717:1:kitprops | `handler:changed>onChange` | `handler:changed>changed` | scanner |
| packages/kit-html/src/renderers.tsx:793:1:kitprops | `handler:changed>onChange` | `handler:changed>changed` | scanner |
| packages/kit-mui/src/renderers.tsx:309:1:kitprops | `handler:changed>onChange` | `handler:changed>changed` | scanner |
| packages/kit-mui/src/renderers.tsx:343:1:kitprops | `handler:changed>onChange` | `handler:changed>changed` | scanner |
| packages/kit-mui/src/renderers.tsx:384:1:kitprops | `handler:changed>onChange` | `handler:changed>changed` | scanner |
| packages/kit-mui/src/renderers.tsx:567:1:kitprops | `handler:changed>onChange` | `handler:changed>changed` | scanner |
| packages/kit-mui/src/renderers.tsx:613:1:kitprops | `handler:changed>onChange` | `handler:changed>changed` | scanner |
| packages/kit-mui/src/renderers.tsx:657:1:kitprops | `handler:changed>onChange` | `handler:changed>changed` | scanner |
| packages/kit-mui/src/renderers.tsx:735:1:kitprops | `handler:changed>onChange` | `handler:changed>changed` | scanner |

## Unresolved hits

Two calls matched a job's lexical net without resolving. One is in an opaque file. The other, `apps/demo-server/src/index.ts:26:1` (the function that reads `PORT`), does no job. None is blocked.
