// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// ProjectEditForm calls useRouter().refresh() after a successful PATCH/profile
// and useRouter().push("/settings") after a successful delete, so the hook
// needs the same jsdom-friendly mock every other client-component test in this
// suite uses (mirrors profile-review.test.tsx), with `push` added.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { ProjectEditForm } from "@/components/project-edit-form";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  (global.fetch as any) = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

const project = { id: "p1", name: "HF", domain: "harperflow.io" };

describe("ProjectEditForm", () => {
  it("PATCHes name/domain edits", async () => {
    render(<ProjectEditForm project={project} />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "HarperFlow" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/projects/p1", expect.objectContaining({ method: "PATCH" })),
    );
  });

  it("enqueues an async profile job and shows a running state", async () => {
    // Pending fetch: the enqueue POST fires and the button parks in its running
    // label — no poll timer scheduled, so nothing leaks past the test.
    (global.fetch as any) = vi.fn(() => new Promise(() => {}));
    render(<ProjectEditForm project={project} />);
    fireEvent.click(screen.getByRole("button", { name: /profile site/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/projects/p1/profile",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(screen.getByRole("button", { name: /profiling/i })).toBeTruthy();
  });

  it("requires a second click to confirm before DELETEing", async () => {
    render(<ProjectEditForm project={project} />);
    const del = screen.getByRole("button", { name: /delete project/i });

    // First click only arms the confirm state — no DELETE yet.
    fireEvent.click(del);
    expect(screen.getByText(/click again to confirm/i)).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();

    // Second click on the same control actually DELETEs.
    fireEvent.click(del);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/projects/p1", expect.objectContaining({ method: "DELETE" })),
    );
  });

  it("shows an inline error and does not refresh when the PATCH fails", async () => {
    (global.fetch as any) = vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }));
    render(<ProjectEditForm project={project} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/couldn.t save/i)).toBeTruthy();
  });
});
