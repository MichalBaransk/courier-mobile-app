import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';


/**
 * Powiadomienie „zmiana trwa" — odtwarzane, bo nieusuwalnego już nie ma.
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
 * DWA ŹRÓDŁA, JEDNO POWIADOMIENIE. Gdy w pasku coś od tej aplikacji już wisi
 * — wpis usługi GPS albo nasz — nie dokładamy drugiego. Dwa wpisy o tej samej
 * rzeczy czyta się jak usterkę.
 *
 * Które z dwóch widzisz, mówi Ci przy okazji, czy GPS pracuje:
 *
 * | wpis w pasku | znaczenie |
 * |---|---|
 * | „Zmiana trwa — Wysyłam pozycję…" (usługa Androida) | zmiana leci, GPS pracuje |
 * | „Zmiana trwa — GPS nie wysyła pozycji" (ten plik)   | zmiana leci, pozycji nie ma |
 * | brak wpisu                                          | zmiany nie ma |
 *
 * Trzeci wiersz jest wart tyle, co dwa pierwsze — dlatego wpis jest odtwarzany,
 * a nie tylko zakładany raz przy otwarciu zmiany.
 *
 * ⚠️ „NIEUSUWALNE" NIE ISTNIEJE OD ANDROIDA 14. Platforma zmieniła znaczenie
 * `FLAG_ONGOING_EVENT` (czyli `sticky: true`) tak, że użytkownik MOŻE zdjąć
 * taki wpis machnięciem palca. Dotyczy to również powiadomienia usługi
 * pierwszoplanowej — usługa chodzi dalej, tylko wpis znika. Opt-outu nie ma;
 * wyjątkami są wyłącznie połączenia, multimedia, zarządzanie firmowe
 * i domyślna wyszukiwarka.
 * https://developer.android.com/about/versions/14/behavior-changes-all
 *
 * Dlatego `sticky` zostaje (na Androidzie 13 i starszym nadal działa), ale
 * całą robotę wykonuje `zapewnijPowiadomienieZmiany` — sprawdza, czy wpis
 * NADAL jest, i zakłada go z powrotem, gdy zniknął. Wołane przy każdym
 * powrocie aplikacji na wierzch ORAZ z zadania GPS w tle, czyli co dwadzieścia
 * sekund trwającej zmiany.
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
export async function zapewnijPowiadomienieZmiany(
  od: string | null,
  gpsChodzi = false
): Promise<void> {
  try {
    /**
     * PYTAMY O TO, CO NAPRAWDĘ WIDAĆ, a nie o to, co powinno być widać.
     *
     * Wcześniej stało tu `czySledzenieChodzi()` — „skoro usługa GPS chodzi,
     * to jej wpis wisi w pasku". To założenie przestało być prawdziwe:
     * od Androida 14 wpis usługi da się zdjąć palcem, a usługa działa dalej.
     * Wynikiem było zero powiadomień przy trwającej zmianie.
     *
     * `getPresentedNotificationsAsync()` zwraca to, co ta aplikacja ma
     * w pasku TERAZ. Cokolwiek tam jest — wpis usługi GPS albo nasz —
     * znaczy, że kurier widzi znak trwającej zmiany i nie ma co dokładać.
     */
    const widoczne = await Notifications.getPresentedNotificationsAsync();
    if (widoczne.length > 0) return;

    const zgoda = await Notifications.requestPermissionsAsync();
    if (!zgoda.granted) return;

    await kanal();

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Zmiana trwa',
        /**
         * Treść mówi wprost, czy pozycja leci — po samym pasku ma być widać,
         * czy GPS pracuje.
         *
         * `gpsChodzi` jest tu potrzebne, bo ten wpis powstaje w DWÓCH
         * sytuacjach: gdy śledzenia nie ma wcale, i gdy jest, ale kurier zdjął
         * palcem wpis usługi (Android 14 na to pozwala). W drugim przypadku
         * napisanie „GPS nie wysyła pozycji" byłoby nieprawdą.
         */
        body:
          (od === null ? '' : `Od ${od} · `) +
          (gpsChodzi ? 'Wysyłam pozycję. ' : 'GPS nie wysyła pozycji. ') +
          'Pamiętaj o zjeździe.',
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
