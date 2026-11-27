// Browser facts that Settings and the notification code both need.
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
