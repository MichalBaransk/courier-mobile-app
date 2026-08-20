import { Alert } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { postLokalizacja } from './api';
import { czyOsierocone } from './gpsTloReguly';
import { zOdczytu } from './lokalizacjaOdczyt';
import { ODSTEP_M, ODSTEP_MS } from './lokalizacja';
import { readToken } from './storage';

/**
 * Śledzenie pozycji, które PRZEŻYWA zamknięcie aplikacji.
 *
 * PO CO. Do tej pory pozycja leciała tylko przy aplikacji na wierzchu
 * (`sledzPozycje`). W praktyce kurier trzyma na wierzchu Glovo, a nie tę
 * aplikację — więc serwer dostawał pozycję sprzed kilkunastu minut i liczył
 * z niej dojazd. To jest dokładnie przypadek z §8f: Maps policzył 7,56 km
 * zamiast 3,37, bo mierzył od ostatniego znanego punktu.
 *
 * ⚠️ TO NIE JEST ZWYKŁY MODUŁ. Funkcja zadania uruchamia się w OSOBNYM
 * KONTEKŚCIE JAVASCRIPTU — bez Reacta, bez stanu, bez domknięć nad niczym,
 * co widziałeś na ekranie. Kontekst powstaje na nowo także wtedy, gdy
 * aplikacja jest ubita. Stąd dwie konsekwencje, które wyglądają na dziwactwa,
 * a nie są:
 *
 *  1. token czytamy W ŚRODKU zadania z `expo-secure-store`, zamiast go
 *     przekazać — nie ma komu go przekazać,
 *  2. moment startu trzymamy w `AsyncStorage`, bo zmienna modułowa nie
 *     przeżyje ubicia procesu, a to na niej stoi zapora z `czyOsierocone`.
 *
 * Sama REJESTRACJA zadania siedzi w `gpsTloZadanie.ts`. Ten plik wolno
 * importować skądkolwiek — każda funkcja dotyka modułu natywnego dopiero
 * po wywołaniu i ma własne `try/catch`.
 */

export const ZADANIE_GPS = 'glovo-gps-tlo';

/** Klucz z momentem uruchomienia. Zmienna modułowa nie przeżyje ubicia procesu. */
const KLUCZ_STARTU = 'gps_tlo_start';

async function zapiszStart(teraz: number): Promise<void> {
  try {
    await AsyncStorage.setItem(KLUCZ_STARTU, String(teraz));
  } catch {
    // Brak znacznika jest obsłużony: `czyOsierocone(null)` zwraca `true`,
    // więc najgorsze, co się stanie, to zatrzymanie przy następnym odczycie.
  }
}

