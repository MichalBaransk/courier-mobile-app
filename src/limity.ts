/**
 * Rozsądek wpisu — dwie warstwy zamiast jednej.
 *
 * Serwer ma własne limity (`schemas.ts`: napiwek ≤ 10 000, dystans ≤ 2 000,
 * brutto ≤ 100 000) i one zostają jedynym twardym prawem. Są jednak celowo
 * luźne, żeby nie blokować nietypowego, ale prawdziwego dnia. Skutek: literówka
 * przechodzi bez mrugnięcia. `45,50` wpisane bez przecinka to `4550` — kwota
 * całkowicie legalna dla serwera i całkowicie absurdalna dla kuriera. Wpada do
 * bazy, zawyża miesiąc, psuje średnią stawkę i postęp celu, a znaleźć ją potem
 * można tylko ręcznie.
 *
 * Dlatego są tu DWA progi:
 *
 * - `blad` — wartość, której nie ma sensu wysyłać. Zero, liczba ujemna, `NaN`,
 *   albo powyżej limitu serwera. Formularz jej nie puszcza.
 * - `ostrzezenie` — wartość dopuszczalna, ale nietypowa. Formularz pokazuje,
 *   co go dziwi, i czeka na DRUGIE dotknięcie „Zapisz". Ten sam mechanizm, co
 *   przy nadpisywaniu wpisu — użytkownik może mieć rację i musi mieć jak
 *   postawić na swoim.
 *
 * Progi „rozsądku" biorą się z realiów kuriera na motocyklu w polskim mieście,
 * nie z żadnego przepisu. Gdy któryś zacznie przeszkadzać — zmień go tutaj,
 * to jedyne miejsce, które o nich wie.
 */

export interface Ocena {
  /** Twardy błąd — zapis się nie odbędzie. */
  blad: string | null;
  /** Nietypowa wartość — zapis po potwierdzeniu. */
  ostrzezenie: string | null;
}

const CZYSTO: Ocena = { blad: null, ostrzezenie: null };

/** Formatowanie liczby w komunikacie — po polsku, z przecinkiem. */
function pl(v: number): string {
  return (Number.isInteger(v) ? String(v) : v.toFixed(2)).replace('.', ',');
}

interface Prog {
  /** Limit serwera — powyżej tego żądanie i tak wróci z 400. */
  maks: number;
  /** Czy zero jest dozwolone (brutto pozwala wyzerować pomyłkę). */
  zeroOk?: boolean;
  /** Górna granica „normalności". Powyżej — ostrzeżenie. */
  rozsadneDo: number;
  /** Dolna granica „normalności". Poniżej — ostrzeżenie. */
  rozsadneOd?: number;
  jednostka: string;
  nazwa: string;
}

const PROGI = {
  napiwek: { maks: 10_000, rozsadneDo: 100, jednostka: 'zł', nazwa: 'Napiwek' },
  brutto: { maks: 100_000, zeroOk: true, rozsadneDo: 1_500, jednostka: 'zł', nazwa: 'Brutto' },
  dystans: { maks: 2_000, rozsadneDo: 400, jednostka: 'km', nazwa: 'Dystans' },
  paliwo: { maks: 10_000, rozsadneDo: 500, jednostka: 'zł', nazwa: 'Kwota paliwa' },
  litry: { maks: 500, rozsadneDo: 60, jednostka: 'L', nazwa: 'Litry' },
  cenaZaLitr: {
    maks: 100,
    rozsadneOd: 3,
    rozsadneDo: 12,
    jednostka: 'zł/L',
    nazwa: 'Cena za litr',
  },
  celMiesieczny: {
    maks: 1_000_000,
    rozsadneOd: 500,
    rozsadneDo: 40_000,
    jednostka: 'zł',
    nazwa: 'Cel miesięczny',
  },
  celTygodniowy: {
    maks: 1_000_000,
    rozsadneOd: 100,
    rozsadneDo: 10_000,
    jednostka: 'zł',
    nazwa: 'Cel tygodniowy',
  },
} as const satisfies Record<string, Prog>;

