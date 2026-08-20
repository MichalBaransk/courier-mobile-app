import { iloraz, skonczona } from './licz';
import { dniZakresu, dzienTygodnia, type Zakres } from './okresy';
import type { CourseOfferItem, DailyTotals } from './types';

/**
 * Arytmetyka wykresów — bez `View`, bez `Svg`, bez stanu.
 *
 * DLACZEGO OSOBNY PLIK. Ta sama zasada, co przy `finance.calc.ts` po stronie
 * bota i `statystykiOfert.ts` tutaj: liczby, które da się sprawdzić testem bez
 * podnoszenia całego świata, mają siedzieć tam, gdzie da się je sprawdzić
 * testem bez podnoszenia całego świata. Komponent rysujący ma dostać gotowe
 * współrzędne i nie mieć własnego zdania na temat skali.
 *
 * Wykres myli inaczej niż tabela. Tabela z błędem pokazuje złą liczbę i widać
 * to od razu; wykres z błędem w skali pokazuje ŁADNY, wiarygodny obrazek,
 * który znaczy coś innego, niż się wydaje. Stąd te testy.
 *
 * ZASADA PRZEWODNIA: brak danych to `null`, nie zero. Dzień bez pracy ma
 * `zlH === null`, a nie `0 zł/h` — zero na wykresie stawki wygląda jak
 * „pracował za darmo", czyli dokładnie ten sam błąd, przed którym broni
 * `kilometrLubNull()` po stronie bota (§8f).
 */

/* ========================================================================== */
/*  Skala                                                                     */
/* ========================================================================== */

export interface ZakresOsi {
  min: number;
  max: number;
}

/**
 * Zakres osi pionowej z surowych wartości.
 *
 * Trzy pułapki, każda widziana w tym projekcie:
 *
 * 1. **Pusta lista.** `Math.max()` bez argumentów zwraca `-Infinity`, a nie
 *    błąd. Wszystko dalej robi się `NaN` i wykres znika bez śladu w konsoli.
 * 2. **`NaN` w danych.** Jeden `NaN` zatruwa `Math.max` i cała skala pada —
 *    to ten sam powód, dla którego `Wykresy.tsx` ma `doWykresu()`.
 * 3. **Wszystko równe zeru.** `max === min` daje dzielenie przez zero przy
 *    mapowaniu na piksele. Wtedy oś musi mieć sztuczną wysokość.
 *
 * Dół osi to ZERO, gdy wszystkie wartości są dodatnie — słupek liczony od
 * najmniejszej wartości kłamie wizualnie, bo różnica 100 → 110 zł wygląda
 * wtedy jak dziesięciokrotność.
 */
export function zakresOsi(wartosci: Array<number | null | undefined>): ZakresOsi {
  const czyste = wartosci.map(skonczona).filter((v): v is number => v !== null);

  if (czyste.length === 0) return { min: 0, max: 1 };

  const maks = Math.max(...czyste);
  const mini = Math.min(...czyste);

  // Wartości ujemne (saldo, różnica do celu) muszą mieścić się w osi razem
  // z dodatnimi, inaczej słupek wychodzi poza wykres.
  const dol = mini < 0 ? mini : 0;
  const gora = maks > 0 ? maks : 0;

  if (gora === dol) return { min: dol, max: dol + 1 };
  return { min: dol, max: gora };
}

/**
 * Wartość → współrzędna Y w pikselach, licząc od GÓRY.
 *
 * SVG ma początek układu w lewym górnym rogu i oś Y skierowaną w dół — więc
 * największa wartość musi dostać najmniejszy `y`. Pomylenie tego daje wykres
 * odbity w pionie, który wygląda poprawnie do momentu, aż ktoś porówna go
 * z liczbami.
 */
export function naY(v: number, os: ZakresOsi, wysokosc: number): number {
  const rozpietosc = os.max - os.min;
  if (rozpietosc <= 0) return wysokosc;
  const udzial = (v - os.min) / rozpietosc;
  return wysokosc - udzial * wysokosc;
}

/**
 * „Ładne" wartości linii siatki — 0, 20, 40… zamiast 0, 23.7, 47.4…
 *
 * Krok wybierany z ciągu 1-2-5 przemnożonego przez potęgę dziesiątki, bo
 * człowiek czyta takie liczby bez zatrzymywania się. Zwracamy do `ile + 1`
 * linii; dokładna liczba zależy od tego, jak krok wypadnie w zakresie.
 */
