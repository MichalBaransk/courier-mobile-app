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
