import { useEffect, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard';

type CopyState = 'idle' | 'copied' | 'failed';

interface Props {
  label: string;
  getText: () => string;
  testId: string;
  disabled?: boolean;
  className?: string;
}

export function CopyMarkdownButton({ label, getText, testId, disabled = false, className = '' }: Props) {
  const [state, setState] = useState<CopyState>('idle');
  const revert = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (revert.current !== null) clearTimeout(revert.current);
    },
    [],
  );

  async function onClick() {
    if (disabled) return;
    if (revert.current !== null) clearTimeout(revert.current);
    const ok = await copyText(getText());
    setState(ok ? 'copied' : 'failed');
    revert.current = setTimeout(() => setState('idle'), 1800);
  }

  const buttonLabel =
    state === 'copied' ? 'Copied!' : state === 'failed' ? 'Copy failed' : label;

  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={() => void onClick()}
      aria-label={label}
      className={[
        'px-3 py-2 text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent',
        state === 'copied' ? 'border-violet-700 text-violet-200' : '',
        state === 'failed' ? 'border-red-900 text-red-300' : '',
        className,
      ].join(' ')}
    >
      <span aria-live="polite">{buttonLabel}</span>
    </button>
  );
}
