import { describe, expect, it } from 'vitest';

import {
  czyUstawiony,
  godzinyDnia,
  ileDniRoboczych,
  naGodzine,
  opisDni,
  opisDnia,
  planZakresu,
  poprawTydzien,
  PUSTY_TYDZIEN,
  rozlozCel,
  sumaTygodnia,
  type DzienPracy,
} from './tydzienPracy';

/**
 * Tydzień pracy zmienia JEDNĄ rzecz: przez ile dni dzielimy to, co zostało
 * do celu. Te testy pilnują, żeby nie zmieniał niczego więcej, żeby przy
 * zerze dni roboczych nie wypuścił `Infinity` na ekran i żeby zmiana przez
 * północ liczyła się tak samo jak w bocie (§8d).
 */

const p = (od: string, doGodz: string): DzienPracy => {
  const [g1, m1] = od.split(':').map(Number);
  const [g2, m2] = doGodz.split(':').map(Number);
  return { od: (g1 ?? 0) * 60 + (m1 ?? 0), do: (g2 ?? 0) * 60 + (m2 ?? 0) };
};

/** pon–pt, 10:00–18:00. */
const PON_PT = [p('10:00', '18:00'), p('10:00', '18:00'), p('10:00', '18:00'), p('10:00', '18:00'), p('10:00', '18:00'), null, null];
/** Tylko weekend, 12:00–18:00. */
const WEEKEND = [null, null, null, null, null, p('12:00', '18:00'), p('12:00', '18:00')];

describe('godzinyDnia', () => {
  it('zwykła zmiana', () => {
    expect(godzinyDnia(p('10:00', '18:00'))).toBe(8);
    expect(godzinyDnia(p('10:30', '18:00'))).toBe(7.5);
  });

  it('przez północ to nie błąd — kurier kończący o 02:00 jest normą (§8d)', () => {
    expect(godzinyDnia(p('22:00', '02:00'))).toBe(4);
    expect(godzinyDnia(p('18:00', '01:30'))).toBe(7.5);
  });

  it('równe godziny znaczą „nic nie ustawiono", a nie dobę pracy', () => {
    expect(godzinyDnia(p('10:00', '10:00'))).toBe(0);
  });

  it('dzień wolny', () => {
    expect(godzinyDnia(null)).toBe(0);
  });
});

describe('naGodzine / opisDnia', () => {
  it('formatuje minuty od północy', () => {
    expect(naGodzine(600)).toBe('10:00');
    expect(naGodzine(615)).toBe('10:15');
    expect(naGodzine(0)).toBe('00:00');
    expect(naGodzine(1439)).toBe('23:59');
  });

  it('opis przedziału', () => {
    expect(opisDnia(p('10:00', '18:00'))).toBe('10:00–18:00');
    expect(opisDnia(null)).toBe('wolne');
  });
});

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
    expect(planZakresu(PON_PT, '2026-08-15', '2026-08-16')).toEqual({ dni: 0, godziny: 0 });
  });

  it('zakres odwrócony nie zapętla renderowania', () => {
    expect(planZakresu(PON_PT, '2026-08-16', '2026-08-10')).toEqual({ dni: 0, godziny: 0 });
  });

  it('działa przez granicę miesiąca', () => {
    expect(planZakresu(PON_PT, '2026-07-27', '2026-08-02')).toEqual({ dni: 5, godziny: 40 });
  });
});

describe('rozlozCel — na tym polega cała funkcja', () => {
  it('dzieli przez dni ROBOCZE, nie przez wszystkie', () => {
    const r = rozlozCel(PON_PT, 800, 20, '2026-08-10', '2026-08-16');
    expect(r.dniRobocze).toBe(5);
    expect(r.nettoNaDzienRoboczy).toBe(160); // 800 / 5, a nie 800 / 7
    expect(r.godzinNaDzienRoboczy).toBe(4);
  });

  it('porównuje plan z potrzebą', () => {
    const r = rozlozCel(PON_PT, 800, 20, '2026-08-10', '2026-08-16');
    expect(r.godzinyPlanu).toBe(40);
    expect(r.zapasGodzin).toBe(20);
  });

  it('ujemny zapas znaczy, że plan NIE wystarczy', () => {
    const r = rozlozCel(WEEKEND, 800, 30, '2026-08-10', '2026-08-16');
    expect(r.godzinyPlanu).toBe(12);
    expect(r.zapasGodzin).toBe(-18);
  });

  it('zero dni roboczych daje null, a nie Infinity', () => {
    const r = rozlozCel(PON_PT, 800, 20, '2026-08-15', '2026-08-16');
    expect(r.dniRobocze).toBe(0);
    expect(r.nettoNaDzienRoboczy).toBeNull();
    expect(r.godzinNaDzienRoboczy).toBeNull();
    expect(r.zapasGodzin).toBeNull();
  });
});

describe('poprawTydzien — to, co przyszło z dysku', () => {
  it('przepuszcza poprawne przedziały', () => {
    expect(poprawTydzien([...PON_PT])).toEqual(PON_PT);
  });

  it('STARY format (same godziny) zamienia na przedziały od 10:00', () => {
    // Bez tego pierwsza wersja tygodnia pracy przepadłaby po aktualizacji.
    const stary = poprawTydzien([8, 8, 8, 8, 8, 0, 0]);
    expect(stary).not.toBeNull();
    expect(sumaTygodnia(stary ?? [])).toBe(40);
    expect(opisDnia(stary?.[0] ?? null)).toBe('10:00–18:00');
    expect(stary?.[5]).toBeNull();
  });

  it('odrzuca złą długość', () => {
    expect(poprawTydzien([null, null, null])).toBeNull();
    expect(poprawTydzien([])).toBeNull();
  });

  it('odrzuca zmianę dłuższą niż 16 h', () => {
    expect(poprawTydzien([p('06:00', '23:00'), null, null, null, null, null, null])).toBeNull();
  });

  it('odrzuca minuty spoza doby', () => {
    expect(poprawTydzien([{ od: -1, do: 600 }, null, null, null, null, null, null])).toBeNull();
    expect(poprawTydzien([{ od: 0, do: 1440 }, null, null, null, null, null, null])).toBeNull();
  });

  it('odrzuca to, co w ogóle nie jest tym, na co wygląda', () => {
    expect(poprawTydzien(null)).toBeNull();
    expect(poprawTydzien('8,8,8')).toBeNull();
    expect(poprawTydzien([{ od: '10:00', do: 1080 }, null, null, null, null, null, null])).toBeNull();
  });

  it('przedział zerowej długości staje się dniem wolnym', () => {
    expect(poprawTydzien([p('10:00', '10:00'), null, null, null, null, null, null])?.[0]).toBeNull();
  });
});
