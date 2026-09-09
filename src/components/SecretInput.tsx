import { SECRET_MASK, isKeptSecret, keepMarker } from '../lib/secretFields';

interface Props {
  id: string;
  /** Either a real value being typed, or a keep marker from `secretFields`. */
  value: string;
  onChange: (next: string) => void;
  /** The stored key this field came from, when the form is editing one. */
  storedKey?: string;
  /** True when the server being edited has a secret here to fall back on. */
  hasStored: boolean;
  placeholder?: string;
  className: string;
  autoComplete?: string;
  label: string;
}

const buttonClass =
  'shrink-0 text-xs px-2.5 py-2 rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/60 transition-colors';

/**
 * A credential field that never displays a stored credential.
 *
 * While the field holds a keep marker it renders {@link SECRET_MASK} read-only,
 * so the plaintext is not in the DOM and copying the field yields the mask.
 * “Change” swaps in an empty editable field; “Keep existing” puts the marker
 * back. An empty field on submit clears the credential.
 */
export function SecretInput({
  id,
  value,
  onChange,
  storedKey,
  hasStored,
  placeholder,
  className,
  autoComplete = 'off',
  label,
}: Props) {
  const kept = isKeptSecret(value);

  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="password"
        autoComplete={autoComplete}
        readOnly={kept}
        value={kept ? SECRET_MASK : value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={kept ? undefined : placeholder}
        aria-describedby={kept ? `${id}-kept` : undefined}
        className={`flex-1 min-w-0 ${className} ${kept ? 'cursor-default text-zinc-500' : ''}`}
      />
      {kept && (
        <button
          type="button"
          onClick={() => onChange('')}
          className={buttonClass}
          aria-label={`Change ${label}`}
        >
          Change
        </button>
      )}
      {!kept && hasStored && (
        <button
          type="button"
          onClick={() => onChange(keepMarker(storedKey))}
          className={buttonClass}
          aria-label={`Keep existing ${label}`}
        >
          Keep existing
        </button>
      )}
      {kept && (
        <span id={`${id}-kept`} className="sr-only">
          A {label} is stored. Its value is never shown. Choose Change to replace it.
        </span>
      )}
    </div>
  );
}
