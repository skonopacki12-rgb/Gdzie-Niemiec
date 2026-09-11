/**
 * Rozpoznawanie tramwajów z Bonn (Duewag/Siemens NGT6D "R1.1") wśród wszystkich
 * pojazdów, które ZTM Poznań wystawia w feedzie GTFS-RT.
 *
 * Feed identyfikuje pojazd polem `vehicle.id` / `vehicle.label`, które u ZTM
 * zawiera numer taborowy (czasem z prefiksem, np. "T_971"). Model pojazdu
 * podaje osobny plik `vehicle_dictionary.csv`. Dlatego rozpoznajemy dwutorowo:
 * po modelu ze słownika (źródło główne) i po liście numerów (awaryjnie).
 */

/** Wyciąga z tekstu wszystkie ciągi cyfr: "T_971/2" -> ['971', '2'] */
export function digitGroups(value) {
  if (value === null || value === undefined) return [];
  return String(value).match(/\d+/g) ?? [];
}

/** Numer taborowy bez zer wiodących i śmieci: "0971" -> "971" */
export function normalizeFleetNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const trimmed = digits.replace(/^0+/, '');
  return trimmed || '0';
}

/**
 * Zwraca funkcję sprawdzającą, czy dany pojazd to tramwaj z Bonn.
 * @param {Iterable<string>} numbers numery taborowe uznawane za "niemieckie"
 */
export function createFleetMatcher(numbers) {
  const set = new Set();
  for (const n of numbers ?? []) {
    const norm = normalizeFleetNumber(n);
    if (norm) set.add(norm);
  }

  const match = (...candidates) => {
    for (const candidate of candidates) {
      if (candidate === null || candidate === undefined || candidate === '') continue;
      const raw = String(candidate).trim();
      // Sam numer, np. "971"
      if (set.has(normalizeFleetNumber(raw))) return true;
      // Numer schowany w identyfikatorze, np. "T_971" albo "971/2"
      for (const group of digitGroups(raw)) {
        if (set.has(normalizeFleetNumber(group))) return true;
      }
    }
    return false;
  };

  match.size = set.size;
  match.numbers = [...set].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  return match;
}

/**
 * Minimalny parser CSV: obsługuje cudzysłowy, przecinek i średnik jako separator.
 * @returns {{header: string[], rows: string[][]}}
 */
export function parseCsv(text) {
  const clean = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!clean.trim()) return { header: [], rows: [] };

  const firstLine = clean.slice(0, clean.indexOf('\n') === -1 ? undefined : clean.indexOf('\n'));
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === delimiter) { row.push(field); field = ''; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const cleaned = rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ''));
  if (!cleaned.length) return { header: [], rows: [] };
  return { header: cleaned[0], rows: cleaned.slice(1) };
}

const ID_COLUMN_HINTS = [/^vehicle_?id$/i, /^id$/i, /numer|nr_|_nr|tabor|bocz|pojazd|vehicle/i];

/**
 * Wyciąga ze słownika pojazdów numery taborowe, których opis pasuje do modelu.
 * Nie zakładamy sztywno nazw kolumn - ZTM potrafi je zmienić - więc szukamy
 * kolumny z identyfikatorem heurystycznie, a modelu szukamy w całym wierszu.
 *
 * @param {string} csvText zawartość vehicle_dictionary.csv
 * @param {RegExp[]} patterns wzorce modelu (np. /R1\.?1/i)
 * @returns {{numbers: string[], idColumn: string|null, scannedRows: number}}
 */
export function fleetNumbersFromDictionary(csvText, patterns) {
  const { header, rows } = parseCsv(csvText);
  if (!header.length || !rows.length) return { numbers: [], idColumn: null, scannedRows: 0 };

  let idIndex = -1;
  for (const hint of ID_COLUMN_HINTS) {
    idIndex = header.findIndex((h) => hint.test(h));
    if (idIndex !== -1) break;
  }
  if (idIndex === -1) idIndex = 0;

  const numbers = new Set();
  for (const row of rows) {
    const id = row[idIndex];
    if (!id) continue;
    // Model może siedzieć w dowolnej kolumnie, więc przeszukujemy cały wiersz
    // z pominięciem kolumny identyfikatora (żeby numer nie udawał modelu).
    const haystack = row.filter((_, i) => i !== idIndex).join(' ');
    if (patterns.some((p) => p.test(haystack))) {
      const norm = normalizeFleetNumber(id);
      if (norm) numbers.add(norm);
    }
  }

  return {
    numbers: [...numbers].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
    idColumn: header[idIndex] ?? null,
    scannedRows: rows.length,
  };
}
