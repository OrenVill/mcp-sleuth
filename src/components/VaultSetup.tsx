import { useMemo, useState } from 'react';
import { getHost } from '../lib/host';

interface Props {
  onCreate: (passphrase: string) => Promise<void>;
  migrationHint: boolean;
  error: string | null;
  busy: boolean;
}

const inputClass =
  'mt-1.5 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500/70 transition-colors';

export function VaultSetup({ onCreate, migrationHint, error, busy }: Props) {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  // The desktop app writes a real file, so "stays in this browser" would be wrong there.
  const isDesktop = useMemo(() => getHost().kind === 'electron', []);

  const mismatch = useMemo(() => {
    if (!confirmPassphrase) return false;
    return passphrase !== confirmPassphrase;
  }, [passphrase, confirmPassphrase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passphrase.trim() || mismatch) return;
    await onCreate(passphrase);
  }

  return (
    <div className="h-full flex items-center justify-center bg-zinc-950 px-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-2xl shadow-black/50 space-y-4"
      >
        <div>
          <h2 className="text-zinc-50 text-lg font-semibold tracking-tight">Create vault</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Set a passphrase to encrypt servers and credentials on this device.{' '}
            {isDesktop
              ? 'The vault is an encrypted file in your mcp-sleuth data folder.'
              : 'With the dev server, the vault is an encrypted file; otherwise it stays in this browser.'}
          </p>
        </div>

        {migrationHint && (
          <div className="text-xs text-violet-200 px-3 py-2 rounded-lg bg-violet-950/40 border border-violet-900/60">
            Existing legacy server data will be imported and encrypted after setup.
          </div>
        )}

        <label className="block text-xs text-zinc-400 font-medium">
          Passphrase
          <input
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="••••••••"
            disabled={busy}
            autoFocus
          />
        </label>

        <label className="block text-xs text-zinc-400 font-medium">
          Confirm passphrase
          <input
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={confirmPassphrase}
            onChange={(e) => setConfirmPassphrase(e.target.value)}
            placeholder="••••••••"
            disabled={busy}
          />
        </label>

        {mismatch && (
          <div className="text-xs text-amber-300 px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-900/60">
            Passphrases do not match.
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 px-3 py-2 rounded-lg bg-red-950/30 border border-red-900/60">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !passphrase.trim() || mismatch}
          className="w-full text-sm px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium shadow-sm shadow-violet-950/50 transition-colors"
        >
          {busy ? 'Creating…' : 'Create vault'}
        </button>
      </form>
    </div>
  );
}
