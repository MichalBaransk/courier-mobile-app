import { describe, expect, it } from 'vitest';

import { kluczObrazu, typObrazu } from './obraz';

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

describe('kluczObrazu — idempotencja oceny oferty', () => {
  it('ten sam obraz daje ten sam klucz — na tym polega ponowienie', () => {
    expect(kluczObrazu(JPEG)).toBe(kluczObrazu(JPEG));
  });

  it('różne obrazy dają różne klucze', () => {
    expect(kluczObrazu(JPEG)).not.toBe(kluczObrazu(PNG));
  });

  it('mieści się w ograniczeniach serwera: 8–128 znaków z dozwolonego zbioru', () => {
    for (const wejscie of [JPEG, PNG, 'A'.repeat(3_000_000), 'x']) {
      const k = kluczObrazu(wejscie);
      expect(k.length).toBeGreaterThanOrEqual(8);
      expect(k.length).toBeLessThanOrEqual(128);
      expect(/^[A-Za-z0-9._:-]+$/.test(k)).toBe(true);
    }
  });

  it('zmiana JEDNEGO próbkowanego znaku zmienia klucz', () => {
    const a = 'B'.repeat(100);
    const b = `${'B'.repeat(70)}C${'B'.repeat(29)}`;
    expect(a.length).toBe(b.length);
    expect(kluczObrazu(a)).not.toBe(kluczObrazu(b));
  });
});
