import { Donut, BarHistogram, HBars } from "@/components/charts";
import type { DashboardData } from "@/lib/dashboard";

function ChartPanel({ title, context, children }: { title: string; context?: string; children: React.ReactNode }) {
  return (
    <div className="panel flex flex-col gap-4 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {context ? <span className="eyebrow">{context}</span> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * The project dashboard's chart grid — the analytics that make this read as a
 * search-visibility instrument rather than a list: where tracked keywords sit in
 * the SERPs, how hard the target set is, the biggest volume plays, and how the
 * tracked competitors' footprints compare. All derived from existing data.
 */
export function DashboardCharts({ data }: { data: DashboardData }) {
  const ranked = data.positionDist.filter((s) => s.label !== "Unranked").reduce((a, s) => a + s.value, 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartPanel title="Ranking distribution" context={`${ranked}/${data.keywordsTracked} ranked`}>
        <Donut segments={data.positionDist} centerLabel="keywords" />
      </ChartPanel>

      <ChartPanel title="Keyword difficulty" context={data.avgDifficulty != null ? `avg KD ${data.avgDifficulty}` : "no scores yet"}>
        <BarHistogram bars={data.difficultyDist} />
      </ChartPanel>

      <ChartPanel title="Biggest opportunities" context="by search volume">
        <HBars items={data.topOpportunities} emptyLabel="Refresh data to score opportunities" />
      </ChartPanel>

      <ChartPanel title="Competitor footprint" context="ranked keywords collected">
        <HBars items={data.competitorSov} valueFormat={(n) => String(n)} color="var(--color-series-3)" emptyLabel="Refresh a competitor's intel to compare" />
      </ChartPanel>
    </div>
  );
}
