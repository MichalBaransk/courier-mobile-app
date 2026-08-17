import { przesunDate } from './format';
import { dzienTygodnia } from './okresy';
import { iloraz } from './licz';

/**
 * Tydzień pracy — w jakich GODZINACH kurier zwykle jeździ w poszczególne dni.
 *
 * CZYSTA logika, bez React Native i bez magazynu, żeby dało się to
 * przetestować. To ona decyduje, czy „ile trzeba dziennie" jest liczbą,
 * która ma sens.
 *
 * ⚠️ CO TO ZMIENIA, A CZEGO NIE.
 *
 * Nie zmienia **niczego** w tym, ile zarobiłeś. `currentNetto`,
 * `progressPercent`, `remainingNetto` przychodzą z serwera i zostają
 * nietknięte. Tydzień pracy wpływa wyłącznie na **rozłożenie tego, co
 * zostało**: zamiast dzielić przez wszystkie dni kalendarza, dzielimy przez
 * dni, w które faktycznie jeździsz.
 *
 * Ta granica jest celowa. Gdyby tydzień pracy wchodził do arytmetyki
 * rozliczeń, powstałoby drugie źródło prawdy obok serwera i przy pierwszej
 * zmianie `NETTO_FACTOR` bot i aplikacja pokazywałyby inne liczby.
 *
 * Przykład różnicy: zostało 800 zł i 7 dni do końca okresu. Bez tygodnia
 * pracy wychodzi 114 zł dziennie — także w niedziele, w które nie pracujesz.
 * Z planem pon–pt zostaje 5 dni roboczych i wychodzi 160 zł. Ta druga liczba
 * jest wykonalna albo nie; pierwsza jest po prostu nieprawdą.
 */

/** Przedział pracy w danym dniu, w MINUTACH od północy. */
export interface DzienPracy {
  od: number;
  do: number;
}

/** Indeks 0 = poniedziałek … 6 = niedziela. `null` = dzień wolny. */
export type TydzienPracy = ReadonlyArray<DzienPracy | null>;

export const DNI_SKROT = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'] as const;

export const PUSTY_TYDZIEN: TydzienPracy = [null, null, null, null, null, null, null];

/** Domyślna propozycja przy pierwszym otwarciu — pon–pt, 10:00–18:00. */
export const PROPOZYCJA: TydzienPracy = [
  { od: 600, do: 1080 },
  { od: 600, do: 1080 },
  { od: 600, do: 1080 },
  { od: 600, do: 1080 },
  { od: 600, do: 1080 },
  null,
  null,
];

const MINUT_W_DOBIE = 1440;

/** Górna granica długości zmiany — ta sama reguła co §8d po stronie serwera. */
export const MAKS_GODZIN_DZIENNIE = 16;

