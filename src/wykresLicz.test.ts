import { describe, expect, it } from 'vitest';

import {
  histogramStawek,
  linieSiatki,
  narastajaco,
  naY,
  ofertyWgGodziny,
  ktoreEtykiety,
  przytnijPuste,
  podzialDecyzji,
  polozenieKosza,
  profilTygodnia,
  sciezkaLamanej,
  seriaDni,
  zakresZDanymi,
  zakresOsi,
} from './wykresLicz';
import type { CourseOfferItem, DailyTotals } from './types';

const dzien = (p: Partial<DailyTotals> & { date: string }): DailyTotals => ({
  grossEarnings: 0,
  netEarnings: 0,
  cashTipsTotal: 0,
  totalNetto: 0,
  workHours: 0,
  hourlyRateNetto: 0,
  distanceKm: 0,
  fuelCost: 0,
  ...p,
});

const oferta = (p: Partial<CourseOfferItem>): CourseOfferItem => ({
  id: 1,
  date: '2026-08-10',
  time: '12:00:00',
  grossAmount: 20,
  netAmount: 16.28,
  appTotalKm: 6,
  mapsTotalKm: null,
  distanceTotalKm: 6,
  rateBasis: 'APP',
  netRatePerKm: 2.71,
  isProfitable: true,
  status: 'PENDING',
  pickupAddress: null,
  deliveryAddress: null,
  ...p,
});

/* ========================================================================== */

describe('zakresOsi — skala, która nie znika', () => {
  it('pusta lista nie daje -Infinity', () => {
    // `Math.max()` bez argumentów zwraca -Infinity i cały wykres robi się NaN.
    expect(zakresOsi([])).toEqual({ min: 0, max: 1 });
  });

  it('NaN i null wypadają, reszta zostaje', () => {
    expect(zakresOsi([10, NaN, null, 30, undefined])).toEqual({ min: 0, max: 30 });
  });

  it('same zera dostają sztuczną wysokość — bez dzielenia przez zero', () => {
    expect(zakresOsi([0, 0, 0])).toEqual({ min: 0, max: 1 });
  });

  it('dół osi to ZERO przy dodatnich wartościach', () => {
    // Gdyby dół szedł od minimum, różnica 100 → 110 wyglądałaby jak kilkukrotność.
    expect(zakresOsi([100, 105, 110])).toEqual({ min: 0, max: 110 });
  });

  it('wartości ujemne mieszczą się w osi', () => {
    expect(zakresOsi([-40, 10])).toEqual({ min: -40, max: 10 });
  });
});

describe('naY — oś SVG rośnie w DÓŁ', () => {
  const os = { min: 0, max: 100 };

  it('największa wartość ma najmniejszy y', () => {
    expect(naY(100, os, 200)).toBe(0);
  });

  it('zero leży na dole wykresu', () => {
    expect(naY(0, os, 200)).toBe(200);
  });

  it('połowa leży w połowie', () => {
    expect(naY(50, os, 200)).toBe(100);
  });

  it('zerowa rozpiętość nie dzieli przez zero', () => {
    expect(naY(5, { min: 5, max: 5 }, 200)).toBe(200);
  });
});

