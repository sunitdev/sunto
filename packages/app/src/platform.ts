import './storage/driver';
import { Capacitor } from '@capacitor/core';

// Native capabilities belong here, keeping UI components independent of each shell.
export function getPlatform(): 'macos' | 'ios' | 'web' {
  if (window.sunto?.platform === 'macos') return 'macos';
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'web';
}
// Opens the system emoji picker, which types into the focused field. Browsers
// offer no API for it; there it opens with Control-Command-Space.
export const canShowEmojiPanel = !!window.sunto;
export function showEmojiPanel() {
  window.sunto?.showEmojiPanel();
}
