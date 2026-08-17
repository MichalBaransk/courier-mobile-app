import { describe, expect, it } from 'vitest';

import { iloraz, procentUdzialu, procentZmiany, skonczona } from './licz';

/**
 * Te testy pilnują jednej rzeczy: żeby na ekranie NIGDY nie pojawiło się
 * „NaN zł" ani „Infinity zł/km".
 *
 * `0/0` to `NaN`, `5/0` to `Infinity`, a `(0/0).toFixed(2)` renderuje się jako
 * `"NaN"`. Aplikacja wygląda wtedy na zepsutą, choć dane są tylko puste.
 */

describe('iloraz — dzielenie, które nie zwraca NaN ani Infinity', () => {
  it('zero przez zero to brak wyniku, nie NaN', () => {
    expect(iloraz(0, 0)).toBeNull();
  });

  it('dzielenie przez zero to brak wyniku, nie Infinity', () => {
    expect(iloraz(5, 0)).toBeNull();
    expect(iloraz(-5, 0)).toBeNull();
  });

  it('nieskończoności na wejściu też dają null', () => {
    expect(iloraz(NaN, 2)).toBeNull();
    expect(iloraz(2, Infinity)).toBeNull();
    expect(iloraz(Infinity, 2)).toBeNull();
  });

  it('normalne dzielenie działa normalnie', () => {
    expect(iloraz(10, 4)).toBe(2.5);
    expect(iloraz(-10, 4)).toBe(-2.5);
  });
});

describe('procentZmiany', () => {
  it('podstawa zerowa daje null — wzrost z zera nie ma miary procentowej', () => {
    expect(procentZmiany(100, 0)).toBeNull();
    expect(procentZmiany(0, 0)).toBeNull();
  });

  it('liczy wzrost i spadek', () => {
    expect(procentZmiany(120, 100)).toBe(20);
    expect(procentZmiany(80, 100)).toBe(-20);
  });

  it('przy ujemnej podstawie znak nadal znaczy „w górę / w dół"', () => {
    expect(procentZmiany(-50, -100)).toBe(50);
  });
});

describe('procentUdzialu — szerokość paska postępu', () => {
  it('liczy udział', () => {
    expect(procentUdzialu(50, 200)).toBe(25);
  });

  it('przycina do 0–100, bo width: "-40%" cicho psuje układ', () => {
    expect(procentUdzialu(300, 100)).toBe(100);
    expect(procentUdzialu(-50, 100)).toBe(0);
  });

  it('dzielenie przez zero daje 0, a nie NaN', () => {
    expect(procentUdzialu(50, 0)).toBe(0);
  });
});

describe('skonczona', () => {
  it('odsiewa to, czego nie da się pokazać', () => {
    expect(skonczona(NaN)).toBeNull();
    expect(skonczona(Infinity)).toBeNull();
    expect(skonczona(-Infinity)).toBeNull();
    expect(skonczona(null)).toBeNull();
    expect(skonczona(undefined)).toBeNull();
  });

  it('zero przepuszcza — zero to konkretna informacja, nie brak informacji', () => {
    expect(skonczona(0)).toBe(0);
  });
});
