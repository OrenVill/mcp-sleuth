import { useState } from 'react';

interface Props {
  onUnlock: (passphrase: string) => Promise<void>;
  error: string | null;
  busy: boolean;
}

const inputClass =
  'mt-1.5 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500/70 transition-colors';

export function VaultUnlock({ onUnlock, error, busy }: Props) {
  const [passphrase, setPassphrase] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passphrase.trim()) return;
    await onUnlock(passphrase);
  }

  // Centring lives in App: this used to stretch to full height, which pushed the
  // sibling "Reset vault" button to the bottom of the window.
  return (
    <form
    onSubmit={(e) => void handleSubmit(e)}
    className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-2xl shadow-black/50 space-y-4"
  >
      <div>
        <h2 className="text-zinc-50 text-lg font-semibold tracking-tight">Unlock vault</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Enter your passphrase to decrypt servers and credentials.
        </p>
      </div>

      <label className="block text-xs text-zinc-400 font-medium">
        Passphrase
        <input
          type="password"
          autoComplete="current-password"
          className={inputClass}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="••••••••"
          disabled={busy}
          autoFocus
        />
      </label>

      {error && (
        <div className="text-xs text-red-400 px-3 py-2 rounded-lg bg-red-950/30 border border-red-900/60">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !passphrase.trim()}
        className="w-full text-sm px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium shadow-sm shadow-violet-950/50 transition-colors"
      >
        {busy ? 'Unlocking…' : 'Unlock'}
      </button>
    </form>
  );
}