export type RodzajLiczby = keyof typeof PROGI;

/** Ocena pojedynczej liczby. `null` = pole puste, to nie jest zadanie tej funkcji. */
export function ocenLiczbe(rodzaj: RodzajLiczby, wartosc: number | null): Ocena {
  if (wartosc === null) return CZYSTO;

  const p: Prog = PROGI[rodzaj];

  if (!Number.isFinite(wartosc)) {
    return { blad: `${p.nazwa}: to nie jest liczba.`, ostrzezenie: null };
  }
  if (wartosc < 0) {
    return { blad: `${p.nazwa} nie może być ujemny.`, ostrzezenie: null };
  }
  if (wartosc === 0 && p.zeroOk !== true) {
    return { blad: `${p.nazwa} musi być większy od zera.`, ostrzezenie: null };
  }
  if (wartosc > p.maks) {
    return {
      blad: `${p.nazwa}: ${pl(wartosc)} ${p.jednostka} to więcej, niż serwer przyjmie (limit ${pl(p.maks)}).`,
      ostrzezenie: null,
    };
  }

  if (wartosc > p.rozsadneDo) {
    return {
      blad: null,
      ostrzezenie: `${pl(wartosc)} ${p.jednostka} to nietypowo dużo (zwykle do ${pl(p.rozsadneDo)}). Przecinek na miejscu?`,
    };
  }
  if (p.rozsadneOd !== undefined && wartosc > 0 && wartosc < p.rozsadneOd) {
    return {
      blad: null,
      ostrzezenie: `${pl(wartosc)} ${p.jednostka} to nietypowo mało (zwykle od ${pl(p.rozsadneOd)}).`,
    };
  }

  return CZYSTO;
}

/**
 * Spójność paragonu: litry × cena powinny dać mniej więcej kwotę.
 *
 * Tolerancja 15% pokrywa zaokrąglenia i rabaty lojalnościowe. Rozjazd większy
 * znaczy zwykle, że jedno z trzech pól zostało przepisane z innej linijki
 * paragonu — a wtedy cena za litr w statystykach jest fikcją.
 *
 * Sprawdzenie działa tylko przy trzech wypełnionych polach; dwa z nich są
 * opcjonalne i ich brak jest zupełnie normalny.
 */
export function ocenParagon(
  kwota: number | null,
  litry: number | null,
  cena: number | null
): Ocena {
  if (kwota === null || litry === null || cena === null) return CZYSTO;
  if (!Number.isFinite(kwota) || !Number.isFinite(litry) || !Number.isFinite(cena)) return CZYSTO;
  if (kwota <= 0 || litry <= 0 || cena <= 0) return CZYSTO;

  const wyliczona = litry * cena;
  const rozjazd = Math.abs(wyliczona - kwota) / kwota;
  if (rozjazd <= 0.15) return CZYSTO;

  return {
    blad: null,
    ostrzezenie: `${pl(litry)} L × ${pl(cena)} zł/L to ${pl(wyliczona)} zł, a wpisana kwota to ${pl(kwota)} zł. Które pole jest z innej linijki paragonu?`,
  };
}

/**
 * Ocena zmiany na podstawie godzin `GG:MM`.
 *
 * Powtarza regułę `calculateHours` z serwera (§8d): dopuszczalne 0,25–16 h,
 * przejście przez północ jest normalne. Powtarzam ją TYLKO po to, żeby
 * ostrzec przed wysłaniem — decyzja i tak należy do serwera, który przy
 * wartości spoza zakresu zapisze `hours: null` i odeśle komunikat.
 *
 * Bez tego literówka `10:00 → 09:00` wraca dopiero jako zdziwienie po zapisie.
 */
