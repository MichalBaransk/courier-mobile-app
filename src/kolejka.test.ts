import { describe, expect, it } from 'vitest';

import {
  dodaj,
  ileZablokowanych,
  LIMIT_KOLEJKI,
  MAKS_PROB,
  nastepny,
  nowyKlucz,
  oznaczOdrzucony,
  podzielWygasle,
  poNieudanej,
  ponowWszystkie,
  toBrakSieci,
  usunPoWyslaniu,
  usunRecznie,
  type WpisKolejki,
} from './kolejka';

/**
 * To jest jedyny plik w aplikacji, którego błąd kosztuje UTRATĘ DANYCH kuriera.
 * Stąd tak dużo testów jak na tak mało kodu.
 */

/** Stała chwila, żeby testy nie zależały od zegara. */
const T0 = 1_755_300_000_000;

function pelnaKolejka(): WpisKolejki[] {
  let k: WpisKolejki[] = [];
  for (let i = 0; i < LIMIT_KOLEJKI; i++) {
    const r = dodaj(
      k,
      { endpoint: '/api/v1/napiwek', cialo: { kwota: i + 1 }, opis: `n${i}`, data: '2026-08-16' },
      T0 + i
    );
    if (r.ok) k = r.kolejka;
  }
  return k;
}

describe('dodaj — data zamrożona w chwili dodania (pułapka północy)', () => {
  it('data trafia do ciała, nie zostaje na później', () => {
    const r = dodaj(
      [],
      { endpoint: '/api/v1/napiwek', cialo: { kwota: 5.5 }, opis: 'napiwek', data: '2026-08-16' },
      T0
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cialo = JSON.parse(r.kolejka[0]!.cialo) as { data: string; kwota: number };
    expect(cialo.data).toBe('2026-08-16');
    expect(cialo.kwota).toBe(5.5);
  });

  it('bez daty ODMAWIA zamiast wysłać null', () => {
    // `null` znaczy „dzisiaj według serwera W MOMENCIE WYSYŁKI". Wpis dodany
    // o 23:50 i wysłany o 00:10 wylądowałby w następnej dobie.
    const r = dodaj(
      [],
      { endpoint: '/api/v1/napiwek', cialo: { kwota: 5 }, opis: 'x', data: null },
      T0
    );
    expect(r.ok).toBe(false);
  });

  it('odrzuca datę w złym formacie', () => {
    const r = dodaj(
      [],
      { endpoint: '/api/v1/napiwek', cialo: { kwota: 5 }, opis: 'x', data: '16.08.2026' },
      T0
    );
    expect(r.ok).toBe(false);
  });

  it('cel nie dotyczy konkretnego dnia — tam brak daty jest poprawny', () => {
    const r = dodaj(
      [],
      { endpoint: '/api/v1/cel', cialo: { okres: 'MONTHLY', kwota: 6000 }, opis: 'cel', data: null },
      T0
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.parse(r.kolejka[0]!.cialo)).not.toHaveProperty('data');
  });
});

describe('dodaj — klucz z nieudanej próby na żywo', () => {
  it('zostaje ZACHOWANY, bo inaczej powstałby duplikat', () => {
    // Żądanie mogło dojść do serwera, a zginąć dopiero odpowiedź. Ponowienie
    // z tym samym kluczem serwer rozpozna jako powtórkę.
    const r = dodaj(
      [],
      {
        endpoint: '/api/v1/napiwek',
        cialo: { kwota: 5 },
        opis: 'x',
        data: '2026-08-16',
        id: 'k-zywy-12345',
      },
      T0
    );
    expect(r.ok && r.kolejka[0]!.id).toBe('k-zywy-12345');
  });
});

describe('dodaj — limit kolejki', () => {
  it(`mieści dokładnie ${LIMIT_KOLEJKI} wpisów`, () => {
    expect(pelnaKolejka()).toHaveLength(LIMIT_KOLEJKI);
  });

  it('kolejny ODMAWIA zamiast po cichu wyrzucić najstarszy', () => {
    const pelna = pelnaKolejka();
    const r = dodaj(
      pelna,
      { endpoint: '/api/v1/napiwek', cialo: { kwota: 99 }, opis: 'za duzo', data: '2026-08-16' },
      T0
    );
    expect(r.ok).toBe(false);
    expect(pelna[0]!.opis).toBe('n0');
  });
});

describe('nastepny — FIFO, jeden naraz', () => {
  it('bierze najstarszy gotowy', () => {
    expect(nastepny(pelnaKolejka(), T0 + 1000)?.opis).toBe('n0');
  });

  it('wpis odłożony na przyszłość nie jest gotowy', () => {
    const pelna = pelnaKolejka();
    expect(nastepny([pelna[19]!], T0)).toBeNull();
  });
});

describe('poNieudanej — backoff', () => {
  it('pierwsza porażka odsuwa o 5 s i przepuszcza następny wpis', () => {
    const pelna = pelnaKolejka();
    const po = poNieudanej(pelna, pelna[0]!.id, T0);
    expect(po[0]!.prob).toBe(1);
    expect(po[0]!.nastepnaProba).toBe(T0 + 5_000);
    expect(nastepny(po, T0 + 100)?.opis).toBe('n1');
    expect(nastepny([po[0]!], T0 + 5_000)?.opis).toBe('n0');
  });

  it(`po ${MAKS_PROB} próbach wpis czeka na „Ponów", ale NIE znika`, () => {
    const pelna = pelnaKolejka();
    let odbity = pelna;
    for (let i = 0; i < MAKS_PROB; i++) odbity = poNieudanej(odbity, pelna[0]!.id, T0);

    expect(nastepny(odbity, T0 + 10_000_000)?.opis).toBe('n1');
    expect(ileZablokowanych(odbity)).toBe(1);
    expect(odbity).toHaveLength(LIMIT_KOLEJKI);
    expect(nastepny(ponowWszystkie(odbity, T0 + 100), T0 + 100)?.opis).toBe('n0');
  });
});

describe('oznaczOdrzucony — trwały błąd serwera (400)', () => {
  it('wpis zostaje w kolejce z komunikatem i przestaje być ponawiany', () => {
    const pelna = pelnaKolejka();
    const odrz = oznaczOdrzucony(pelna, pelna[0]!.id, 'Pole "kwota" musi być większe od zera.');

    expect(odrz).toHaveLength(LIMIT_KOLEJKI);
    expect(odrz[0]!.blad).toBe('Pole "kwota" musi być większe od zera.');
    expect(nastepny(odrz, T0 + 10_000_000)?.opis).toBe('n1');
    expect(ponowWszystkie(odrz, T0 + 100)[0]!.blad).toBeNull();
  });
});

describe('podzielWygasle — 48 h', () => {
  it('47 h to jeszcze żywy wpis', () => {
    expect(podzielWygasle(pelnaKolejka(), T0 + 47 * 3_600_000).zywe).toHaveLength(LIMIT_KOLEJKI);
  });

  it('49 h to telefon, który leżał w szufladzie', () => {
    const stare = podzielWygasle(pelnaKolejka(), T0 + 49 * 3_600_000);
    expect(stare.wygasle).toHaveLength(LIMIT_KOLEJKI);
    expect(stare.zywe).toHaveLength(0);
  });
});

describe('usuwanie', () => {
  it('po wysłaniu i ręcznie', () => {
    const pelna = pelnaKolejka();
    expect(usunPoWyslaniu(pelna, pelna[0]!.id)).toHaveLength(LIMIT_KOLEJKI - 1);
    expect(usunRecznie(pelna, pelna[3]!.id).some((w) => w.id === pelna[3]!.id)).toBe(false);
  });
});

describe('toBrakSieci', () => {
  it('null znaczy „nie doszło do serwera" — to kolejkujemy', () => {
    expect(toBrakSieci(null)).toBe(true);
  });

  it('każda odpowiedź serwera znaczy, że sieć DZIAŁA', () => {
    // Kolejkowanie żądania odrzuconego przez serwer powtarzałoby ten sam
    // błąd w nieskończoność.
    expect(toBrakSieci(400)).toBe(false);
    expect(toBrakSieci(500)).toBe(false);
  });
});

describe('nowyKlucz', () => {
  it('5000 kluczy w tej samej milisekundzie — zero kolizji', () => {
    const klucze = new Set<string>();
    for (let i = 0; i < 5000; i++) klucze.add(nowyKlucz(T0));
    expect(klucze.size).toBe(5000);
  });

  it('znaki bezpieczne jako nazwa klucza w SecureStore', () => {
    // Nazwa musi być alfanumeryczna — cokolwiek innego rzuca wyjątkiem przy
    // odczycie, czyli kosztuje CAŁĄ kolejkę.
    for (let i = 0; i < 100; i++) {
      expect(nowyKlucz(T0 + i)).toMatch(/^[A-Za-z0-9._-]{1,64}$/);
    }
  });
});
