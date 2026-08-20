import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm action as destructive. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * In-app replacement for `window.confirm`.
 *
 * The native dialog is an unstyled browser chrome element — in a frameless dark
 * desktop window it reads as a browser popup rather than part of the app. It is
 * also modal to the whole process and cannot be themed.
 *
 * Sits above the server form (z-50), which can raise a confirmation of its own.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus the safe action, not the destructive one.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl shadow-black/60"
      >
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-50">{title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{message}</p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-zinc-700 px-3.5 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800/70 hover:text-zinc-100"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors ${
              danger
                ? 'bg-red-600 shadow-red-950/50 hover:bg-red-500 active:bg-red-700'
                : 'bg-violet-600 shadow-violet-950/50 hover:bg-violet-500 active:bg-violet-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
