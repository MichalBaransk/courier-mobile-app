import { API_BASE, REQUEST_TIMEOUT_MS } from './config';
import type { ApiInfo, DailySummary, DailyTotals, PeriodSummary, Saldo } from './types';

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

async function request<T>(path: string, token: string, cialo?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: cialo === undefined ? 'GET' : 'POST',
      headers:
        cialo === undefined
          ? { Authorization: `Bearer ${token}` }
          : { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(cialo === undefined ? {} : { body: JSON.stringify(cialo) }),
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

async function zapisz(path: string, token: string, cialo: unknown): Promise<ZapisOdpowiedz> {
  const dane = await request<unknown>(path, token, cialo);
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
export const postNapiwek = (token: string, kwota: number, data: string | null) =>
  zapisz('/api/v1/napiwek', token, { kwota, data });

export const postPaliwo = (
  token: string,
  kwota: number,
  litry: number | null,
  cenaZaLitr: number | null,
  data: string | null
) => zapisz('/api/v1/paliwo', token, { kwota, litry, cenaZaLitr, data });

export const postDystans = (token: string, km: number, data: string | null) =>
  zapisz('/api/v1/dystans', token, { km, data });

export const postBrutto = (token: string, kwota: number, data: string | null) =>
  zapisz('/api/v1/brutto', token, { kwota, data });

export const postZmiana = (
  token: string,
  od: string | null,
  doGodz: string | null,
  data: string | null
) => zapisz('/api/v1/zmiana', token, { od, do: doGodz, data });

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
