/**
 * Tryb demo: symulacja tramwajów z Bonn jeżdżących po Poznaniu.
 *
 * Używany, gdy nie ma dostępu do feedu ZTM (brak sieci, blokada firewalla,
 * awaria API) albo gdy chcesz zobaczyć aplikację w ruchu o dowolnej porze.
 * Trasy to uproszczone korytarze poznańskiej sieci - nie są to dokładne
 * przebiegi torowisk.
 */
import { cumulativeLengths, pointAlong } from './geo.js';

const ROUTES = [
  {
    line: '11',
    headsigns: ['Ogrody', 'Junikowo'],
    points: [
      [52.4118, 16.8869], // Ogrody
      [52.4103, 16.8975], // Dąbrowskiego
      [52.4089, 16.9074],
      [52.4083, 16.9147], // Rondo Kaponiera
      [52.4040, 16.9134], // Most Dworcowy
      [52.3966, 16.9016], // Głogowska
      [52.3897, 16.8869], // Górczyn
      [52.3866, 16.8630],
      [52.3855, 16.8573], // Junikowo
    ],
  },
  {
    line: '12',
    headsigns: ['Os. Sobieskiego', 'Starołęka'],
    points: [
      [52.4558, 16.9128], // Os. Sobieskiego
      [52.4416, 16.9103], // PST
      [52.4277, 16.9098],
      [52.4165, 16.9137], // Most Teatralny
      [52.4083, 16.9147], // Rondo Kaponiera
      [52.4049, 16.9244], // Św. Marcin
      [52.3993, 16.9333], // Rondo Rataje
      [52.3854, 16.9331],
      [52.3723, 16.9327], // Starołęka
    ],
  },
  {
    line: '13',
    headsigns: ['Miłostowo', 'Rondo Kaponiera'],
    points: [
      [52.4083, 16.9147], // Rondo Kaponiera
      [52.4108, 16.9269], // Plac Wielkopolski
      [52.4116, 16.9414], // Garbary
      [52.4143, 16.9600], // Zawady
      [52.4172, 16.9784],
      [52.4186, 16.9968], // Miłostowo
    ],
  },
];

const PREPARED = ROUTES.map((route) => {
  const lengths = cumulativeLengths(route.points);
  return { ...route, lengths, length: lengths[lengths.length - 1] };
});

/**
 * Zwraca symulowane pozycje pojazdów dla podanej chwili.
 * Jest to funkcja czysta: ten sam czas daje ten sam wynik, więc nie musimy
 * trzymać żadnego stanu między odpytaniami.
 *
 * @param {string[]} fleetNumbers numery taborowe do obsadzenia
 * @param {number} nowMs czas w ms
 * @param {number} count ile pojazdów ma być "na trasie"
 */
export function simulateVehicles(fleetNumbers, nowMs = Date.now(), count = 5) {
  const numbers = (fleetNumbers.length ? fleetNumbers : ['971']).slice(0, Math.max(1, count));
  const seconds = nowMs / 1000;

  return numbers.map((number, index) => {
    const route = PREPARED[index % PREPARED.length];
    const speedMs = 8 + ((index * 3) % 5); // ~29-40 km/h
    const offset = (index * 1700) % (2 * route.length);

    // Ruch tam i z powrotem - R1.1 są dwukierunkowe, więc wracają bez pętli.
    const cycle = (offset + speedMs * seconds) % (2 * route.length);
    const forward = cycle < route.length;
    const along = forward ? cycle : 2 * route.length - cycle;

    const { lat, lon, bearing } = pointAlong(route.points, route.lengths, along);

    return {
      id: number,
      label: number,
      licensePlate: null,
      lat,
      lon,
      bearing: forward ? bearing : (bearing + 180) % 360,
      speedKmh: Math.round(speedMs * 3.6),
      routeId: route.line,
      tripId: `demo-${route.line}-${number}`,
      directionId: forward ? 0 : 1,
      startTime: null,
      stopId: null,
      currentStatus: 2,
      timestamp: Math.floor(seconds),
      headsign: forward ? route.headsigns[1] : route.headsigns[0],
    };
  });
}
