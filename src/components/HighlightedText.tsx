import type { HighlightPart } from '../lib/promptInjectionScan';

interface Props {
  parts: HighlightPart[];
}

export function HighlightedText({ parts }: Props) {
  return (
    <span className="font-mono text-xs break-all">
      {parts.map((part, index) =>
        part.highlight ? (
          <mark
            key={index}
            className="bg-amber-500/30 text-amber-100 rounded px-0.5"
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </span>
  );
}