/** `615` → `10:15`. */
export function naGodzine(minuty: number): string {
  const m = ((Math.round(minuty) % MINUT_W_DOBIE) + MINUT_W_DOBIE) % MINUT_W_DOBIE;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Ile godzin trwa dzień pracy.
 *
 * Zjazd wcześniej niż wyjazd znaczy przejechaną północ, nie błąd — kurier
 * kończący o 02:00 jest normą (§8d). Równe godziny znaczą „nic nie ustawiono",
 * a nie dobę pracy.
 */
export function godzinyDnia(d: DzienPracy | null): number {
  if (d === null) return 0;
  const trwanie = (d.do - d.od + MINUT_W_DOBIE) % MINUT_W_DOBIE;
  return trwanie / 60;
}

export function czyUstawiony(t: TydzienPracy): boolean {
  return t.some((d) => godzinyDnia(d) > 0);
}

export function sumaTygodnia(t: TydzienPracy): number {
  return t.reduce((a, d) => a + godzinyDnia(d), 0);
}

export function ileDniRoboczych(t: TydzienPracy): number {
  return t.filter((d) => godzinyDnia(d) > 0).length;
}

/** `pon, wt, czw` — do podpisu pod kartą. */
export function opisDni(t: TydzienPracy): string {
  const dni = DNI_SKROT.filter((_, i) => godzinyDnia(t[i] ?? null) > 0);
  return dni.length === 0 ? 'brak' : dni.join(', ');
}

/** `10:00–18:00` albo `wolne`. */
export function opisDnia(d: DzienPracy | null): string {
  if (godzinyDnia(d) <= 0 || d === null) return 'wolne';
  return `${naGodzine(d.od)}–${naGodzine(d.do)}`;
}

export interface PlanZakresu {
  /** Ile dni roboczych zostało (dzisiaj włącznie). */
  dni: number;
  /** Ile godzin przewiduje plan w tych dniach. */
  godziny: number;
}

/**
 * Ile dni roboczych i godzin zostało od `od` do `do` włącznie.
 *
 * Granice liczone są OBIE — dzisiaj też jest dniem, w którym można jeszcze
 * zarobić. Twardy limit 400 obrotów, żeby zła data nie zapętliła renderowania
 * (ta sama ostrożność co w `dniZakresu`).
 */
export function planZakresu(t: TydzienPracy, od: string, doDaty: string): PlanZakresu {
  let dni = 0;
  let godziny = 0;
  let biezacy = od;

  for (let i = 0; i < 400 && biezacy <= doDaty; i++) {
    const g = godzinyDnia(t[dzienTygodnia(biezacy) - 1] ?? null);
    if (g > 0) {
      dni += 1;
      godziny += g;
    }
    biezacy = przesunDate(biezacy, 1);
  }
  return { dni, godziny };
}

export interface RozlozenieCelu {
  /** Ile trzeba zarobić w każdy dzień roboczy. `null` = nie da się policzyć. */
  nettoNaDzienRoboczy: number | null;
  /** Ile godzin dziennie przy Twojej stawce. `null` = brak danych. */
  godzinNaDzienRoboczy: number | null;
  dniRobocze: number;
  godzinyPlanu: number;
  godzinyPotrzebne: number;
  /** Nadwyżka planu nad potrzebą. Ujemna = plan NIE wystarczy. */
  zapasGodzin: number | null;
}

/**
 * Rozłożenie tego, co zostało do celu, na dni robocze.
 *
 * `pozostaleNetto` i `godzinyPotrzebne` pochodzą z serwera (`remainingNetto`,
 * `estimatedHoursRemaining`) — tutaj tylko dzielimy je inaczej.
 *
 * Zero dni roboczych w zakresie to nie błąd, tylko informacja: przy planie
 * „tylko soboty" i celu kończącym się w piątek nie ma już kiedy zarobić.
 * Wtedy wszystkie ilorazy są `null`, a wywołujący ma to pokazać wprost.
 */
export function rozlozCel(
  t: TydzienPracy,
  pozostaleNetto: number,
  godzinyPotrzebne: number,
  od: string,
  doDaty: string
): RozlozenieCelu {
  const plan = planZakresu(t, od, doDaty);

  return {
    nettoNaDzienRoboczy: iloraz(pozostaleNetto, plan.dni),
    godzinNaDzienRoboczy: iloraz(godzinyPotrzebne, plan.dni),
    dniRobocze: plan.dni,
    godzinyPlanu: plan.godziny,
    godzinyPotrzebne,
    zapasGodzin: plan.dni > 0 ? plan.godziny - godzinyPotrzebne : null,
  };
}

/**
 * Kontrola tego, co przyszło z magazynu.
 *
 * Przyjmuje też STARY format — tablicę samych godzin (`[8,8,8,8,8,0,0]`) —
 * i zamienia go na przedziały zaczynające się o 10:00. Bez tego pierwsza
 * wersja tygodnia pracy przepadłaby po aktualizacji, a użytkownik nie
 * dostałby o tym żadnego sygnału.
 */
export function poprawTydzien(v: unknown): TydzienPracy | null {
  if (!Array.isArray(v) || v.length !== 7) return null;

  const wynik: Array<DzienPracy | null> = [];
  for (const d of v) {
    if (d === null) {
      wynik.push(null);
      continue;
    }

    // Stary format: same godziny.
    if (typeof d === 'number') {
      if (!Number.isFinite(d) || d < 0 || d > MAKS_GODZIN_DZIENNIE) return null;
      wynik.push(d === 0 ? null : { od: 600, do: (600 + Math.round(d * 60)) % MINUT_W_DOBIE });
      continue;
    }

    if (typeof d !== 'object') return null;
    const p = d as Partial<DzienPracy>;
    if (typeof p.od !== 'number' || typeof p.do !== 'number') return null;
    if (!Number.isFinite(p.od) || !Number.isFinite(p.do)) return null;
    if (p.od < 0 || p.od >= MINUT_W_DOBIE || p.do < 0 || p.do >= MINUT_W_DOBIE) return null;

    const przedzial = { od: Math.round(p.od), do: Math.round(p.do) };
    if (godzinyDnia(przedzial) > MAKS_GODZIN_DZIENNIE) return null;
    wynik.push(godzinyDnia(przedzial) === 0 ? null : przedzial);
  }
  return wynik;
}