function minutyGodziny(g: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(g);
  if (!m?.[1] || !m[2]) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Zmiana jako przedział minut na osi doby wyjazdu.
 *
 * Odpowiednik `zakresSesji` z serwera (`finance.calc.ts`) — obie strony muszą
 * dawać ten sam wynik, inaczej formularz przepuści coś, co serwer odrzuci.
 * Trwająca zmiana kończy się w nieskończoności: wszystko, co zaczyna się po
 * niej, na nią nachodzi, a wcześniejsze — nie.
 */
function zakres(sesja: { od: string; do: string | null }): { start: number; koniec: number } | null {
  const start = minutyGodziny(sesja.od);
  if (start === null) return null;
  if (sesja.do === null) return { start, koniec: Number.POSITIVE_INFINITY };
  const k = minutyGodziny(sesja.do);
  if (k === null) return null;
  return { start, koniec: k <= start ? k + 1440 : k };
}

/**
 * Ocena zmiany — długość własna ORAZ to, jak wpada w resztę doby.
 *
 * `sesje` są opcjonalne, bo formularz nie zawsze zna dobę (np. wpis wstecz
 * na dzień, którego karta nie jest wczytana). Bez nich zostaje sama kontrola
 * długości — dokładnie to, co ta funkcja robiła przed `work_sessions`.
 *
 * Suma doby jest kontrolą OSOBNĄ od długości pojedynczej zmiany i nie da się
 * jej z niej wyprowadzić: dziesięć zmian po dwie godziny to dwadzieścia godzin
 * pracy, a każda z osobna mieści się w limicie bez mrugnięcia.
 */
export function ocenZmiane(
  od: string | null,
  doGodz: string | null,
  sesje: ReadonlyArray<{ id: number; od: string; do: string | null }> = [],
  pomijaneId: number | null = null
): Ocena {
  if (od === null || doGodz === null) return CZYSTO;

  const a = minutyGodziny(od);
  const b = minutyGodziny(doGodz);
  if (a === null || b === null) return CZYSTO;

  // Zjazd wcześniej niż wyjazd = przejechana północ, nie błąd (§8d).
  const trwanie = (b - a + 1440) % 1440;
  const godzin = trwanie / 60;

  if (godzin < 0.25) {
    return {
      blad: null,
      ostrzezenie: `${od} – ${doGodz} to ${pl(Math.round(godzin * 60))} minut. Serwer nie zapisze zmiany krótszej niż 15 minut.`,
    };
  }
  if (godzin > 16) {
    return {
      blad: null,
      ostrzezenie: `${od} – ${doGodz} to ${pl(Math.round(godzin * 10) / 10)} h. Serwer odrzuci zmianę dłuższą niż 16 h — sprawdź, czy godziny nie są zamienione.`,
    };
  }

  const inne = sesje.filter((sz) => pomijaneId === null || sz.id !== pomijaneId);
  const nowa = zakres({ od, do: doGodz });

  if (nowa) {
    for (const sz of inne) {
      const z = zakres(sz);
      if (z && nowa.start < z.koniec && z.start < nowa.koniec) {
        return {
          blad: null,
          ostrzezenie:
            sz.do === null
              ? `Zmiana od ${sz.od} jeszcze trwa — serwer odrzuci drugą na te godziny.`
              : `Te godziny nachodzą na zmianę ${sz.od} – ${sz.do}. Serwer to odrzuci.`,
        };
      }
    }
  }

  const sumaInnych = inne.reduce((acc, sz) => {
    if (sz.do === null) return acc;
    const z = zakres(sz);
    return z ? acc + (z.koniec - z.start) / 60 : acc;
  }, 0);
  const razem = Math.round((sumaInnych + godzin) * 100) / 100;

  if (razem > 16) {
    return {
      blad: null,
      ostrzezenie: `Razem wyszłoby ${pl(razem)} h w jednej dobie. Serwer odrzuci powyżej 16 h.`,
    };
  }

  return CZYSTO;
}

/** Pierwsze niepuste ostrzeżenie / pierwszy błąd z listy ocen. */
export function polacz(...oceny: Ocena[]): Ocena {
  const blad = oceny.find((o) => o.blad !== null)?.blad ?? null;
  if (blad !== null) return { blad, ostrzezenie: null };
  return { blad: null, ostrzezenie: oceny.find((o) => o.ostrzezenie !== null)?.ostrzezenie ?? null };
}
