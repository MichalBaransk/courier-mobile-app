import { StyleSheet, View } from 'react-native';

import { stawka } from './format';
import { C } from './theme';
import type { CourseOfferItem } from './types';
import { KartaWykresu, Legenda, Slupki, type PunktSlupka } from './WykresySvg';
import {
  histogramStawek,
  ofertyWgGodziny,
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
  const kosze = histogramStawek(oferty);
  const godziny = ofertyWgGodziny(oferty);
  const decyzje = podzialDecyzji(oferty);

  const histogram: PunktSlupka[] = kosze.map((k, i) => ({
    klucz: `k${i}`,
    // Co drugi podpis — przy koszach po 0,5 zł pełna oś zlewa się w wstęgę.
    podpis: i % 2 === 0 ? String(k.od) : null,
    wartosc: k.ile,
    kolor: KOLOR_KOSZA[polozenieKosza(k.od, k.do, minStawka)],
  }));

  const ileWgGodziny: PunktSlupka[] = godziny.map((g) => ({
    klucz: `g${g.godzina}`,
    podpis: g.godzina % 3 === 0 ? String(g.godzina) : null,
    wartosc: g.ile,
  }));

  const stawkaWgGodziny: PunktSlupka[] = godziny.map((g) => ({
    klucz: `s${g.godzina}`,
    podpis: g.godzina % 3 === 0 ? String(g.godzina) : null,
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
        pusty={oferty.length === 0}
        komunikatPusty="Brak ocenionych ofert w tym miesiącu."
        podpis="Ile ofert oceniłeś w danej godzinie. To mówi o TWOICH godzinach pracy, nie o tym, kiedy Glovo wysyła kursy — nie ocenisz oferty, gdy nie jesteś na zmianie."
      >
        <Slupki seria={ileWgGodziny} kolor="#60a5fa" formatuj={(v) => String(Math.round(v))} />
      </KartaWykresu>

      <KartaWykresu
        tytul="ŚREDNIA STAWKA WG GODZINY"
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