export function linieSiatki(os: ZakresOsi, ile = 4): number[] {
  const rozpietosc = os.max - os.min;
  if (rozpietosc <= 0 || ile < 1) return [os.min];

  const surowy = rozpietosc / ile;
  const rzad = 10 ** Math.floor(Math.log10(surowy));
  const znormalizowany = surowy / rzad;
  // Progi są NAJBLIŻSZE, nie „nie większe niż": 2,5 idzie do 2 (krok 20), a nie
  // do 5 (krok 50). Wariant „nie większe niż" dawał dla zakresu 0–100 trzy linie
  // zamiast sześciu — wykres z siatką co połowę wysokości nie jest siatką.
  const mnoznik =
    znormalizowany < 1.5 ? 1 : znormalizowany < 3 ? 2 : znormalizowany < 7 ? 5 : 10;
  const krok = mnoznik * rzad;

  const linie: number[] = [];
  const start = Math.ceil(os.min / krok) * krok;
  for (let v = start; v <= os.max + krok / 1000; v += krok) {
    // Krok bywa ułamkowy (0.5, 0.25), a sumowanie zmiennoprzecinkowe zostawia
    // ogony w rodzaju 2.7999999999999998. Zaokrąglamy do sensownej precyzji.
    linie.push(Math.round(v * 1000) / 1000);
  }
  return linie;
}

/* ========================================================================== */
/*  Serie z dni                                                               */
/* ========================================================================== */

export interface PunktDnia {
  data: string;
  /** `null` = tego dnia nie ma czego pokazać. NIE zero — patrz nagłówek. */
  wartosc: number | null;
}

/** Co da się narysować z dnia. Nazwy własne, bo pola API są po angielsku. */
export type MiaraDnia = 'netto' | 'brutto' | 'godziny' | 'zlH' | 'km' | 'paliwo';

function miara(d: DailyTotals, ktora: MiaraDnia): number | null {
  switch (ktora) {
    case 'netto':
      return skonczona(d.totalNetto);
    case 'brutto':
      return skonczona(d.grossEarnings);
    case 'godziny':
      return skonczona(d.workHours);
    case 'km':
      return skonczona(d.distanceKm);
    case 'paliwo':
      return skonczona(d.fuelCost);
    case 'zlH': {
      // Stawka bez godzin nie istnieje — i nie wolno jej udawać zerem.
      const h = skonczona(d.workHours);
      if (h === null || h <= 0) return null;
      return iloraz(skonczona(d.totalNetto) ?? 0, h);
    }
  }
}

/**
 * Seria dla KAŻDEGO dnia zakresu, także tego, którego nie ma w danych.
 *
 * Bez wyrównania do kalendarza wykres miesiąca z trzema dniami pracy pokazuje
 * trzy słupki obok siebie i wygląda jak trzy dni z rzędu. Dziura w danych to
 * informacja, nie powód do ściśnięcia osi.
 *
 * Rozróżnienie jest celowe: dzień NIEOBECNY w danych i dzień obecny z zerem
 * dają tę samą `wartosc: null` przy stawce, ale przy zarobkach zero to
 * prawdziwe zero — dlatego decyduje `miara()`, nie ta funkcja.
 */
export function seriaDni(dni: DailyTotals[], zakres: Zakres, ktora: MiaraDnia): PunktDnia[] {
  const mapa = new Map(dni.map((d) => [d.date, d]));
  return dniZakresu(zakres).map((data) => {
    const wpis = mapa.get(data);
    return { data, wartosc: wpis === undefined ? null : miara(wpis, ktora) };
  });
}

/**
 * Suma narastająca — pod „ile już mam z celu miesięcznego".
 *
 * Dni bez danych NIE przerywają linii: suma się nie zmienia, więc linia biegnie
 * poziomo. To jest prawda o stanie konta, a nie dziura.
 */
export function narastajaco(seria: PunktDnia[]): PunktDnia[] {
  let suma = 0;
  return seria.map((p) => {
    suma += p.wartosc ?? 0;
    return { data: p.data, wartosc: Math.round(suma * 100) / 100 };
  });
}

/* ========================================================================== */
/*  Profil tygodnia                                                           */
/* ========================================================================== */

