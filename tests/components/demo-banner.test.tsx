// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DemoProvider } from "@/components/demo-provider";
import { DemoBanner } from "@/components/demo-banner";

afterEach(cleanup);

describe("DemoBanner", () => {
  it("renders only inside a demo provider", () => {
    const { container } = render(<DemoProvider demo={false}><DemoBanner /></DemoProvider>);
    expect(container.textContent).toBe("");
    cleanup();
    render(<DemoProvider demo={true}><DemoBanner /></DemoProvider>);
    expect(screen.getByRole("note")).toHaveTextContent(/read-only demo/i);
    expect(screen.getByRole("link", { name: /install your own/i })).toHaveAttribute("href", expect.stringContaining("better-search-lab"));
  });
});
