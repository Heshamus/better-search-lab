// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SetupWizard } from "@/components/setup-wizard";

afterEach(cleanup);

describe("SetupWizard frame", () => {
  it("lists every step, marks the current one, and shows Exit setup after the account step", () => {
    render(<SetupWizard step="competitors"><p>body</p></SetupWizard>);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["Account", "DataForSEO", "AI assistant", "Your site", "Profile", "Competitors", "Build", "Done"]);
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Competitors");
    expect(screen.getByText("body")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /exit setup/i })).toHaveAttribute("href", "/overview");
  });
  it("hides Exit setup on the account step", () => {
    render(<SetupWizard step="account"><p /></SetupWizard>);
    expect(screen.queryByRole("link", { name: /exit setup/i })).toBeNull();
  });
});
