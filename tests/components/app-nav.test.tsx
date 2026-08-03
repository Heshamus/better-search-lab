// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppNav } from "@/components/app-nav";

describe("AppNav", () => {
  it("renders the validated nav sections and marks the active one", () => {
    render(<AppNav active="opportunities" />);
    for (const label of ["Opportunities", "Rankings", "Keywords", "Research", "Competitors", "Content", "Usage & cost", "Settings"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("Opportunities").closest("a")?.getAttribute("aria-current")).toBe("page");
  });
});
