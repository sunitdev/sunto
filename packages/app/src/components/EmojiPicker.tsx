import { useLayoutEffect, useRef } from 'react';
import { useDismiss } from '../hooks/useDismiss';
import { place } from '../hooks/usePhone';
import { getPlatform, showEmojiPanel } from '../platform';

// The first character of `value`, including flags, keycaps and skin tones.
function firstGlyph(value: string) {
  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return [...segments.segment(value.trim())][0]?.segment ?? '';
}
// The Mac app opens the system emoji picker itself; elsewhere, how to open it.
const platform = getPlatform();
const hint =
  platform === 'macos'
    ? ''
    : platform === 'ios'
      ? 'Tap the emoji key on the keyboard.'
      : 'Press fn E or Control-Command-Space for emoji.';
// Chooses a list or section icon with the system emoji picker, opening below
// the element that `anchor` measures. The first emoji entered becomes the icon.
export function EmojiPicker({
  anchor,
  current,
  choose,
  close,
}: {
  anchor: DOMRect;
  current: string;
  choose: (icon: string) => void;
  close: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  useDismiss(root, true, close);
  useLayoutEffect(() => {
    const el = root.current!;
    const { width, height } = el.getBoundingClientRect();
    place(
      el,
      Math.max(8, Math.min(anchor.left, innerWidth - width - 8)),
      Math.max(8, Math.min(anchor.bottom + 4, innerHeight - height - 8)),
    );
    field.current!.focus();
    showEmojiPanel();
  }, [anchor]);
  function pick(icon: string) {
    close();
    choose(icon);
  }
  return (
    <div
      ref={root}
      className="popover emoji-picker"
      role="dialog"
      aria-label="Choose icon"
    >
      <div className="emoji-custom">
        <input
          ref={field}
          aria-label="Icon emoji"
          placeholder={current || 'Emoji'}
          value=""
          onChange={(e) => {
            const glyph = firstGlyph(e.target.value);
            if (glyph) pick(glyph);
          }}
          onClick={showEmojiPanel}
        />
        {current && (
          <button className="emoji-remove" onClick={() => pick('')}>
            Remove
          </button>
        )}
      </div>
      {hint && <p className="emoji-hint">{hint}</p>}
    </div>
  );
}
