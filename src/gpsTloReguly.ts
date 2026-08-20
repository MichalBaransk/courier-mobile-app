/**
 * Reguły śledzenia w tle — bez `expo-task-manager` i bez `expo-location`.
 *
 * Ta sama zasada, co przy `lokalizacjaOdczyt.ts` i `finance.calc.ts`: decyzje
 * dają się sprawdzić testem, warstwa dotykająca systemu nie.
 *
 * Tutaj chodzi o coś więcej niż porządek. Zadanie w tle jest jedynym kawałkiem
 * tej aplikacji, który **przeżywa jej zamknięcie** — działa, gdy nie ma ekranu,
 * nikt na nie nie patrzy, a błąd objawia się rozładowaną baterią rano.
 * Sprawdzenie go przez klikanie znaczy „czekaj do jutra i zobacz".
 */

/**
 * Ile godzin śledzenie może chodzić, zanim uzna się za sierotę.
 *
 * Tyle samo, co górna granica w `calculateHours()` po stronie bota (§8d).
 * Zmiana dłuższa niż szesnaście godzin nie jest zmianą, tylko zapomnianym
 * przyciskiem.
 *
 * PO CO TO W OGÓLE JEST. Zmianę można zamknąć **w Telegramie**. Aplikacja nie
 * dowie się o tym, dopóki jej nie otworzysz, a usługa pierwszoplanowa
 * przeżywa zamknięcie aplikacji — więc bez tego limitu chodziłaby dalej,
 * całą noc, z włączonym radiem GPS.
 */
export const MAKS_GODZIN_SLEDZENIA = 16;

/** Czy zadanie chodzi tak długo, że na pewno nikt go już nie pilnuje. */
export function czyOsierocone(
  startMs: number | null,
  terazMs: number,
  maksGodzin = MAKS_GODZIN_SLEDZENIA
): boolean {
  // Brak znacznika startu to stan, którego nie umiemy ocenić — a zadanie
  // przeżyło restart aplikacji. Traktujemy jak sierotę: lepiej zatrzymać
  // i pozwolić aplikacji włączyć je z powrotem, niż zostawić coś, o czym
  // nikt nic nie wie.
  if (startMs === null || !Number.isFinite(startMs)) return true;

  return terazMs - startMs > maksGodzin * 3600_000;
}

export type DecyzjaSledzenia = 'start' | 'stop' | 'nic';

/**
 * Co zrobić ze śledzeniem przy obecnym stanie aplikacji.
 *
 * Wywoływane w dwóch momentach i to jest cały sens tej funkcji: przy zmianie
 * stanu (otwarcie/zamknięcie zmiany, przełącznik) ORAZ przy starcie aplikacji,
 * kiedy trzeba **uzgodnić** to, co zastaliśmy, z tym, jak być powinno.
 *
 * Bez uzgodnienia przy starcie zostaje sierota: ubijasz aplikację z otwartą
 * zmianą, zamykasz zmianę w Telegramie, odpalasz aplikację — a usługa
 * pierwszoplanowa chodzi dalej, bo nikt jej nie kazał przestać.
 */
export function decyzjaSledzenia({
  zmianaTrwa,
  wysylajPozycje,
  zadanieChodzi,
}: {
  zmianaTrwa: boolean;
  wysylajPozycje: boolean;
  zadanieChodzi: boolean;
}): DecyzjaSledzenia {
  const powinno = zmianaTrwa && wysylajPozycje;

  if (powinno && !zadanieChodzi) return 'start';
  if (!powinno && zadanieChodzi) return 'stop';
  return 'nic';
}
