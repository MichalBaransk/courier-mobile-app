/**
 * Kolejka niewysłanych zapisów — CZYSTA logika, bez `expo-secure-store`,
 * bez `fetch`, bez React Native.
 *
 * Wydzielone tak celowo: to jest jedyny plik w aplikacji, którego błąd
 * kosztuje UTRATĘ DANYCH kuriera, więc musi dać się przetestować bez
 * telefonu, bez sieci i bez emulatora. Zapisem na dysk zajmuje się
 * `kolejkaMagazyn.ts`, wysyłką — `App.tsx`.
 *
 * ⚠️ NAJWAŻNIEJSZA PUŁAPKA CAŁEGO KROKU 5: `data` w ciele NIE MOŻE być `null`.
 *
 * Przy zapisie na żywo `null` znaczy „dzisiaj wyznaczone po stronie serwera"
 * i to jest właściwe zachowanie (§8a). Ale wpis zakolejkowany o 23:50
 * i wysłany o 00:10 wylądowałby w NASTĘPNYM dniu — cicho, bez błędu, w złej
 * dobie. Dlatego `dodaj()` wymaga jawnej daty i sam jej nie zgaduje.
 */

/** Zakresy, które wolno kolejkować. `usun` NIE — patrz `WYMAGA_POLACZENIA`. */
export type EndpointKolejki =
  | '/api/v1/napiwek'
  | '/api/v1/paliwo'
  | '/api/v1/dystans'
  | '/api/v1/brutto'
  | '/api/v1/zmiana'
  | '/api/v1/cel';

/**
 * Kasowanie NIE trafia do kolejki — świadoma decyzja, uzgodniona.
 *
 * `usun` działa na stanie, którego offline nie widać. „Usuń ostatni napiwek"
 * zakolejkowane o 14:00 i wysłane o 18:00 skasuje napiwek dodany o 16:00 —
 * inny niż ten, który użytkownik miał na ekranie. To cicha utrata danych,
 * a kasowanie jest nieodwracalne. Bez zasięgu przycisk ma powiedzieć wprost,
 * że wymaga połączenia.
 */
export const WYMAGA_POLACZENIA = ['/api/v1/usun'] as const;

export interface WpisKolejki {
  /** Jednocześnie `Idempotency-Key` wysyłany do serwera. */
  id: string;
  endpoint: EndpointKolejki;
  /** Gotowy JSON ciała — bez ponownej serializacji przy wysyłce. */
  cialo: string;
  /** Znacznik utworzenia w ms — do wygaszania po 48 h. */
  utworzony: number;
  /** Ile razy próbowaliśmy wysłać. */
  prob: number;
  /** Kiedy najwcześniej wolno spróbować ponownie (ms). */
  nastepnaProba: number;
  /** Opis dla użytkownika, np. `napiwek 5,50 zł · 16 sierpnia`. */
  opis: string;
  /**
   * Komunikat serwera, gdy wpis został TRWALE odrzucony (np. 400).
   *
   * Taki wpis zostaje w kolejce i czeka na decyzję użytkownika, zamiast
   * zniknąć. Ponawianie go w nieskończoność nic nie da, ale ciche skasowanie
   * byłoby utratą danych — a użytkownik wpisał tę wartość świadomie.
   */
  blad?: string | null;
}

/**
 * Twardy limit długości kolejki.
 *
 * Nie jest wzięty z sufitu: kolejka leży w `expo-secure-store`, a ten ostrzega
 * przy wartościach powyżej 2048 bajtów. Trzymamy klucz na wpis (~200 B) plus
 * indeks identyfikatorów (20 × 36 znaków ≈ 750 B), więc każda wartość zostaje
 * daleko pod limitem.
 *
 * Po przekroczeniu limitu aplikacja MÓWI, że kolejka jest pełna, zamiast po
 * cichu wyrzucić najstarszy wpis. Ciche gubienie danych jest tu gorsze niż
 * odmowa — użytkownik ma szansę zareagować.
 */
export const LIMIT_KOLEJKI = 20;

