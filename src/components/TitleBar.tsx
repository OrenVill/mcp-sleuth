import { Logo } from './Logo';
import { WindowControls } from './WindowControls';

/**
 * Slim title bar for the pre-vault screens, which render no app header.
 *
 * The desktop window is frameless, so without this there would be no app
 * identity, nothing to drag the window by, and no way to close it. On the main
 * UI the real header (`.app-header`) plays the same role.
 */
export function TitleBar() {
  return (
    <div className="app-titlebar flex items-center gap-2.5 border-b border-zinc-800/80 bg-zinc-950/80 pl-4">
      <Logo size={20} className="rounded-[6px]" />
      <span className="text-sm font-semibold tracking-tight text-zinc-200">MCP Explorer</span>
      <div className="ml-auto flex items-center self-stretch">
        <WindowControls />
      </div>
    </div>
  );
}
