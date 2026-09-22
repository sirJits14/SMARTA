export function notificationState({ supported, permission, isIOS, isStandalone, registered, accountEnabled }) {
  if (!supported) return isIOS && !isStandalone ? 'ios_needs_install' : 'unsupported';
  if (permission === 'denied') return 'blocked';
  if (!accountEnabled) return 'account_off';
  return permission === 'granted' && registered ? 'on' : 'off';
}
