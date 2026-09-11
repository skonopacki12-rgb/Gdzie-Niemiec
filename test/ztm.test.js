import assert from 'node:assert/strict';
import { test } from 'node:test';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { decodeFeed, normalizeEntity, toNumber } from '../src/ztm.js';

const { transit_realtime: rt } = GtfsRealtimeBindings;

const encode = (entities) =>
  rt.FeedMessage.encode(
    rt.FeedMessage.create({
      header: { gtfsRealtimeVersion: '2.0', timestamp: 1_770_000_000 },
      entity: entities,
    }),
  ).finish();

test('dekoduje pozycje pojazdów z protobufa', () => {
  const buffer = encode([
    {
      id: 'e1',
      vehicle: {
        trip: { tripId: 't-1', routeId: '11' },
        vehicle: { id: '971', label: '971' },
        position: { latitude: 52.4083, longitude: 16.9147, bearing: 45, speed: 10 },
        timestamp: 1_770_000_000,
      },
    },
  ]);

  const { feedTimestamp, vehicles } = decodeFeed(buffer);
  assert.equal(feedTimestamp, 1_770_000_000);
  assert.equal(vehicles.length, 1);
  assert.equal(vehicles[0].id, '971');
  assert.equal(vehicles[0].routeId, '11');
  assert.equal(vehicles[0].speedKmh, 36, 'm/s przeliczone na km/h');
});

test('pomija wpisy bez sensownej pozycji', () => {
  assert.equal(normalizeEntity({ vehicle: { vehicle: { id: '1' } } }), null);
  assert.equal(
    normalizeEntity({ vehicle: { vehicle: { id: '1' }, position: { latitude: 0, longitude: 0 } } }),
    null,
  );
});

test('sprowadza wartości Long protobufa do liczb', () => {
  assert.equal(toNumber({ toNumber: () => 42 }), 42);
  assert.equal(toNumber(7), 7);
  assert.equal(toNumber(null), null);
});