export interface DzienProfilu {
  /**
   * 0 = poniedziałek, 6 = niedziela — indeks TABLICY.
   *
   * ⚠️ `dzienTygodnia()` z `okresy.ts` zwraca **1–7**, nie 0–6 (niedziela to 7,
   * bo `|| 7` podmienia zero z `getUTCDay`). Bez odjęcia jedynki poniedziałek
   * ląduje w kubełku wtorku, a niedziela poza tablicą. Złapane testem.
   */
  dzien: number;
  /** Ile dni tego rodzaju weszło do średniej. Zero = brak danych. */
  ile: number;
  sredniNetto: number | null;
  sredniaZlH: number | null;
  sumaGodzin: number;
}

/**
 * Średnie wg dnia tygodnia — „czy sobota naprawdę jest lepsza".
 *
 * Średnia zł/h liczona jest jako SUMA NETTO / SUMA GODZIN, a nie jako średnia
 * z dziennych stawek. Różnica nie jest kosmetyczna: dzień z jedną godziną
 * i stawką 60 zł/h ważyłby w średniej arytmetycznej tyle samo, co dziesięć
 * godzin po 25 zł/h. Ten sam powód, dla którego `statystykiOfert.ts` liczy
 * stawkę ważoną obok arytmetycznej.
 *
 * Dni bez pracy nie wchodzą do średniej wcale — inaczej każdy wolny poniedziałek
 * ciągnąłby poniedziałki w dół i wyszłoby, że to najgorszy dzień tygodnia.
 */
export function profilTygodnia(dni: DailyTotals[]): DzienProfilu[] {
  const kubelki = Array.from({ length: 7 }, (_, dzien) => ({
    dzien,
    ile: 0,
    sumaNetto: 0,
    sumaGodzin: 0,
  }));

  for (const d of dni) {
    const godziny = skonczona(d.workHours) ?? 0;
    const netto = skonczona(d.totalNetto) ?? 0;
    if (godziny <= 0 && netto <= 0) continue;

    const k = kubelki[dzienTygodnia(d.date) - 1];
    if (k === undefined) continue;

    k.ile += 1;
    k.sumaNetto += netto;
    k.sumaGodzin += godziny;
  }

  return kubelki.map((k) => ({
    dzien: k.dzien,
    ile: k.ile,
    sredniNetto: k.ile > 0 ? Math.round((k.sumaNetto / k.ile) * 100) / 100 : null,
    sredniaZlH: k.sumaGodzin > 0 ? Math.round((k.sumaNetto / k.sumaGodzin) * 100) / 100 : null,
    sumaGodzin: Math.round(k.sumaGodzin * 100) / 100,
  }));
}

/* ========================================================================== */
/*  Oferty                                                                    */
/* ========================================================================== */

export interface Kosz {
  /** Dolna granica kosza, włącznie. */
  od: number;
  /** Górna granica, wyłącznie — poza ostatnim koszem. */
  do: number;
  ile: number;
}

/**
 * Histogram stawek zł/km.
 *
 * Oferty bez dystansu (`rateBasis: 'NONE'`, stawka 0) są POMIJANE — tak samo
 * jak w `statystykiOfert.ts` i z tego samego powodu: jedna oferta bez
 * zgeokodowanego adresu potrafiła zjechać „najgorszą stawkę" do zera i wykres
 * powtórzyłby to kłamstwo, tylko ładniej.
 *
 * Ostatni kosz jest domknięty z obu stron, inaczej najlepsza oferta miesiąca
 * wypada z wykresu.
 */
export function histogramStawek(oferty: CourseOfferItem[], szerokosc = 0.5): Kosz[] {
  const stawki = oferty
    .filter((o) => o.rateBasis !== 'NONE' && (skonczona(o.netRatePerKm) ?? 0) > 0)
    .map((o) => skonczona(o.netRatePerKm))
    .filter((v): v is number => v !== null);

  if (stawki.length === 0 || szerokosc <= 0) return [];

  const maks = Math.max(...stawki);
  const ileKoszy = Math.max(1, Math.ceil(maks / szerokosc));

  const kosze: Kosz[] = Array.from({ length: ileKoszy }, (_, i) => ({
    od: Math.round(i * szerokosc * 100) / 100,
    do: Math.round((i + 1) * szerokosc * 100) / 100,
    ile: 0,
  }));

  for (const s of stawki) {
    const i = Math.min(ileKoszy - 1, Math.floor(s / szerokosc));
    kosze[i]!.ile += 1;
  }

  return kosze;
}

export interface KoszGodziny {
  /** Godzina doby, 0–23. */
  godzina: number;
  ile: number;
  sredniaStawka: number | null;
  sredniBrutto: number | null;
}

