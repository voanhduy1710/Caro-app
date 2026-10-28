/** The bot game has its own address, so it can be linked to and survives a refresh. */
export const BOT_PATH = '/bot';

export const isBotPath = (pathname: string): boolean => /^\/bot\/?$/i.test(pathname);

/** Opening /bot starts a bot game, unless the link is really a room link. */
export const shouldAutoStartBot = (pathname: string, search: string): boolean =>
  isBotPath(pathname) && !new URLSearchParams(search).has('room');

/** Mirrors the screen in the address bar without adding a history entry. */
export const setBotUrl = (onBotPage: boolean) => {
  // Leaving only matters from /bot itself; anywhere else the address (a room link, say) is not ours to touch.
  if (!onBotPage && !isBotPath(window.location.pathname)) return;
  try {
    window.history.replaceState(window.history.state, '', onBotPage ? BOT_PATH : '/');
  } catch {
    // The address is a convenience; the game works without it.
  }
};
