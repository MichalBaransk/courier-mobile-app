import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Zapis ostatniej awarii, żeby dało się ją przeczytać PO ponownym starcie.
 *
 * PO CO. Zgłoszenie z 20.08: „aplikacja zaczęła lubić crashe, wywala mnie
 * najprawdopodobniej w ustawieniach". Słowo „najprawdopodobniej" jest tu
 * najważniejsze — po wywaleniu aplikacji nie zostaje nic: komunikat mignął
 * i przepadł, `console.error` idzie do konsoli, której na telefonie nikt nie
 * czyta, a Metro trzeba by mieć podłączone dokładnie w tej sekundzie.
 *
 * To ten sam problem, co przy śledzeniu w tle godzinę wcześniej: mechanizm
 * odmawia po cichu, więc rozmowa schodzi na zgadywanie. Tam pomogło zapisanie
 * powodu i pokazanie go w Diagnostyce — i to samo robi ten plik.
 *
 * NIE JEST TO ZASTĘPSTWO SENTRY. Łapie wyłącznie błędy JavaScriptu widziane
 * przez `ErrorUtils`; awaria w module natywnym ubije proces bez pytania nikogo
 * o zdanie i tutaj nie zostawi śladu. Za to nie wymaga konta, sieci ani
 * modułu natywnego, czyli działa przez OTA i od razu.
 */

const KLUCZ = 'ostatnia_awaria';

export interface Awaria {
  /** Treść błędu — pierwsza linia, ta która coś mówi. */
  komunikat: string;
  /** Kilka pierwszych ramek stosu. Całość nie mieści się na ekranie telefonu. */
  stos: string;
  /** Czy błąd był śmiertelny dla aplikacji, czy tylko zgłoszony. */
  smiertelny: boolean;
}

export async function odczytajAwarie(): Promise<Awaria | null> {
  try {
    const surowe = await AsyncStorage.getItem(KLUCZ);
    return surowe === null ? null : (JSON.parse(surowe) as Awaria);
  } catch {
    return null;
  }
}

export async function skasujAwarie(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KLUCZ);
  } catch {
    /* nieistotne */
  }
}

/**
 * Podpięcie pod globalną obsługę błędów Reacta Native.
 *
 * `ErrorUtils` jest w RDZENIU React Native — nie wymaga żadnej zależności.
 * Nie ma go w typach, stąd rzutowanie; to jedyne miejsce w projekcie, gdzie
 * takie rzutowanie jest uzasadnione, bo chodzi o globalną zmienną platformy.
 *
 * ⚠️ POPRZEDNI HANDLER MUSI ZOSTAĆ WYWOŁANY. To on pokazuje czerwony ekran
 * w trybie deweloperskim i on kończy proces przy błędzie śmiertelnym.
 * Zjedzenie go zamieniłoby awarię w ciszę — czyli dokładnie w to, z czym
 * walczymy.
 *
 * Zapis jest asynchroniczny, a proces przy błędzie śmiertelnym zaraz zginie.
 * Nie da się na to poradzić bez modułu natywnego; w praktyce `AsyncStorage`
 * zdąży, bo poprzedni handler też robi swoje przez most. Gdyby nie zdążył,
 * stracimy jeden zapis — nadal lepiej niż zero.
 */
export function pilnujAwarii(): void {
  const utils = (globalThis as { ErrorUtils?: {
    getGlobalHandler: () => (blad: Error, smiertelny?: boolean) => void;
    setGlobalHandler: (h: (blad: Error, smiertelny?: boolean) => void) => void;
  } }).ErrorUtils;

  if (!utils) return;

  const poprzedni = utils.getGlobalHandler();

  utils.setGlobalHandler((blad, smiertelny) => {
    const zapis: Awaria = {
      komunikat: blad?.message ?? String(blad),
      stos: (blad?.stack ?? '').split('\n').slice(0, 4).join('\n'),
      smiertelny: smiertelny === true,
    };

    void AsyncStorage.setItem(KLUCZ, JSON.stringify(zapis)).catch(() => {
      /* nie ma gdzie tego zgłosić — właśnie po to ten plik powstał */
    });

    poprzedni(blad, smiertelny);
  });
}
