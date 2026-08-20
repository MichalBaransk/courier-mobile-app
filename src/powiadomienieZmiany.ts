import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { czySledzenieChodzi } from './gpsTlo';

/**
 * Nieusuwalne powiadomienie „zmiana trwa".
 *
 * PO CO. Zmiana zostawiona otwarta przez noc nie boli od razu — boli
 * następnego dnia, gdy zjazd wpada w złą dobę i psuje stawkę zł/h. Nie ma
 * dziś niczego, co przypomina o otwartej zmianie, gdy aplikacja jest zamknięta.
 *
 * DLACZEGO TO NIE JEST TO SAMO, CO POWIADOMIENIE USŁUGI GPS. Tamto pokazuje
 * Android sam, gdy chodzi śledzenie w tle, i znika razem z nim. Chodzi ono
 * tylko przy WŁĄCZONYM przełączniku „Wysyłaj pozycję" i przyznanej zgodzie
 * „zawsze" — więc kurier, który pozycji nie wysyła, nie dostawał żadnego
 * znaku, że zmiana leci.
 *
 * DWA ŹRÓDŁA, JEDNO POWIADOMIENIE. Gdy usługa GPS już wisi w pasku, NIE
 * dokładamy drugiego — dwa wpisy o tej samej rzeczy czyta się jak usterkę.
 * Stąd `czySledzenieChodzi()` w `pokazPowiadomienieZmiany`.
 *
 * Które z dwóch widzisz, mówi Ci przy okazji, czy GPS pracuje:
 *
 * | wpis w pasku | znaczenie |
 * |---|---|
 * | „Zmiana trwa — Wysyłam pozycję…" (usługa Androida) | zmiana leci, GPS pracuje |
 * | „Zmiana trwa — GPS nie wysyła pozycji" (ten plik)   | zmiana leci, pozycji nie ma |
 * | brak wpisu                                          | zmiany nie ma |
 *
 * Trzeci wiersz jest wart tyle, co dwa pierwsze — dlatego wpis jest odtwarzany
 * przy każdym powrocie aplikacji na wierzch (`przebudzenia` w `App.tsx`),
 * a nie tylko zakładany raz przy otwarciu zmiany.
 */

const KANAL = 'zmiana';
const KLUCZ_ID = 'powiadomienie_zmiany_id';

/**
 * Bez tego powiadomienie wysłane przy otwartej aplikacji nigdzie się nie pokaże.
 *
 * Domyślnie `expo-notifications` przy aplikacji na wierzchu tylko odpala
 * zdarzenie i nic nie rysuje. Tutaj chodzi o coś odwrotnego: wpis ma wisieć
 * w pasku niezależnie od tego, gdzie akurat jesteś.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Kanał o niskiej ważności — bez dźwięku i bez wyskakiwania na wierzch.
 *
 * `LOW` jest tu celowe. To ma być pasek stanu, a nie alarm: kurier widzi go,
 * gdy sam spojrzy, i nie dostaje dzwonka co otwarcie zmiany.
 */
async function kanal(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(KANAL, {
      name: 'Trwająca zmiana',
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      vibrationPattern: [0],
      showBadge: false,
    });
  } catch {
    /* brak kanału oznacza domyślny — powiadomienie i tak się pokaże */
  }
}

/**
 * Pokazuje powiadomienie, jeśli jeszcze go nie ma.
 *
 * Identyfikator ląduje w `AsyncStorage`, a nie w zmiennej modułowej, bo
 * powiadomienie **przeżywa ubicie aplikacji** — a jego skasowanie musi być
 * możliwe po ponownym uruchomieniu. Ta sama zasada, co przy znaczniku startu
 * w `gpsTlo.ts`.
 */
export async function pokazPowiadomienieZmiany(od: string | null): Promise<void> {
  try {
    // Usługa GPS ma już własny, nieusuwalny wpis. Drugi byłby szumem.
    if (await czySledzenieChodzi()) return;

    if ((await AsyncStorage.getItem(KLUCZ_ID)) !== null) return;

    const zgoda = await Notifications.requestPermissionsAsync();
    if (!zgoda.granted) return;

    await kanal();

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Zmiana trwa',
        /**
         * Treść mówi wprost, że pozycja NIE leci.
         *
         * Ten wpis pojawia się wyłącznie wtedy, gdy śledzenia w tle nie ma —
         * gdy jest, w pasku wisi powiadomienie usługi GPS („Wysyłam pozycję…").
         * Dwa różne zdania zamiast jednego to jedyny sposób, żeby po samym
         * pasku dało się poznać, czy GPS pracuje.
         */
        body:
          (od === null ? '' : `Od ${od} · `) + 'GPS nie wysyła pozycji. Pamiętaj o zjeździe.',
        // Android: wpisu nie da się zdjąć machnięciem…
        sticky: true,
        // …ani przypadkowym dotknięciem.
        autoDismiss: false,
        ...(Platform.OS === 'android' ? { channelId: KANAL } : {}),
      },
      trigger: null,
    });

    await AsyncStorage.setItem(KLUCZ_ID, id);
  } catch {
    /**
     * Powiadomienie jest wygodą, nie danymi. Odmowa zgody, brak kanału albo
     * kaprys systemu nie mogą przeszkodzić w otwarciu zmiany — a to jest
     * czynność wykonywana przy motocyklu, często w rękawicach.
     */
  }
}

/** Zdejmuje powiadomienie. Bezpieczne do wywołania, gdy żadnego nie ma. */
export async function schowajPowiadomienieZmiany(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(KLUCZ_ID);
    if (id !== null) {
      await Notifications.dismissNotificationAsync(id);
      await Notifications.cancelScheduledNotificationAsync(id);
    }
  } catch {
    /* zob. wyżej */
  }
  try {
    await AsyncStorage.removeItem(KLUCZ_ID);
  } catch {
    /* pusto */
  }
}
