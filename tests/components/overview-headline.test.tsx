// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OverviewHeadline } from "@/components/overview-headline";

afterEach(cleanup);

describe("OverviewHeadline", () => {
  it("renders real GSC + GA headline values", () => {
    render(
      <OverviewHeadline
        gsc={{ clicks: 1206, impressions: 42000, position: 8.4 }}
        ga={{ sessions: 4500, engagementRate: 0.419, conversions: 31 }}
      />,
    );
    expect(screen.getByText("1.2K")).toBeTruthy(); // clicks
    expect(screen.getByText("42K")).toBeTruthy(); // impressions
    expect(screen.getByText("8.4")).toBeTruthy(); // avg position
    expect(screen.getByText("4.5K")).toBeTruthy(); // sessions
    expect(screen.getByText("42%")).toBeTruthy(); // engagement
    expect(screen.getByText("31")).toBeTruthy(); // conversions
  });

  it("shows em-dashes when GSC/GA are not connected", () => {
    render(<OverviewHeadline gsc={null} ga={null} />);
    expect(screen.getAllByText("—").length).toBe(6);
  });
});
