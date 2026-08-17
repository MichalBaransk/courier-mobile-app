import { describe, expect, it } from 'vitest';

import {
  dataPoPolsku,
  godziny,
  km,
  krotkaData,
  litry,
  normalizujGodzine,
  poprawnaData,
  przesunDate,
  stawka,
  zl,
  zlZeZnakiem,
} from './format';

/**
 * Formatowanie i normalizacja wejścia.
 *
 * Dwie rzeczy są tu naprawdę ważne, reszta to kosmetyka:
 *
 * 1. **`przesunDate` nie ma prawa zgubić dnia** przy zmianie czasu ani na
 *    przełomie roku. Ta funkcja wyznacza „wczoraj" dla wpisów wstecz i granice
 *    okna odniesienia — pomyłka o jeden dzień jest niewidoczna i trwała.
 * 2. **Żadna funkcja formatująca nie może wypuścić „NaN zł"** na ekran.
 */

describe('przesunDate — arytmetyka dat bez stref', () => {
  it('dzień w przód i w tył', () => {
    expect(przesunDate('2026-08-16', 1)).toBe('2026-08-17');
    expect(przesunDate('2026-08-16', -1)).toBe('2026-08-15');
    expect(przesunDate('2026-08-16', 0)).toBe('2026-08-16');
  });

  it('przechodzi przez granicę miesiąca', () => {
    expect(przesunDate('2026-08-31', 1)).toBe('2026-09-01');
    expect(przesunDate('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('przechodzi przez granicę roku', () => {
    expect(przesunDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(przesunDate('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('rok przestępny', () => {
    expect(przesunDate('2024-02-28', 1)).toBe('2024-02-29');
    expect(przesunDate('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('przez marcową zmianę czasu nie gubi dnia', () => {
    // Ostatnia niedziela marca — z południem UTC w środku ta granica jest
    // nieszkodliwa, ale bez niego wynik potrafi się cofnąć o dobę.
    expect(przesunDate('2026-03-28', 1)).toBe('2026-03-29');
    expect(przesunDate('2026-03-29', 1)).toBe('2026-03-30');
  });

  it('przez październikową zmianę czasu też nie', () => {
    expect(przesunDate('2026-10-24', 1)).toBe('2026-10-25');
    expect(przesunDate('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('okno 30 dni wstecz', () => {
    expect(przesunDate('2026-08-16', -29)).toBe('2026-07-18');
  });
});

describe('normalizujGodzine — skróty z palca', () => {
  it('sama godzina znaczy pełną godzinę', () => {
    expect(normalizujGodzine('9')).toBe('09:00');
    expect(normalizujGodzine('21')).toBe('21:00');
    expect(normalizujGodzine('0')).toBe('00:00');
  });

  it('trzy i cztery cyfry to godzina z minutami', () => {
    expect(normalizujGodzine('930')).toBe('09:30');
    expect(normalizujGodzine('0930')).toBe('09:30');
    expect(normalizujGodzine('2115')).toBe('21:15');
  });

  it('kropka i przecinek znaczą to samo co dwukropek', () => {
    expect(normalizujGodzine('9:30')).toBe('09:30');
    expect(normalizujGodzine('9.30')).toBe('09:30');
    expect(normalizujGodzine('9,30')).toBe('09:30');
  });

  it('obcina białe znaki', () => {
    expect(normalizujGodzine('  11:30  ')).toBe('11:30');
  });

  it('odrzuca to, czego nie da się odczytać', () => {
    expect(normalizujGodzine('')).toBeNull();
    expect(normalizujGodzine('   ')).toBeNull();
    expect(normalizujGodzine('rano')).toBeNull();
    expect(normalizujGodzine('9:3')).toBeNull();
  });

  it('odrzuca godziny i minuty spoza zakresu', () => {
    expect(normalizujGodzine('24')).toBeNull();
    expect(normalizujGodzine('25:00')).toBeNull();
    expect(normalizujGodzine('12:60')).toBeNull();
    expect(normalizujGodzine('1270')).toBeNull();
  });
});

describe('poprawnaData — ten sam warunek co isValidDateStr na serwerze', () => {
  it('przepuszcza istniejące daty', () => {
    expect(poprawnaData('2026-08-16')).toBe(true);
    expect(poprawnaData('2024-02-29')).toBe(true);
  });

  it('odrzuca daty, które nie istnieją', () => {
    expect(poprawnaData('2026-02-30')).toBe(false);
    expect(poprawnaData('2026-13-01')).toBe(false);
    expect(poprawnaData('2026-02-29')).toBe(false);
  });

  it('odrzuca zły format', () => {
    expect(poprawnaData('16-08-2026')).toBe(false);
    expect(poprawnaData('2026-8-16')).toBe(false);
    expect(poprawnaData('')).toBe(false);
  });
});

describe('formatowanie liczb — przecinek i żadnego NaN', () => {
  it('złotówki, kilometry, godziny, litry, stawka', () => {
    expect(zl(1234.5)).toBe('1234,50 zł');
    expect(zlZeZnakiem(12)).toBe('+12,00 zł');
    expect(zlZeZnakiem(-8.5)).toBe('-8,50 zł');
    expect(zlZeZnakiem(0)).toBe('0,00 zł');
    expect(km(142.3)).toBe('142,3 km');
    expect(godziny(9.75)).toBe('9,75 h');
    expect(litry(48.2)).toBe('48,20 L');
    expect(stawka(2.8149)).toBe('2,81');
  });

  it('zaokrąglanie idzie przez toFixed, ze wszystkim, co z tego wynika', () => {
    // `(142.35).toFixed(1)` daje „142.3", nie „142.4" — 142,35 nie ma dokładnej
    // reprezentacji binarnej i naprawdę jest odrobinę mniejsze. To NIE jest błąd
    // do naprawienia: przy kwotach kuriera różnica jest niewidoczna, a każda
    // „poprawka" (mnożenie, Math.round) wprowadza własne dziwactwa.
    // Test jest tu po to, żeby nikt tego nie „naprawiał" w dobrej wierze.
    expect(km(142.35)).toBe('142,3 km');
    expect(zl(0.005)).toBe('0,01 zł');
    expect(zl(1.005)).toBe('1,00 zł');
  });

  it('NaN i nieskończoność dają myślnik, nie „NaN zł"', () => {
    expect(zl(NaN)).toBe('—');
    expect(zl(Infinity)).toBe('—');
    expect(zlZeZnakiem(NaN)).toBe('—');
    expect(km(NaN)).toBe('—');
    expect(godziny(Infinity)).toBe('—');
    expect(litry(NaN)).toBe('—');
    expect(stawka(NaN)).toBe('—');
  });

  it('brak wartości też daje myślnik', () => {
    expect(zl(null)).toBe('—');
    expect(km(null)).toBe('—');
    expect(km(undefined)).toBe('—');
  });
});

describe('daty po polsku', () => {
  it('tylko pierwsza litera z wielkiej — miesiące piszemy z małej', () => {
    // `textTransform: 'capitalize'` w stylach robiło z tego „16 Sierpnia".
    expect(dataPoPolsku('2026-08-16')).toBe('Niedziela, 16 sierpnia');
    expect(dataPoPolsku('2026-08-10')).toBe('Poniedziałek, 10 sierpnia');
  });

  it('krótka etykieta na przycisk', () => {
    expect(krotkaData('2026-08-15')).toBe('sob 15 sie');
  });

  it('niepoprawne wejście wraca bez zmian, zamiast wywalać renderowanie', () => {
    expect(dataPoPolsku('bzdura')).toBe('bzdura');
    expect(krotkaData('bzdura')).toBe('bzdura');
  });
});