/**
 * Oferty wg godziny doby — „kiedy przychodzą dobre kursy".
 *
 * Godzina brana z pola `time` (`HH:MM:SS` z serwera), nie z `Date` — zegar
 * telefonu nie ma tu nic do rzeczy, a `new Date('12:30')` i tak by nie zadziałało.
 * Wiersz z niepoprawną godziną jest pomijany, nie wrzucany do godziny zerowej:
 * nieprawdziwa północ zafałszowałaby dokładnie ten wykres, którym patrzy się
 * na porę dnia.
 */
export function ofertyWgGodziny(oferty: CourseOfferItem[]): KoszGodziny[] {
  const kubelki = Array.from({ length: 24 }, (_, godzina) => ({
    godzina,
    ile: 0,
    sumaStawek: 0,
    ileStawek: 0,
    sumaBrutto: 0,
  }));

  for (const o of oferty) {
    const godzina = Number.parseInt((o.time ?? '').slice(0, 2), 10);
    if (!Number.isInteger(godzina) || godzina < 0 || godzina > 23) continue;

    const k = kubelki[godzina]!;
    k.ile += 1;
    k.sumaBrutto += skonczona(o.grossAmount) ?? 0;

    const stawka = skonczona(o.netRatePerKm);
    if (o.rateBasis !== 'NONE' && stawka !== null && stawka > 0) {
      k.sumaStawek += stawka;
      k.ileStawek += 1;
    }
  }

  return kubelki.map((k) => ({
    godzina: k.godzina,
    ile: k.ile,
    sredniaStawka: k.ileStawek > 0 ? Math.round((k.sumaStawek / k.ileStawek) * 100) / 100 : null,
    sredniBrutto: k.ile > 0 ? Math.round((k.sumaBrutto / k.ile) * 100) / 100 : null,
  }));
}

export interface PodzialDecyzji {
  przyjete: number;
  odrzucone: number;
  bezDecyzji: number;
}

/**
 * Podział ofert wg decyzji.
 *
 * `PENDING` to osobna kategoria, nie „odrzucone". Oferta bez decyzji znaczy, że
 * kurier ocenił ją i nie kliknął — najczęściej dlatego, że kurs zniknął z ekranu
 * Glovo, zanim zdążył. Wrzucenie tego do odrzuconych zawyżałoby „ile odrzucam".
 */
export function podzialDecyzji(oferty: CourseOfferItem[]): PodzialDecyzji {
  let przyjete = 0;
  let odrzucone = 0;

  for (const o of oferty) {
    if (o.status === 'ACCEPTED') przyjete += 1;
    else if (o.status === 'REJECTED') odrzucone += 1;
  }

  return { przyjete, odrzucone, bezDecyzji: oferty.length - przyjete - odrzucone };
}

/* ========================================================================== */
/*  Ścieżka łamanej                                                           */
/* ========================================================================== */

export interface UkladWykresu {
  /** Odstęp od lewej krawędzi — miejsce na podpisy osi. */
  lewy: number;
  /** Odstęp od góry. */
  gorny: number;
  /** Wysokość obszaru rysowania. */
  wysokosc: number;
}

/**
 * Atrybut `d` ścieżki SVG, z PRZERWAMI tam, gdzie brakuje danych.
 *
 * `null` przerywa linię, nie jest pomijany. Połączenie punktu z czwartku
 * z punktem z soboty jednym odcinkiem rysuje trend przez piątek, którego nikt
 * nie zmierzył — a wykres wygląda przy tym zupełnie normalnie. Ta sama zasada,
 * co przy `seriaDni()`: dziura w danych jest informacją, nie usterką.
 *
 * Funkcja jest tutaj, a nie w komponencie, właśnie po to, żeby dało się to
 * sprawdzić testem. Reguła „jeden `M` na każdy nieprzerwany odcinek" jest
 * dokładnie tego rodzaju, że łatwo ją napisać źle i nie zauważyć: linia
 * z jednym `M` na początku i tak się narysuje, tylko połączy przerwy.
 */
export function sciezkaLamanej(
  punkty: PunktDnia[],
  os: ZakresOsi,
  krok: number,
  uklad: UkladWykresu
): string {
  let d = '';
  let ciagniemy = false;

  punkty.forEach((p, i) => {
    if (p.wartosc === null) {
      ciagniemy = false;
      return;
    }
    const x = uklad.lewy + krok * (i + 0.5);
    const y = uklad.gorny + naY(p.wartosc, os, uklad.wysokosc);
    d += `${ciagniemy ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
    ciagniemy = true;
  });

  return d.trim();
}
