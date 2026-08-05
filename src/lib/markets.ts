// Curated market list for project-agnostic keyword lookups. Each entry pins a
// DataForSEO location_code + a sensible default language_code, so the UI is a
// single native <select> with no second language control. ~26 high-traffic
// markets covers virtually all real use; extend as needed.
export interface Market { label: string; locationCode: number; languageCode: string; }

export const MARKETS: Market[] = [
  { label: "United States", locationCode: 2840, languageCode: "en" },
  { label: "United Kingdom", locationCode: 2826, languageCode: "en" },
  { label: "Canada", locationCode: 2124, languageCode: "en" },
  { label: "Australia", locationCode: 2036, languageCode: "en" },
  { label: "Ireland", locationCode: 2372, languageCode: "en" },
  { label: "New Zealand", locationCode: 2554, languageCode: "en" },
  { label: "India", locationCode: 2356, languageCode: "en" },
  { label: "Singapore", locationCode: 2702, languageCode: "en" },
  { label: "South Africa", locationCode: 2710, languageCode: "en" },
  { label: "United Arab Emirates", locationCode: 2784, languageCode: "en" },
  { label: "Germany", locationCode: 2276, languageCode: "de" },
  { label: "Austria", locationCode: 2040, languageCode: "de" },
  { label: "Switzerland", locationCode: 2756, languageCode: "de" },
  { label: "France", locationCode: 2250, languageCode: "fr" },
  { label: "Belgium", locationCode: 2056, languageCode: "fr" },
  { label: "Netherlands", locationCode: 2528, languageCode: "nl" },
  { label: "Spain", locationCode: 2724, languageCode: "es" },
  { label: "Mexico", locationCode: 2484, languageCode: "es" },
  { label: "Italy", locationCode: 2380, languageCode: "it" },
  { label: "Portugal", locationCode: 2620, languageCode: "pt" },
  { label: "Brazil", locationCode: 2076, languageCode: "pt" },
  { label: "Sweden", locationCode: 2752, languageCode: "sv" },
  { label: "Norway", locationCode: 2578, languageCode: "no" },
  { label: "Denmark", locationCode: 2208, languageCode: "da" },
  { label: "Poland", locationCode: 2616, languageCode: "pl" },
  { label: "Japan", locationCode: 2392, languageCode: "ja" },
];

export const DEFAULT_MARKET: Market = MARKETS[0];
