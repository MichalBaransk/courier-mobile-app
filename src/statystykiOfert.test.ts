import { describe, expect, it } from 'vitest';

import { policzOferty } from './statystykiOfert';
import type { CourseOfferItem } from './types';

/**
 * Statystyki ofert — z naciskiem na oferty BEZ dystansu.
 *
 * To one są tu sednem. Oferta z `rateBasis: 'NONE'` powstaje wtedy, gdy ekran
 * Glovo nie pokazał adresu klienta i geokoder nie miał czego szukać (§8f).
 * Wliczenie jej stawki (zera) do średniej zaniża wynik cicho i bezpowrotnie.
 */

const oferta = (p: Partial<CourseOfferItem>): CourseOfferItem => ({
  id: 0,
  date: '2026-08-16',
  time: '12:00',
  grossAmount: 0,
  netAmount: 0,
  appTotalKm: null,
  mapsTotalKm: null,
  distanceTotalKm: 0,
  rateBasis: 'APP',
  netRatePerKm: 0,
  isProfitable: false,
  status: 'PENDING',
  pickupAddress: null,
  deliveryAddress: null,
  ...p,
});

/** Przypadek z §8f: 22,04 zł, aplikacja podała 3,37 + 3,01 = 6,38 km. */
const PRZYKLAD: CourseOfferItem[] = [
  oferta({
    id: 1,
    grossAmount: 22.04,
    netAmount: 17.94,
    distanceTotalKm: 6.38,
    netRatePerKm: 2.81,
    isProfitable: true,
    status: 'ACCEPTED',
  }),
  oferta({
    id: 2,
    grossAmount: 10,
    netAmount: 8.14,
    distanceTotalKm: 8,
    netRatePerKm: 1.02,
    status: 'REJECTED',
  }),
  oferta({
    id: 3,
    grossAmount: 15,
    netAmount: 12.21,
    distanceTotalKm: 0,
    netRatePerKm: 0,
    rateBasis: 'NONE',
  }),
];

describe('policzOferty — zliczanie', () => {
  const st = policzOferty(PRZYKLAD);

  it('liczy wszystkie oferty, także tę bez dystansu', () => {
    expect(st.ile).toBe(3);
    expect(st.oplacalne).toBe(1);
    expect(st.nieoplacalne).toBe(2);
  });

  it('rozdziela statusy', () => {
    expect(st.przyjete).toBe(1);
    expect(st.odrzucone).toBe(1);
    expect(st.oczekujace).toBe(1);
  });

  it('sumuje brutto i kilometry', () => {
    expect(st.sumaBrutto).toBeCloseTo(47.04, 2);
    expect(st.sumaKm).toBeCloseTo(14.38, 2);
  });
});

describe('policzOferty — oferty bez dystansu nie psują stawek', () => {
  const st = policzOferty(PRZYKLAD);

  it('średnia liczona TYLKO z ofert mających dystans', () => {
    expect(st.sredniaStawka).toBeCloseTo((2.81 + 1.02) / 2, 4);
  });

  it('stawka ważona to suma netto przez sumę km', () => {
    expect(st.wazonaStawka).toBeCloseTo((17.94 + 8.14 + 12.21) / 14.38, 4);
  });

  it('najgorsza stawka to 1,02 — a NIE zero z oferty bez adresu', () => {
    expect(st.najlepsza).toBe(2.81);
    expect(st.najgorsza).toBe(1.02);
  });
});

describe('policzOferty — pustka nie dzieli przez zero', () => {
  const puste = policzOferty([]);

  it('brak ofert daje null, a nie NaN', () => {
    expect(puste.sredniaStawka).toBeNull();
    expect(puste.wazonaStawka).toBeNull();
    expect(puste.najlepsza).toBeNull();
    expect(puste.najgorsza).toBeNull();
  });

  it('sumy zerowe, liczniki zerowe', () => {
    expect(puste.ile).toBe(0);
    expect(puste.sumaBrutto).toBe(0);
    expect(puste.sumaKm).toBe(0);
  });

  it('dzień z samymi ofertami bez dystansu też nie wywala', () => {
    const st = policzOferty([oferta({ id: 9, grossAmount: 15, netAmount: 12.21 })]);
    expect(st.ile).toBe(1);
    expect(st.sredniaStawka).toBeNull();
    expect(st.wazonaStawka).toBeNull();
  });
});
