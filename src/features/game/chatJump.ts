/** Brings the answered message into view and flashes it, when it is still in the feed. */
export const jumpTo = (list: HTMLDivElement | null, id: string) => {
  const target = list?.querySelector<HTMLElement>(`[data-chat-id="${CSS.escape(id)}"]`);
  if (!target) return;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.classList.remove('chat-flash');
  void target.offsetWidth;
  target.classList.add('chat-flash');
};
