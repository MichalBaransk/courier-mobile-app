/**
 * Statystyki ofert — CZYSTA arytmetyka, bez React Native.
 *
 * Wydzielone z `Oferty.tsx` po to, żeby dało się to przetestować. Plik `.tsx`
 * importuje `react-native`, którego nie da się rozwiązać w node — a to jest
 * kod liczący liczby pokazywane jako fakty, więc ma być pod testem.
 * Ta sama zasada, co przy `finance.calc.ts` po stronie bota (§5).
 *
 * ⚠️ ROZBIEŻNOŚĆ Z BOTEM, ŚWIADOMA I DO UZGODNIENIA.
 *
 * `getCourseOfferStats` na serwerze liczy `avgNetRatePerKm` dzieląc przez
 * WSZYSTKIE oferty, a `bestNetRate`/`worstNetRate` bierze też z tych, które
 * mają `rateBasis: 'NONE'` i stawkę 0. Skutek: jedna oferta bez zgeokodowanego
 * adresu ustawia „najgorszą stawkę" na 0,00 zł/km i zaniża średnią — dokładnie
 * ten sam rodzaj wiarygodnie wyglądającej bzdury, przed którym ostrzega §8f.
 *
 * Tutaj oferty bez dystansu są pomijane w średniej i w skrajnych wartościach
 * (nadal liczą się do „ile ofert" i do sumy brutto). Liczby w aplikacji są
 * więc WYŻSZE niż w `/statystyki` w bocie. Poprawka po stronie serwera to
 * osobna decyzja — zgodnie z zasadą „nie zmieniam bazowego kodu bez zgody".
 */

import { iloraz } from './licz';
import type { CourseOfferItem } from './types';

export interface StatystykiOfert {
  ile: number;
  oplacalne: number;
  nieoplacalne: number;
  przyjete: number;
  odrzucone: number;
  oczekujace: number;
  /** Średnia arytmetyczna stawek — „jakie oferty przychodzą". */
  sredniaStawka: number | null;
  /** Suma netto / suma km — „ile realnie wychodzi na kilometr". */
  wazonaStawka: number | null;
  najlepsza: number | null;
  najgorsza: number | null;
  sumaBrutto: number;
  sumaKm: number;
}

export function policzOferty(oferty: CourseOfferItem[]): StatystykiOfert {
  let oplacalne = 0;
  let przyjete = 0;
  let odrzucone = 0;
  let oczekujace = 0;
  let sumaStawek = 0;
  let ileStawek = 0;
  let sumaBrutto = 0;
  let sumaNetto = 0;
  let sumaKm = 0;
  let najlepsza: number | null = null;
  let najgorsza: number | null = null;

  for (const o of oferty) {
    if (o.isProfitable) oplacalne++;
    if (o.status === 'ACCEPTED') przyjete++;
    else if (o.status === 'REJECTED') odrzucone++;
    else oczekujace++;

    sumaBrutto += o.grossAmount;
    sumaNetto += o.netAmount;
    sumaKm += o.distanceTotalKm;

    // Stawka bez dystansu nie znaczy nic — `rateBasis: 'NONE'` to dokładnie
    // przypadek z §8f, gdzie geokoder nie miał adresu klienta. Wliczenie zera
    // do średniej zaniżyłoby ją cicho i bezpowrotnie.
    if (o.distanceTotalKm > 0 && o.netRatePerKm > 0) {
      sumaStawek += o.netRatePerKm;
      ileStawek++;
      if (najlepsza === null || o.netRatePerKm > najlepsza) najlepsza = o.netRatePerKm;
      if (najgorsza === null || o.netRatePerKm < najgorsza) najgorsza = o.netRatePerKm;
    }
  }

  return {
    ile: oferty.length,
    oplacalne,
    nieoplacalne: oferty.length - oplacalne,
    przyjete,
    odrzucone,
    oczekujace,
    // `iloraz` zwraca `null` przy zerowym mianowniku — dzień bez ani jednej
    // oferty z dystansem daje „—", a nie `NaN`.
    sredniaStawka: iloraz(sumaStawek, ileStawek),
    wazonaStawka: iloraz(sumaNetto, sumaKm),
    najlepsza,
    najgorsza,
    sumaBrutto,
    sumaKm,
  };
}
