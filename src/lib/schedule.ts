export function dueProjects(
  projects: { id: string; refreshCadence: string }[],
  isoDate: string
): { rankRefresh: string[]; metricsRefresh: string[]; opportunities: string[] } {
  const isMonday = new Date(isoDate + "T00:00:00Z").getUTCDay() === 1; // 0=Sun, 1=Mon
  const rankRefresh = projects
    .filter((p) => p.refreshCadence === "daily" || (p.refreshCadence === "weekly" && isMonday))
    .map((p) => p.id);
  const metricsRefresh = isMonday ? projects.map((p) => p.id) : [];
  const opportunities = isMonday ? projects.map((p) => p.id) : [];
  return { rankRefresh, metricsRefresh, opportunities };
}
