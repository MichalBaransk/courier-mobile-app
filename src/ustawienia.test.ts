import { describe, expect, it } from 'vitest';

import { DOMYSLNE, poprawUstawienia } from './ustawienia';

/**
 * Sedno: SCALANIE, nie odrzucanie. Plik zapisany przez starszą wersję
 * aplikacji nie ma pól dodanych później — gdyby to unieważniało całość,
 * każda aktualizacja kasowałaby użytkownikowi wybory.
 */

describe('poprawUstawienia', () => {
  it('brak zapisu daje domyślne', () => {
    expect(poprawUstawienia(null)).toEqual(DOMYSLNE);
    expect(poprawUstawienia(undefined)).toEqual(DOMYSLNE);
    expect(poprawUstawienia('bzdura')).toEqual(DOMYSLNE);
    expect(poprawUstawienia(42)).toEqual(DOMYSLNE);
  });

  it('pusty obiekt daje domyślne', () => {
    expect(poprawUstawienia({})).toEqual(DOMYSLNE);
  });

  it('domyślne to dotychczasowe zachowanie — wszystko włączone', () => {
    // Ktoś, kto nigdy nie wejdzie w ustawienia, nie ma prawa zauważyć,
    // że one powstały.
    expect(DOMYSLNE.ekranNieGasnie).toBe(true);
    expect(DOMYSLNE.wysylajPozycje).toBe(true);
    expect(DOMYSLNE.wysokaDokladnosc).toBe(true);
  });

  it('zapis CZĘŚCIOWY uzupełnia się domyślnymi, nie kasuje reszty', () => {
    // Dokładnie ten przypadek: stara wersja zapisała dwa pola, doszło trzecie.
    const w = poprawUstawienia({ ekranNieGasnie: false, wysylajPozycje: false });
    expect(w).toEqual({
      ekranNieGasnie: false,
      wysylajPozycje: false,
      wysokaDokladnosc: true,
    });
  });

  it('pole o złym typie wraca do domyślnego, reszta zostaje', () => {
    const w = poprawUstawienia({ ekranNieGasnie: 'nie', wysylajPozycje: false });
    expect(w.ekranNieGasnie).toBe(true);
    expect(w.wysylajPozycje).toBe(false);
  });

  it('nieznane pola są ignorowane, a nie przepisywane dalej', () => {
    const w = poprawUstawienia({ ekranNieGasnie: false, cosStarego: 'x' });
    expect(w).toEqual({ ...DOMYSLNE, ekranNieGasnie: false });
    expect(Object.keys(w).sort()).toEqual(Object.keys(DOMYSLNE).sort());
  });

  it('wynik jest NOWYM obiektem — nie da się przypadkiem zmutować domyślnych', () => {
    const w = poprawUstawienia({});
    w.ekranNieGasnie = false;
    expect(DOMYSLNE.ekranNieGasnie).toBe(true);
  });
});
