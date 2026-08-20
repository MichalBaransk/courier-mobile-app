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
 * ⚠️ OD 20.08 TO JEST ZAPAS, NIE GŁÓWNA DROGA. Praca w tle siedzi
 * w `gpsTlo.ts` i wchodzi pierwsza; ten plik obsługuje przypadki, w których
 * tamta odpadła: brak `expo-task-manager` w zainstalowanym APK albo odmowa
 * zgody „zawsze". Lepsza gorsza pozycja niż żadna.
 *
 * KOMENTARZ, KTÓRY TU STAŁ, KŁAMAŁ. Twierdził, że `expo-task-manager`
 * „w projekcie NIE MA (sprawdź package.json)" — a moduł jest tam od kroku 30.
 * Uzasadnienie przeżyło swój powód i przez jedną sesję blokowało robotę,
 * która była do zrobienia od dawna. Czwarty taki przypadek w tym projekcie.
 */

/**
 * Dokładność żądana od systemu.
 *
 * ⚠️ TO NIE JEST DROBIAZG — pierwsza wersja miała tu `Balanced`, co na
 * Androidzie znaczy pozycję z sieci komórkowej i Wi-Fi, o niepewności około
 * 100 m. Pierwszy prawdziwy odczyt z telefonu potwierdził: `accuracy_m = 100`.
 *
 * Serwer liczy zaufanie w metrach: `niepewność + prędkość × wiek <= 300 m`.
 * Przy niepewności 100 m jedna trzecia budżetu znika, zanim w ogóle ruszysz,
 * a dopuszczalny wiek pozycji spada z 52 s do 36 s przy 20 km/h i z 10 s do
 * 7 s przy 100 km/h. Cały mechanizm zbudowaliśmy wokół metrów, a potem
 * karmiliśmy go najmniej dokładnym dostępnym źródłem.
 *
 * `High` to prawdziwy GPS, typowo 5–15 m na otwartym terenie. Cena: radio GPS
 * pracuje ciągle, więc bateria schodzi szybciej.
 *
 * Od kroku 28 wybór należy do użytkownika (Więcej → Wysoka dokładność GPS),
 * bo tylko on może zmierzyć, czy bateria wyrabia. Domyślnie `High`.
 */
function dokladnosc(wysoka: boolean) {
  return wysoka ? Location.Accuracy.High : Location.Accuracy.Balanced;
}

/** Jak często prosimy system o odczyt. Serwer domyślnie wybacza 300 m błędu. */
export const ODSTEP_MS = 20_000;

/** Albo co tyle metrów, jeśli przesuniesz się szybciej. */
export const ODSTEP_M = 100;

export type StanZgody = 'przyznana' | 'odmowa' | 'blad';

/**
 * Pyta o zgodę na lokalizację przy użyciu aplikacji.
 *
 * TA funkcja pyta wyłącznie o pierwszy plan. O zgodę „zawsze" prosi
 * `zapytajOZgodeTla()` z `gpsTlo.ts` — razem z wyjaśnieniem, bo Android
 * wyrzuca wtedy na pełny ekran ustawień systemowych.
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
export async function biezacaPozycja(wysokaDokladnosc = true): Promise<OdczytPozycji | null> {
  try {
    const pozycja = await Location.getCurrentPositionAsync({
      accuracy: dokladnosc(wysokaDokladnosc),
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
  przy: (odczyt: OdczytPozycji) => void,
  wysokaDokladnosc = true
): Promise<() => void> {
  let ostatniaWyslanaMs: number | null = null;

  const sub = await Location.watchPositionAsync(
    {
      accuracy: dokladnosc(wysokaDokladnosc),
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
