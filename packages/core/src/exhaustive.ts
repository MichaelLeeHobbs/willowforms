export function unreadableTag<T>(_tag: never, fallback: T): T {
  return fallback
}
