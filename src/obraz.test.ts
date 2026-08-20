import { describe, expect, it } from 'vitest';

import { haszObrazu, kluczOceny, typObrazu } from './obraz';

/**
 * Sygnatury liczone z prawdziwych bajtow, nie przepisane z pamieci:
 * PNG zaczyna sie od 89 50 4E 47 0D 0A 1A 0A, JPEG od FF D8 FF.
 */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).toString('base64');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString('base64');

describe('typObrazu — format z bajtów, nie z deklaracji pickera', () => {
  it('rozpoznaje PNG po sygnaturze', () => {
    expect(typObrazu(PNG)).toBe('image/png');
  });

  it('rozpoznaje JPEG po sygnaturze', () => {
    expect(typObrazu(JPEG)).toBe('image/jpeg');
  });

  it('sygnatura PNG w base64 zaczyna się dokładnie tak, jak zakłada kod', () => {
    // Gdyby ktoś zmienił próg `slice`, ten test powie o tym wprost.
    expect(PNG.startsWith('iVBORw0KGgo')).toBe(true);
    expect(JPEG.startsWith('/9j/')).toBe(true);
  });

  it('nieznany początek traktujemy jak JPEG — lepiej wysłać niż odmówić', () => {
    expect(typObrazu('AAAAAAAAAAAAAAAA')).toBe('image/jpeg');
    expect(typObrazu('')).toBe('image/jpeg');
  });
});

describe('haszObrazu — rozpoznanie powtórnie wysłanego zrzutu', () => {
  it('ten sam obraz daje ten sam hasz — na tym polega ostrzeżenie o powtórce', () => {
    expect(haszObrazu(JPEG)).toBe(haszObrazu(JPEG));
  });

  it('różne obrazy dają różne hasze', () => {
    expect(haszObrazu(JPEG)).not.toBe(haszObrazu(PNG));
  });

  it('zmiana JEDNEGO próbkowanego znaku zmienia hasz', () => {
    const a = 'B'.repeat(100);
    const b = `${'B'.repeat(70)}C${'B'.repeat(29)}`;
    expect(a.length).toBe(b.length);
    expect(haszObrazu(a)).not.toBe(haszObrazu(b));
  });
});

describe('kluczOceny — idempotencja JEDNEGO wyboru zdjęcia', () => {
  /**
   * To jest test regresji, nie ozdoba. Poprzednia wersja liczyła klucz z treści
   * obrazu i przez to serwer odbijał każdą kolejną ocenę tego samego zrzutu
   * przez 48 h jako powtórkę — bez wywołania modelu i bez wpisu w `course_offers`.
   */
  it('dwa wywołania dają RÓŻNE klucze — powtórna ocena ma dać nowy wpis', () => {
    expect(kluczOceny()).not.toBe(kluczOceny());
  });

  it('sto wywołań pod rząd to sto różnych kluczy', () => {
    const klucze = new Set(Array.from({ length: 100 }, () => kluczOceny()));
    expect(klucze.size).toBe(100);
  });

  it('mieści się w ograniczeniach serwera: 8–128 znaków z dozwolonego zbioru', () => {
    for (let i = 0; i < 50; i++) {
      const k = kluczOceny();
      expect(k.length).toBeGreaterThanOrEqual(8);
      expect(k.length).toBeLessThanOrEqual(128);
      expect(/^[A-Za-z0-9._:-]+$/.test(k)).toBe(true);
    }
  });
});
