interface McpToolDefinition {
  name: string;
  description: string;
  /** Human-facing one-liner (fleet #1967). Optional; consumers fall back to
   *  description. Kept in step with shared/src/types.ts — scripts/lib/
   *  check-inlined-types.mjs reports drift at publish time. */
  summary?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    anyOf?: Array<{ required: string[] }>;
    oneOf?: Array<{ required: string[] }>;
    allOf?: Array<{ required: string[] }>;
  };
  outputSchema?: Record<string, unknown>;
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Fragile States Index — annual country fragility score and rank, for
 * country-risk context alongside event/news data (fleet #3266).
 *
 * Publisher + dataset: The Fund for Peace, Fragile States Index. Published
 * annually as a bulk download (no live query API), so this pack reads from
 * a baked copy rather than proxying per request — see
 * workers/gateway/src/pack-baked-indexes.json and scripts/bake-fragile-states-index.mjs
 * for the refresh path. NEVER value-import the data module here (fleet
 * #2754 — it goes into every gateway isolate's bundle whether or not that
 * isolate ever serves this pack); only type-only imports are allowed.
 *
 * LICENCE: Fund for Peace licenses this data under a Creative Commons
 * Attribution-NonCommercial-ShareAlike 4.0 International License and asks
 * commercial republishers to contact them directly. Bruce ruled 2026-10-17
 * (build-anyway-zero-rate) to ship it anyway with the whole pack zero-rated
 * — see pack-manifest.json's `zeroRated`/`zeroRatedReason` for this pack.
 * Every response carries the publisher's attribution in its `source` field.
 */
import type { FsiCountryRow } from './fsi-index-data.js';

const SOURCE = 'The Fund for Peace, Fragile States Index';

// fleet #2754: the baked index lives in KV, injected as args._bakedIndex on
// the first call into this pack, never imported at module scope.
let FSI_COUNTRIES: FsiCountryRow[] = [];
let FSI_EDITION_YEAR = 0;
let FSI_CAPTURED_AT = '';

function ensureIndex(args: Record<string, unknown>): void {
  if (FSI_COUNTRIES.length) return;
  const idx = args._bakedIndex as Record<string, unknown> | null | undefined;
  const countries = idx?.FSI_COUNTRIES;
  const year = idx?.FSI_EDITION_YEAR;
  const capturedAt = idx?.FSI_CAPTURED_AT;
  if (!Array.isArray(countries) || countries.length === 0 || typeof year !== 'number' || typeof capturedAt !== 'string') {
    throw new Error(
      'fragile-states-index: the baked index is unavailable (not injected or malformed). ' +
      'The gateway loads it from KV on the first call into this pack; this is a server-side fault, not a bad country name — retry shortly.',
    );
  }
  FSI_COUNTRIES = countries as FsiCountryRow[];
  FSI_EDITION_YEAR = year;
  FSI_CAPTURED_AT = capturedAt;
}

// A handful of names callers reach for that do not match the publisher's own
// spelling in the sheet (verified against the baked rows: "United States",
// "Congo Democratic Republic", "Congo Republic", "Cote d'Ivoire", ...).
const ALIASES: Record<string, string> = {
  usa: 'united states',
  us: 'united states',
  'united states of america': 'united states',
  america: 'united states',
  uk: 'united kingdom',
  britain: 'united kingdom',
  drc: 'congo democratic republic',
  'dr congo': 'congo democratic republic',
  'democratic republic of the congo': 'congo democratic republic',
  'democratic republic of congo': 'congo democratic republic',
  // Deliberately NOT aliasing bare "congo" — it is genuinely ambiguous
  // between Congo Democratic Republic and Congo Republic, and guessing
  // either one silently would be a wrong answer, not a convenience. The
  // generic contains-match below already returns both as candidates for a
  // caller to disambiguate.
  'republic of the congo': 'congo republic',
  'ivory coast': "cote d'ivoire",
  "côte d'ivoire": "cote d'ivoire",
  russia: 'russia',
  'south korea': 'south korea',
  'north korea': 'north korea',
};

function normalize(s: string): string {
  return s.trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

function findCountry(query: string): { row: FsiCountryRow | null; candidates: string[] } {
  const q = normalize(query);
  const aliased = ALIASES[q] ?? q;
  const byExact = FSI_COUNTRIES.find((r) => normalize(r.country) === aliased);
  if (byExact) return { row: byExact, candidates: [] };
  const contains = FSI_COUNTRIES.filter((r) => normalize(r.country).includes(aliased) || aliased.includes(normalize(r.country)));
  if (contains.length === 1) return { row: contains[0]!, candidates: [] };
  return { row: null, candidates: contains.map((r) => r.country) };
}

const tools: McpToolExport['tools'] = [
  {
    name: 'fsi_country_score',
    description:
      'Fragile States Index score and rank for ONE country — a country-fragility risk measure (12 cohesion/economic/political/social indicators rolled into one 0-120 score; higher = more fragile). Published annually by The Fund for Peace. PREFER for "how fragile is <country>", "<country> fragile states index", "state fragility risk for <country>", or as background context on a country before/alongside news-event data (complements gdelt). Pass a country name (e.g. "Somalia", "Brazil", "United States" — common aliases like "USA"/"DRC"/"Ivory Coast" are accepted).',
    inputSchema: {
      type: 'object',
      properties: {
        country: { type: 'string', description: 'Country name (e.g. "Yemen", "Germany", "USA").' },
      },
      required: ['country'],
    },
  },
  {
    name: 'fsi_ranking',
    description:
      'Rank countries by Fragile States Index score — the N most fragile or N most stable countries in one call, with rank and score. PREFER for "most fragile countries", "most stable/least fragile countries", "top 10 failed states", "which countries are at highest state-fragility risk". direction defaults to "most_fragile".',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'How many countries to return (default 10, max 50).' },
        direction: { type: 'string', enum: ['most_fragile', 'most_stable'], description: 'Which end of the ranking to return. Default "most_fragile".' },
      },
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  ensureIndex(args);
  switch (name) {
    case 'fsi_country_score':
      return fsiCountryScore(String(args.country ?? args.country_name ?? '').trim());
    case 'fsi_ranking':
      return fsiRanking(
        typeof args.limit === 'number' ? args.limit : Number(args.limit) || 10,
        args.direction === 'most_stable' ? 'most_stable' : 'most_fragile',
      );
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function fsiCountryScore(country: string) {
  if (!country) {
    throw new Error('Pass a country name, e.g. fsi_country_score({country: "Yemen"}).');
  }
  const { row, candidates } = findCountry(country);
  if (!row) {
    throw new Error(
      candidates.length > 1
        ? `user_error: "${country}" matches more than one country in the Fragile States Index: ${candidates.join(', ')}. Pass one of those exact names.`
        : `user_error: No Fragile States Index entry found for "${country}". The Index covers ${FSI_COUNTRIES.length} countries/territories; check the spelling (e.g. "Congo Democratic Republic" rather than "DR Congo" works via alias, but an unrecognized territory will not appear at all).`,
    );
  }
  return {
    country: row.country,
    year: FSI_EDITION_YEAR,
    rank: row.rank,
    total_countries: FSI_COUNTRIES.length,
    score: row.total,
    scale: '0 (most stable) to 120 (most fragile)',
    source: SOURCE,
    data_as_of: FSI_CAPTURED_AT,
  };
}

function fsiRanking(limitRaw: number, direction: 'most_fragile' | 'most_stable') {
  const limit = Math.max(1, Math.min(50, Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 10));
  const sorted = [...FSI_COUNTRIES].sort((a, b) => (direction === 'most_fragile' ? a.rank - b.rank : b.rank - a.rank));
  const slice = sorted.slice(0, limit);
  return {
    direction,
    returned: slice.length,
    total_countries: FSI_COUNTRIES.length,
    year: FSI_EDITION_YEAR,
    scale: '0 (most stable) to 120 (most fragile)',
    source: SOURCE,
    data_as_of: FSI_CAPTURED_AT,
    ranking: slice.map((r) => ({ rank: r.rank, country: r.country, score: r.total })),
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
