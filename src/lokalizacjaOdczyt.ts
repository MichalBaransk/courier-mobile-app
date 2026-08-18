/**
 * Normalizacja odczytu GPS — CZYSTA logika, bez `expo-location`.
 *
 * Wydzielone z `lokalizacja.ts` z tego samego powodu, co `kolejka.ts` od
 * `kolejkaMagazyn.ts`: plik importujący moduł natywny nie da się uruchomić
 * w node, więc nie da się go przetestować. A tu jest co testować — Android
 * ma w tym miejscu kilka zwyczajów, o których lepiej pamiętać w jednym
 * miejscu niż odkrywać je w terenie.
 *
 * ⚠️ DLACZEGO WYSYŁAMY WIEK, A NIE ZNACZNIK CZASU.
 *
 * Wiek jest wielkością **względną**, więc nie ma w nim zegara telefonu, który
 * mógłby być przestawiony albo mieć złą strefę. Znacznik czasu z telefonu
 * byłby drugim źródłem prawdy obok serwera — a doba i czas należą do serwera
 * (§8a instrukcji bota). Serwer robi z tego `recorded_at = teraz − wiek`.
 */

export interface OdczytPozycji {
  lat: number;
  lon: number;
  /** Promień niepewności w metrach. `null` = system nie podał. */
  dokladnoscM: number | null;
  /** Metry na sekundę. `null` = system nie podał. */
  predkoscMps: number | null;
  /** Ile ms upłynęło od złapania pozycji do teraz. */
  wiekMs: number;
}

/** Tyle, ile naprawdę potrzebujemy z `Location.LocationObject`. */
export interface SurowyOdczyt {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    speed?: number | null;
  };
  /** ms epoch z systemu — używany WYŁĄCZNIE do policzenia wieku. */
  timestamp: number;
}

/**
 * Zamienia odczyt systemowy na to, co rozumie API.
 *
 * Zwraca `null`, gdy współrzędne nie mają sensu. Ta sama zasada co po stronie
 * serwera: lepiej nie wysłać nic niż wysłać liczbę, która wygląda wiarygodnie
 * i nie znaczy nic (§8f).
 */
export function zOdczytu(surowy: SurowyOdczyt, terazMs: number): OdczytPozycji | null {
  const { latitude, longitude, accuracy, speed } = surowy.coords;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  // Dokładne (0, 0) to Zatoka Gwinejska — w praktyce zawsze niezainicjowana
  // struktura, nie odczyt.
  if (latitude === 0 && longitude === 0) return null;

  // Android potrafi oddać `-1` zamiast `null`, gdy prędkości nie zna.
  // Przepuszczenie tego dalej znaczyłoby „stoi", czyli dokładnie odwrotność
  // prawdy w najgorszym możliwym momencie.
  const predkoscMps =
    typeof speed === 'number' && Number.isFinite(speed) && speed >= 0 ? speed : null;

  const dokladnoscM =
    typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null;

  // `timestamp` bywa w przyszłości o kilkadziesiąt ms przy rozjeżdżonych
  // zegarach — ujemny wiek nie ma sensu, więc przycinamy do zera.
  const wiekMs = Number.isFinite(surowy.timestamp) ? Math.max(0, terazMs - surowy.timestamp) : 0;

  return { lat: latitude, lon: longitude, dokladnoscM, predkoscMps, wiekMs };
}

/**
 * Czy warto wysyłać ten odczyt, skoro poprzedni już poszedł.
 *
 * GPS potrafi sypać odczytami częściej, niż prosiliśmy, a każdy wysłany to
 * żądanie po komórkowym internecie. Wysyłamy, gdy naprawdę coś się zmieniło:
 * minęło dość czasu ALBO pozycja przesunęła się bardziej niż o własną
 * niepewność.
 *
 * `null` jako poprzednia znaczy „pierwszy odczyt" — zawsze wysyłamy.
 */
export function czyWartoWyslac(
  poprzedniaWyslanaMs: number | null,
  terazMs: number,
  minOdstepMs: number
): boolean {
  if (poprzedniaWyslanaMs === null) return true;
  return terazMs - poprzedniaWyslanaMs >= minOdstepMs;
}
