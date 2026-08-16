/**
 * Formatowanie liczb po polsku.
 *
 * Celowo ręcznie, bez `Intl.NumberFormat` — obsługa Intl w silniku Hermes
 * bywa niepełna i różni się między wersjami Androida. Wynik ma być
 * przewidywalny na każdym telefonie, a to jest kilka linijek.
 */

const przecinek = (v: number, miejsca: number): string => v.toFixed(miejsca).replace('.', ',');

export const zl = (v: number): string => `${przecinek(v, 2)} zł`;

/** Ze znakiem — ujemne „do przelewu" ma być widoczne, nie ukryte. */
export const zlZeZnakiem = (v: number): string => `${v > 0 ? '+' : ''}${przecinek(v, 2)} zł`;

export const km = (v: number | null): string => (v == null ? '—' : `${przecinek(v, 1)} km`);

export const godziny = (v: number): string => `${przecinek(v, 2)} h`;

export const litry = (v: number): string => `${przecinek(v, 2)} L`;

/** `2026-08-16` → `sobota, 16 sierpnia`. Bez Intl, bez stref — data przychodzi gotowa. */
const DNI = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const MIESIACE = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];

export function dataPoPolsku(iso: string): string {
  const [rok, miesiac, dzien] = iso.split('-').map(Number);
  if (!rok || !miesiac || !dzien) return iso;

  // Południe UTC, żeby żadne przesunięcie strefy nie zmieniło dnia tygodnia.
  const d = new Date(Date.UTC(rok, miesiac - 1, dzien, 12));

  // Tylko PIERWSZA litera z wielkiej. Po polsku nazwy miesiecy sa z malej,
  // wiec `textTransform: 'capitalize'` w stylach robilo z tego „16 Sierpnia”.
  const tekst = `${DNI[d.getUTCDay()]}, ${dzien} ${MIESIACE[miesiac - 1]}`;
  return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}

/* ========================================================================== */
/*  Daty wcześniejsze                                                         */
/* ========================================================================== */

const DNI_KROTKO = ['nd', 'pon', 'wt', 'śr', 'czw', 'pt', 'sob'];
const MIESIACE_KROTKO = [
  'sty', 'lut', 'mar', 'kwi', 'maj', 'cze',
  'lip', 'sie', 'wrz', 'paź', 'lis', 'gru',
];

/**
 * Przesunięcie daty o N dni, na czystych łańcuchach `RRRR-MM-DD`.
 *
 * Punktem odniesienia jest ZAWSZE data przysłana przez serwer, nie zegar
 * telefonu. Telefon może mieć inną strefę albo przestawiony czas, a doba
 * kończy się o północy w Europe/Warsaw. Dzięki temu „wczoraj" znaczy to samo
 * w aplikacji i w bocie.
 *
 * Południe UTC w środku, żeby przejście przez zmianę czasu nie przesunęło dnia.
 */
export function przesunDate(iso: string, dni: number): string {
  const [rok, miesiac, dzien] = iso.split('-').map(Number);
  if (!rok || !miesiac || !dzien) return iso;

  const d = new Date(Date.UTC(rok, miesiac - 1, dzien, 12));
  d.setUTCDate(d.getUTCDate() + dni);

  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/** `2026-08-15` → `sob 15 sie`. Krótka etykieta na przycisk wyboru dnia. */
export function krotkaData(iso: string): string {
  const [rok, miesiac, dzien] = iso.split('-').map(Number);
  if (!rok || !miesiac || !dzien) return iso;

  const d = new Date(Date.UTC(rok, miesiac - 1, dzien, 12));
  return `${DNI_KROTKO[d.getUTCDay()]} ${dzien} ${MIESIACE_KROTKO[miesiac - 1]}`;
}

/**
 * Ten sam warunek co `isValidDateStr` po stronie serwera: format plus
 * sprawdzenie, że data faktycznie istnieje (`2026-02-30` nie przejdzie).
 * Dzięki temu oczywista literówka nie kosztuje podróży do serwera.
 */
export function poprawnaData(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return false;
  return new Date(t).toISOString().slice(0, 10) === iso;
}
