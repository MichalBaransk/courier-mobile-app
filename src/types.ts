/**
 * Typy przepisane ręcznie z backendu (`src/services/finance.service.ts`).
 *
 * Świadomie duplikat, nie wspólna paczka — patrz plan §5. Wydzielenie ma sens
 * dopiero, gdy typy zaczną się rozjeżdżać; projekt ma już problem dwóch kopii
 * repozytorium i nie ma powodu go pogłębiać.
 *
 * Kontrakt chroni prefiks `/api/v1/`: zmiana kształtu odpowiedzi po stronie
 * serwera pójdzie jako `/v2`, a nie po cichu zepsuje aplikację na telefonie.
 */

export interface ApiInfo {
  api: string;
  tz: string;
  nettoFactor: number;
  minStawkaNettoKm: number;
  dzisiaj: string;
}

export interface DailySummary {
  /** `YYYY-MM-DD` w strefie Europe/Warsaw. Nigdy UTC. */
  date: string;
  grossEarnings: number;
  /** brutto × 0.814 — to, co wpłynie na konto. */
  netEarnings: number;
  cashTipsTotal: number;
  /** netEarnings + cashTipsTotal — ile kurier zarobił. */
  totalNetto: number;
  walletPayouts: number;
  /** netEarnings − walletPayouts. Może być ujemne i ma to być widoczne. */
  doPrzelewu: number;
  workFrom: string | null;
  workTo: string | null;
  workHours: number;
  hourlyRateNetto: number;
  fuelCost: number;
  fuelLiters: number;
  fuelPricePerLiter: number | null;
  fuelReceiptCount: number;
  distanceKm: number | null;
}
