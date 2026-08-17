import { describe, expect, it } from 'vitest';

import {
  dniZakresu,
  dzienTygodnia,
  etykietaTygodnia,
  nazwaMiesiaca,
  numerTygodniaISO,
  poniedzialek,
  przyszloscZablokowana,
  zakresMiesiaca,
  zakresTygodnia,
} from './okresy';

/**
 * Zakresy dat — arytmetyka na łańcuchach `RRRR-MM-DD`, bez stref czasowych.
 *
 * Najważniejszy jest tu **przełom roku**. `earning_targets.year` dla celów
 * tygodniowych trzyma ROK ISO, nie kalendarzowy (§8e): cel zapisany 30 grudnia
 * i odczytany 2 stycznia musi trafić pod ten sam klucz. Pomyłka w tym miejscu
 * nie wywala niczego — po prostu w Sylwestra cel po cichu znika.
 */

describe('poniedzialek — tydzień ISO, nie niedzielny', () => {
  it('niedziela należy do tygodnia, który zaczął się sześć dni wcześniej', () => {
    expect(poniedzialek('2026-08-16')).toBe('2026-08-10');
  });

  it('poniedziałek jest sam dla siebie', () => {
    expect(poniedzialek('2026-08-10')).toBe('2026-08-10');
  });

  it('działa wstecz przez granicę miesiąca', () => {
    expect(poniedzialek('2026-08-01')).toBe('2026-07-27');
  });
});

describe('zakresTygodnia', () => {
  it('poniedziałek – niedziela', () => {
    expect(zakresTygodnia('2026-08-16')).toEqual({ od: '2026-08-10', do: '2026-08-16' });
  });
});

describe('zakresMiesiaca — ostatni dzień liczony, nie zgadywany', () => {
  it('sierpień ma 31 dni', () => {
    expect(zakresMiesiaca('2026-08-16')).toEqual({ od: '2026-08-01', do: '2026-08-31' });
  });

  it('luty w roku zwykłym ma 28', () => {
    expect(zakresMiesiaca('2026-02-10').do).toBe('2026-02-28');
  });

  it('luty w roku przestępnym ma 29', () => {
    expect(zakresMiesiaca('2024-02-10').do).toBe('2024-02-29');
  });

  it('grudzień nie przewija się na styczeń następnego roku', () => {
    // `new Date(rok, 12, 0)` to najczęstsze miejsce, w którym takie liczenie się psuje.
    expect(zakresMiesiaca('2026-12-05')).toEqual({ od: '2026-12-01', do: '2026-12-31' });
  });
});

describe('numerTygodniaISO — przełom roku (§8e)', () => {
  it('1 stycznia 2026 (czwartek) to tydzień 1', () => {
    expect(numerTygodniaISO('2026-01-01')).toBe(1);
  });

  it('31 grudnia 2025 (środa) należy do tego samego tygodnia ISO co 1 stycznia', () => {
    expect(numerTygodniaISO('2025-12-31')).toBe(numerTygodniaISO('2026-01-01'));
  });

  it('1 stycznia 2027 (piątek) to nadal tydzień 53 roku 2026', () => {
    expect(numerTygodniaISO('2027-01-01')).toBe(53);
  });

  it('4 stycznia 2027 (poniedziałek) zaczyna tydzień 1', () => {
    expect(numerTygodniaISO('2027-01-04')).toBe(1);
  });

  it('cały tydzień ma ten sam numer', () => {
    const numery = dniZakresu(zakresTygodnia('2026-08-16')).map(numerTygodniaISO);
    expect(new Set(numery).size).toBe(1);
  });
});

describe('dzienTygodnia — 1 = poniedziałek, 7 = niedziela', () => {
  it('poniedziałek to 1', () => {
    expect(dzienTygodnia('2026-08-10')).toBe(1);
  });

  it('niedziela to 7, nie 0', () => {
    // `getUTCDay()` zwraca dla niedzieli zero — bez korekty kalendarz
    // przesunąłby się o cały wiersz.
    expect(dzienTygodnia('2026-08-16')).toBe(7);
  });
});

describe('dniZakresu', () => {
  it('zwraca wszystkie dni, z obiema granicami włącznie', () => {
    const dni = dniZakresu({ od: '2026-08-10', do: '2026-08-16' });
    expect(dni).toHaveLength(7);
    expect(dni[0]).toBe('2026-08-10');
    expect(dni[6]).toBe('2026-08-16');
  });

  it('zakres jednodniowy daje jeden dzień', () => {
    expect(dniZakresu({ od: '2026-08-16', do: '2026-08-16' })).toEqual(['2026-08-16']);
  });

  it('zakres odwrócony daje pustkę zamiast pętli w nieskończoność', () => {
    expect(dniZakresu({ od: '2026-08-16', do: '2026-08-10' })).toEqual([]);
  });

  it('pełny miesiąc', () => {
    expect(dniZakresu(zakresMiesiaca('2026-08-01'))).toHaveLength(31);
  });
});

describe('etykiety po polsku', () => {
  it('nazwa miesiąca w mianowniku', () => {
    expect(nazwaMiesiaca('2026-08-16')).toBe('sierpień 2026');
  });

  it('tydzień w jednym miesiącu — dopełniacz', () => {
    expect(etykietaTygodnia('2026-08-16')).toBe('10–16 sierpnia');
  });

  it('tydzień na przełomie miesięcy — skróty po obu stronach', () => {
    expect(etykietaTygodnia('2026-08-01')).toBe('27 lip – 2 sie');
  });
});

describe('przyszloscZablokowana — porównujemy POCZĄTKI okresów', () => {
  const DZIS = '2026-08-16';

  it('dzień: dzisiaj to koniec drogi', () => {
    expect(przyszloscZablokowana('dzien', DZIS, DZIS)).toBe(true);
    expect(przyszloscZablokowana('dzien', '2026-08-15', DZIS)).toBe(false);
  });

  it('tydzień: bieżący tydzień kończy się w przyszłości i to NIE ma go blokować', () => {
    // Porównanie po dacie końcowej odcięłoby bieżący tydzień — 16 sierpnia
    // to niedziela, więc tydzień kończy się tego samego dnia, ale w innych
    // dniach tygodnia kończyłby się już po dzisiaj.
    expect(przyszloscZablokowana('tydzien', DZIS, DZIS)).toBe(true);
    expect(przyszloscZablokowana('tydzien', '2026-08-12', '2026-08-12')).toBe(true);
    expect(przyszloscZablokowana('tydzien', '2026-08-05', '2026-08-12')).toBe(false);
  });

  it('miesiąc: bieżący miesiąc jest ostatnim dostępnym', () => {
    expect(przyszloscZablokowana('miesiac', DZIS, DZIS)).toBe(true);
    expect(przyszloscZablokowana('miesiac', '2026-07-01', DZIS)).toBe(false);
  });
});
