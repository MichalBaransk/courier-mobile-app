import { przesunDate } from './format';
import { dzienTygodnia } from './okresy';
import { iloraz } from './licz';

/**
 * Tydzień pracy — ile godzin kurier zwykle jeździ w poszczególne dni.
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
 * Przykład różnicy: zostało 800 zł i 10 dni do końca miesiąca. Bez tygodnia
 * pracy wychodzi 80 zł dziennie — także w niedziele, w które nie pracujesz.
 * Z tygodniem pracy (pon–pt) zostaje 6 dni roboczych i wychodzi 133 zł.
 * Ta druga liczba jest wykonalna albo nie; pierwsza jest po prostu nieprawdą.
 */

/** Indeks 0 = poniedziałek … 6 = niedziela. Godziny; 0 znaczy dzień wolny. */
export type TydzienPracy = readonly number[];

export const DNI_SKROT = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'] as const;

export const PUSTY_TYDZIEN: TydzienPracy = [0, 0, 0, 0, 0, 0, 0];

/** Domyślna propozycja przy pierwszym otwarciu — pięć dni po 8 h. */
export const PROPOZYCJA: TydzienPracy = [8, 8, 8, 8, 8, 0, 0];

/** Górna granica na dzień. Ta sama myśl co w `limity.ts`: łapiemy literówkę. */
export const MAKS_GODZIN_DZIENNIE = 16;

/** Czy użytkownik w ogóle coś ustawił. */
export function czyUstawiony(t: TydzienPracy): boolean {
  return t.some((g) => g > 0);
}

export function sumaTygodnia(t: TydzienPracy): number {
  return t.reduce((a, g) => a + (Number.isFinite(g) ? Math.max(0, g) : 0), 0);
}

export function ileDniRoboczych(t: TydzienPracy): number {
  return t.filter((g) => g > 0).length;
}

/** `pon, wt, czw` — do podpisu pod kartą. */
export function opisDni(t: TydzienPracy): string {
  const dni = DNI_SKROT.filter((_, i) => (t[i] ?? 0) > 0);
  return dni.length === 0 ? 'brak' : dni.join(', ');
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
    const g = t[dzienTygodnia(biezacy) - 1] ?? 0;
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
  /** Ile dni roboczych zostało. */
  dniRobocze: number;
  /** Ile godzin przewiduje plan do końca okresu. */
  godzinyPlanu: number;
  /** Ile godzin trzeba według stawki. */
  godzinyPotrzebne: number;
  /**
   * Nadwyżka planu nad potrzebą. Ujemna = plan NIE wystarczy.
   * `null`, gdy nie da się tego ocenić.
   */
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
 * Plik na dysku mógł powstać w starszej wersji albo zostać uszkodzony.
 * Zwracamy `null` zamiast próbować ratować połowę — przy siedmiu liczbach
 * łatwiej ustawić je jeszcze raz niż zgadywać, które są prawdziwe.
 */
export function poprawTydzien(v: unknown): TydzienPracy | null {
  if (!Array.isArray(v) || v.length !== 7) return null;

  const wynik: number[] = [];
  for (const g of v) {
    if (typeof g !== 'number' || !Number.isFinite(g)) return null;
    if (g < 0 || g > MAKS_GODZIN_DZIENNIE) return null;
    wynik.push(g);
  }
  return wynik;
}