describe('linieSiatki — liczby, które człowiek czyta bez zatrzymania', () => {
  it('okrągły krok zamiast dzielenia zakresu na równo', () => {
    // 100/4 = 25, a 25 nie należy do rodziny 1-2-5 — krok schodzi do 20.
    expect(linieSiatki({ min: 0, max: 100 }, 4)).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('zakres 0–37 dostaje krok 10, a nie 9.25', () => {
    expect(linieSiatki({ min: 0, max: 37 }, 4)).toEqual([0, 10, 20, 30]);
  });

  it('małe wartości dostają ułamkowy krok bez ogonów zmiennoprzecinkowych', () => {
    const linie = linieSiatki({ min: 0, max: 3 }, 4);
    expect(linie).toEqual([0, 1, 2, 3]);
    for (const v of linie) expect(Number.isFinite(v)).toBe(true);
  });

  it('zerowa rozpiętość zwraca jedną linię zamiast pętli w nieskończoność', () => {
    expect(linieSiatki({ min: 4, max: 4 })).toEqual([4]);
  });
});

/* ========================================================================== */

describe('seriaDni — dziura w danych zostaje dziurą', () => {
  const zakres = { od: '2026-08-01', do: '2026-08-05' };

  it('każdy dzień zakresu ma swój punkt, także ten bez danych', () => {
    const seria = seriaDni([dzien({ date: '2026-08-03', totalNetto: 120 })], zakres, 'netto');
    expect(seria).toHaveLength(5);
    expect(seria.map((p) => p.wartosc)).toEqual([null, null, 120, null, null]);
  });

  it('stawka bez godzin to null, a NIE zero zł/h', () => {
    // Zero na wykresie stawki czyta się jak „pracował za darmo".
    const seria = seriaDni(
      [dzien({ date: '2026-08-01', totalNetto: 200, workHours: 0 })],
      { od: '2026-08-01', do: '2026-08-01' },
      'zlH'
    );
    expect(seria[0]?.wartosc).toBeNull();
  });

  it('stawka liczy się z netto i godzin, nie z pola serwera', () => {
    const seria = seriaDni(
      [dzien({ date: '2026-08-01', totalNetto: 200, workHours: 8, hourlyRateNetto: 999 })],
      { od: '2026-08-01', do: '2026-08-01' },
      'zlH'
    );
    expect(seria[0]?.wartosc).toBe(25);
  });
});

describe('narastajaco', () => {
  it('dzień bez danych nie przerywa linii — suma stoi w miejscu', () => {
    const seria = narastajaco([
      { data: '2026-08-01', wartosc: 100 },
      { data: '2026-08-02', wartosc: null },
      { data: '2026-08-03', wartosc: 50 },
    ]);
    expect(seria.map((p) => p.wartosc)).toEqual([100, 100, 150]);
  });

  it('nie zostawia ogonów zmiennoprzecinkowych', () => {
    const seria = narastajaco([
      { data: '2026-08-01', wartosc: 0.1 },
      { data: '2026-08-02', wartosc: 0.2 },
    ]);
    expect(seria[1]?.wartosc).toBe(0.3);
  });
});

/* ========================================================================== */

describe('profilTygodnia', () => {
  // 2026-08-10 to poniedziałek, 2026-08-15 to sobota.
  const dni = [
    dzien({ date: '2026-08-10', totalNetto: 100, workHours: 1 }),
    dzien({ date: '2026-08-17', totalNetto: 250, workHours: 10 }),
    dzien({ date: '2026-08-15', totalNetto: 300, workHours: 10 }),
  ];

  it('średnia zł/h jest WAŻONA godzinami, nie średnią ze stawek dziennych', () => {
    // Arytmetyczna dałaby (100/1 + 250/10) / 2 = 62.5 zł/h — godzina po 100 zł
    // ważyłaby tyle samo, co dziesięć godzin po 25.
    const pon = profilTygodnia(dni)[0]!;
    expect(pon.ile).toBe(2);
    expect(pon.sredniaZlH).toBe(31.82); // 350 / 11
    expect(pon.sredniNetto).toBe(175);
  });

  it('dni bez pracy nie ciągną średniej w dół', () => {
    const zWolnym = [...dni, dzien({ date: '2026-08-24' })];
    expect(profilTygodnia(zWolnym)[0]?.ile).toBe(2);
  });

  it('sobota trafia pod indeks 5, niedziela pod 6', () => {
    const profil = profilTygodnia(dni);
    expect(profil[5]?.sredniNetto).toBe(300);
    expect(profil[6]?.ile).toBe(0);
    expect(profil[6]?.sredniaZlH).toBeNull();
  });

  it('zawsze siedem kubełków, także dla pustych danych', () => {
    expect(profilTygodnia([])).toHaveLength(7);
  });
});

/* ========================================================================== */

describe('histogramStawek', () => {
  it('oferty bez dystansu nie tworzą kosza przy zerze', () => {
    const kosze = histogramStawek([
      oferta({ id: 1, netRatePerKm: 2.7 }),
      oferta({ id: 2, netRatePerKm: 0, rateBasis: 'NONE' }),
    ]);
    expect(kosze.reduce((s, k) => s + k.ile, 0)).toBe(1);
  });

  it('najlepsza oferta mieści się w OSTATNIM koszu, nie wypada z wykresu', () => {
    const kosze = histogramStawek([oferta({ netRatePerKm: 3 })], 0.5);
    expect(kosze.at(-1)?.ile).toBe(1);
    expect(kosze.reduce((s, k) => s + k.ile, 0)).toBe(1);
  });

  it('wartość na granicy idzie do kosza wyższego', () => {
    const kosze = histogramStawek(
      [oferta({ id: 1, netRatePerKm: 1 }), oferta({ id: 2, netRatePerKm: 1.4 })],
      0.5
    );
    expect(kosze[2]?.od).toBe(1);
    expect(kosze[2]?.ile).toBe(2);
    expect(kosze[1]?.ile).toBe(0);
  });

  it('brak ofert to pusta lista, nie wykres z jednym pustym koszem', () => {
    expect(histogramStawek([])).toEqual([]);
  });
});

describe('ofertyWgGodziny', () => {
  it('godzina bierze się z pola `time`, nie z zegara telefonu', () => {
    const kosze = ofertyWgGodziny([oferta({ time: '18:45:00' })]);
    expect(kosze[18]?.ile).toBe(1);
    expect(kosze[0]?.ile).toBe(0);
  });

  it('niepoprawna godzina jest POMIJANA, nie wrzucana do północy', () => {
    // Nieprawdziwa północ zafałszowałaby dokładnie ten wykres.
    const kosze = ofertyWgGodziny([oferta({ time: '' }), oferta({ time: '99:00' })]);
    expect(kosze.reduce((s, k) => s + k.ile, 0)).toBe(0);
  });

  it('średnia stawka pomija oferty bez dystansu, ale liczy je do sztuk', () => {
    const kosze = ofertyWgGodziny([
      oferta({ time: '12:00:00', netRatePerKm: 3 }),
      oferta({ time: '12:30:00', netRatePerKm: 0, rateBasis: 'NONE' }),
    ]);
    expect(kosze[12]?.ile).toBe(2);
    expect(kosze[12]?.sredniaStawka).toBe(3);
  });

  it('zawsze 24 kubełki', () => {
    expect(ofertyWgGodziny([])).toHaveLength(24);
  });
});

describe('podzialDecyzji', () => {
  it('PENDING to osobna kategoria, nie odrzucone', () => {
    const p = podzialDecyzji([
      oferta({ id: 1, status: 'ACCEPTED' }),
      oferta({ id: 2, status: 'REJECTED' }),
      oferta({ id: 3, status: 'PENDING' }),
      oferta({ id: 4, status: 'PENDING' }),
    ]);
    expect(p).toEqual({ przyjete: 1, odrzucone: 1, bezDecyzji: 2 });
  });

  it('suma zawsze zgadza się z liczbą ofert', () => {
    const oferty = [oferta({ id: 1, status: 'ACCEPTED' }), oferta({ id: 2, status: 'COS_INNEGO' })];
    const p = podzialDecyzji(oferty);
    expect(p.przyjete + p.odrzucone + p.bezDecyzji).toBe(oferty.length);
  });
});

describe('sciezkaLamanej — dziura przerywa linię', () => {
  const os = { min: 0, max: 100 };
  const uklad = { lewy: 0, gorny: 0, wysokosc: 100 };
  const p = (data: string, wartosc: number | null) => ({ data, wartosc });

  it('brak danych zaczyna NOWY odcinek, a nie łączy przez dziurę', () => {
    // Połączenie czwartku z sobotą jedną kreską rysuje trend przez piątek,
    // którego nikt nie zmierzył — i wygląda przy tym zupełnie normalnie.
    const d = sciezkaLamanej([p('a', 50), p('b', null), p('c', 50)], os, 10, uklad);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/L/g)).toBeNull();
  });

  it('ciągła seria to jeden M i reszta L', () => {
    const d = sciezkaLamanej([p('a', 10), p('b', 20), p('c', 30)], os, 10, uklad);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.match(/L/g)).toHaveLength(2);
  });

  it('same dziury dają pustą ścieżkę, a nie „M NaN NaN"', () => {
    expect(sciezkaLamanej([p('a', null), p('b', null)], os, 10, uklad)).toBe('');
  });

  it('wartość maksymalna ląduje na górze obszaru', () => {
    expect(sciezkaLamanej([p('a', 100)], os, 10, uklad)).toBe('M5.0 0.0');
  });
});

