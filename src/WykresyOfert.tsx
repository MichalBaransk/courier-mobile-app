import { StyleSheet, View } from 'react-native';

import { stawka } from './format';
import { C } from './theme';
import type { CourseOfferItem } from './types';
import { KartaWykresu, Legenda, Slupki, type PunktSlupka } from './WykresySvg';
import {
  histogramStawek,
  ktoreEtykiety,
  ofertyWgGodziny,
  przytnijPuste,
  podzialDecyzji,
  polozenieKosza,
  type PolozenieKosza,
} from './wykresLicz';

/**
 * Wykresy liczone z ofert miesiąca.
 *
 * Wszystko z `oferty`, czyli z jednego żądania, które aplikacja i tak wysyła
 * po wejściu w miesiąc. Zero nowych endpointów — ta sama granica, co przy
 * `WykresyDni`.
 *
 * ZAKRES TO CAŁY MIESIĄC, nie zaznaczenie z kalendarza. Rozkład stawek z
 * jednego dnia to kilkanaście słupków po jednym — wykres, który nic nie mówi.
 * Sekcja Wykresy ma własny nagłówek z miesiącem i tak jest opisana w karcie.
 */

/** Słowo z `wykresLicz.ts` przełożone na kolor motywu. */
const KOLOR_KOSZA: Record<PolozenieKosza, string> = {
  nad: C.akcent,
  przeciety: C.ostrzezenie,
  pod: C.blad,
};