async function odczytajStart(): Promise<number | null> {
  try {
    const surowy = await AsyncStorage.getItem(KLUCZ_STARTU);
    if (surowy === null) return null;
    const v = Number(surowy);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/* ========================================================================== */
/*  Zadanie                                                                   */
/* ========================================================================== */

/**
 * Obsługa jednej porcji odczytów. `defineTask` woła to w osobnym kontekście.
 *
 * Funkcja jest TUTAJ, a jej rejestracja w `gpsTloZadanie.ts`, i to nie jest
 * podział dla ozdoby — patrz nagłówek tamtego pliku. W skrócie: `defineTask`
 * dotyka modułu natywnego już przy wczytaniu pliku, więc musi mieszkać
 * w module, którego nikt nie importuje zwykłym `import`-em.
 */
export const obsluzOdczyty: TaskManager.TaskManagerTaskExecutor = async ({ data, error }) => {
  if (error) {
    console.warn('[GPS tło] błąd zadania:', error.message);
    return;
  }

  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const pozycja = locations?.[locations.length - 1];
  if (!pozycja) return;

  const teraz = Date.now();

  /**
   * Zapora PRZED wysyłką, nie po.
   *
   * Gdyby stała za wysyłką, sierota zdążyłaby jeszcze raz obudzić radio
   * i wysłać pozycję, zanim się zatrzyma. Tu chodzi o baterię, więc kolejność
   * nie jest kosmetyczna.
   */
  if (czyOsierocone(await odczytajStart(), teraz)) {
    console.warn('[GPS tło] śledzenie chodzi zbyt długo — zatrzymuję.');
    await zatrzymajSledzenieTla();
    return;
  }

  const token = await readToken();
  if (token === null) {
    // Wylogowanie przy ubitej aplikacji. Bez tokena nie ma dokąd wysyłać
    // i nie będzie — zatrzymujemy zamiast próbować w kółko.
    await zatrzymajSledzenieTla();
    return;
  }

  const odczyt = zOdczytu(pozycja, teraz);
  if (!odczyt) return;

  try {
    await postLokalizacja(token, odczyt);
  } catch {
    /**
     * Cisza jest tu celowa, tak samo jak przy śledzeniu na pierwszym planie.
     * Pozycja to dana ODTWARZALNA — za dwadzieścia sekund będzie następna.
     * Kolejka offline byłaby tu wręcz szkodliwa: wysłałaby po godzinie punkt
     * opisujący miejsce, w którym kuriera dawno nie ma.
     */
  }
};

/* ========================================================================== */
/*  Sterowanie                                                                */
/* ========================================================================== */

/** Czy moduł natywny w ogóle jest w tym APK. Odpowiada wierszowi w „Wersja". */
export async function czyTloDostepne(): Promise<boolean> {
  try {
    return await TaskManager.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function czySledzenieChodzi(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(ZADANIE_GPS);
  } catch {
    return false;
  }
}

/**
 * Zgoda „zawsze".
 *
 * Android NIE daje jej z okienka — pokazuje ekran ustawień, na którym trzeba
 * ręcznie wybrać „Zezwalaj zawsze". Dlatego wywołujący ma obowiązek napisać,
 * co się zaraz stanie; wyrzucenie do ustawień bez słowa wygląda jak usterka.
 *
 * Zgoda na pierwszy plan musi być PIERWSZA — tak mówi dokumentacja Expo
 * i tak działa system.
 */
export async function zapytajOZgodeTla(): Promise<boolean> {
  try {
    const przod = await Location.requestForegroundPermissionsAsync();
    if (przod.status !== 'granted') return false;

    // Zgodę już mamy — bez okienka. Inaczej wyjaśnienie wyskakiwałoby przy
    // każdym otwarciu zmiany, czyli kilka razy dziennie.
    const juz = await Location.getBackgroundPermissionsAsync();
    if (juz.status === 'granted') return true;

    /**
     * Uprzedzenie PRZED wyrzuceniem do ustawień systemowych.
     *
     * Android nie daje zgody „zawsze" z okienka — otwiera pełny ekran
     * ustawień, na którym trzeba samemu wybrać „Zezwalaj zawsze". Bez tego
     * zdania wygląda to jak wyrzucenie z aplikacji bez powodu, a najczęstszą
     * reakcją na niezrozumiały ekran uprawnień jest „Odmów".
     */
    await new Promise<void>((gotowe) => {
      Alert.alert(
        'Pozycja przy schowanym telefonie',
        'Android zapyta teraz o dostęp do lokalizacji „zawsze". Wybierz „Zezwalaj zawsze" — ' +
          'bez tego pozycja przestaje lecieć, gdy tylko przełączysz się do Glovo, ' +
          'a bot znów liczy dojazd od ostatniego znanego miejsca.',
        [{ text: 'Rozumiem', onPress: () => gotowe() }],
        { onDismiss: () => gotowe() }
      );
    });

    const tlo = await Location.requestBackgroundPermissionsAsync();
    return tlo.status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Uruchomienie śledzenia w tle.
 *
 * Zwraca `false`, gdy się nie udało — wywołujący ma wtedy włączyć zapas na
 * pierwszym planie, zamiast zostawić kuriera bez pozycji w ogóle.
 *
 * Odstępy są te same, co przy pierwszym planie (`ODSTEP_MS`, `ODSTEP_M`),
 * bo po drugiej stronie stoi ten sam budżet błędu w metrach (§8j).
 */
export async function uruchomSledzenieTla(wysokaDokladnosc: boolean): Promise<boolean> {
  try {
    if (!(await czyTloDostepne())) return false;
    if (!(await zapytajOZgodeTla())) return false;
    if (await czySledzenieChodzi()) return true;

    await zapiszStart(Date.now());

    await Location.startLocationUpdatesAsync(ZADANIE_GPS, {
      accuracy: wysokaDokladnosc ? Location.Accuracy.High : Location.Accuracy.Balanced,
      timeInterval: ODSTEP_MS,
      distanceInterval: ODSTEP_M,
      // Android tego WYMAGA przy lokalizacji w tle i nie da się tego ukryć.
      // Bez powiadomienia system ubija usługę po kilku minutach.
      foregroundService: {
        notificationTitle: 'Zmiana trwa',
        notificationBody: 'Wysyłam pozycję, żeby bot liczył dojazd od miejsca, w którym jesteś.',
        notificationColor: '#4ade80',
        // Ubicie aplikacji NIE ma zatrzymywać śledzenia — to jest cały powód,
        // dla którego ten plik istnieje.
        killServiceOnDestroy: false,
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });

    return true;
  } catch (err) {
    console.warn('[GPS tło] nie udało się uruchomić:', err);
    return false;
  }
}

export async function zatrzymajSledzenieTla(): Promise<void> {
  try {
    if (await czySledzenieChodzi()) {
      await Location.stopLocationUpdatesAsync(ZADANIE_GPS);
    }
  } catch (err) {
    console.warn('[GPS tło] nie udało się zatrzymać:', err);
  }
  try {
    await AsyncStorage.removeItem(KLUCZ_STARTU);
  } catch {
    /* nieistotne — znacznik bez zadania nikomu nie przeszkadza */
  }
}
