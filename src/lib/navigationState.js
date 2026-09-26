// Re-selecting the active destination must not remount an unsaved editor.
export function shouldStartNavigation(current, next, params = null) {
  return current !== next || params !== null;
}
