import { API_BASE, REQUEST_TIMEOUT_MS } from './config';
import type { ApiInfo, DailySummary } from './types';

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

async function request<T>(path: string, token: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
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
    throw new ApiError(`Serwer zwrócił błąd ${response.status}.`, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('Odpowiedź serwera nie jest poprawnym JSON-em.', response.status);
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
