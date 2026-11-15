import { Capacitor } from '@capacitor/core';

// Native capabilities belong here, keeping UI components independent of each shell.
export function getPlatform(): 'macos' | 'ios' | 'web' {
  if (window.sunto?.platform === 'macos') return 'macos';
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'web';
}

// Opens the system emoji picker for the focused field, where the shell can;
// elsewhere the field's own keyboard offers emoji.
export function showEmojiPanel() {
  void window.sunto?.showEmojiPanel();
}
