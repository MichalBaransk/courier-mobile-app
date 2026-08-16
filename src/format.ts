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
  return `${DNI[d.getUTCDay()]}, ${dzien} ${MIESIACE[miesiac - 1]}`;
  const tekst = `${DNI[d.getUTCDay()]}, ${dzien} ${MIESIACE[miesiac - 1]}`;
  return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}
