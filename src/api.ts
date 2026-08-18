import { API_BASE, REQUEST_TIMEOUT_MS } from './config';
import type { OdczytPozycji } from './lokalizacjaOdczyt';
import type {
  ApiInfo,
  Cele,
  CourseOfferItem,
  DailySummary,
  DailyTotals,
  PeriodSummary,
  Saldo,
  TargetProgress,
} from './types';

/**
 * Klient REST API bota.
 *
 * Każdy błąd ma tu ZROZUMIAŁY komunikat po polsku. Zasada z backendu (§14):
 * nigdy nie połykaj wyjątku cicho i nie zamieniaj go na ciszę — użytkownik
 * musi wiedzieć, czy padła sieć, czy token, czy serwer.
 */
export class ApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  /** Token odrzucony — trzeba wrócić do ekranu wpisywania. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/**
 * Klucz idempotencji.
 *
 * Wysyłany TYLKO wtedy, gdy wywołujący go poda — czyli przy zapisach z kolejki
 * i przy zwykłych zapisach z formularza. Serwer bez tego nagłówka zachowuje
 * się dokładnie jak wcześniej, więc starsza wersja aplikacji nadal działa.
 */
async function request<T>(
  path: string,
  token: string,
  cialo?: unknown,
  klucz?: string
): Promise<T> {
  const cialoJson = cialo === undefined ? undefined : JSON.stringify(cialo);
  return zadanie<T>(path, token, cialoJson, klucz);
}

async function zadanie<T>(
  path: string,
  token: string,
  cialoJson: string | undefined,
  klucz: string | undefined
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const naglowki: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (cialoJson !== undefined) naglowki['content-type'] = 'application/json';
  if (klucz !== undefined) naglowki['idempotency-key'] = klucz;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: cialoJson === undefined ? 'GET' : 'POST',
      headers: naglowki,
      ...(cialoJson === undefined ? {} : { body: cialoJson }),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      controller.signal.aborted
        ? 'Serwer nie odpowiedział na czas.'
        : 'Brak połączenia z serwerem.',
      null
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    throw new ApiError('Serwer odrzucił token.', 401);
  }
  if (response.status === 503) {
    throw new ApiError('API jest wyłączone — brak API_TOKEN w .env na serwerze.', 503);
  }

  if (!response.ok) {
    // Backend przy 400 zwraca `{ "error": "Pole \"kwota\" musi być…" }`.
    // Te komunikaty są pisane pod użytkownika, więc pokazujemy je wprost
    // zamiast generycznego „błąd 400" — po to powstały.
    const zSerwera = await odczytajKomunikatBledu(response);
    throw new ApiError(zSerwera ?? `Serwer zwrócił błąd ${response.status}.`, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('Odpowiedź serwera nie jest poprawnym JSON-em.', response.status);
  }
}

async function odczytajKomunikatBledu(response: Response): Promise<string | null> {
  try {
    const tresc = (await response.json()) as { error?: unknown };
    return typeof tresc.error === 'string' && tresc.error.length > 0 ? tresc.error : null;
  } catch {
    return null;
  }
}

/**
 * Lekka kontrola kształtu odpowiedzi.
 *
 * Nie zaciągam tu zoda: API jest nasze, typowane i wersjonowane przez `/v1`,
 * więc pełna walidacja byłaby przerostem. Ale samo `as DailySummary` to
 * obietnica bez pokrycia — przy zmianie kontraktu wolę zobaczyć jasny błąd
 * niż `undefined.toFixed()` w środku renderowania.
 */
function assertDailySummary(value: unknown): asserts value is DailySummary {
  const v = value as Partial<DailySummary> | null;
  if (
    !v ||
    typeof v.date !== 'string' ||
    typeof v.grossEarnings !== 'number' ||
    typeof v.totalNetto !== 'number'
  ) {
    throw new ApiError('Serwer zwrócił dane w nieoczekiwanym formacie.', null);
  }
}

/** Metadane API. Używane też do sprawdzenia tokena przy pierwszym logowaniu. */
export async function getInfo(token: string): Promise<ApiInfo> {
  return request<ApiInfo>('/api/v1/info', token);
}

/** Podsumowanie dzisiejszego dnia. Datę wyznacza serwer (Europe/Warsaw). */
export async function getToday(token: string): Promise<DailySummary> {
  const data = await request<unknown>('/api/v1/dzien', token);
  assertDailySummary(data);
  return data;
}

/* ========================================================================== */
/*  Zapisy (krok 3a)                                                          */
/* ========================================================================== */

