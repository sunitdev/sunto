import { useLayoutEffect, useRef, useState } from 'react';
import { useDismiss } from '../hooks/useDismiss';

const choices = [
  '📁',
  '🏡',
  '💼',
  '🎯',
  '🚀',
  '📚',
  '💡',
  '🛒',
  '✈️',
  '🏋️',
  '💰',
  '🧾',
  '🎨',
  '🎵',
  '🌱',
  '🍳',
  '💻',
  '📝',
  '📅',
  '⭐',
  '❤️',
  '🐾',
  '🔧',
  '🎉',
];
// The first character of `value`, including flags, keycaps and skin tones.
function firstGlyph(value: string) {
  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return [...segments.segment(value.trim())][0]?.segment ?? '';
}
// Chooses a list or section icon from common emoji, or any typed character,
// opening below the element that `anchor` measures.
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
  const [draft, setDraft] = useState('');
  useDismiss(root, true, close);
  useLayoutEffect(() => {
    const el = root.current!;
    const { width, height } = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(anchor.bottom + 4, innerHeight - height - 8))}px`;
    (
      el.querySelector<HTMLElement>('[aria-pressed="true"]') ??
      el.querySelector('button')
    )?.focus();
  }, [anchor]);
  function pick(icon: string) {
    close();
    choose(icon);
  }
  function applyDraft() {
    const glyph = firstGlyph(draft);
    if (glyph) pick(glyph);
  }
  return (
    <div
      ref={root}
      className="popover emoji-picker"
      role="dialog"
      aria-label="Choose icon"
    >
      <div className="emoji-grid">
        {choices.map((emoji) => (
          <button
            key={emoji}
            aria-label={emoji}
            aria-pressed={emoji === current}
            onClick={() => pick(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="emoji-custom">
        <input
          aria-label="Any emoji or character"
          placeholder="Type any emoji"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (!e.nativeEvent.isComposing && e.key === 'Enter') {
              e.preventDefault();
              applyDraft();
            }
          }}
        />
        <button className="emoji-use" onClick={applyDraft}>
          Use
        </button>
        <button className="emoji-remove" onClick={() => pick('')}>
          Remove
        </button>
      </div>
    </div>
  );
}
