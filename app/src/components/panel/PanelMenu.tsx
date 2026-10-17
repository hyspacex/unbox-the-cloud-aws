"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useKeelState, type MenuScreen } from "@/components/KeelStateProvider";
import { MENU_TITLES } from "./MenuScreens";
import { C } from "./parts";

const TOP: MenuScreen[] = ["how_it_works", "rules", "record", "how_checked"];
const BOTTOM: MenuScreen[] = ["scenarios", "replay"];

/** The ⋯ menu (design decision 7). Each item opens inside the panel as a level-2 screen with the back arrow. */
export function PanelMenu({ onClose }: { onClose: () => void }) {
  const { pushView, reset, isMock, config, replay, busy, run } = useKeelState();
  const [confirmReset, setConfirmReset] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-panel-menu-button]")) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const open = (s: MenuScreen) => {
    onClose();
    pushView({ kind: "menu", screen: s });
  };
  const mode = replay ? "Replay" : config?.mode === "live" ? "Live" : config?.mode === "replay" ? "Replay" : "Mock";

  const Item = ({ s }: { s: MenuScreen }) => (
    <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-[13.5px] hover:bg-[#F4F6FA] focus:bg-[#F4F6FA] focus:outline-none" style={{ color: C.text }} onClick={() => open(s)}>
      {MENU_TITLES[s]}
    </button>
  );

  return (
    <motion.div
      ref={ref}
      role="menu"
      aria-label="Control review menu"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.16 }}
      className="absolute right-3 top-[50px] z-10 w-[220px] rounded-[4px] border bg-white py-1"
      style={{ borderColor: C.border, boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
        const i = items.indexOf(document.activeElement as HTMLElement);
        items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }}
    >
      {TOP.map((s) => (
        <Item key={s} s={s} />
      ))}
      <div className="my-1 border-t" style={{ borderColor: C.border }} />
      {BOTTOM.map((s) => (
        <Item key={s} s={s} />
      ))}
      {isMock ? (
        confirmReset ? (
          <div className="px-3 py-2">
            <div className="text-[12.5px]" style={{ color: C.text }}>
              Back to snapshot S3?
            </div>
            <div className="mt-1.5 flex gap-2">
              <button type="button" role="menuitem" className="h-7 rounded-[4px] border px-2 text-[12.5px] font-bold hover:bg-[#F4F6FA]" style={{ borderColor: "#C9C9C9" }} onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button
                type="button"
                role="menuitem"
                className="h-7 rounded-[4px] px-2 text-[12.5px] font-bold text-white"
                style={{ background: C.boxBlue }}
                onClick={async () => {
                  onClose();
                  await reset();
                }}
              >
                Reset demo
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            role="menuitem"
            disabled={Boolean(run?.running)}
            className="block w-full px-3 py-2 text-left text-[13.5px] hover:bg-[#F4F6FA] focus:bg-[#F4F6FA] focus:outline-none disabled:opacity-40"
            style={{ color: C.text }}
            onClick={() => setConfirmReset(true)}
          >
            Reset demo
          </button>
        )
      ) : null}
      <div className="px-3 py-2 text-[12.5px]" style={{ color: C.secondary }} aria-label={`Mode ${mode}`}>
        Mode · {mode}
        {busy && !replay ? <span className="sr-only"> (busy)</span> : null}
      </div>
    </motion.div>
  );
}
