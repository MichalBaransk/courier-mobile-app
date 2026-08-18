import * as Location from 'expo-location';

import { czyWartoWyslac, zOdczytu, type OdczytPozycji } from './lokalizacjaOdczyt';

/**
 * Pozycja kuriera — warstwa dotykająca modułu natywnego.
 *
 * Cała arytmetyka siedzi w `lokalizacjaOdczyt.ts` (bez `expo-location`, więc
 * pod testem). Tutaj zostaje wyłącznie rozmowa z systemem.
 *
 * ⚠️ CO TO ROBI, A CZEGO NIE ROBI — WAŻNE.
 *
 * To jest śledzenie NA PIERWSZYM PLANIE. Działa, dopóki aplikacja jest na
 * wierzchu. Gdy przełączysz się do Glovo, Android zatrzyma odczyty.
 *
 * Praca w TLE wymaga `expo-task-manager`, którego w projekcie NIE MA
 * (sprawdź `package.json`). To osobny moduł natywny, więc nie da się go
 * dołożyć przez `eas update` — potrzebny jest nowy APK. Reguła projektu mówi
 * wyraźnie: modułów natywnych nie dokładamy po jednym, tylko paczką (§7
 * kompendium). Dlatego na razie tego nie ma.
 *
 * Co z tego wynika w praktyce: pozycja odświeża się wtedy, gdy trzymasz tę
 * aplikację otwartą, i pozostaje w bazie po jej zamknięciu. Serwer sam ocenia,
 * czy jest jeszcze coś warta — patrz budżet błędu w `lokalizacja.rules.ts`.
 */

/** Jak często prosimy system o odczyt. Serwer domyślnie wybacza 300 m błędu. */
export const ODSTEP_MS = 20_000;

/** Albo co tyle metrów, jeśli przesuniesz się szybciej. */
export const ODSTEP_M = 100;

export type StanZgody = 'przyznana' | 'odmowa' | 'blad';

/**
 * Pyta o zgodę na lokalizację przy użyciu aplikacji.
 *
 * NIE pytamy o zgodę „zawsze" (w tle) — bez `expo-task-manager` i tak nie
 * mielibyśmy jej z czego użyć, a Android pokazuje wtedy osobny, straszący
 * ekran systemowy. Prosimy o uprawnienie, które faktycznie wykorzystamy.
 */
export async function zapytajOZgode(): Promise<StanZgody> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted' ? 'przyznana' : 'odmowa';
  } catch {
    return 'blad';
  }
}

/** Czy zgoda już jest — bez pokazywania okna systemowego. */
export async function czyJestZgoda(): Promise<boolean> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Jeden świeży odczyt na żądanie.
 *
 * To jest docelowa droga przy ocenie oferty: pozycja złapana W MOMENCIE,
 * w którym jest potrzebna, ma wiek 1–3 s i żadna prędkość jej nie psuje.
 */
export async function biezacaPozycja(): Promise<OdczytPozycji | null> {
  try {
    const pozycja = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return zOdczytu(pozycja, Date.now());
  } catch {
    return null;
  }
}

/**
 * Śledzenie, dopóki aplikacja jest na wierzchu.
 *
 * Zwraca funkcję zatrzymującą. Wywołujący MUSI ją wywołać przy sprzątaniu —
 * inaczej po zmianie zakładki zostaje działający nasłuch GPS, którego nikt
 * już nie czyta, a bateria o tym wie.
 *
 * `czyWartoWyslac` przycina nadmiar: system potrafi sypać odczytami częściej,
 * niż prosiliśmy, a każdy wysłany to żądanie po komórkowym internecie.
 */
export async function sledzPozycje(
  przy: (odczyt: OdczytPozycji) => void
): Promise<() => void> {
  let ostatniaWyslanaMs: number | null = null;

  const sub = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: ODSTEP_MS,
      distanceInterval: ODSTEP_M,
    },
    (pozycja) => {
      const teraz = Date.now();
      if (!czyWartoWyslac(ostatniaWyslanaMs, teraz, ODSTEP_MS)) return;

      const odczyt = zOdczytu(pozycja, teraz);
      if (!odczyt) return;

      ostatniaWyslanaMs = teraz;
      przy(odczyt);
    }
  );

  return () => sub.remove();
}
