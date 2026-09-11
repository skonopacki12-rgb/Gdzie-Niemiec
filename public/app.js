/* Frontend aplikacji "Gdzie Niemiec" - mapa Leaflet + odpytywanie /api/vehicles. */
(() => {
  'use strict';

  const REFRESH_MS = 10_000;
  const POZNAN = [52.4064, 16.9252];

  const el = {
    map: document.getElementById('map'),
    list: document.getElementById('list'),
    count: document.getElementById('count'),
    countLabel: document.getElementById('count-label'),
    modeChip: document.getElementById('mode-chip'),
    updatedChip: document.getElementById('updated-chip'),
    hint: document.getElementById('hint'),
    banner: document.getElementById('banner'),
    sourceNote: document.getElementById('source-note'),
  };

  const map = L.map(el.map, { zoomControl: true, attributionControl: true }).setView(POZNAN, 12);

  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // Bez dostępu do OSM (firewall, tryb offline) mapa jest czarna - powiedzmy o tym
  // wprost, zamiast zostawiać użytkownika z pustym tłem.
  let tileErrors = 0;
  tiles.on('tileerror', () => {
    tileErrors += 1;
    if (tileErrors === 4) {
      el.banner.hidden = false;
      el.banner.textContent =
        'Nie udało się pobrać kafelków mapy z OpenStreetMap - pozycje tramwajów działają, brakuje tylko tła mapy.';
    }
  });

  /** id pojazdu -> { marker, trail } */
  const layers = new Map();
  let selectedId = null;
  let lastPayload = null;
  let followSelected = false;
  let framed = false;

  const icon = (vehicle, stale) =>
    L.divIcon({
      className: 'marker-wrap',
      html: `
        <div class="marker ${stale ? 'marker--stale' : ''}">
          <div class="marker__arrow" style="transform: rotate(${vehicle.bearing ?? 0}deg)"></div>
          <div class="marker__dot">${vehicle.routeId ?? '?'}</div>
        </div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -18],
    });

  const fmtAge = (sec) => {
    if (sec === null || sec === undefined) return 'brak danych';
    if (sec < 60) return `${sec} s temu`;
    const min = Math.floor(sec / 60);
    return min < 60 ? `${min} min temu` : `${Math.floor(min / 60)} h temu`;
  };

  const popupHtml = (v) => `
    <div class="popup">
      <h3>Tramwaj ${v.id ?? '?'} &middot; linia ${v.routeId ?? '?'}</h3>
      <dl>
        <dt>Model</dt><dd>NGT6D R1.1 (ex-Bonn)</dd>
        ${v.headsign ? `<dt>Kierunek</dt><dd>${v.headsign}</dd>` : ''}
        <dt>Prędkość</dt><dd>${v.speedKmh === null ? 'brak danych' : `${v.speedKmh} km/h`}</dd>
        <dt>Pozycja z</dt><dd>${fmtAge(v.ageSec)}</dd>
        ${v.tripId ? `<dt>Kurs</dt><dd>${v.tripId}</dd>` : ''}
      </dl>
    </div>`;

  function syncMarkers(vehicles) {
    const seen = new Set();

    for (const vehicle of vehicles) {
      const id = String(vehicle.id);
      seen.add(id);
      const stale = (vehicle.ageSec ?? 0) > 90;
      let entry = layers.get(id);

      if (!entry) {
        const marker = L.marker([vehicle.lat, vehicle.lon], { icon: icon(vehicle, stale) }).addTo(map);
        const trail = L.polyline(vehicle.trail ?? [], {
          color: '#ffce00',
          weight: 3,
          opacity: 0.45,
        }).addTo(map);
        marker.on('click', () => select(id, false));
        entry = { marker, trail };
        layers.set(id, entry);
        // Płynny przesuw znacznika między kolejnymi odczytami.
        requestAnimationFrame(() => marker.getElement()?.classList.add('glide'));
      } else {
        entry.marker.setLatLng([vehicle.lat, vehicle.lon]);
        entry.marker.setIcon(icon(vehicle, stale));
        entry.trail.setLatLngs(vehicle.trail ?? []);
      }

      entry.marker.bindPopup(popupHtml(vehicle));
      if (followSelected && id === selectedId) map.panTo([vehicle.lat, vehicle.lon]);
    }

    // Przy pierwszym odczycie kadrujemy mapę tak, żeby widać było wszystkie wagony.
    if (!framed && vehicles.length) {
      framed = true;
      const bounds = L.latLngBounds(vehicles.map((v) => [v.lat, v.lon]));
      map.fitBounds(bounds.pad(0.25), { maxZoom: 14 });
    }

    for (const [id, entry] of layers) {
      if (seen.has(id)) continue;
      map.removeLayer(entry.marker);
      map.removeLayer(entry.trail);
      layers.delete(id);
      if (selectedId === id) selectedId = null;
    }
  }

  function renderList(vehicles) {
    el.list.innerHTML = '';

    if (!vehicles.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent =
        'Żaden tramwaj z Bonn nie jest teraz na trasie. Wagony wyjeżdżają z zajezdni w godzinach szczytu.';
      el.list.append(empty);
      return;
    }

    for (const vehicle of vehicles) {
      const id = String(vehicle.id);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `tram ${id === selectedId ? 'tram--active' : ''}`;
      item.setAttribute('role', 'listitem');
      item.innerHTML = `
        <span class="tram__line">${vehicle.routeId ?? '?'}</span>
        <span class="tram__meta">
          <span class="tram__no">#${id} <span>NGT6 R1.1</span></span>
          <span class="tram__sub">
            ${vehicle.headsign ? `→ ${vehicle.headsign} &middot; ` : ''}
            ${vehicle.speedKmh === null ? '' : `${vehicle.speedKmh} km/h &middot; `}
            ${fmtAge(vehicle.ageSec)}
          </span>
        </span>`;
      item.addEventListener('click', () => select(id, true));
      el.list.append(item);
    }
  }

  function select(id, fly) {
    selectedId = id;
    followSelected = true;
    const entry = layers.get(id);
    if (entry) {
      const position = entry.marker.getLatLng();
      if (fly) map.flyTo(position, Math.max(map.getZoom(), 15), { duration: 0.8 });
      entry.marker.openPopup();
    }
    if (lastPayload) renderList(lastPayload.vehicles);
  }

  map.on('dragstart', () => {
    followSelected = false;
  });

  function renderStatus(payload) {
    const demo = payload.mode === 'demo';
    el.modeChip.textContent = demo ? 'tryb demo' : 'na żywo';
    el.modeChip.className = `chip ${demo ? 'chip--demo' : 'chip--live'}`;

    el.count.textContent = payload.vehicles.length;
    el.countLabel.textContent =
      payload.fleet?.total ? `z ${payload.fleet.total} sprowadzonych – na trasie` : 'na trasie';

    el.updatedChip.textContent = new Date(payload.updatedAt).toLocaleTimeString('pl-PL');

    const hints = [];
    if (demo && payload.error) hints.push('Feed ZTM nieosiągalny – pokazuję symulację.');
    else if (demo) hints.push('Dane symulowane – to nie są prawdziwe pozycje.');
    if (payload.totalVehicles !== null && !demo) {
      hints.push(`W całej sieci ZTM widocznych pojazdów: ${payload.totalVehicles}.`);
    }
    el.hint.textContent = hints.join(' ');

    const fleet = payload.fleet ?? {};
    el.sourceNote.textContent = demo
      ? 'Symulacja lokalna – dane poglądowe'
      : `Źródło: GTFS-RT ZTM Poznań · tabor: ${fleet.source ?? '—'} (${fleet.size ?? 0} nr)`;

    if (payload.error && !demo) {
      el.banner.hidden = false;
      el.banner.textContent = `Błąd pobierania danych: ${payload.error}`;
    } else {
      el.banner.hidden = true;
    }
  }

  async function refresh() {
    try {
      const response = await fetch('/api/vehicles', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      lastPayload = payload;
      renderStatus(payload);
      syncMarkers(payload.vehicles);
      renderList(payload.vehicles);
    } catch (error) {
      el.modeChip.textContent = 'brak połączenia';
      el.modeChip.className = 'chip chip--error';
      el.banner.hidden = false;
      el.banner.textContent = `Nie mogę połączyć się z serwerem aplikacji: ${error.message}`;
    }
  }

  refresh();
  setInterval(refresh, REFRESH_MS);
})();
