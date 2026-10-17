"use client";

import Link from "next/link";
import { IconClock, IconFolder, IconNote, IconSync, IconTrash } from "./icons";

const ITEMS = [
  { label: "All Files", Icon: IconFolder, active: true },
  { label: "Recents", Icon: IconClock },
  { label: "Synced", Icon: IconSync },
  { label: "Notes", Icon: IconNote },
  { label: "Trash", Icon: IconTrash },
];

/** Box's left navigation. 240 px; icons only below 1100 px. */
export function BoxNav() {
  return (
    <nav aria-label="Box" className="flex w-[64px] min-[1100px]:w-[240px] shrink-0 flex-col border-r border-[#E8E8E8] bg-white py-3">
      <ul className="flex flex-col gap-0.5 px-2 min-[1100px]:px-3">
        {ITEMS.map(({ label, Icon, active }) => (
          <li key={label}>
            <Link
              href="/"
              aria-current={active ? "page" : undefined}
              title={label}
              onClick={(e) => {
                if (!active) e.preventDefault();
              }}
              className={`flex h-10 items-center justify-center gap-3 rounded-md px-3 text-[14px] transition-colors min-[1100px]:justify-start ${
                active ? "bg-[#E8F0FE] font-bold text-[#0061D5]" : "text-[#222222] hover:bg-[#F4F6FA]"
              }`}
            >
              <Icon size={20} className={active ? "text-[#0061D5]" : "text-[#4E4E4E]"} />
              <span className="hidden min-[1100px]:inline">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
