"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Names the region for assistive tech, for example "Vault navigation". */
  label: string;
  children: ReactNode;
}

/**
 * A native <dialog> pinned to the leading edge. Using the element rather than
 * a styled div keeps the focus trap, the Escape key, and the inert page.
 */
export function Drawer({ open, onClose, label, children }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    node.addEventListener("cancel", handleCancel);
    return () => node.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-label={label}
      className={cn(
        "m-0 h-dvh max-h-dvh w-[17rem] max-w-[85vw] overflow-hidden border-e border-line bg-surface-2 p-0 text-ink shadow-[var(--shadow-2)]",
        "backdrop:bg-[var(--scrim)]",
      )}
    >
      <div className="h-full">{children}</div>
    </dialog>
  );
}
