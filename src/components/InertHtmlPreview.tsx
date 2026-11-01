interface Props {
  html: string;
  title: string;
}

/**
 * Renders an HTML resource from the server under investigation, with scripts off.
 *
 * This preview used to run with `sandbox="allow-scripts"`. The sandbox held —
 * opaque origin, no parent DOM, no storage, no preload bridge — but attacker
 * script still executed, and a frame that merely *looks* like the app is enough:
 * Sleuth is open source, so a hostile server can publish an HTML resource that
 * reproduces the vault-unlock panel and posts the passphrase it collects to its
 * own host. The user only has to click Preview, which is an ordinary action in
 * an inspection tool.
 *
 * The point of the preview is to see how the markup renders, not to run it, so
 * the frame is fully sandboxed: no scripts, no same-origin, no forms, no
 * navigation. The banner says so, because a preview that silently differs from
 * a browser's rendering would otherwise be misleading.
 */
export function InertHtmlPreview({ html, title }: Props) {
  return (
    <div>
      <p className="px-4 py-1.5 text-[10px] uppercase tracking-[0.12em] text-amber-500/80 bg-amber-500/5 border-b border-amber-500/15">
        Untrusted preview · scripts and forms disabled
      </p>
      <iframe
        srcDoc={html}
        sandbox=""
        title={title}
        referrerPolicy="no-referrer"
        className="w-full block bg-white"
        style={{ minHeight: '320px', border: 'none' }}
      />
    </div>
  );
}
