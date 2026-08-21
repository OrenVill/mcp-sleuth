/**
 * Human-readable text for an unexpected error caught by a boundary or a global
 * handler. Pure, so the formatting is testable without rendering anything.
 */
export interface FormattedCrash {
  title: string;
  detail: string;
  stack: string | null;
}

const MAX_DETAIL = 400;

export function formatCrash(error: unknown, context?: string): FormattedCrash {
  const title = context ? `${context} stopped responding` : 'Something went wrong';

  if (error instanceof Error) {
    const detail = error.message.trim() || error.name || 'An unknown error occurred.';
    return {
      title,
      detail: detail.length > MAX_DETAIL ? `${detail.slice(0, MAX_DETAIL)}…` : detail,
      stack: typeof error.stack === 'string' ? error.stack : null,
    };
  }

  if (typeof error === 'string' && error.trim()) {
    const detail = error.trim();
    return {
      title,
      detail: detail.length > MAX_DETAIL ? `${detail.slice(0, MAX_DETAIL)}…` : detail,
      stack: null,
    };
  }

  return { title, detail: 'An unknown error occurred.', stack: null };
}
