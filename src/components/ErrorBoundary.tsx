import { Component, type ErrorInfo, type ReactNode } from 'react';
import { formatCrash } from '../lib/errorMessage';

interface Props {
  children: ReactNode;
  /** Names the failing region, e.g. "The result pane". */
  context?: string;
  /** Compact styling for a boundary around one pane rather than the whole app. */
  inline?: boolean;
}

interface State {
  error: unknown;
}

/**
 * Stops one bad render from taking the whole app down.
 *
 * This matters more here than in most apps: the renderer displays tool
 * descriptions, markdown, images, and JSON that come from MCP servers we do not
 * control and may be hostile — the same threat model the prompt-injection scan
 * exists for. Without a boundary, one malformed payload white-screens everything
 * and takes every live connection with it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('sleuth: render failed', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { title, detail } = formatCrash(error, this.props.context);
    const { inline } = this.props;

    return (
      <div
        role="alert"
        className={
          inline
            ? 'm-4 rounded-xl border border-red-900/60 bg-red-950/20 p-4'
            : 'flex h-full items-center justify-center bg-zinc-950 p-6'
        }
      >
        <div className={inline ? '' : 'w-full max-w-md space-y-4 text-center'}>
          <h2 className="text-sm font-semibold text-red-300">{title}</h2>
          <p className="mt-1.5 break-words text-sm text-zinc-400">{detail}</p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-3 rounded-lg border border-zinc-700 px-3.5 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800/70 hover:text-zinc-100"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