export function WykresyOfert({
  oferty,
  minStawka,
}: {
  oferty: CourseOfferItem[];
  /** Próg opłacalności z `/api/v1/info`. `null` = nie znamy. */
  minStawka: number | null;
}) {
  /**
   * Puste końce obu osi lecą.
   *
   * Oferty przychodzą między 11:00 a 23:00, więc jedenaście pól z lewej to
   * jedenaście godzin, w których nic nie ma i nie miało prawa być. Tak samo
   * histogram: kosze od zera do najniższej stawki są zawsze puste.
   *
   * Godziny przycinamy RAZ i tym samym zakresem karmimy oba wykresy — dwa
   * rysunki jeden pod drugim z różnymi osiami przy tych samych podpisach
   * czytałoby się jako błąd.
   */
  const kosze = przytnijPuste(histogramStawek(oferty), (k) => k.ile === 0);
  const godziny = przytnijPuste(ofertyWgGodziny(oferty), (g) => g.ile === 0);

  // Te same reguły podpisów co na osi dziennej — po przycięciu obie osie mają
  // podobną długość, a dwie ręcznie pisane reguły to dwa miejsca na ten sam błąd.
  const etykietyGodzin = ktoreEtykiety(godziny.length);
  const etykietyKoszy = ktoreEtykiety(kosze.length);
  const decyzje = podzialDecyzji(oferty);

  const histogram: PunktSlupka[] = kosze.map((k, i) => ({
    klucz: `k${i}`,
    podpis: etykietyKoszy.has(i) ? String(k.od) : null,
    wartosc: k.ile,
    kolor: KOLOR_KOSZA[polozenieKosza(k.od, k.do, minStawka)],
  }));

  const ileWgGodziny: PunktSlupka[] = godziny.map((g, i) => ({
    klucz: `g${g.godzina}`,
    podpis: etykietyGodzin.has(i) ? String(g.godzina) : null,
    wartosc: g.ile,
  }));

  const stawkaWgGodziny: PunktSlupka[] = godziny.map((g, i) => ({
    klucz: `s${g.godzina}`,
    podpis: etykietyGodzin.has(i) ? String(g.godzina) : null,
    wartosc: g.sredniaStawka,
    ...(g.sredniaStawka !== null && minStawka !== null
      ? { kolor: g.sredniaStawka >= minStawka ? C.akcent : C.blad }
      : {}),
  }));

  const zStawka = kosze.reduce((suma, k) => suma + k.ile, 0);
  const najlepszaGodzina = godziny
    .filter((g) => g.sredniaStawka !== null && g.ile >= 2)
    .sort((a, b) => (b.sredniaStawka ?? 0) - (a.sredniaStawka ?? 0))[0];

  return (
    <>
      <KartaWykresu
        tytul="ROZKŁAD STAWEK ZŁ/KM"
        osY="ile ofert"
        osX="stawka zł/km — dolna granica kosza"
        pusty={histogram.length === 0}
        komunikatPusty="Żadna oferta w tym miesiącu nie ma policzonego dystansu."
        podpis={
          minStawka === null
            ? `${zStawka} ofert z policzoną stawką. Kosze co 0,50 zł.`
            : `${zStawka} ofert z policzoną stawką, kosze co 0,50 zł. Czerwone są pod progiem ${stawka(minStawka)} zł/km, żółty kosz próg przecina.`
        }
      >
        <Slupki seria={histogram} formatuj={(v) => String(Math.round(v))} />
      </KartaWykresu>

      <KartaWykresu
        tytul="OFERTY WG GODZINY DOBY"
        osY="ile ofert"
        osX="godzina doby"
        pusty={oferty.length === 0}
        komunikatPusty="Brak ocenionych ofert w tym miesiącu."
        podpis="Ile ofert oceniłeś w danej godzinie. To mówi o TWOICH godzinach pracy, nie o tym, kiedy Glovo wysyła kursy — nie ocenisz oferty, gdy nie jesteś na zmianie."
      >
        <Slupki seria={ileWgGodziny} kolor="#60a5fa" formatuj={(v) => String(Math.round(v))} />
      </KartaWykresu>

      <KartaWykresu
        tytul="ŚREDNIA STAWKA WG GODZINY"
        osY="zł/km (średnia)"
        osX="godzina doby"
        pusty={godziny.every((g) => g.sredniaStawka === null)}
        komunikatPusty="Za mało ofert z dystansem, żeby liczyć średnie."
        podpis={
          najlepszaGodzina === undefined
            ? 'Puste godziny to te, w których nie oceniałeś ofert.'
            : `Najlepsza godzina to ${najlepszaGodzina.godzina}:00 — średnio ${stawka(najlepszaGodzina.sredniaStawka)} zł/km z ${najlepszaGodzina.ile} ofert. Godziny z jedną ofertą pomijam przy tym wskazaniu.`
        }
      >
        <Slupki seria={stawkaWgGodziny} formatuj={(v) => String(Math.round(v * 10) / 10)} />
      </KartaWykresu>

      <KartaWykresu
        tytul="CO ZROBIŁEŚ Z OFERTAMI"
        osY="szerokość paska = udział w liczbie ofert"
        osX={`razem ${oferty.length} ofert w tym miesiącu`}
        pusty={oferty.length === 0}
        komunikatPusty="Brak ocenionych ofert w tym miesiącu."
        podpis={
          'Brak decyzji to nie to samo, co odrzucenie — najczęściej znaczy, że kurs zniknął ' +
          'z ekranu Glovo, zanim zdążyłeś kliknąć.'
        }
      >
        <PasekDecyzji podzial={decyzje} ile={oferty.length} />
        <Legenda
          pozycje={[
            { kolor: C.akcent, opis: `przyjęte: ${decyzje.przyjete}` },
            { kolor: C.blad, opis: `odrzucone: ${decyzje.odrzucone}` },
            { kolor: C.obramowanie, opis: `bez decyzji: ${decyzje.bezDecyzji}` },
          ]}
        />
      </KartaWykresu>
    </>
  );
}

/**
 * Podział decyzji jako jeden pasek.
 *
 * Bez SVG — trzy `View` z `flex` robią dokładnie to samo i skalują się same do
 * szerokości ekranu. To jest ta sama zasada, dla której kalendarz w
 * `Wykresy.tsx` też nie jest rysowany: SVG bierzemy tam, gdzie `View` nie
 * wystarcza (linia, przerwa, oś), a nie wszędzie.
 *
 * Kołowego wykresu tu nie ma świadomie: przy trzech kategoriach o zbliżonych
 * udziałach kąty czyta się gorzej niż długości.
 */
function PasekDecyzji({
  podzial,
  ile,
}: {
  podzial: { przyjete: number; odrzucone: number; bezDecyzji: number };
  ile: number;
}) {
  if (ile <= 0) return null;

  const czesci = [
    { klucz: 'p', ile: podzial.przyjete, kolor: C.akcent },
    { klucz: 'o', ile: podzial.odrzucone, kolor: C.blad },
    { klucz: 'b', ile: podzial.bezDecyzji, kolor: C.obramowanie },
  ].filter((c) => c.ile > 0);

  return (
    <View style={s.pasek}>
      {czesci.map((c) => (
        <View key={c.klucz} style={{ flex: c.ile, backgroundColor: c.kolor }} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  pasek: {
    flexDirection: 'row',
    height: 22,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: C.tlo,
  },
});
