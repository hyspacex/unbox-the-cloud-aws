"use client";

import Link from "next/link";
import { BoxNav } from "./BoxNav";
import { OwlMark } from "@/components/owl";
import { IconBell, IconPlusCircle, IconSearch } from "./icons";

export { PUSH_MIN_WIDTH, PUSH_QUERY } from "./BoxPush";

/** The Box web app frame: 56 px header with the Keel wordmark, search, ⊕, bell and the user chip; left nav; content. */
export function BoxShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="box-root flex h-screen min-h-0 flex-col overflow-hidden bg-white text-[14px] text-[#222222]">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[#E8E8E8] bg-white pl-5 pr-4">
        <Link href="/" className="flex w-[52px] min-[1100px]:w-[200px] shrink-0 items-center" aria-label="Keel, All Projects">
          <span className="flex items-center gap-2">
            <OwlMark size={26} />
            <span className="hidden text-[20px] font-bold tracking-[-0.01em] text-[#0061D5] min-[1100px]:inline">Keel</span>
          </span>
        </Link>
        <label className="group relative flex h-9 w-full max-w-[640px] items-center">
          <span className="sr-only">Search files and folders</span>
          <IconSearch size={18} className="pointer-events-none absolute left-3 text-[#767676]" />
          <input
            type="search"
            placeholder="Search files and folders"
            className="h-9 w-full rounded-md border border-[#E8E8E8] bg-[#F7F7F8] pl-10 pr-3 text-[14px] text-[#222222] outline-none transition-colors placeholder:text-[#909090] hover:border-[#D0D0D0] focus:border-[#0061D5] focus:bg-white"
          />
        </label>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" aria-label="New" className="box-icon-btn">
            <IconPlusCircle size={22} />
          </button>
          <button type="button" aria-label="Notifications" className="box-icon-btn">
            <IconBell size={22} />
          </button>
          <button
            type="button"
            aria-label="Dana Okafor, account"
            title="Dana Okafor"
            className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#2486FC] text-[13px] font-bold text-white hover:ring-2 hover:ring-[#D6E6FB]"
          >
            D
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <BoxNav />
        <div className="flex min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