/** Po tylu godzinach wpis jest bezwartościowy i zostaje porzucony. */
export const WYGASA_PO_H = 48;

/** Po tylu nieudanych próbach wpis czeka na ręczne „Ponów". */
export const MAKS_PROB = 5;

/** Odstępy między próbami. Ostatni powtarza się dla dalszych prób. */
const BACKOFF_MS = [5_000, 15_000, 60_000, 300_000];

export type WynikDodania =
  | { ok: true; kolejka: WpisKolejki[] }
  | { ok: false; powod: string };

/**
 * Nowy identyfikator wpisu, a zarazem `Idempotency-Key`.
 *
 * Nie `crypto.randomUUID()` — w silniku Hermes go nie ma, a `expo-crypto` to
 * moduł natywny, czyli koniec aktualizacji OTA. `Math.random()` wystarcza,
 * bo ten klucz niczego nie zabezpiecza: ma tylko być niepowtarzalny.
 *
 * Znacznik czasu i licznik z przodu sprawiają, że kolizja w obrębie jednej
 * sesji jest niemożliwa, a nie tylko nieprawdopodobna — dwa wpisy dodane
 * w tej samej milisekundzie i tak dostaną różne liczniki.
 */
let licznik = 0;
export function nowyKlucz(teraz: number): string {
  licznik = (licznik + 1) % 100_000;
  const losowa = Math.floor(Math.random() * 0xffffffff).toString(36);
  return `k-${teraz.toString(36)}-${licznik.toString(36)}-${losowa}`;
}

/**
 * Dodaje wpis na koniec kolejki.
 *
 * `data` jest wymagana i musi być łańcuchem `RRRR-MM-DD` — patrz nagłówek
 * pliku. Funkcja tego pilnuje, zamiast ufać wywołującemu.
 */
export function dodaj(
  kolejka: WpisKolejki[],
  wpis: {
    endpoint: EndpointKolejki;
    cialo: Record<string, unknown>;
    opis: string;
    /** Data SERWEROWA, nie z zegara telefonu. `null` = wpis bez daty (cel). */
    data: string | null;
    /**
     * Klucz użyty przy nieudanej próbie „na żywo".
     *
     * To NIE jest szczegół. Jeśli żądanie wyszło, doszło do serwera i dopiero
     * odpowiedź zginęła, ponowienie z TYM SAMYM kluczem zostanie rozpoznane
     * przez serwer jako powtórka i nie utworzy drugiego napiwka. Nowy klucz
     * zrobiłby z tej sytuacji duplikat — czyli dokładnie to, przed czym cała
     * idempotencja ma chronić.
     */
    id?: string;
  },
  teraz: number
): WynikDodania {
  if (kolejka.length >= LIMIT_KOLEJKI) {
    return {
      ok: false,
      powod: `Kolejka jest pełna (${LIMIT_KOLEJKI} wpisów). Połącz się z siecią i wyślij to, co czeka.`,
    };
  }

  // Cel nie dotyczy konkretnego dnia — tam brak daty jest poprawny.
  const wymagaDaty = wpis.endpoint !== '/api/v1/cel';
  if (wymagaDaty && (wpis.data === null || !/^\d{4}-\d{2}-\d{2}$/.test(wpis.data))) {
    return {
      ok: false,
      powod: 'Nie znam dzisiejszej daty serwera, więc nie zakolejkuję tego wpisu.',
    };
  }

  const cialo = wymagaDaty ? { ...wpis.cialo, data: wpis.data } : { ...wpis.cialo };

  return {
    ok: true,
    kolejka: [
      ...kolejka,
      {
        id: wpis.id ?? nowyKlucz(teraz),
        endpoint: wpis.endpoint,
        cialo: JSON.stringify(cialo),
        utworzony: teraz,
        prob: 0,
        nastepnaProba: teraz,
        opis: wpis.opis,
      },
    ],
  };
}

