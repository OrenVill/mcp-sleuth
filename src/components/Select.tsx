import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A select that we draw ourselves.
 *
 * The native control renders in the OS's own chrome, which reads as a foreign
 * light-mode element on this app's dark surfaces, and Tailwind's reset does not
 * strip it — only `appearance-none` does, and that also removes the arrow and
 * still leaves the option list unstyleable.
 *
 * Two things here are less obvious than they look:
 *
 * - The list is rendered through a portal at fixed coordinates. A native select
 *   pops up in an OS layer that ignores the page's clipping; an absolutely
 *   positioned list does not, and several of these sit inside scrollable panels
 *   (Scenario Runner, Schema Lab) that would cut it off.
 * - The roles and keyboard handling are spelled out rather than inherited. A
 *   `<div>` gets none of the behaviour `<select>` gave us for free, so losing it
 *   silently is the main risk in replacing the native control.
 */

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  /** Shown when `value` matches no option. */
  placeholder?: string;
  title?: string;
  'aria-label'?: string;
  testId?: string;
  /** Extra classes for the trigger. */
  className?: string;
  /** Drop the frame so several can sit inside one segmented group. */
  bare?: boolean;
}

const TRIGGER_BASE =
  'flex items-center gap-1.5 text-xs text-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const TRIGGER_FRAMED =
  'bg-zinc-900 border border-zinc-700 rounded-md pl-2.5 pr-2 py-1.5 hover:border-zinc-600 focus:outline-none focus:border-violet-500';
const TRIGGER_BARE = 'bg-transparent pl-2.5 pr-2 py-1.5 focus:outline-none hover:text-white';

export function Select({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = 'Select…',
  title,
  'aria-label': ariaLabel,
  testId,
  className = '',
  bare = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const typeahead = useRef({ text: '', at: 0 });
  const listboxId = useId();

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setRect({ left: box.left, top: box.bottom + 4, width: box.width });
  }, []);

  // Position before paint so the list never appears in the wrong place first.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    // `capture` so scrolling of any ancestor repositions it, not just the window.
    const reposition = () => place();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const openList = useCallback(() => {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [disabled, selectedIndex]);

  const choose = useCallback(
    (index: number) => {
      const option = options[index];
      if (option) onChange(option.value);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange, options],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (disabled) return;

      if (!open) {
        if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault();
          openList();
        }
        return;
      }

      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
          return;
        case 'Enter':
        case ' ':
          event.preventDefault();
          choose(activeIndex);
          return;
        case 'ArrowDown':
          event.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, options.length - 1));
          return;
        case 'ArrowUp':
          event.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          return;
        case 'Home':
          event.preventDefault();
          setActiveIndex(0);
          return;
        case 'End':
          event.preventDefault();
          setActiveIndex(options.length - 1);
          return;
        case 'Tab':
          setOpen(false);
          return;
        default:
          break;
      }

      // Typeahead, the one affordance people miss most from the native control.
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const now = event.timeStamp;
        const state = typeahead.current;
        state.text = now - state.at > 800 ? event.key : state.text + event.key;
        state.at = now;
        const match = options.findIndex((option) =>
          option.label.toLowerCase().startsWith(state.text.toLowerCase()),
        );
        if (match >= 0) setActiveIndex(match);
      }
    },
    [activeIndex, choose, disabled, open, openList, options],
  );

  // Keep the highlighted row in view when arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        data-testid={testId}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`${TRIGGER_BASE} ${bare ? TRIGGER_BARE : TRIGGER_FRAMED} ${className}`}
      >
        <span className={`flex-1 min-w-0 truncate text-left ${selected ? '' : 'text-zinc-500'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 w-3 h-3 text-zinc-500">
          <path
            d="M4.5 6.5 8 10l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel ?? title}
            style={{
              position: 'fixed',
              left: rect.left,
              top: rect.top,
              minWidth: rect.width,
              zIndex: 100,
            }}
            className="max-h-64 overflow-y-auto py-1 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
          >
            {options.length === 0 && (
              <div className="px-3 py-1.5 text-xs text-zinc-600">No options</div>
            )}
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  data-index={index}
                  // mousedown would fire before the outside-click handler closes us.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={[
                    'flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer',
                    index === activeIndex ? 'bg-zinc-800' : '',
                    isSelected ? 'text-violet-300' : 'text-zinc-300',
                  ].join(' ')}
                >
                  <span className="flex-1 min-w-0 truncate">{option.label}</span>
                  {isSelected && (
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 w-3 h-3">
                      <path
                        d="M3.5 8.5 6.5 11.5 12.5 5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
