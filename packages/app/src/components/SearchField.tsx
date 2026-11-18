import type { RefObject } from 'react';
import { ToolbarIcon } from './icons';

// The field above Search's results and the Logbook. Enter or the down arrow
// moves to the first result, and Escape clears the field, then leaves it.
export function SearchField({
  query,
  setQuery,
  label,
  inputRef,
  autoFocus,
}: {
  query: string;
  setQuery: (query: string) => void;
  label: string;
  inputRef: RefObject<HTMLInputElement | null>;
  autoFocus: boolean;
}) {
  return (
    <div className="search-field" role="search">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4 4" />
      </svg>
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        aria-label={label}
        placeholder={label}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            const first = document.querySelector<HTMLElement>(
              '.task-scroll .task-title',
            );
            if (first) first.focus();
            else e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            if (query) setQuery('');
            else e.currentTarget.blur();
          }
        }}
      />
      {query && (
        <button
          className="search-clear"
          aria-label="Clear search"
          onClick={() => {
            setQuery('');
            inputRef.current?.focus();
          }}
        >
          <ToolbarIcon d="M8 8l8 8M16 8l-8 8" />
        </button>
      )}
    </div>
  );
}
