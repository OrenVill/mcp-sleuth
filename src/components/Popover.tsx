import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A panel anchored to a trigger, portalled to the body.
 *
 * Same reasoning as `Select`: these open from a toolbar that sits above
 * scrollable content, and an absolutely positioned panel would be clipped by
 * the first ancestor with `overflow` set. Positioning is recomputed on scroll
 * (capture phase, so an ancestor scrolling counts) and on resize.
 */
interface Props {
  /** Rendered inside the trigger button. */
  trigger: (state: { open: boolean }) => ReactNode;
  children: (state: { close: () => void }) => ReactNode;
  /** Which edge of the panel lines up with the trigger. */
  align?: 'left' | 'right';
  className?: string;
  panelClassName?: string;
  testId?: string;
  'aria-label'?: string;
  disabled?: boolean;
}

export function Popover({
  trigger,
  children,
  align = 'right',
  className = '',
  panelClassName = '',
  testId,
  'aria-label': ariaLabel,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ left: number; right: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setBox({
      left: rect.left,
      right: window.innerWidth - rect.right,
      top: rect.bottom + 6,
    });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
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
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        data-testid={testId}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={className}
      >
        {trigger({ open })}
      </button>

      {open &&
        box &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={ariaLabel}
            style={{
              position: 'fixed',
              top: box.top,
              ...(align === 'right' ? { right: box.right } : { left: box.left }),
              zIndex: 100,
            }}
            className={`rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl ${panelClassName}`}
          >
            {children({ close: () => setOpen(false) })}
          </div>,
          document.body,
        )}
    </>
  );
}
