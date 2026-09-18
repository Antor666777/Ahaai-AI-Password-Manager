import { cn } from "@/components/ui/cn";
import type { ItemType } from "@/lib/client/types";
import { CardIcon, KeyIcon, NoteIcon, PersonIcon } from "@/components/app/shell/Icons";

/** One leading glyph per item type, so rows read at a glance. */
export function TypeGlyph({
  type,
  className,
}: {
  type: ItemType;
  className?: string;
}) {
  const Icon =
    type === "login"
      ? KeyIcon
      : type === "card"
        ? CardIcon
        : type === "identity"
          ? PersonIcon
          : NoteIcon;

  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-ink-muted",
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}
