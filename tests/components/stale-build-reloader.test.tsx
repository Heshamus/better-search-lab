// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { StaleBuildReloader } from "@/components/stale-build-reloader";

// jsdom's real location.reload logs "Not implemented" and never hits our spy, so
// replace window.location with a minimal stub the component's reload() will call.
let reload: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.sessionStorage.clear(); // no cooldown flag leaks in from a prior test
  reload = vi.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { reload } });
});
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

function rejectWith(reason: unknown) {
  const evt = new Event("unhandledrejection") as unknown as PromiseRejectionEvent;
  (evt as { reason: unknown }).reason = reason;
  window.dispatchEvent(evt);
}

describe("StaleBuildReloader", () => {
  it("reloads once when an unhandledrejection carries the stale-build error", () => {
    render(<StaleBuildReloader />);
    rejectWith(new Error("An unexpected response was received from the server."));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads on a matching uncaught error event too", () => {
    render(<StaleBuildReloader />);
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("An unexpected response was received from the server.") }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated errors", () => {
    render(<StaleBuildReloader />);
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("Cannot read properties of undefined"), message: "boom" }));
    rejectWith(new Error("some other failure"));
    expect(reload).not.toHaveBeenCalled();
  });

  it("removes its listeners on unmount", () => {
    const { unmount } = render(<StaleBuildReloader />);
    unmount();
    rejectWith(new Error("An unexpected response was received from the server."));
    expect(reload).not.toHaveBeenCalled();
  });
});