describe('polozenieKosza — próg opłacalności', () => {
  it('kosz w całości nad progiem', () => {
    expect(polozenieKosza(2.5, 3, 2.3)).toBe('nad');
  });

  it('kosz w całości pod progiem', () => {
    expect(polozenieKosza(1.5, 2, 2.3)).toBe('pod');
  });

  it('kosz przecięty progiem to OSOBNA kategoria, nie „nad"', () => {
    // 2,00-2,50 przy progu 2,30 zawiera i kursy do wzięcia, i do odrzucenia.
    expect(polozenieKosza(2, 2.5, 2.3)).toBe('przeciety');
  });

  it('kosz kończący się DOKŁADNIE na progu jest pod nim', () => {
    // Próg to minimum, więc stawka równa progowi jest jeszcze do przyjęcia —
    // ale górna granica kosza jest wyłączna, więc nic z niego progu nie sięga.
    expect(polozenieKosza(1.8, 2.3, 2.3)).toBe('pod');
  });

  it('kosz zaczynający się DOKŁADNIE na progu jest nad nim', () => {
    expect(polozenieKosza(2.3, 2.8, 2.3)).toBe('nad');
  });

  it('bez znanego progu nie malujemy na czerwono', () => {
    expect(polozenieKosza(0, 0.5, null)).toBe('nad');
  });
});

