import { describe, expect, it } from 'vitest';

import {
  czyUstawiony,
  ileDniRoboczych,
  opisDni,
  planZakresu,
  poprawTydzien,
  PUSTY_TYDZIEN,
  rozlozCel,
  sumaTygodnia,
} from './tydzienPracy';

/**
 * Tydzień pracy zmienia JEDNĄ rzecz: przez ile dni dzielimy to, co zostało
 * do celu. Te testy pilnują, żeby nie zmieniał niczego więcej i żeby przy
 * zerze dni roboczych nie wypuścił `Infinity` na ekran.
 */

/** pon–pt po 8 h. */
const PON_PT: number[] = [8, 8, 8, 8, 8, 0, 0];
/** Tylko weekend. */
const WEEKEND: number[] = [0, 0, 0, 0, 0, 6, 6];

describe('podstawy', () => {
  it('pusty tydzień to brak ustawienia', () => {
    expect(czyUstawiony(PUSTY_TYDZIEN)).toBe(false);
    expect(czyUstawiony(PON_PT)).toBe(true);
  });

  it('suma i liczba dni', () => {
    expect(sumaTygodnia(PON_PT)).toBe(40);
    expect(ileDniRoboczych(PON_PT)).toBe(5);
    expect(sumaTygodnia(WEEKEND)).toBe(12);
    expect(ileDniRoboczych(WEEKEND)).toBe(2);
  });

  it('opis dni po polsku', () => {
    expect(opisDni(PON_PT)).toBe('pon, wt, śr, czw, pt');
    expect(opisDni(WEEKEND)).toBe('sob, nd');
    expect(opisDni(PUSTY_TYDZIEN)).toBe('brak');
  });
});

describe('planZakresu — liczy dni robocze, nie kalendarzowe', () => {
  it('pełny tydzień od poniedziałku do niedzieli', () => {
    // 10.08.2026 to poniedziałek, 16.08 to niedziela.
    expect(planZakresu(PON_PT, '2026-08-10', '2026-08-16')).toEqual({ dni: 5, godziny: 40 });
    expect(planZakresu(WEEKEND, '2026-08-10', '2026-08-16')).toEqual({ dni: 2, godziny: 12 });
  });

  it('obie granice liczą się — dzisiaj też jest dniem pracy', () => {
    expect(planZakresu(PON_PT, '2026-08-10', '2026-08-10')).toEqual({ dni: 1, godziny: 8 });
  });

  it('zakres bez ani jednego dnia roboczego', () => {
    // Sobota i niedziela przy planie pon–pt.
    expect(planZakresu(PON_PT, '2026-08-15', '2026-08-16')).toEqual({ dni: 0, godziny: 0 });
  });

  it('zakres odwrócony nie zapętla renderowania', () => {
    expect(planZakresu(PON_PT, '2026-08-16', '2026-08-10')).toEqual({ dni: 0, godziny: 0 });
  });

  it('działa przez granicę miesiąca', () => {
    // 27.07 (pon) – 02.08 (nd) to jeden pełny tydzień.
    expect(planZakresu(PON_PT, '2026-07-27', '2026-08-02')).toEqual({ dni: 5, godziny: 40 });
  });
});

describe('rozlozCel — na tym polega cała funkcja', () => {
  it('dzieli przez dni ROBOCZE, nie przez wszystkie', () => {
    // 800 zł, tydzień 10–16 sierpnia, plan pon–pt → 5 dni roboczych.
    const r = rozlozCel(PON_PT, 800, 20, '2026-08-10', '2026-08-16');
    expect(r.dniRobocze).toBe(5);
    expect(r.nettoNaDzienRoboczy).toBe(160); // 800 / 5, a nie 800 / 7
    expect(r.godzinNaDzienRoboczy).toBe(4); // 20 h / 5 dni
  });

  it('porównuje plan z potrzebą', () => {
    const r = rozlozCel(PON_PT, 800, 20, '2026-08-10', '2026-08-16');
    expect(r.godzinyPlanu).toBe(40);
    expect(r.godzinyPotrzebne).toBe(20);
    expect(r.zapasGodzin).toBe(20); // plan z zapasem
  });

  it('ujemny zapas znaczy, że plan NIE wystarczy', () => {
    const r = rozlozCel(WEEKEND, 800, 30, '2026-08-10', '2026-08-16');
    expect(r.godzinyPlanu).toBe(12);
    expect(r.zapasGodzin).toBe(-18);
  });

  it('zero dni roboczych daje null, a nie Infinity', () => {
    // To NIE jest błąd — przy planie „tylko dni robocze" i celu kończącym się
    // w niedzielę naprawdę nie ma już kiedy zarobić. Ale `800 / 0` na ekranie
    // wyglądałoby jak zepsuta aplikacja.
    const r = rozlozCel(PON_PT, 800, 20, '2026-08-15', '2026-08-16');
    expect(r.dniRobocze).toBe(0);
    expect(r.nettoNaDzienRoboczy).toBeNull();
    expect(r.godzinNaDzienRoboczy).toBeNull();
    expect(r.zapasGodzin).toBeNull();
  });
});

describe('poprawTydzien — to, co przyszło z dysku', () => {
  it('przepuszcza poprawną tablicę', () => {
    expect(poprawTydzien([8, 8, 8, 8, 8, 0, 0])).toEqual(PON_PT);
  });

  it('odrzuca złą długość', () => {
    expect(poprawTydzien([8, 8, 8])).toBeNull();
    expect(poprawTydzien([])).toBeNull();
  });

  it('odrzuca wartości spoza zakresu', () => {
    expect(poprawTydzien([25, 0, 0, 0, 0, 0, 0])).toBeNull();
    expect(poprawTydzien([-1, 0, 0, 0, 0, 0, 0])).toBeNull();
  });

  it('odrzuca to, co w ogóle nie jest tablicą liczb', () => {
    expect(poprawTydzien(null)).toBeNull();
    expect(poprawTydzien('8,8,8')).toBeNull();
    expect(poprawTydzien([8, 8, 8, 8, 8, 0, '0'])).toBeNull();
    expect(poprawTydzien([NaN, 0, 0, 0, 0, 0, 0])).toBeNull();
  });
});
