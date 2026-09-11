/**
 * Konfiguracja aplikacji. Wszystko da się nadpisać zmiennymi środowiskowymi
 * (np. przez plik .env i `node --env-file=.env src/server.js`).
 */

const ZTM_BASE = 'https://www.ztm.poznan.pl/pl/dla-deweloperow';

/** "971-994, 1001" -> ['971', ..., '994', '1001'] */
export function parseFleetList(spec) {
  if (!spec) return [];
  const out = [];
  for (const part of String(spec).split(/[,;\s]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from <= to && to - from < 1000) {
        for (let n = from; n <= to; n += 1) out.push(String(n));
        continue;
      }
    }
    out.push(part);
  }
  return [...new Set(out)];
}

const env = process.env;
const flags = new Set(process.argv.slice(2));

export const config = {
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? '0.0.0.0',

  /** Tryb demo: symulowane pojazdy zamiast prawdziwego feedu ZTM. */
  demo: flags.has('--demo') || env.DEMO === '1' || env.DEMO === 'true',

  /**
   * Gdy prawdziwy feed jest nieosiągalny (brak sieci, blokada, awaria ZTM),
   * aplikacja przełącza się awaryjnie na symulację zamiast pokazywać pustą mapę.
   */
  demoFallback: env.DEMO_FALLBACK !== '0',

  feedUrl: env.ZTM_FEED_URL ?? `${ZTM_BASE}/getGtfsRtFile/?file=vehicle_positions.pb`,
  dictionaryUrl: env.ZTM_DICTIONARY_URL ?? `${ZTM_BASE}/getGtfsRtFile/?file=vehicle_dictionary.csv`,

  /** Jak długo trzymamy odpowiedź feedu w pamięci (ms). Feed ZTM odświeża się ~co 10 s. */
  feedCacheMs: Number(env.FEED_CACHE_MS ?? 8_000),
  /** Słownik pojazdów zmienia się rzadko. */
  dictionaryCacheMs: Number(env.DICTIONARY_CACHE_MS ?? 6 * 60 * 60 * 1000),
  requestTimeoutMs: Number(env.REQUEST_TIMEOUT_MS ?? 12_000),

  /** Czy w ogóle pytać ZTM o słownik pojazdów (główne źródło rozpoznania modelu). */
  useDictionary: env.USE_DICTIONARY !== '0',

  /**
   * Wzorce modelu w słowniku pojazdów, po których poznajemy tramwaj z Bonn.
   * Duewag/Siemens NGT6D R1.1, rocznik 1994, ex-Stadtwerke Bonn.
   */
  modelPatterns: (env.BONN_MODEL_PATTERNS ?? 'R1\\.?1|NGT ?6')
    .split('|')
    .map((p) => new RegExp(p, 'i')),

  /**
   * Lista awaryjna numerów taborowych, używana gdy słownik ZTM nie poda modelu.
   * MPK Poznań kupiło 24 wagony; pierwszy wyjechał na linię jako 971,
   * kolejne numerowane są w górę. Zakres poprawisz tutaj lub przez BONN_FLEET.
   */
  fleetNumbers: parseFleetList(env.BONN_FLEET ?? '971-994'),

  /** Pojazd znika z mapy, gdy jego pozycja jest starsza niż tyle sekund. */
  staleAfterSec: Number(env.STALE_AFTER_SEC ?? 300),

  /** Ile ostatnich pozycji pamiętamy, żeby narysować ślad trasy. */
  trailLength: Number(env.TRAIL_LENGTH ?? 60),

  /** Ile sztuk łącznie kupiono - do licznika "x z 24". */
  fleetTotal: Number(env.FLEET_TOTAL ?? 24),
};
