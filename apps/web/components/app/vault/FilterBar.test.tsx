// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DecryptedFolder, DecryptedTag } from "@/lib/client/types";
import { FilterBar } from "./FilterBar";

afterEach(cleanup);

const NOW = "2026-01-01T00:00:00.000Z";

const tags: DecryptedTag[] = [
  { id: "t1", name: "Work", createdAt: NOW, updatedAt: NOW },
  { id: "t2", name: "Home", createdAt: NOW, updatedAt: NOW },
];

function renderBar(overrides: Partial<Parameters<typeof FilterBar>[0]> = {}) {
  const onTagChange = vi.fn();
  render(
    <FilterBar
      typeValue=""
      folderValue=""
      tagValue=""
      sortValue=""
      favorites={false}
      count={2}
      folders={[] as DecryptedFolder[]}
      tags={tags}
      onTypeChange={vi.fn()}
      onFolderChange={vi.fn()}
      onTagChange={onTagChange}
      onSortChange={vi.fn()}
      onFavoritesChange={vi.fn()}
      {...overrides}
    />,
  );
  return { onTagChange };
}

describe("FilterBar sort control", () => {
  it("offers name order as the default and reports a pick", () => {
    const onSortChange = vi.fn();
    renderBar({ onSortChange });

    const select = screen.getByLabelText("Sort") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      "Name",
      "Recently updated",
      "Recently created",
    ]);

    fireEvent.change(select, { target: { value: "updated" } });
    expect(onSortChange).toHaveBeenCalledWith("updated");
  });
});

describe("FilterBar tag filter", () => {
  it("lists the vault tags and reports a pick", () => {
    const { onTagChange } = renderBar();

    const select = screen.getByLabelText("Tag") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      "All tags",
      "Work",
      "Home",
    ]);

    fireEvent.change(select, { target: { value: "t2" } });
    expect(onTagChange).toHaveBeenCalledWith("t2");
  });

  it("shows the active tag as the selected value", () => {
    renderBar({ tagValue: "t1" });

    const select = screen.getByLabelText("Tag") as HTMLSelectElement;
    expect(select.value).toBe("t1");
  });
});
