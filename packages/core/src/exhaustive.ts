/**
 * What to answer for a tag the union does not have.
 *
 * Every tagged union in this package is closed, so TypeScript permits a
 * `switch` over it with no tail return: it can prove every case is handled. That
 * proof holds for a value the compiler produced. It does not hold for a
 * document, which is data — authored by one person, stored by another, and
 * hand-editable in between — so `kind: 'conditon'` is a one-character typo away
 * and it reached two switches that then returned `undefined`.
 *
 * `undefined` was read as *hidden* in one and as *the guard did not pass* in the
 * other. Both are the permissive direction, and permissive is the direction that
 * fails in silence: a node dropped from validation makes a required answer
 * optional on the server, where nobody is looking.
 *
 * So each switch gets a `default` that comes through here. The `never` parameter
 * is what keeps the compile-time exhaustiveness the missing tail used to provide
 * — adding a member to the union without a case for it stops compiling — while
 * the fallback is what a hand-edited document gets at runtime. A plain
 * `default: return true` would have bought the second and thrown away the first.
 *
 * Deliberately not a throw. A malformed document is the panel's problem to
 * report and the gate's problem to refuse; taking the form down in front of the
 * person filling it in is not an improvement on either.
 */
export function unreadableTag<T>(_tag: never, fallback: T): T {
  return fallback
}
