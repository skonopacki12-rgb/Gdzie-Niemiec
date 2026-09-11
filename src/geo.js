/** Proste funkcje geograficzne używane przez symulator trybu demo. */

const R = 6_371_000; // promień Ziemi w metrach
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

/** Odległość w metrach między dwoma punktami [lat, lon]. */
export function distance([lat1, lon1], [lat2, lon2]) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Azymut (0-360°, 0 = północ) z punktu A do punktu B. */
export function bearing([lat1, lon1], [lat2, lon2]) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Skumulowane długości segmentów łamanej; ostatni element to jej długość. */
export function cumulativeLengths(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i += 1) {
    lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
  }
  return lengths;
}

/**
 * Punkt oddalony o `metres` od początku łamanej, wraz z azymutem jazdy.
 * @returns {{lat: number, lon: number, bearing: number}}
 */
export function pointAlong(points, lengths, metres) {
  const total = lengths[lengths.length - 1];
  const target = Math.min(Math.max(metres, 0), total);

  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < target) i += 1;

  const segmentStart = points[i - 1];
  const segmentEnd = points[i];
  const segmentLength = lengths[i] - lengths[i - 1] || 1;
  const t = (target - lengths[i - 1]) / segmentLength;

  return {
    lat: segmentStart[0] + (segmentEnd[0] - segmentStart[0]) * t,
    lon: segmentStart[1] + (segmentEnd[1] - segmentStart[1]) * t,
    bearing: bearing(segmentStart, segmentEnd),
  };
}