/**
 * Każdy zapis zwraca świeży stan dnia, więc po dodaniu wpisu nie trzeba
 * osobno odpytywać `/dzien` — jedna podróż zamiast dwóch.
 *
 * ⚠️ Endpointy NIE są idempotentne (krok 3b). Napiwek i paliwo to czyste
 * `INSERT` po stronie bazy: dwa kliknięcia = dwa wpisy. Dlatego przycisk
 * zapisu blokuje się na czas żądania.
 */
export interface ZapisOdpowiedz {
  dzien: DailySummary;
  /** Np. ostrzeżenie o zmianie dłuższej niż 16 h. */
  ostrzezenie: string | null;
}

async function zapisz(
  path: string,
  token: string,
  cialo: unknown,
  klucz?: string
): Promise<ZapisOdpowiedz> {
  const dane = await request<unknown>(path, token, cialo, klucz);
  const w = dane as Partial<ZapisOdpowiedz> | null;
  if (!w || typeof w.dzien !== 'object' || w.dzien === null) {
    throw new ApiError('Serwer potwierdził zapis w nieoczekiwanym formacie.', null);
  }
  assertDailySummary(w.dzien);
  return { dzien: w.dzien, ostrzezenie: typeof w.ostrzezenie === 'string' ? w.ostrzezenie : null };
}

/**
 * `data` to `RRRR-MM-DD` albo `null`.
 *
 * `null` znaczy „dzisiaj wyznaczone PO STRONIE SERWERA" — bezpieczniejsze niż
 * wysyłanie daty z zegara telefonu, który może mieć inną strefę.
 */
export const postNapiwek = (token: string, kwota: number, data: string | null, klucz?: string) =>
  zapisz('/api/v1/napiwek', token, { kwota, data }, klucz);

/**
 * Pozycja kuriera. JEDYNY zapis, który nie zwraca stanu dnia.
 *
 * Powód po stronie serwera: pozycja nie jest wpisem do rozliczenia, tylko
 * stanem chwilowym. Doklejanie podsumowania dnia do odpowiedzi oznaczałoby
 * kilka zapytań do bazy co dwadzieścia sekund przez całą zmianę, bez żadnego
 * pożytku.
 *
 * NIE trafia do kolejki offline i NIE dostaje `Idempotency-Key`. Pozycja
 * sprzed dziesięciu minut jest bezwartościowa (patrz budżet błędu), więc
 * odkładanie jej na później byłoby dostarczaniem śmieci. Brak sieci = odczyt
 * przepada i tak ma być.
 *
 * Serwer oddaje SWÓJ budżet błędu, żeby aplikacja nie musiała go powtarzać
 * u siebie — jedna zmiana w `.env` przestawia obie strony naraz.
 */
export interface LokalizacjaOdpowiedz {
  zapisano: boolean;
  maksBladM: number;
  zaporaS: number;
}

export function postLokalizacja(
  token: string,
  odczyt: OdczytPozycji
): Promise<LokalizacjaOdpowiedz> {
  return request<LokalizacjaOdpowiedz>('/api/v1/lokalizacja', token, {
    lat: odczyt.lat,
    lon: odczyt.lon,
    dokladnoscM: odczyt.dokladnoscM,
    predkoscMps: odczyt.predkoscMps,
    wiekMs: odczyt.wiekMs,
  });
}

export const postPaliwo = (
  token: string,
  kwota: number,
  litry: number | null,
  cenaZaLitr: number | null,
  data: string | null,
  klucz?: string
) => zapisz('/api/v1/paliwo', token, { kwota, litry, cenaZaLitr, data }, klucz);

export const postDystans = (token: string, km: number, data: string | null, klucz?: string) =>
  zapisz('/api/v1/dystans', token, { km, data }, klucz);

export const postBrutto = (token: string, kwota: number, data: string | null, klucz?: string) =>
  zapisz('/api/v1/brutto', token, { kwota, data }, klucz);

export const postZmiana = (
  token: string,
  od: string | null,
  doGodz: string | null,
  data: string | null,
  klucz?: string
) => zapisz('/api/v1/zmiana', token, { od, do: doGodz, data }, klucz);

/* ========================================================================== */
/*  Historia (krok 4)                                                         */
/* ========================================================================== */

/** Podsumowanie wybranego dnia. */
export async function getDzien(token: string, data: string): Promise<DailySummary> {
  const dane = await request<unknown>(`/api/v1/dzien/${data}`, token);
  assertDailySummary(dane);
  return dane;
}

