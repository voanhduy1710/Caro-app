import React from 'react';
import { Calendar, CircleCheck, Lightbulb, MapPin, Plus, User } from 'lucide-react';

/**
 * The Workspace side panel strip that real Google Sheets keeps down the right
 * edge of every document. Nothing in it does anything: it is there because a
 * Sheets window without it reads as "almost Sheets" to anyone who uses the real
 * thing daily, and that is exactly the person glancing over the player's
 * shoulder. Hidden from assistive tech for the same reason it is inert.
 */
const APPS: Array<{ id: string; icon: React.ReactNode; title: string }> = [
  { id: 'calendar', icon: <Calendar size={20} strokeWidth={2} color="#1a73e8" />, title: 'Lịch' },
  { id: 'keep', icon: <Lightbulb size={20} strokeWidth={2} color="#fbbc04" fill="#fbbc04" fillOpacity={0.25} />, title: 'Keep' },
  { id: 'tasks', icon: <CircleCheck size={20} strokeWidth={2} color="#1a73e8" />, title: 'Tasks' },
  { id: 'contacts', icon: <User size={20} strokeWidth={2} color="#1a73e8" />, title: 'Danh bạ' },
  { id: 'maps', icon: <MapPin size={20} strokeWidth={2} color="#34a853" />, title: 'Maps' },
];

export const SheetSideStrip: React.FC = () => (
  <aside
    aria-hidden="true"
    className="hidden w-14 shrink-0 flex-col items-center gap-2 border-l border-[#e0e0e0] bg-white pt-16 md:flex"
  >
    {APPS.map((app) => (
      <span
        key={app.id}
        title={app.title}
        className="grid h-10 w-10 cursor-pointer place-items-center rounded-full transition-colors hover:bg-[rgba(68,71,70,0.08)]"
      >
        {app.icon}
      </span>
    ))}
    <span className="my-1 h-px w-5 bg-[#c4c7c5]" />
    <span
      title="Tải tiện ích bổ sung"
      className="grid h-10 w-10 cursor-pointer place-items-center rounded-full transition-colors hover:bg-[rgba(68,71,70,0.08)]"
    >
      <Plus size={20} strokeWidth={2} color="#444746" />
    </span>
  </aside>
);
