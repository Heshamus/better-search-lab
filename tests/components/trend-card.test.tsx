// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TrendCard } from "@/components/trend-card";

afterEach(cleanup);

const fmt = (n: number) => String(n);

describe("TrendCard", () => {
  it("shows the latest value as the headline and a green +Δ chip when rising (higher is better)", () => {
    render(<TrendCard title="Cited rate" points={[10, 20, 40]} format={fmt} emptyLabel="No history yet" />);

    expect(screen.getByText("Cited rate")).toBeTruthy();
    expect(screen.getByText("higher is better")).toBeTruthy();
    // getByTestId, not getByText("40") — the chart's y-axis tick also reads "40" here.
    expect(screen.getByTestId("trend-headline").textContent).toBe("40");

    const chip = screen.getByTestId("trend-delta");
    expect(chip.textContent).toBe("+30"); // 40 - 10, prefixed with +
    expect(chip).toHaveClass("text-accent");
  });

  it("flips the Δ colour and the eyebrow hint when invert is set (a rank climb = a falling number)", () => {
    render(<TrendCard title="Avg position" points={[10, 20, 40]} format={fmt} invert emptyLabel="No history yet" />);

    expect(screen.getByText("lower is better")).toBeTruthy();

    const chip = screen.getByTestId("trend-delta");
    expect(chip.textContent).toBe("+30"); // same raw delta, but a rise is WORSE for rank
    expect(chip).toHaveClass("text-at-risk");
  });

  it("renders no Δ chip and shows the empty label when there isn't enough history", () => {
    render(<TrendCard title="Cited rate" points={[]} format={fmt} emptyLabel="No history yet" />);

    expect(screen.queryByTestId("trend-delta")).toBeNull();
    expect(screen.getByText("No history yet")).toBeTruthy();
  });
});