/** Dzienne sumy dla zakresu — jedno wywołanie na cały tydzień albo miesiąc. */
export async function getDni(token: string, od: string, doDaty: string): Promise<DailyTotals[]> {
  const dane = await request<{ items?: unknown }>(
    `/api/v1/dni?od=${od}&do=${doDaty}`,
    token
  );
  return Array.isArray(dane.items) ? (dane.items as DailyTotals[]) : [];
}

export function getOkres(token: string, od: string, doDaty: string): Promise<PeriodSummary> {
  return request<PeriodSummary>(`/api/v1/okres?od=${od}&do=${doDaty}`, token);
}

export function getSaldo(token: string): Promise<Saldo> {
  return request<Saldo>('/api/v1/saldo', token);
}

/** Zakresy kasowania — te same, które bot obsługuje głosem. */
export type ZakresUsuniecia =
  | 'LAST_TIP'
  | 'ALL_TIPS'
  | 'FUEL'
  | 'HOURS'
  | 'EARNINGS'
  | 'DISTANCE'
  | 'ALL_DAY';

export interface UsunOdpowiedz {
  usuniete: boolean;
  komunikat: string;
  dzien: DailySummary;
}

export async function postUsun(
  token: string,
  cel: ZakresUsuniecia,
  data: string | null
): Promise<UsunOdpowiedz> {
  const dane = await request<UsunOdpowiedz>('/api/v1/usun', token, { cel, data });
  assertDailySummary(dane.dzien);
  return dane;
}

/* ========================================================================== */
/*  Cele i oferty                                                             */
/* ========================================================================== */

export function getCele(token: string): Promise<Cele> {
  return request<Cele>('/api/v1/cele', token);
}

export function postCel(
  token: string,
  okres: 'MONTHLY' | 'WEEKLY',
  kwota: number,
  klucz?: string
): Promise<{ postep: TargetProgress | null }> {
  return request<{ postep: TargetProgress | null }>('/api/v1/cel', token, { okres, kwota }, klucz);
}

/**
 * Serwer dopuszcza 500 (`MAX_OFFERS_LIMIT` w `routes.read.ts`). Biorę maksimum:
 * ucięcie listy zafałszowałoby średnią stawkę i nie zostawiło po sobie śladu
 * na ekranie.
 */
const MAKS_OFERT = 500;

/**
 * Oferty z zakresu — jedno żądanie na cały miesiąc.
 *
 * Statystyki pojedynczego dnia liczę z tej listy w `Oferty.tsx`, zamiast wołać
 * `/api/v1/oferty/statystyki/:data` — miesiąc i tak przychodzi w komplecie pod
 * kalendarz. Uwaga: średnia stawka liczona jest tam odrobinę inaczej niż na
 * serwerze; różnica i jej powód są opisane w nagłówku `Oferty.tsx`.
 * Endpoint zostaje po stronie serwera, bo używa go bot.
 */
export async function getOferty(
  token: string,
  od: string,
  doDaty: string
): Promise<CourseOfferItem[]> {
  const dane = await request<{ items?: unknown }>(
    `/api/v1/oferty?od=${od}&do=${doDaty}&limit=${MAKS_OFERT}`,
    token
  );
  return Array.isArray(dane.items) ? (dane.items as CourseOfferItem[]) : [];
}

/* ========================================================================== */
/*  Wysyłka z kolejki offline (krok 5)                                        */
/* ========================================================================== */

/**
 * Wysyła gotowy, zserializowany wpis z kolejki.
 *
 * Ciało idzie DOSŁOWNIE takie, jakie zostało zapisane w chwili dodania do
 * kolejki — bez ponownej serializacji i bez uzupełniania czegokolwiek.
 * Tam jest już zamrożona data serwerowa i to jest cały sens: wpis dodany
 * o 23:50 ma trafić do wczorajszej doby, nawet gdy wychodzi o 00:10.
 *
 * `klucz` to `Idempotency-Key`. Dzięki niemu ponowienie po timeoucie, przy
 * którym żądanie JEDNAK doszło, nie utworzy drugiego napiwka.
 *
 * Rzuca `ApiError` — wywołujący rozróżnia po `status`: `null` znaczy „nie
 * doszło, spróbuj ponownie", cokolwiek innego znaczy „serwer odpowiedział".
 */
export async function wyslijZKolejki(
  token: string,
  endpoint: string,
  cialoJson: string,
  klucz: string
): Promise<void> {
  await zadanie<unknown>(endpoint, token, cialoJson, klucz);
}
