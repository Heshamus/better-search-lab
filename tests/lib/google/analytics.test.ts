import { describe, it, expect, vi } from "vitest";
import { listGaProperties, runGaReport, normGaDate } from "@/lib/google/analytics";

describe("listGaProperties", () => {
  it("flattens accountSummaries and strips the properties/ prefix", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          accountSummaries: [
            {
              displayName: "Acme",
              propertySummaries: [
                { property: "properties/111", displayName: "Acme Web" },
                { property: "properties/222", displayName: "Acme App" },
              ],
            },
            { displayName: "Solo", propertySummaries: [{ property: "properties/333", displayName: "Solo Site" }] },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const props = await listGaProperties("tok", fetchImpl);
    expect(props).toEqual([
      { propertyId: "111", displayName: "Acme Web", account: "Acme" },
      { propertyId: "222", displayName: "Acme App", account: "Acme" },
      { propertyId: "333", displayName: "Solo Site", account: "Solo" },
    ]);
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(String(url)).toContain("/accountSummaries");
    expect((init.headers as any).Authorization).toBe("Bearer tok");
  });

  it("throws (so the caller can prompt reconnect) on a 403 no-scope response", async () => {
    const fetchImpl = vi.fn(async () => new Response("insufficient scope", { status: 403 })) as unknown as typeof fetch;
    await expect(listGaProperties("tok", fetchImpl)).rejects.toThrow(/403/);
  });
});

describe("runGaReport", () => {
  it("POSTs the date range + dims + metrics and maps rows to numbers", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          rows: [
            { dimensionValues: [{ value: "20260801" }], metricValues: [{ value: "120" }, { value: "95" }] },
            { dimensionValues: [{ value: "20260802" }], metricValues: [{ value: "80" }, { value: "60" }] },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const rows = await runGaReport(
      "tok",
      "12345",
      { startDate: "2026-05-01", endDate: "2026-08-01", dimensions: ["date"], metrics: ["sessions", "totalUsers"], orderByMetric: "sessions" },
      fetchImpl,
    );
    expect(rows).toEqual([
      { dimensions: ["20260801"], metrics: [120, 95] },
      { dimensions: ["20260802"], metrics: [80, 60] },
    ]);

    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(String(url)).toContain("/properties/12345:runReport");
    const body = JSON.parse(init.body);
    expect(body.dateRanges).toEqual([{ startDate: "2026-05-01", endDate: "2026-08-01" }]);
    expect(body.dimensions).toEqual([{ name: "date" }]);
    expect(body.metrics).toEqual([{ name: "sessions" }, { name: "totalUsers" }]);
    expect(body.orderBys[0].metric.metricName).toBe("sessions");
  });
});

describe("normGaDate", () => {
  it("converts YYYYMMDD to YYYY-MM-DD and passes other shapes through", () => {
    expect(normGaDate("20260801")).toBe("2026-08-01");
    expect(normGaDate("2026-08-01")).toBe("2026-08-01");
    expect(normGaDate("(other)")).toBe("(other)");
  });
});
