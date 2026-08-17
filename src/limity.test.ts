import { describe, expect, it } from 'vitest';

import { ocenLiczbe, ocenParagon, ocenZmiane, polacz } from './limity';

/**
 * Progi rozsądku — warstwa, która łapie literówkę, zanim ta wejdzie do bazy.
 *
 * Limity serwera są luźne z premedytacją (napiwek do 10 000 zł), więc `45,50`
 * wpisane bez przecinka to `4550` — kwota całkowicie legalna i całkowicie
 * absurdalna. Te testy pilnują, żeby taka wartość dostała ostrzeżenie,
 * a wartość niemożliwa — twardy błąd.
 */

const CZYSTO = { blad: null, ostrzezenie: null };

describe('ocenLiczbe — twarde błędy', () => {
  it('zero i liczby ujemne nie mają sensu', () => {
    expect(ocenLiczbe('napiwek', 0).blad).not.toBeNull();
    expect(ocenLiczbe('napiwek', -3).blad).not.toBeNull();
  });

  it('NaN to nie jest liczba', () => {
    expect(ocenLiczbe('napiwek', NaN).blad).not.toBeNull();
  });

  it('powyżej limitu serwera — nie ma po co wysyłać', () => {
    expect(ocenLiczbe('napiwek', 20_000).blad).not.toBeNull();
    expect(ocenLiczbe('dystans', 5_000).blad).not.toBeNull();
  });

  it('brutto dopuszcza zero — pozwala wyzerować pomyłkowy wpis', () => {
    expect(ocenLiczbe('brutto', 0)).toEqual(CZYSTO);
  });

  it('puste pole to nie jest zadanie tej funkcji', () => {
    expect(ocenLiczbe('napiwek', null)).toEqual(CZYSTO);
  });
});

describe('ocenLiczbe — ostrzeżenia, czyli literówki', () => {
  it('typowe wartości przechodzą bez słowa', () => {
    expect(ocenLiczbe('napiwek', 5.5)).toEqual(CZYSTO);
    expect(ocenLiczbe('dystans', 142.3)).toEqual(CZYSTO);
    expect(ocenLiczbe('brutto', 438.6)).toEqual(CZYSTO);
    expect(ocenLiczbe('cenaZaLitr', 6.48)).toEqual(CZYSTO);
    expect(ocenLiczbe('celMiesieczny', 6_000)).toEqual(CZYSTO);
  });

  it('napiwek 550 zł zamiast 5,50 dostaje ostrzeżenie', () => {
    expect(ocenLiczbe('napiwek', 550).ostrzezenie).not.toBeNull();
  });

  it('dystans 455 km w jeden dzień dostaje ostrzeżenie', () => {
    expect(ocenLiczbe('dystans', 455).ostrzezenie).not.toBeNull();
  });

  it('cena 0,64 zł/L to nietypowo MAŁO — dolny próg też działa', () => {
    expect(ocenLiczbe('cenaZaLitr', 0.64).ostrzezenie).not.toBeNull();
  });

  it('cel tygodniowy 60 000 zł to brak przecinka, nie ambicja', () => {
    expect(ocenLiczbe('celTygodniowy', 60_000).ostrzezenie).not.toBeNull();
  });
});

describe('ocenParagon — litry × cena kontra kwota', () => {
  it('48,2 L × 6,48 zł/L ≈ 312,40 zł przechodzi', () => {
    expect(ocenParagon(312.4, 48.2, 6.48)).toEqual(CZYSTO);
  });

  it('dwukrotny rozjazd znaczy, że jedno pole jest z innej linijki', () => {
    expect(ocenParagon(312.4, 96.4, 6.48).ostrzezenie).not.toBeNull();
  });

  it('brak któregokolwiek pola wyłącza sprawdzenie — dwa są opcjonalne', () => {
    expect(ocenParagon(312.4, null, 6.48)).toEqual(CZYSTO);
    expect(ocenParagon(312.4, 48.2, null)).toEqual(CZYSTO);
  });

  it('zera nie dzielą', () => {
    expect(ocenParagon(0, 48.2, 6.48)).toEqual(CZYSTO);
  });
});

describe('ocenZmiane — godziny pracy (§8d)', () => {
  it('normalna zmiana przechodzi', () => {
    expect(ocenZmiane('11:30', '21:15')).toEqual(CZYSTO);
  });

  it('przejście przez północ to nie błąd', () => {
    expect(ocenZmiane('22:00', '02:00')).toEqual(CZYSTO);
  });

  it('10:00 → 09:00 to 23 h — literówka, która psuje stawkę zł/h', () => {
    expect(ocenZmiane('10:00', '09:00').ostrzezenie).not.toBeNull();
  });

  it('pięć minut serwer i tak odrzuci — lepiej ostrzec przed wysłaniem', () => {
    expect(ocenZmiane('12:00', '12:05').ostrzezenie).not.toBeNull();
  });

  it('jedna godzina wystarczy i nie podlega ocenie', () => {
    expect(ocenZmiane('11:30', null)).toEqual(CZYSTO);
    expect(ocenZmiane(null, '21:15')).toEqual(CZYSTO);
  });
});

describe('polacz', () => {
  it('błąd ma pierwszeństwo przed ostrzeżeniem', () => {
    expect(
      polacz({ blad: null, ostrzezenie: 'o' }, { blad: 'b', ostrzezenie: null })
    ).toEqual({ blad: 'b', ostrzezenie: null });
  });

  it('bierze pierwsze niepuste ostrzeżenie', () => {
    expect(polacz(CZYSTO, { blad: null, ostrzezenie: 'o2' })).toEqual({
      blad: null,
      ostrzezenie: 'o2',
    });
  });
});
