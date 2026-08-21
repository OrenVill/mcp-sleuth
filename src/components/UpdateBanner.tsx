import { useState } from 'react';
import { MarkdownPreview } from './MarkdownPreview';
import type { UpdateController } from './useUpdateStatus';

/**
 * The strip under the header, shown once per release.
 *
 * Download opens the GitHub release page rather than an installer: the builds are
 * unsigned, so the app cannot install anything itself, and Linux ships both a deb
 * and an AppImage with no way to know which one the user has.
 */
export function UpdateBanner({ update }: { update: UpdateController }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const { status } = update;

  if (!status?.showBanner || !status.latestVersion) return null;

  return (
    <div
      data-testid="update-banner"
      className="border-b border-violet-900/60 bg-violet-950/40 px-5 py-2 text-xs text-violet-100"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 text-violet-300" aria-hidden>
          <path
            d="M8 13V3.5M8 3.5 4.5 7M8 3.5 11.5 7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>
          <strong className="font-semibold">Sleuth {status.latestVersion}</strong> is available
          <span className="text-violet-300/70"> — you have {status.currentVersion}</span>
        </span>

        {status.releaseNotes && (
          <button
            type="button"
            onClick={() => setNotesOpen((open) => !open)}
            aria-expanded={notesOpen}
            className="text-violet-300 hover:text-violet-100 transition-colors"
          >
            What&apos;s new {notesOpen ? '▾' : '▸'}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              update.openRelease();
              update.dismiss();
            }}
            className="px-2.5 py-1 rounded-md bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
          >
            Download
          </button>
          <button
            type="button"
            onClick={update.skip}
            title={`Never mention ${status.latestVersion} again`}
            className="px-2 py-1 rounded-md text-violet-300 hover:text-violet-100 transition-colors"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={update.dismiss}
            className="px-2 py-1 rounded-md text-violet-300 hover:text-violet-100 transition-colors"
          >
            Later
          </button>
          <button
            type="button"
            onClick={update.dismiss}
            aria-label="Dismiss update notice"
            className="p-1 rounded-md text-violet-400 hover:text-violet-100 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3" aria-hidden>
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {notesOpen && status.releaseNotes && (
        <div
          data-testid="update-release-notes"
          className="mt-2 max-h-48 overflow-y-auto rounded-md border border-violet-900/50 bg-zinc-950/50 px-3 py-2"
        >
          <MarkdownPreview source={status.releaseNotes} className="md-preview-compact" />
        </div>
      )}
    </div>
  );
}
