"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconChevronDown, IconNewVersion, IconUploadFile, IconUploadFolder } from "./icons";

/** A Box toolbar dropdown: the button, then a menu that closes on Esc, outside click or choice. */
export function BoxDropdown({
  label,
  variant,
  disabled,
  items,
  testId,
}: {
  label: string;
  variant: "primary" | "secondary";
  disabled?: boolean;
  items: ({ label: string; icon?: React.ReactNode; onSelect?: () => void; separatorBefore?: boolean; testId?: string })[];
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testId}
        onClick={() => setOpen((o) => !o)}
        className={`box-btn ${variant === "primary" ? "box-btn-primary" : "box-btn-secondary"}`}
      >
        {label}
        <IconChevronDown size={12} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="box-menu absolute right-0 top-[38px] z-30"
          >
            {items.map((it) => (
              <div key={it.label}>
                {it.separatorBefore ? <div className="my-1.5 h-px bg-[#E8E8E8]" role="separator" /> : null}
                <button
                  type="button"
                  role="menuitem"
                  data-testid={it.testId}
                  className="box-menu-item"
                  onClick={() => {
                    setOpen(false);
                    it.onSelect?.();
                  }}
                >
                  {it.icon ? <span className="text-[#4E4E4E]">{it.icon}</span> : null}
                  {it.label}
                </button>
              </div>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Box's Upload menu: Upload files, Upload folder, and Upload new version (the demo's beat). */
export function UploadMenu({ disabled, onNewVersion }: { disabled?: boolean; onNewVersion: () => void }) {
  return (
    <BoxDropdown
      label="Upload"
      variant="secondary"
      disabled={disabled}
      testId="upload-menu"
      items={[
        { label: "Upload files", icon: <IconUploadFile /> },
        { label: "Upload folder", icon: <IconUploadFolder /> },
        { label: "Upload new version", icon: <IconNewVersion />, onSelect: onNewVersion, separatorBefore: true, testId: "upload-new-version" },
      ]}
    />
  );
}