/** Wpisy starsze niż 48 h. Zwracane osobno, żeby dało się o nich powiedzieć. */
export function podzielWygasle(
  kolejka: WpisKolejki[],
  teraz: number
): { zywe: WpisKolejki[]; wygasle: WpisKolejki[] } {
  const granica = teraz - WYGASA_PO_H * 3_600_000;
  return {
    zywe: kolejka.filter((w) => w.utworzony >= granica),
    wygasle: kolejka.filter((w) => w.utworzony < granica),
  };
}

/**
 * Pierwszy wpis gotowy do wysłania.
 *
 * FIFO i **ściśle jeden naraz**. Równoległe wysłanie dwóch upsertów na ten sam
 * dzień (`dystans`, `brutto`, `zmiana`) daje wynik zależny od kolejności
 * odpowiedzi, czyli losowy.
 */
export function nastepny(kolejka: WpisKolejki[], teraz: number): WpisKolejki | null {
  return (
    kolejka.find((w) => w.prob < MAKS_PROB && w.nastepnaProba <= teraz) ?? null
  );
}

/** Wpis wysłany — znika z kolejki. */
export function usunPoWyslaniu(kolejka: WpisKolejki[], id: string): WpisKolejki[] {
  return kolejka.filter((w) => w.id !== id);
}

/** Ręczne usunięcie z kolejki (użytkownik rezygnuje z wpisu). */
export const usunRecznie = usunPoWyslaniu;

/**
 * Próba nieudana — rośnie licznik i odsuwa się następne podejście.
 *
 * Backoff rośnie, bo powtarzanie co sekundę przy braku zasięgu tylko zjada
 * baterię. Po `MAKS_PROB` wpis przestaje być brany automatycznie i czeka
 * na ręczne „Ponów" — nie znika.
 */
export function poNieudanej(
  kolejka: WpisKolejki[],
  id: string,
  teraz: number
): WpisKolejki[] {
  return kolejka.map((w) => {
    if (w.id !== id) return w;
    const prob = w.prob + 1;
    const odstep = BACKOFF_MS[Math.min(prob - 1, BACKOFF_MS.length - 1)] ?? 60_000;
    return { ...w, prob, nastepnaProba: teraz + odstep };
  });
}

/**
 * Wpis TRWALE odrzucony przez serwer (400 — zła wartość, zły format).
 *
 * Zostaje w kolejce z komunikatem, ale przestaje być ponawiany. Ponowienie
 * niczego nie zmieni, a ciche skasowanie byłoby utratą danych, które
 * użytkownik wpisał świadomie. Decyzję zostawiamy jemu: „Usuń" albo „Ponów".
 */
export function oznaczOdrzucony(
  kolejka: WpisKolejki[],
  id: string,
  komunikat: string
): WpisKolejki[] {
  return kolejka.map((w) =>
    w.id === id ? { ...w, prob: MAKS_PROB, blad: komunikat } : w
  );
}

/** „Ponów teraz" — zeruje liczniki i kasuje zapamiętane błędy. */
export function ponowWszystkie(kolejka: WpisKolejki[], teraz: number): WpisKolejki[] {
  return kolejka.map((w) => ({ ...w, prob: 0, nastepnaProba: teraz, blad: null }));
}

/** Ile wpisów odbiło się od `MAKS_PROB` i czeka na decyzję użytkownika. */
export function ileZablokowanych(kolejka: WpisKolejki[]): number {
  return kolejka.filter((w) => w.prob >= MAKS_PROB).length;
}

/**
 * Czy błąd oznacza „nie doszło do serwera", czyli sytuację do zakolejkowania.
 *
 * `status === null` ustawia `api.ts` przy zerwanym połączeniu i przy timeoucie.
 * Odpowiedź z serwera — nawet 400 — znaczy, że sieć DZIAŁA, a żądanie jest złe.
 * Kolejkowanie takiego wpisu tylko powtarzałoby ten sam błąd w nieskończoność.
 *
 * Świadomie BEZ `@react-native-community/netinfo`: to moduł natywny, a jego
 * jedyną zaletą byłoby wcześniejsze wykrycie braku sieci.
 */
export function toBrakSieci(status: number | null): boolean {
  return status === null;
}
