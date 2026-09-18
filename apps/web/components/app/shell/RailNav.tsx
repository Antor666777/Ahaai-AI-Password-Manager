"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";
import {
  HealthIcon,
  SettingsIcon,
  ShieldIcon,
  TrashIcon,
  VaultIcon,
} from "./Icons";

interface NavEntry {
  href: string;
  label: string;
  icon: ReactNode;
}

const ENTRIES: NavEntry[] = [
  { href: "/vault", label: "Vault", icon: <VaultIcon className="size-4" /> },
  {
    href: "/vault/health",
    label: "Health",
    icon: <HealthIcon className="size-4" />,
  },
  {
    href: "/vault/security",
    label: "Security",
    icon: <ShieldIcon className="size-4" />,
  },
  {
    href: "/vault/settings",
    label: "Settings",
    icon: <SettingsIcon className="size-4" />,
  },
  {
    href: "/vault/trash",
    label: "Trash",
    icon: <TrashIcon className="size-4" />,
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/vault") return pathname === "/vault";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function RailNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Vault sections">
      <ul className="space-y-0.5">
        {ENTRIES.map((entry) => {
          const active = isActive(pathname, entry.href);
          return (
            <li key={entry.href}>
              <Link
                href={entry.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-2.5 rounded-md border-s-2 px-3 text-[13px] transition-colors",
                  active
                    ? "border-primary bg-surface font-medium text-ink"
                    : "border-transparent text-ink-muted hover:bg-surface hover:text-ink",
                )}
              >
                {entry.icon}
                {entry.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
