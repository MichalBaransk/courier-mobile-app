import { przesunDate } from './format';

/**
 * Wyznaczanie zakresów tygodnia i miesiąca — czysta arytmetyka na łańcuchach
 * `RRRR-MM-DD`, bez stref czasowych.
 *
 * Punktem odniesienia jest ZAWSZE data przysłana przez serwer. Zegar telefonu
 * nie bierze udziału w niczym, co decyduje, do którego dnia należy wpis.
 */

export interface Zakres {
  od: string;
  do: string;
}

function czesci(iso: string): { rok: number; miesiac: number; dzien: number } {
  const [rok, miesiac, dzien] = iso.split('-').map(Number);
  return { rok: rok || 1970, miesiac: miesiac || 1, dzien: dzien || 1 };
}

/** Poniedziałek tygodnia, w którym leży `iso`. Tydzień ISO, nie niedzielny. */
export function poniedzialek(iso: string): string {
  const { rok, miesiac, dzien } = czesci(iso);
  const d = new Date(Date.UTC(rok, miesiac - 1, dzien, 12));
  const dzienTygodnia = d.getUTCDay() || 7; // pon = 1 … nd = 7
  return przesunDate(iso, -(dzienTygodnia - 1));
}

export function zakresTygodnia(iso: string): Zakres {
  const od = poniedzialek(iso);
  return { od, do: przesunDate(od, 6) };
}

export function zakresMiesiaca(iso: string): Zakres {
  const { rok, miesiac } = czesci(iso);
  const mm = String(miesiac).padStart(2, '0');
  // Dzień 0 następnego miesiąca to ostatni dzień bieżącego — działa też dla grudnia.
  const ostatni = new Date(Date.UTC(rok, miesiac, 0, 12)).getUTCDate();
  return { od: `${rok}-${mm}-01`, do: `${rok}-${mm}-${String(ostatni).padStart(2, '0')}` };
}

/** Numer tygodnia ISO — ta sama reguła co `earning_targets.year` w bazie (§8e). */
export function numerTygodniaISO(iso: string): number {
  const { rok, miesiac, dzien } = czesci(iso);
  const d = new Date(Date.UTC(rok, miesiac - 1, dzien, 12));
  const dzienTygodnia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dzienTygodnia); // czwartek tego tygodnia
  const poczatekRoku = new Date(Date.UTC(d.getUTCFullYear(), 0, 1, 12));
  return Math.ceil(((d.getTime() - poczatekRoku.getTime()) / 86_400_000 + 1) / 7);
}

const MIESIACE_MIANOWNIK = [
  'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
];

export function nazwaMiesiaca(iso: string): string {
  const { rok, miesiac } = czesci(iso);
  return `${MIESIACE_MIANOWNIK[miesiac - 1]} ${rok}`;
}

/** Dzień tygodnia 1–7 (pon–nd). Do ustawienia przesunięcia w kalendarzu. */
export function dzienTygodnia(iso: string): number {
  const { rok, miesiac, dzien } = czesci(iso);
  return new Date(Date.UTC(rok, miesiac - 1, dzien, 12)).getUTCDay() || 7;
}

/** Wszystkie dni zakresu jako lista `RRRR-MM-DD`. */
export function dniZakresu(zakres: Zakres): string[] {
  const dni: string[] = [];
  let biezacy = zakres.od;
  // Twardy limit, żeby błąd w zakresie nie zapętlił renderowania.
  for (let i = 0; i < 400 && biezacy <= zakres.do; i++) {
    dni.push(biezacy);
    biezacy = przesunDate(biezacy, 1);
  }
  return dni;
}
