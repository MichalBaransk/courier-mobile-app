import { describe, expect, it } from 'vitest';

import { czyWartoWyslac, zOdczytu, type SurowyOdczyt } from './lokalizacjaOdczyt';

/**
 * Sedno: żaden odczyt bez sensu nie ma prawa pójść na serwer, a prędkość
 * musi przetrwać podróż nietknięta — bo od niej zależy, jak długo pozycja
 * jest cokolwiek warta. Przy 100 km/h pozycja sprzed minuty jest o 1,7 km obok.
 */

const TERAZ = 1_755_500_000_000;

const odczyt = (over: Partial<SurowyOdczyt['coords']> = {}, ts = TERAZ): SurowyOdczyt => ({
  coords: { latitude: 50.2649, longitude: 19.0238, accuracy: 12, speed: 8.3, ...over },
  timestamp: ts,
});

describe('zOdczytu', () => {
  it('przepuszcza poprawny odczyt bez zmian', () => {
    const w = zOdczytu(odczyt(), TERAZ);
    expect(w).toEqual({
      lat: 50.2649,
      lon: 19.0238,
      dokladnoscM: 12,
      predkoscMps: 8.3,
      wiekMs: 0,
    });
  });

  it('liczy wiek odczytu, a nie wysyła znacznika czasu', () => {
    // Znacznik czasu z telefonu byłby drugim źródłem prawdy obok serwera.
    const w = zOdczytu(odczyt({}, TERAZ - 20_000), TERAZ);
    expect(w?.wiekMs).toBe(20_000);
  });

  it('odczyt „z przyszłości" nie daje ujemnego wieku', () => {
    const w = zOdczytu(odczyt({}, TERAZ + 500), TERAZ);
    expect(w?.wiekMs).toBe(0);
  });

  it('prędkość -1 z Androida zamienia na null, nie na zero', () => {
    // Zero znaczyłoby „stoi", czyli odwrotność prawdy w najgorszym momencie:
    // serwer uznałby, że pozycja starzeje się wolno, i zaufałby jej za długo.
    const w = zOdczytu(odczyt({ speed: -1 }), TERAZ);
    expect(w?.predkoscMps).toBeNull();
  });

  it('brak prędkości i dokładności przechodzi jako null', () => {
    const w = zOdczytu(odczyt({ speed: null, accuracy: null }), TERAZ);
    expect(w?.predkoscMps).toBeNull();
    expect(w?.dokladnoscM).toBeNull();
  });

  it('zero jako prędkość zostaje zerem — stanie w miejscu to informacja', () => {
    const w = zOdczytu(odczyt({ speed: 0 }), TERAZ);
    expect(w?.predkoscMps).toBe(0);
  });

  it('odrzuca współrzędne spoza mapy', () => {
    expect(zOdczytu(odczyt({ latitude: 91 }), TERAZ)).toBeNull();
    expect(zOdczytu(odczyt({ longitude: -181 }), TERAZ)).toBeNull();
  });

  it('odrzuca dokładne (0, 0)', () => {
    expect(zOdczytu(odczyt({ latitude: 0, longitude: 0 }), TERAZ)).toBeNull();
    // Ale samo zero w jednej osi jest legalne.
    expect(zOdczytu(odczyt({ latitude: 0 }), TERAZ)).not.toBeNull();
  });

  it('odrzuca NaN', () => {
    expect(zOdczytu(odczyt({ latitude: NaN }), TERAZ)).toBeNull();
  });
});

describe('czyWartoWyslac', () => {
  it('pierwszy odczyt idzie zawsze', () => {
    expect(czyWartoWyslac(null, TERAZ, 20_000)).toBe(true);
  });

  it('za wcześnie po poprzednim — pomijamy', () => {
    expect(czyWartoWyslac(TERAZ - 5_000, TERAZ, 20_000)).toBe(false);
  });

  it('granica jest domknięta', () => {
    expect(czyWartoWyslac(TERAZ - 20_000, TERAZ, 20_000)).toBe(true);
  });
});
