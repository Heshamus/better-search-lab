// Inline stroke icons (currentColor, 18px default) so the shell has no external
// icon dependency and every glyph inherits the design-system text colours.
import type { SVGProps } from "react";

function Base({ size = 18, children, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconOverview = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Base>
);
export const IconOpportunities = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.4" />
    <path d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22" />
  </Base>
);
export const IconRankings = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M4 19V5M4 19h16" />
    <rect x="7.5" y="12" width="2.6" height="4" rx="0.6" />
    <rect x="12" y="9" width="2.6" height="7" rx="0.6" />
    <rect x="16.5" y="6" width="2.6" height="10" rx="0.6" />
  </Base>
);
export const IconKeywords = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M9 4L7 20M17 4l-2 16M5 9h15M4 15h15" />
  </Base>
);
export const IconResearch = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6.4" />
    <path d="M20 20l-3.8-3.8" />
  </Base>
);
export const IconKeywordOverview = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </Base>
);
export const IconCompetitors = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="8.5" cy="9" r="2.7" />
    <circle cx="16.5" cy="9" r="2.7" />
    <path d="M4 19c0-2.5 2-4.2 4.5-4.2S13 16.5 13 19M13.2 15.2c1-.6 2.1-.9 3.3-.9 2.5 0 4.5 1.7 4.5 4.2" />
  </Base>
);
export const IconUsage = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M6 3.5h9L18.5 7v13.5H6z" />
    <path d="M9 11h6M9 14.5h6M9 7.5h3" />
  </Base>
);
export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.2M12 19.3v2.2M4.2 7l1.9 1.1M17.9 15.9l1.9 1.1M4.2 17l1.9-1.1M17.9 8.1l1.9-1.1" />
  </Base>
);
export const IconAudit = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M12 2.6l7 2.6v5.5c0 4.5-3 7.6-7 8.9-4-1.3-7-4.4-7-8.9V5.2z" />
    <path d="M9 11.5l2.2 2.2L15.5 9.4" />
  </Base>
);
export const IconBacklinks = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M9.5 14.5l5-5" />
    <path d="M8 11l-1.8 1.8a3.2 3.2 0 004.5 4.5L12.5 15.5" />
    <path d="M16 13l1.8-1.8a3.2 3.2 0 00-4.5-4.5L11.5 8.5" />
  </Base>
);
export const IconGsc = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M3 12h3l2.4-6.5L13 18l2.6-6H21" />
  </Base>
);
export const IconGa = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M4 4v16h16" />
    <path d="M8 16v-3M12 16v-6M16 16v-9" />
  </Base>
);
export const IconAiVisibility = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10z" />
    <path d="M18 16.5l.7 2 .8-2 .7 2M6 4.5l.5 1.5" />
  </Base>
);
export const IconTrends = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Base>
);
export const IconOrganicKeywords = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M4 6h10M4 12h7M4 18h5" /><circle cx="17" cy="16" r="3" /><path d="M19.5 18.5 22 21" /></Base>
);

export const NAV_ICONS: Record<string, (p: SVGProps<SVGSVGElement>) => React.ReactElement> = {
  overview: IconOverview,
  opportunities: IconOpportunities,
  rankings: IconRankings,
  keywords: IconKeywords,
  "organic-keywords": IconOrganicKeywords,
  research: IconResearch,
  "keyword-overview": IconKeywordOverview,
  competitors: IconCompetitors,
  audit: IconAudit,
  backlinks: IconBacklinks,
  gsc: IconGsc,
  ga: IconGa,
  "ai-visibility": IconAiVisibility,
  trends: IconTrends,
  usage: IconUsage,
  settings: IconSettings,
};

export const IconArrowUp = (p: SVGProps<SVGSVGElement>) => (
  <Base size={14} {...p}>
    <path d="M12 19V6M6 12l6-6 6 6" />
  </Base>
);
export const IconArrowDown = (p: SVGProps<SVGSVGElement>) => (
  <Base size={14} {...p}>
    <path d="M12 5v13M6 12l6 6 6-6" />
  </Base>
);

// Brand mark — a broadcast/"signal" motif (concentric arcs + source dot): search
// visibility radiating outward. Accent-filled, sized to the sidebar wordmark.
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="7" fill="var(--color-accent)" fillOpacity="0.12" stroke="var(--color-accent)" strokeOpacity="0.35" />
      <circle cx="8" cy="16" r="1.7" fill="var(--color-accent)" />
      <path d="M8 12.5c2 0 3.5 1.5 3.5 3.5" stroke="var(--color-accent)" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8 9c4 0 7 3 7 7" stroke="var(--color-accent)" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
