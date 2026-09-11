/**
 * Warstwa łącząca: pobiera feed ZTM, wybiera z niego tramwaje z Bonn,
 * pamięta ślady tras i w razie awarii feedu przechodzi w tryb demo.
 */
import { createFleetMatcher, fleetNumbersFromDictionary } from './fleet.js';
import { fetchVehicleDictionary, fetchVehiclePositions } from './ztm.js';
import { simulateVehicles } from './demo.js';
import { distance } from './geo.js';

export class Tracker {
  #config;
  #fetchPositions;
  #fetchDictionary;
  #now;

  #fleet = null;           // { numbers, source, matcher, fetchedAt }
  #feedCache = null;       // { data, fetchedAt }
  #inFlight = null;
  #trails = new Map();     // id -> [[lat, lon], ...]
  #lastError = null;

  constructor(config, deps = {}) {
    this.#config = config;
    this.#fetchPositions = deps.fetchVehiclePositions ?? fetchVehiclePositions;
    this.#fetchDictionary = deps.fetchVehicleDictionary ?? fetchVehicleDictionary;
    this.#now = deps.now ?? (() => Date.now());
  }

  /**
   * Ustala listę numerów taborowych uznawanych za tramwaje z Bonn.
   * Źródło główne: słownik pojazdów ZTM (rozpoznanie po modelu).
   * Źródło zapasowe: lista numerów z konfiguracji.
   */
  async #resolveFleet() {
    const now = this.#now();
    if (this.#fleet && now - this.#fleet.fetchedAt < this.#config.dictionaryCacheMs) {
      return this.#fleet;
    }

    let numbers = this.#config.fleetNumbers;
    let source = 'lista-konfiguracyjna';
    let dictionaryError = null;

    if (this.#config.useDictionary && !this.#config.demo) {
      try {
        const csv = await this.#fetchDictionary(this.#config.dictionaryUrl, this.#config.requestTimeoutMs);
        const found = fleetNumbersFromDictionary(csv, this.#config.modelPatterns);
        if (found.numbers.length) {
          numbers = found.numbers;
          source = 'słownik pojazdów ZTM';
        } else {
          dictionaryError = 'w słowniku ZTM nie znaleziono modelu R1.1/NGT6';
        }
      } catch (error) {
        dictionaryError = `słownik pojazdów niedostępny: ${error.message}`;
      }
    }

    this.#fleet = {
      numbers,
      source,
      dictionaryError,
      matcher: createFleetMatcher(numbers),
      fetchedAt: now,
    };
    return this.#fleet;
  }

  /** Feed ZTM z prostym cache'em - nie odpytujemy API częściej niż co feedCacheMs. */
  async #getFeed() {
    const now = this.#now();
    if (this.#feedCache && now - this.#feedCache.fetchedAt < this.#config.feedCacheMs) {
      return this.#feedCache.data;
    }
    if (this.#inFlight) return this.#inFlight;

    this.#inFlight = (async () => {
      try {
        const data = await this.#fetchPositions(this.#config.feedUrl, this.#config.requestTimeoutMs);
        this.#feedCache = { data, fetchedAt: this.#now() };
        return data;
      } finally {
        this.#inFlight = null;
      }
    })();

    return this.#inFlight;
  }

  #rememberTrail(vehicle) {
    const point = [vehicle.lat, vehicle.lon];
    const trail = this.#trails.get(vehicle.id) ?? [];
    const last = trail[trail.length - 1];
    if (!last || distance(last, point) > 8) {
      trail.push(point);
      if (trail.length > this.#config.trailLength) trail.shift();
      this.#trails.set(vehicle.id, trail);
    }
    return this.#trails.get(vehicle.id);
  }

  #decorate(vehicles, nowSec) {
    return vehicles.map((vehicle) => ({
      ...vehicle,
      ageSec: vehicle.timestamp ? Math.max(0, Math.round(nowSec - vehicle.timestamp)) : null,
      trail: this.#rememberTrail(vehicle),
    }));
  }

  /** Pełny stan dla API: pojazdy z Bonn + metadane. */
  async getState() {
    const fleet = await this.#resolveFleet();
    const nowMs = this.#now();
    const nowSec = Math.floor(nowMs / 1000);

    let mode = 'live';
    let vehicles = [];
    let totalVehicles = null;
    let feedTimestamp = null;
    let error = null;

    if (this.#config.demo) {
      mode = 'demo';
      vehicles = simulateVehicles(fleet.numbers, nowMs);
      totalVehicles = vehicles.length;
      feedTimestamp = nowSec;
    } else {
      try {
        const feed = await this.#getFeed();
        totalVehicles = feed.vehicles.length;
        feedTimestamp = feed.feedTimestamp;
        vehicles = feed.vehicles.filter((v) => fleet.matcher(v.id, v.label, v.licensePlate));
        this.#lastError = null;
      } catch (fetchError) {
        error = fetchError.message;
        this.#lastError = error;
        if (this.#config.demoFallback) {
          mode = 'demo';
          vehicles = simulateVehicles(fleet.numbers, nowMs);
          totalVehicles = vehicles.length;
          feedTimestamp = nowSec;
        }
      }
    }

    // Pozycje sprzed dłuższego czasu to pojazd, który zjechał do zajezdni.
    const fresh = vehicles.filter(
      (v) => !v.timestamp || nowSec - v.timestamp <= this.#config.staleAfterSec,
    );

    return {
      mode,
      error,
      updatedAt: new Date(nowMs).toISOString(),
      feedTimestamp,
      totalVehicles,
      fleet: {
        source: fleet.source,
        size: fleet.numbers.length,
        numbers: fleet.numbers,
        total: this.#config.fleetTotal,
        note: fleet.dictionaryError,
      },
      vehicles: this.#decorate(fresh, nowSec).sort(
        (a, b) => Number(a.id ?? 0) - Number(b.id ?? 0) || String(a.id).localeCompare(String(b.id)),
      ),
    };
  }

  get lastError() {
    return this.#lastError;
  }
}
