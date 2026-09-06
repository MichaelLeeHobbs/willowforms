export type {
  ActionRef,
  CodeAction,
  ComponentNode,
  Condition,
  Device,
  Effect,
  EventName,
  FieldSchema,
  FormContext,
  FormData,
  FormDocument,
  FormErrors,
  FormSettings,
  JsonValue,
  Language,
  Operand,
  PropValue,
  ValidationKey,
  ValidationRule,
} from './types.js'

export type { ActionEvaluator, ActionInvocation, ActionRunResult } from './actions.js'
export { BUILTIN_ACTION_NAMES, runActions } from './actions.js'

export type {
  ComponentDef,
  IconName,
  Kit,
  PaletteGroup,
  PropEditor,
  PropOption,
  PropSchema,
} from './kit.js'
export { groupKit, indexKit } from './kit.js'

export {
  isEmpty,
  jsonToString,
  optionEntry,
  optionValues,
  optionValue,
  readPath,
  safeHref,
  valueOf,
} from './json.js'

export { MAX_CONDITION_DEPTH, evaluateCondition, same } from './condition.js'

/*
 * `MAX_TREE_DEPTH`, whose sibling `MAX_CONDITION_DEPTH` is exported one line
 * up, and `validationsOf`, which `FieldSchema`'s own JSDoc names as the
 * prescribed way to read `validations` -- and that comment ships in the
 * published `.d.ts`, so a consumer following the type's own instruction got a
 * resolution error and hand-rolled the guard the helper exists to centralise.
 */
export { MAX_TREE_DEPTH, validationsOf } from './tree.js'

export { unreadableTag } from './exhaustive.js'

export {
  DEVICE_QUERY,
  parseDeclarations,
  printDeclarations,
  readDeclaration,
  safeDeclarations,
  safeStyleValue,
  setDeclaration,
  styleSheetFor,
} from './css.js'
// The options bag `styleSheetFor` takes. Exporting the function and not the
// shape of its argument leaves a consumer unable to name what it is passing.
export type { StyleSheetOptions } from './css.js'

export {
  MAX_CONTEXT_VALUES,
  contextKeys,
  contextValues,
  evaluatorKeys,
  missingContext,
} from './context.js'

export { KEY_PATTERN, MAX_KEY_LENGTH, RESERVED_KEYS, keyProblem } from './keys.js'

export type { KeyScopes, RowContext, RowFrame, RowPath } from './rows.js'
export type { ParsedAddress } from './rows.js'
export {
  NO_ROWS,
  addressOf,
  applyChange,
  decodeAddress,
  decodeRow,
  encodeRow,
  innermost,
  keyScopesFor,
  pushRow,
  rowContext,
  rowsOf,
} from './rows.js'

export { isVisible } from './visibility.js'

export { findLanguage, languageTag } from './language.js'

export type { JsonSchema, JsonSchemaProperty } from './schema.js'
export { toJsonSchema, unexportableRules } from './schema.js'

export type { FlatNode, StructuralError } from './tree.js'
export {
  flatten,
  collectKeys,
  dataKeyOf,
  duplicateNode,
  findNode,
  findParent,
  generateKey,
  insertNode,
  moveNode,
  pathTo,
  removeNode,
  repointBinding,
  repointDataKey,
  writersOf,
  updateNode,
  validateDocument,
  walk,
} from './tree.js'

export type { EvalOptions, Evaluator } from './validation.js'
export {
  applyRule,
  autoValidateKeys,
  submittedData,
  DEFAULT_MESSAGES,
  INVALID_TYPE,
  MAX_ROWS,
  NOT_A_LIST,
  TOO_DEEP,
  TOO_MANY_ROWS,
  UNREADABLE_RULE,
  validateField,
  isRequired,
  itemLimits,
  isRowScope,
  patternProblem,
  submittedAcross,
  validateAcross,
  validateForm,
} from './validation.js'

export { createDocument, emptyRoot, instantiate, prop } from './factory.js'

export type { DocumentLoadResult } from './document.js'
export { CURRENT_DOCUMENT_VERSION, loadDocument } from './document.js'

export { safeImageSource, MAX_EMBEDDED_IMAGE_BYTES } from './image.js'
export {
  backgroundImageProps,
  backgroundImageDefaults,
  backgroundImageStyle,
} from './background.js'
