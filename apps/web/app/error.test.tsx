// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RouteError from "./error";

afterEach(cleanup);

describe("route error boundary", () => {
  it("renders a fallback without leaking the error message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("vault key exposed in plaintext"), {
      digest: "abc123",
    });

    render(<RouteError error={error} reset={() => {}} />);

    expect(
      screen.getByRole("heading", { name: "Something went wrong on this page" }),
    ).toBeTruthy();
    expect(screen.queryByText(/vault key exposed in plaintext/)).toBeNull();
    expect(screen.getByText(/abc123/)).toBeTruthy();

    spy.mockRestore();
  });

  it("calls reset when the user retries", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();

    render(<RouteError error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(reset).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});
