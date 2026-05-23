import { marked } from 'marked';

interface Props {
  source: string;
  /** CSS class for the wrapper. Use 'md-preview-compact' for dense contexts like descriptions. */
  className?: string;
}

export function MarkdownPreview({ source, className = 'md-preview' }: Props) {
  const html = marked.parse(source) as string;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
