export function nextFocusableIndex(currentIndex, count, backwards = false) {
  if (!Number.isInteger(count) || count <= 0) return -1
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= count) {
    return backwards ? count - 1 : 0
  }
  return (currentIndex + (backwards ? -1 : 1) + count) % count
}
