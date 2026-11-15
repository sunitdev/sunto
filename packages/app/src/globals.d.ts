import type { NativeStorage } from './storage/driver';

// The bridge that the desktop app's preload script exposes.
declare global {
  interface Window {
    sunto?: NativeStorage & { platform: 'macos'; showEmojiPanel(): void };
  }
}
