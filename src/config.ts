/**
 * Jedyne miejsce na stałe konfiguracyjne aplikacji.
 * Odpowiednik `src/config.ts` w backendzie — ta sama zasada.
 */

/** Adres API. Ten sam host co webhook bota (jedna subdomena, patrz plan §4). */
export const API_BASE = 'https://bot.baranskiha.ovh';

/**
 * Klucz w bezpiecznym magazynie systemu.
 *
 * Token NIE trafia do kodu ani do repozytorium — wpisujesz go raz przy
 * pierwszym uruchomieniu, a Android trzyma go w szyfrowanym keystore.
 * To ta sama zasada, co `.env` poza gitem na serwerze.
 */
export const TOKEN_KEY = 'glovo_api_token';

/** Po tylu ms uznajemy, że serwer nie odpowiada. Kurier nie ma czasu czekać. */
export const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Osobny, DŁUŻSZY timeout dla oceny oferty.
 *
 * Zwykłe zapisy to jeden `INSERT` i wracają w ułamku sekundy — 10 s jest tam
 * z ogromnym zapasem. Ocena oferty idzie inną drogą: obraz leci na serwer,
 * czeka w kolejce zapytań do Gemini (§11: jedno naraz, 1,2 s odstępu, do
 * czterech ponowień), model czyta zrzut, a potem jeszcze Google Maps liczy
 * dojazd. Przy zajętej kolejce i jednym ponowieniu spokojnie robi się z tego
 * kilkanaście sekund.
 *
 * Zbyt krótki timeout jest tu GORSZY niż długie czekanie: żądanie i tak doszło,
 * oferta zapisała się w bazie, a kurier widzi „serwer nie odpowiedział na czas"
 * i ocenia ją drugi raz — czyli płaci za drugie wywołanie modelu i dostaje
 * duplikat w statystykach.
 */
export const TIMEOUT_OCENY_MS = 45_000;

/**
 * Dzień-śmietnik do testów.
 *
 * Wpisy z tą datą nie mieszają się z żadnym prawdziwym dniem pracy, więc da się
 * je skasować jednym `DELETE ... WHERE date='2000-01-01'` bez ryzyka.
 *
 * Gdy aplikacja przestanie być testowana, usuń tę stałą i chip „Test"
 * z `DodajWpis.tsx` — to jedyne dwa miejsca, które o niej wiedzą.
 */
export const DATA_TESTOWA = '2000-01-01';

/**
 * Co ile ms ponawiać wysyłkę kolejki, gdy aplikacja jest otwarta.
 *
 * DLACZEGO TO ISTNIEJE: kolejka próbowała wysłać tylko przy starcie i przy
 * powrocie z tła. Jeśli trzymasz aplikację otwartą, a sieć wróci — nikt nie
 * ponawiał i wpis czekał do następnego przełączenia okna.
 *
 * DLACZEGO NIE `expo-network`: moduł ma otwarte zgłoszenia o niepoprawnym
 * raportowaniu stanu po rozłączeniu i ponownym połączeniu. Fałszywe „jest
 * sieć" biłoby w mur, fałszywe „nie ma" nie wysłałoby nic. Zwykły odstęp
 * czasu nic nie zakłada i nie potrafi skłamać.
 *
 * 30 s to kompromis: wystarczająco rzadko, żeby nie zjadać baterii przy
 * trwale zerwanym połączeniu, i wystarczająco często, żeby nie czekać.
 */
export const PONOWIENIE_KOLEJKI_MS = 30_000;
