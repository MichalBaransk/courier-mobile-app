import { describe, expect, it } from 'vitest';

import { czyOsierocone, decyzjaSledzenia, MAKS_GODZIN_SLEDZENIA } from './gpsTloReguly';

const GODZINA = 3600_000;
const TERAZ = 1_755_700_000_000;

describe('czyOsierocone — zapora na zapomniane śledzenie', () => {
  it('świeżo uruchomione zadanie nie jest sierotą', () => {
    expect(czyOsierocone(TERAZ - GODZINA, TERAZ)).toBe(false);
  });

  it('granica szesnastu godzin', () => {
    expect(czyOsierocone(TERAZ - MAKS_GODZIN_SLEDZENIA * GODZINA, TERAZ)).toBe(false);
    expect(czyOsierocone(TERAZ - MAKS_GODZIN_SLEDZENIA * GODZINA - 1, TERAZ)).toBe(true);
  });

  it('brak znacznika startu liczy się jako sierota', () => {
    // Zadanie przeżyło restart aplikacji, a my nie wiemy, od kiedy chodzi.
    // Lepiej zatrzymać i pozwolić aplikacji włączyć je z powrotem.
    expect(czyOsierocone(null, TERAZ)).toBe(true);
    expect(czyOsierocone(Number.NaN, TERAZ)).toBe(true);
  });

  it('znacznik z przyszłości nie zatrzymuje śledzenia', () => {
    // Przestawiony zegar telefonu. Różnica wychodzi ujemna, więc limit
    // nie jest przekroczony — i dobrze: to nie jest powód do wyłączania GPS-a
    // w trakcie kursu.
    expect(czyOsierocone(TERAZ + 5 * GODZINA, TERAZ)).toBe(false);
  });
});

describe('decyzjaSledzenia — uzgodnienie stanu', () => {
  const stan = (zmianaTrwa: boolean, wysylajPozycje: boolean, zadanieChodzi: boolean) =>
    decyzjaSledzenia({ zmianaTrwa, wysylajPozycje, zadanieChodzi });

  it('otwarta zmiana i włączona wysyłka uruchamiają śledzenie', () => {
    expect(stan(true, true, false)).toBe('start');
  });

  it('już chodzi — nie uruchamiamy drugi raz', () => {
    expect(stan(true, true, true)).toBe('nic');
  });

  it('zamknięta zmiana zatrzymuje chodzące zadanie', () => {
    expect(stan(false, true, true)).toBe('stop');
  });

  it('wyłączony przełącznik zatrzymuje, mimo otwartej zmiany', () => {
    expect(stan(true, false, true)).toBe('stop');
  });

  it('nic nie chodzi i nic nie ma chodzić — zero ruchu', () => {
    expect(stan(false, false, false)).toBe('nic');
    expect(stan(false, true, false)).toBe('nic');
    expect(stan(true, false, false)).toBe('nic');
  });
});
