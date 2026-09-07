// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { JobProgress } from "@/components/job-progress";

afterEach(cleanup);

describe("JobProgress", () => {
  it("shows the handler's line while running", () => {
    render(<JobProgress state="running" progress="Crawling…" error={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Crawling…");
  });
  it("shows a neutral placeholder while running before the first report", () => {
    render(<JobProgress state="running" progress={null} error={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Working…");
  });
  it("shows the real error and nothing when idle", () => {
    const { container, rerender } = render(<JobProgress state="error" progress={null} error="DataForSEO 402" />);
    expect(screen.getByRole("alert")).toHaveTextContent("DataForSEO 402");
    rerender(<JobProgress state="idle" progress={null} error={null} />);
    expect(container.textContent).toBe("");
  });
});
