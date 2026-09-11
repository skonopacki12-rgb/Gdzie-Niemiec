/**
 * Pobieranie i normalizacja feedu GTFS-RT `vehicle_positions.pb` z ZTM Poznań.
 */
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;

/** protobufjs zwraca 64-bitowe liczby jako obiekty Long - sprowadzamy je do Number. */
export function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value.toNumber === 'function') return value.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Jeden wpis feedu -> płaski obiekt używany dalej przez API i frontend. */
export function normalizeEntity(entity) {
  const vp = entity?.vehicle;
  const position = vp?.position;
  if (!position || typeof position.latitude !== 'number' || typeof position.longitude !== 'number') {
    return null;
  }
  if (position.latitude === 0 && position.longitude === 0) return null;

  const descriptor = vp.vehicle ?? {};
  const trip = vp.trip ?? {};
  const speedMs = typeof position.speed === 'number' ? position.speed : null;

  return {
    id: descriptor.id ?? entity.id ?? null,
    label: descriptor.label ?? null,
    licensePlate: descriptor.licensePlate ?? null,
    lat: position.latitude,
    lon: position.longitude,
    bearing: typeof position.bearing === 'number' ? position.bearing : null,
    speedKmh: speedMs === null ? null : Math.round(speedMs * 3.6),
    routeId: trip.routeId ?? null,
    tripId: trip.tripId ?? null,
    directionId: toNumber(trip.directionId),
    startTime: trip.startTime ?? null,
    stopId: vp.stopId ?? null,
    currentStatus: vp.currentStatus ?? null,
    timestamp: toNumber(vp.timestamp),
  };
}

/** Dekoduje bufor protobuf feedu do listy pojazdów. */
export function decodeFeed(buffer) {
  const feed = FeedMessage.decode(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  const vehicles = [];
  for (const entity of feed.entity ?? []) {
    const vehicle = normalizeEntity(entity);
    if (vehicle) vehicles.push(vehicle);
  }
  return { feedTimestamp: toNumber(feed.header?.timestamp), vehicles };
}

async function fetchBuffer(url, timeoutMs) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'gdzie-niemiec/1.0 (+hobby tram tracker)' },
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`ZTM odpowiedziało ${response.status} ${response.statusText} dla ${url}`);
  }
  return response;
}

/** Pobiera i dekoduje aktualne pozycje wszystkich pojazdów ZTM. */
export async function fetchVehiclePositions(url, timeoutMs) {
  const response = await fetchBuffer(url, timeoutMs);
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (!buffer.length) throw new Error('ZTM zwróciło pusty feed pozycji pojazdów');
  return decodeFeed(buffer);
}

/** Pobiera słownik pojazdów (CSV z modelami taboru). */
export async function fetchVehicleDictionary(url, timeoutMs) {
  const response = await fetchBuffer(url, timeoutMs);
  return response.text();
}
