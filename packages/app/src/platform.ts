import { Capacitor } from '@capacitor/core';

declare global {
  interface Window { sunto?: Readonly<{ platform: 'macos' }> }
}

// Native capabilities belong here, keeping UI components independent of each shell.
export function getPlatform(): 'macos' | 'ios' | 'web' {
  if (window.sunto?.platform === 'macos') return 'macos';
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'web';
}
