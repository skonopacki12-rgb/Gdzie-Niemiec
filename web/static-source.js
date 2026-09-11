/**
 * Wersja statyczna aplikacji (GitHub Pages).
 *
 * Nie ma tu backendu, więc ta sama logika co na serwerze - pobranie feedu
 * GTFS-RT, dekodowanie protobufa, wybór wagonów z Bonn, ślady tras - jedzie
 * w przeglądarce. Klasa Tracker jest współdzielona z wersją serwerową.
 */
import { Tracker } from '../src/tracker.js';

const ZTM_BASE = 'https://www.ztm.poznan.pl/pl/dla-deweloperow';

const overrides = window.GDZIE_NIEMIEC_CONFIG ?? {};

/**
 * Opcjonalne proxy CORS. Potrzebne tylko wtedy, gdy ZTM nie wystawia nagłówka
 * Access-Control-Allow-Origin - wtedy przeglądarka sama nie pobierze danych.
 * Ustaw w index.html: window.GDZIE_NIEMIEC_CONFIG = { corsProxy: 'https://…/?url=' }
 */
const withProxy = (url) => (overrides.corsProxy ? overrides.corsProxy + encodeURIComponent(url) : url);

const config = {
  demo: false,
  // Na publicznej stronie nie podstawiamy symulacji pod prawdziwe dane -
  // lepiej pokazać pustą mapę i powód błędu.
  demoFallback: false,
  useDictionary: true,
  feedUrl: withProxy(overrides.feedUrl ?? `${ZTM_BASE}/getGtfsRtFile/?file=vehicle_positions.pb`),
  dictionaryUrl: withProxy(
    overrides.dictionaryUrl ?? `${ZTM_BASE}/getGtfsRtFile/?file=vehicle_dictionary.csv`,
  ),
  feedCacheMs: 8_000,
  dictionaryCacheMs: 6 * 60 * 60 * 1000,
  requestTimeoutMs: 12_000,
  modelPatterns: [/R1\.?1/i, /NGT ?6/i],
  fleetNumbers: overrides.fleetNumbers ?? Array.from({ length: 24 }, (_, i) => String(971 + i)),
  staleAfterSec: 300,
  trailLength: 60,
  fleetTotal: 24,
};

const tracker = new Tracker(config);

/**
 * Błąd sieciowy w przeglądarce jest zwięzły do bólu ("Failed to fetch"),
 * a przy danych z innej domeny niemal zawsze oznacza brak nagłówków CORS.
 * Bez tego wyjaśnienia strona wygląda po prostu na zepsutą.
 */
const CORS_HINT =
  'przeglądarka nie mogła pobrać danych wprost z ztm.poznan.pl. Najczęściej znaczy to, ' +
  'że ZTM nie wysyła nagłówków CORS - wtedy wersja statyczna potrzebuje proxy ' +
  'albo trzeba uruchomić aplikację z jej backendem.';

const isNetworkError = (message) => /failed to fetch|load failed|networkerror|cors/i.test(message ?? '');

window.__GDZIE_NIEMIEC_SOURCE__ = async () => {
  // Tracker sam obsługuje awarie feedu i zwraca je w polu `error`,
  // więc tłumaczymy komunikat tam, a nie w catch.
  const state = await tracker.getState();
  if (isNetworkError(state.error)) {
    return { ...state, error: CORS_HINT };
  }
  return state;
};
