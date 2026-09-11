import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createFleetMatcher,
  fleetNumbersFromDictionary,
  normalizeFleetNumber,
  parseCsv,
} from '../src/fleet.js';

test('normalizuje numer taborowy', () => {
  assert.equal(normalizeFleetNumber('0971'), '971');
  assert.equal(normalizeFleetNumber('T_971'), '971');
  assert.equal(normalizeFleetNumber(972), '972');
  assert.equal(normalizeFleetNumber('brak'), '');
});

test('rozpoznaje tramwaj po numerze w różnych formatach id', () => {
  const matcher = createFleetMatcher(['971', '972']);
  assert.ok(matcher('971'));
  assert.ok(matcher('T_971'));
  assert.ok(matcher(null, '0972'));
  assert.ok(!matcher('412'));
  assert.ok(!matcher('9710'), 'numer 9710 to nie jest 971');
  assert.equal(matcher.size, 2);
});

test('parsuje CSV z przecinkiem i ze średnikiem', () => {
  assert.deepEqual(parseCsv('a,b\n1,2').rows, [['1', '2']]);
  assert.deepEqual(parseCsv('a;b\n1;2').rows, [['1', '2']]);
  assert.deepEqual(parseCsv('a,b\n"x,y",2').rows, [['x,y', '2']]);
  assert.deepEqual(parseCsv('').rows, []);
});

test('wybiera ze słownika ZTM tylko wagony R1.1/NGT6', () => {
  const csv = [
    'vehicle_id;model;rocznik;niskopodlogowy',
    '971;Duewag NGT6D R1.1;1994;czesciowo',
    '972;"R1.1";1994;czesciowo',
    '412;Moderus Beta MF 02 AC;2015;tak',
    '105;Konstal 105Na;1989;nie',
  ].join('\n');

  const result = fleetNumbersFromDictionary(csv, [/R1\.?1/i, /NGT ?6/i]);
  assert.deepEqual(result.numbers, ['971', '972']);
  assert.equal(result.idColumn, 'vehicle_id');
  assert.equal(result.scannedRows, 4);
});

test('nie myli numeru taborowego z nazwą modelu', () => {
  const csv = 'id,model\n11,Moderus Gamma\n971,NGT6 R1.1';
  assert.deepEqual(fleetNumbersFromDictionary(csv, [/R1\.?1/i]).numbers, ['971']);
});

test('radzi sobie z pustym lub nieznanym słownikiem', () => {
  assert.deepEqual(fleetNumbersFromDictionary('', [/R1\.?1/i]).numbers, []);
  assert.deepEqual(fleetNumbersFromDictionary('a,b\n1,2', [/R1\.?1/i]).numbers, []);
});
