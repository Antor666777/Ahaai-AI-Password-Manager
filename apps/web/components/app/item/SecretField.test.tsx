// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SecretRow } from "./SecretField";

/**
 * SecretRow only needs two things from the session: whether a reprompt is
 * already satisfied, and the master-password check. The real provider would
 * need a vault key and the network, so the module is stubbed here.
 */
const session = vi.hoisted(() => ({
  access: false,
  verify: vi.fn(),
}));

vi.mock("@/lib/client/session", () => ({
  useSession: () => ({
    hasRepromptAccess: () => session.access,
    verifyMasterPassword: session.verify,
  }),
}));

/** jsdom does not implement the native <dialog> modal methods. */
if (
  typeof HTMLDialogElement !== "undefined" &&
  typeof HTMLDialogElement.prototype.showModal !== "function"
) {
  HTMLDialogElement.prototype.showModal = function showModal(
    this: HTMLDialogElement,
  ) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
}

afterEach(() => {
  cleanup();
  session.access = false;
  session.verify.mockReset();
  vi.useRealTimers();
});

describe("SecretRow", () => {
  it("masks by default and reveals on request when no reprompt is set", () => {
    render(<SecretRow label="Password" value="hunter2" />);

    expect(screen.queryByText("hunter2")).toBeNull();
    expect(screen.getByRole("button", { name: "Copy password" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByText("hunter2")).toBeTruthy();
  });

  it("asks for the master password instead of revealing while the gate is locked", () => {
    session.access = false;
    render(<SecretRow label="Password" value="hunter2" reprompt />);

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));

    expect(screen.getByLabelText("Master password")).toBeTruthy();
    expect(screen.queryByText("hunter2")).toBeNull();
    // The copy shortcut waits behind the same gate.
    expect(screen.queryByRole("button", { name: "Copy password" })).toBeNull();
  });

  it("reveals the value once the master password checks out", async () => {
    session.access = false;
    session.verify.mockResolvedValue(true);
    render(<SecretRow label="Password" value="hunter2" reprompt />);

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    fireEvent.change(screen.getByLabelText("Master password"), {
      target: { value: "correct horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm password" }));

    await waitFor(() => expect(screen.getByText("hunter2")).toBeTruthy());
    expect(session.verify).toHaveBeenCalledWith("correct horse");
  });

  it("stays open with an inline error on a wrong master password", async () => {
    session.access = false;
    session.verify.mockResolvedValue(false);
    render(<SecretRow label="Password" value="hunter2" reprompt />);

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    fireEvent.change(screen.getByLabelText("Master password"), {
      target: { value: "nope" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm password" }));

    expect(await screen.findByText(/did not match/)).toBeTruthy();
    expect(screen.getByLabelText("Master password")).toBeTruthy();
    expect(screen.queryByText("hunter2")).toBeNull();
  });

  it("reveals immediately when the session already has access", () => {
    session.access = true;
    render(<SecretRow label="Password" value="hunter2" reprompt />);

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));

    expect(screen.getByText("hunter2")).toBeTruthy();
    expect(screen.queryByLabelText("Master password")).toBeNull();
  });

  it("masks a revealed secret again after 30 seconds", () => {
    vi.useFakeTimers();
    render(<SecretRow label="Password" value="hunter2" />);

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByText("hunter2")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.queryByText("hunter2")).toBeNull();
  });

  it("clears the pending re-mask timer when the row unmounts", () => {
    const clearSpy = vi.spyOn(window, "clearTimeout");
    const { unmount } = render(<SecretRow label="Password" value="hunter2" />);

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    clearSpy.mockClear();

    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
