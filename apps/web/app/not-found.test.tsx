// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import NotFound from "./not-found";

afterEach(cleanup);

describe("not-found page", () => {
  it("states the 404 in text", () => {
    render(<NotFound />);

    expect(screen.getByText("404")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
  });

  it("offers a route home and a route into the vault", () => {
    render(<NotFound />);

    expect(
      screen.getByRole("link", { name: "Go home" }).getAttribute("href"),
    ).toBe("/");
    expect(
      screen.getByRole("link", { name: "Open the vault" }).getAttribute("href"),
    ).toBe("/vault");
  });
});