describe("seriaDni 'zlKm' — dzień bez kilometrów nie ma stawki", () => {
  const zakres = { od: '2026-08-01', do: '2026-08-02' };

  it('liczy netto na kilometr', () => {
    const dni = [dzien({ date: '2026-08-01', totalNetto: 100, distanceKm: 50 })];
    expect(seriaDni(dni, zakres, 'zlKm')[0]?.wartosc).toBe(2);
  });

  it('zero kilometrów daje null, a NIE zero', () => {
    // Zero czytałoby się na wykresie jak „jechał za darmo".
    const dni = [dzien({ date: '2026-08-01', totalNetto: 100, distanceKm: 0 })];
    expect(seriaDni(dni, zakres, 'zlKm')[0]?.wartosc).toBeNull();
  });
});

describe('ktoreEtykiety — podpisy osi się nie zlewają', () => {
  it('przy 31 dniach nie podpisuje 30 i 31 obok siebie', () => {
    // To był realny błąd na ekranie: wyszło z tego „3031".
    const e = ktoreEtykiety(31);
    expect(e.has(30)).toBe(true);
    expect(e.has(29)).toBe(false);
  });

  it('zawsze podpisuje pierwszą i ostatnią pozycję', () => {
    for (const ile of [28, 29, 30, 31]) {
      const e = ktoreEtykiety(ile);
      expect(e.has(0)).toBe(true);
      expect(e.has(ile - 1)).toBe(true);
    }
  });

  it('przy 30 dniach ostatni podpis wypada równo i nic nie ustępuje', () => {
    const e = ktoreEtykiety(30);
    expect([...e].sort((a, b) => a - b)).toEqual([0, 4, 9, 14, 19, 24, 29]);
  });

  it('żadne dwa podpisy nie stoją bliżej niż minimalny odstęp', () => {
    for (const ile of [1, 2, 3, 7, 28, 29, 30, 31]) {
      const kolejne = [...ktoreEtykiety(ile)].sort((a, b) => a - b);
      for (let i = 1; i < kolejne.length; i++) {
        expect(kolejne[i]! - kolejne[i - 1]!).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('pusta seria nie ma podpisów', () => {
    expect(ktoreEtykiety(0).size).toBe(0);
  });
});

describe('zakresZDanymi — oś kończy się tam, gdzie dane', () => {
  const sierpien = { od: '2026-08-01', do: '2026-08-31' };

  it('zawęża 31 dni do tych, w których cokolwiek jest', () => {
    const dni = [
      dzien({ date: '2026-08-10', totalNetto: 100, workHours: 5 }),
      dzien({ date: '2026-08-20', totalNetto: 120, workHours: 6 }),
    ];
    expect(zakresZDanymi(dni, sierpien)).toEqual({ od: '2026-08-10', do: '2026-08-20' });
  });

  it('dzień obecny, ale całkiem pusty, nie rozciąga osi', () => {
    const dni = [
      dzien({ date: '2026-08-02' }),
      dzien({ date: '2026-08-10', totalNetto: 100, workHours: 5 }),
      dzien({ date: '2026-08-11', workHours: 4 }),
      dzien({ date: '2026-08-30' }),
    ];
    // 10 i 11 to dwa dni, więc do minimum siedmiu dobiera się WSTECZ.
    expect(zakresZDanymi(dni, sierpien)).toEqual({ od: '2026-08-05', do: '2026-08-11' });
  });

  it('jeden dzień danych rozciąga się do minimum, WSTECZ', () => {
    // Jeden słupek na całą szerokość ekranu wygląda jak awaria.
    const dni = [dzien({ date: '2026-08-20', totalNetto: 100 })];
    const z = zakresZDanymi(dni, sierpien);
    expect(z).toEqual({ od: '2026-08-14', do: '2026-08-20' });
  });

  it('przy początku miesiąca dobiera do przodu, bo wstecz nie ma dokąd', () => {
    const dni = [dzien({ date: '2026-08-02', totalNetto: 100 })];
    expect(zakresZDanymi(dni, sierpien)).toEqual({ od: '2026-08-01', do: '2026-08-07' });
  });

  it('brak jakichkolwiek danych zostawia pełny miesiąc', () => {
    expect(zakresZDanymi([], sierpien)).toEqual(sierpien);
  });

  it('dni spoza oglądanego miesiąca nie rozciągają osi', () => {
    const dni = [
      dzien({ date: '2026-07-15', totalNetto: 999 }),
      dzien({ date: '2026-08-10', totalNetto: 100 }),
      dzien({ date: '2026-08-12', totalNetto: 100 }),
    ];
    expect(zakresZDanymi(dni, sierpien).od).toBe('2026-08-06');
  });
});

describe('przytnijPuste — puste końce lecą, dziury w środku zostają', () => {
  const puste = (n: number | null) => n === null;

  it('obcina z obu końców', () => {
    expect(przytnijPuste([null, null, 1, 2, null], puste)).toEqual([1, 2]);
  });

  it('dziurę w ŚRODKU zostawia — to informacja, nie brak', () => {
    expect(przytnijPuste([null, 1, null, 2, null], puste)).toEqual([1, null, 2]);
  });

  it('same puste dają pustą tablicę, a nie wyjątek', () => {
    expect(przytnijPuste([null, null], puste)).toEqual([]);
  });

  it('nic do obcięcia zwraca to samo', () => {
    expect(przytnijPuste([1, 2, 3], puste)).toEqual([1, 2, 3]);
  });
});
