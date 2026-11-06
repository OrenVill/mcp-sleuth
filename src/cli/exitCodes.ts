export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;

/** Agent Readiness score below `--min-readiness`. */
export const EXIT_CHECK_READINESS = 10;
/** Prompt injection findings with `--fail-on-injection`. */
export const EXIT_CHECK_INJECTION = 11;
/** One or more replay cases failed (`--replay`). */
export const EXIT_CHECK_REPLAY = 12;
