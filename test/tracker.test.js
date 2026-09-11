import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Tracker } from '../src/tracker.js';
import { simulateVehicles } from '../src/demo.js';
import { parseFleetList } from '../src/config.js';

const nowSec = () => Math.floor(Date.now() / 1000);

const baseConfig = {
  demo: false,
  demoFallback: true,
  useDictionary: true,
  feedUrl: 'https://example.test/vp.pb',
  dictionaryUrl: 'https://example.test/dict.csv',
  feedCacheMs: 5_000,
  dictionaryCacheMs: 60_000,
  requestTimeoutMs: 1_000,
  modelPatterns: [/R1\.?1/i, /NGT ?6/i],
  fleetNumbers: ['971', '972'],
  staleAfterSec: 300,
  trailLength: 5,
  fleetTotal: 24,
};

const feedWith = (vehicles) => async () => ({ feedTimestamp: nowSec(), vehicles });

test('zostawia na mapie tylko tramwaje z Bonn', async () => {
  const tracker = new Tracker(baseConfig, {
    fetchVehicleDictionary: async () => 'vehicle_id,model\n971,NGT6D R1.1\n412,Moderus Beta\n',
    fetchVehiclePositions: feedWith([
      { id: '971', label: '971', lat: 52.4, lon: 16.9, timestamp: nowSec() },
      { id: '412', label: '412', lat: 52.4, lon: 16.9, timestamp: nowSec() },
    ]),
  });

  const state = await tracker.getState();
  assert.equal(state.mode, 'live');
  assert.deepEqual(state.vehicles.map((v) => v.id), ['971']);
  assert.equal(state.totalVehicles, 2);
  assert.match(state.fleet.source, /słownik/);
});

test('gdy słownik milczy, używa listy numerów z konfiguracji', async () => {
  const tracker = new Tracker(baseConfig, {
    fetchVehicleDictionary: async () => 'vehicle_id,model\n412,Moderus Beta\n',
    fetchVehiclePositions: feedWith([{ id: '972', lat: 52.4, lon: 16.9, timestamp: nowSec() }]),
  });

  const state = await tracker.getState();
  assert.equal(state.fleet.source, 'lista-konfiguracyjna');
  assert.equal(state.vehicles.length, 1);
  assert.match(state.fleet.note, /nie znaleziono/);
});

test('awaria feedu przełącza aplikację w tryb demo', async () => {
  const tracker = new Tracker(baseConfig, {
    fetchVehicleDictionary: async () => { throw new Error('403'); },
    fetchVehiclePositions: async () => { throw new Error('ZTM nie odpowiada'); },
  });

  const state = await tracker.getState();
  assert.equal(state.mode, 'demo');
  assert.equal(state.error, 'ZTM nie odpowiada');
  assert.ok(state.vehicles.length > 0);
});

test('bez trybu awaryjnego zwraca pustą listę i błąd', async () => {
  const tracker = new Tracker({ ...baseConfig, demoFallback: false, useDictionary: false }, {
    fetchVehiclePositions: async () => { throw new Error('timeout'); },
  });

  const state = await tracker.getState();
  assert.equal(state.mode, 'live');
  assert.equal(state.vehicles.length, 0);
  assert.equal(state.error, 'timeout');
});

test('ukrywa pojazdy z przestarzałą pozycją', async () => {
  const tracker = new Tracker({ ...baseConfig, useDictionary: false }, {
    fetchVehiclePositions: feedWith([
      { id: '971', lat: 52.4, lon: 16.9, timestamp: nowSec() - 4000 },
      { id: '972', lat: 52.4, lon: 16.9, timestamp: nowSec() },
    ]),
  });

  const state = await tracker.getState();
  assert.deepEqual(state.vehicles.map((v) => v.id), ['972']);
});

test('cache oszczędza zapytania do ZTM', async () => {
  let calls = 0;
  const tracker = new Tracker({ ...baseConfig, useDictionary: false }, {
    fetchVehiclePositions: async () => {
      calls += 1;
      return { feedTimestamp: nowSec(), vehicles: [{ id: '971', lat: 52.4, lon: 16.9, timestamp: nowSec() }] };
    },
  });

  await Promise.all([tracker.getState(), tracker.getState()]);
  await tracker.getState();
  assert.equal(calls, 1);
});

test('buduje ślad trasy z kolejnych pozycji', async () => {
  let lat = 52.40;
  const tracker = new Tracker({ ...baseConfig, useDictionary: false, feedCacheMs: 0 }, {
    fetchVehiclePositions: async () => {
      lat += 0.001;
      return { feedTimestamp: nowSec(), vehicles: [{ id: '971', lat, lon: 16.9, timestamp: nowSec() }] };
    },
  });

  await tracker.getState();
  await tracker.getState();
  const state = await tracker.getState();
  assert.equal(state.vehicles[0].trail.length, 3);
});

test('symulacja demo utrzymuje pojazdy w granicach Poznania i przesuwa je w czasie', () => {
  const now = 1_770_000_000_000;
  const first = simulateVehicles(['971', '972', '973'], now);
  const later = simulateVehicles(['971', '972', '973'], now + 60_000);

  assert.equal(first.length, 3);
  for (const vehicle of first) {
    assert.ok(vehicle.lat > 52.34 && vehicle.lat < 52.47, 'szerokość w granicach miasta');
    assert.ok(vehicle.lon > 16.83 && vehicle.lon < 17.01, 'długość w granicach miasta');
    assert.ok(vehicle.speedKmh > 0);
  }
  assert.notDeepEqual(first[0], later[0], 'po minucie pozycja się zmienia');
});

test('parsuje zakresy numerów taborowych', () => {
  assert.deepEqual(parseFleetList('971-973'), ['971', '972', '973']);
  assert.deepEqual(parseFleetList('971, 980'), ['971', '980']);
  assert.deepEqual(parseFleetList(''), []);
});
