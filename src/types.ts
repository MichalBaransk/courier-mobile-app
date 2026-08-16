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

/** Lekki wiersz dzienny z `/api/v1/dni` — pod wykres i kalendarz. */
export interface DailyTotals {
  date: string;
  grossEarnings: number;
  netEarnings: number;
  cashTipsTotal: number;
  totalNetto: number;
  workHours: number;
  hourlyRateNetto: number;
  distanceKm: number;
  fuelCost: number;
}

/** Podsumowanie zakresu z `/api/v1/okres`. */
export interface PeriodSummary {
  startDate: string;
  endDate: string;
  totalGross: number;
  totalNettoEarnings: number;
  totalCashTips: number;
  grandTotalNetto: number;
  totalWalletPayouts: number;
  totalDoPrzelewu: number;
  totalWorkHours: number;
  avgHourlyRateNetto: number;
  totalFuelCost: number;
  totalFuelLiters: number;
  avgPricePerLiter: number | null;
  totalDistanceKm: number;
}

/** Saldo Portfela Glovo — suma transakcji ze znakiem. */
export interface Saldo {
  balance: number;
  transactionCount: number;
  lastDate: string | null;
}

/** Postęp celu zarobkowego — wszystko policzone po stronie serwera. */
export interface TargetProgress {
  periodType: 'MONTHLY' | 'WEEKLY';
  targetAmount: number;
  currentNetto: number;
  remainingNetto: number;
  progressPercent: number;
  daysRemaining: number;
  dailyRequiredNetto: number;
  avgHourlyRate: number;
  /** `true` = brak własnej historii godzin, użyto stawki domyślnej z CFG. */
  usedFallbackRate: boolean;
  estimatedHoursRemaining: number;
  hoursPerDayRequired: number;
  isCompleted: boolean;
}

export interface Cele {
  miesiac: TargetProgress | null;
  tydzien: TargetProgress | null;
}

/**
 * Pojedyncza oferta kursu zapisana przez bota ze zrzutu ekranu.
 *
 * `rateBasis` mówi, SKĄD wzięty jest dystans do stawki: `'APP'` (odczyt z ekranu
 * Glovo — podstawa, §8f), `'MAPS'` (kontrola dojazdu) albo `'NONE'`, gdy adres
 * nie dał się zgeokodować. Przy `'NONE'` `netRatePerKm` nie znaczy nic i nie
 * wolno go wliczać do średniej.
 */
export interface CourseOfferItem {
  id: number;
  date: string;
  time: string;
  grossAmount: number;
  netAmount: number;
  appTotalKm: number | null;
  mapsTotalKm: number | null;
  distanceTotalKm: number;
  rateBasis: string;
  netRatePerKm: number;
  isProfitable: boolean;
  status: string;
  pickupAddress: string | null;
  deliveryAddress: string | null;
}
