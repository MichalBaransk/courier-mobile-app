import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { czySledzenieChodzi } from './gpsTlo';


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
 * całą robotę wykonuje `zapewnijPowiadomienieZmiany`, wołane przy każdym
 * powrocie aplikacji na wierzch. Machnięty wpis wraca, gdy otworzysz apkę.
 *
 * Odtwarzania z zadania GPS w tle (P25) już NIE MA. Zadanie budzi się wtedy,
 * gdy śledzenie chodzi — a wtedy w pasku i tak wisi wpis usługi, więc
 * odtwarzanie było albo bezczynne, albo produkowało drugi, przeczący wpis.
 */

const KANAL = 'zmiana';

/**
 * STAŁY identyfikator powiadomienia. Tu leży cała ochrona przed duplikatami.
 *
 * Android traktuje wpis o tym samym identyfikatorze jako PODMIANĘ, nie jako
 * nowy. Dzięki temu nieważne, ile razy i z ilu miejsc naraz zawołamy
 * `zapewnijPowiadomienieZmiany` — w pasku będzie dokładnie jeden.
 *
 * ZASTĄPIŁO TO DWA STRAŻNIKI, KTÓRE NIE DZIAŁAŁY:
 *
 * 1. Identyfikator w `AsyncStorage` (P24) — działał, dopóki wołający był jeden.
 * 2. Odpytywanie `getPresentedNotificationsAsync()` (P25) — **ściga się samo
 *    ze sobą**. Sprawdzenie jest asynchroniczne, więc kilka wywołań
 *    startujących w tej samej chwili widzi pusty pasek i każde zakłada własny
 *    wpis. Dokładnie to pokazał zrzut z telefonu: cztery „Zmiana trwa"
 *    o tej samej minucie, znikające pojedynczo przy machaniu palcem.
 *
 * Nauka: przy stanie współdzielonym „sprawdź, potem zrób" jest błędem
 * z definicji. Ta sama pomyłka, co przy idempotencji w API bota — i tam
 * rozwiązaniem też było przeniesienie rozstrzygnięcia tam, gdzie jest atomowe.
 */
const ID_POWIADOMIENIA = 'zmiana-trwa';

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
 * Zakłada albo odświeża powiadomienie o trwającej zmianie.
 *
 * Wołać można ile razy się chce i skąd się chce — stały identyfikator
 * sprawia, że wpis jest PODMIENIANY, nie dokładany.
 */
export async function zapewnijPowiadomienieZmiany(od: string | null): Promise<void> {
  try {
    /**
     * Gdy chodzi śledzenie w tle, Android sam wystawia wpis usługi
     * pierwszoplanowej („Zmiana trwa — Wysyłam pozycję…"). Nasz byłby wtedy
     * drugim wpisem o tej samej rzeczy, w dodatku przeczącym tamtemu.
     *
     * Wiem o tym z `hasStartedLocationUpdatesAsync`, czyli od systemu, a nie
     * z odpytywania paska powiadomień. Wersja z `getPresentedNotificationsAsync`
     * wyglądała mądrzej i była gorsza — patrz `ID_POWIADOMIENIA`.
     *
     * ⚠️ CZEGO TO NIE ZAŁATWIA: zdjęcia palcem wpisu USŁUGI przy działającym
     * GPS-ie. Usługa chodzi dalej, więc tu nadal wychodzi „jest wpis",
     * a w pasku pusto. Nie umiem tego wykryć — Android nie daje na to
     * żadnego sygnału, a zgadywanie skończyło się czterema powiadomieniami.
     */
    if (await czySledzenieChodzi()) return;

    /**
     * ⚠️ To sprawdzenie mówi prawdę tylko O TEJ CHWILI.
     *
     * Gdy zmiana dopiero się otwiera, śledzenie może być w połowie
     * uruchamiania (trwa pytanie o zgodę) i wyjdzie „nie chodzi". Dlatego
     * `App.tsx` po UDANYM starcie woła `schowajPowiadomienieZmiany()` —
     * inaczej zostawał tu wpis „GPS nie wysyła pozycji" przy działającym
     * GPS-ie i zgodzie „zawsze". Zgłoszone z telefonu 20.08.
     */

    const zgoda = await Notifications.requestPermissionsAsync();
    if (!zgoda.granted) return;

    await kanal();

    await Notifications.scheduleNotificationAsync({
      // Stały identyfikator = podmiana zamiast duplikatu.
      identifier: ID_POWIADOMIENIA,
      content: {
        title: 'Zmiana trwa',
        body:
          (od === null ? '' : `Od ${od} · `) + 'GPS nie wysyła pozycji. Pamiętaj o zjeździe.',
        // Android 13 i starsze: wpisu nie da się zdjąć machnięciem.
        // Od Androida 14 to tylko sugestia — patrz nagłówek pliku.
        sticky: true,
        autoDismiss: false,
        ...(Platform.OS === 'android' ? { channelId: KANAL } : {}),
      },
      trigger: null,
    });
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
    await Notifications.dismissNotificationAsync(ID_POWIADOMIENIA);
  } catch {
    /* nie było czego zdejmować */
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(ID_POWIADOMIENIA);
  } catch {
    /* jw. */
  }
}
