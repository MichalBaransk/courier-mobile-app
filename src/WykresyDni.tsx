import { Text, View, StyleSheet } from 'react-native';

import { krotkaData, zl } from './format';
import { dniZakresu, nazwaMiesiaca, type Zakres } from './okresy';
import { C } from './theme';
import type { DailyTotals, TargetProgress } from './types';
import { KartaWykresu, Legenda, LiniaDni, SlupkiDni } from './WykresySvg';
import { narastajaco, seriaDni, zakresZDanymi, type PunktDnia } from './wykresLicz';

/**
 * Wykresy liczone z dni miesiąca.
 *
 * Wszystkie cztery rysują się z `dniMiesiaca`, czyli z danych, które aplikacja
 * i tak ma w pamięci po wejściu w miesiąc (`GET /api/v1/dni`). Żaden z nich nie
 * potrzebuje nowego endpointu ani dodatkowego żądania — to była twarda granica
 * przy projektowaniu tej sekcji.
 */

/** Ile pieniędzy dziennie, żeby wyjść na cel przy równym tempie. */
function celDzienny(cel: TargetProgress | null, ileDni: number): number | null {
  if (cel === null || ileDni <= 0) return null;
  const kwota = cel.targetAmount;
  return Number.isFinite(kwota) && kwota > 0 ? Math.round((kwota / ileDni) * 100) / 100 : null;
}

/**
 * Prosta z celu: równe tempo od zera do pełnej kwoty przez cały miesiąc.
 *
 * To NIE jest to samo, co `dailyRequiredNetto` z serwera. Tamto mówi „ile
 * musisz od dziś", więc rośnie po każdym słabym dniu i linia przestałaby być
 * prosta. Tutaj chodzi o odniesienie stałe — żeby po kształcie było widać,
 * kiedy zacząłeś odstawać.
 */
function liniaCelu(daty: string[], cel: TargetProgress | null): PunktDnia[] {
  if (cel === null || daty.length === 0) return [];
  const kwota = cel.targetAmount;
  if (!Number.isFinite(kwota) || kwota <= 0) return [];

  return daty.map((data, i) => ({
    data,
    wartosc: Math.round((kwota * ((i + 1) / daty.length)) * 100) / 100,
  }));
}

export function WykresyDni({
  dni,
  zakres,
  cel,
}: {
  dni: DailyTotals[];
  /** Pełny miesiąc. Wykresy dzienne zawężają go same do dni z danymi. */
  zakres: Zakres;
  /** Cel miesięczny z `/api/v1/cele`. `null` = nie ustawiony. */
  cel: TargetProgress | null;
}) {
  const daty = dniZakresu(zakres);

  /**
   * Oś dzienna kończy się tam, gdzie dane — patrz `zakresZDanymi`.
   *
   * WYJĄTEK: wykres narastający zostaje na PEŁNYM miesiącu. Linia tempa
   * biegnie od zera do całej kwoty celu przez wszystkie dni miesiąca, więc
   * przycięcie osi zmieniłoby jej nachylenie i „jestem przed tempem" zaczęłoby
   * znaczyć co innego. Tam puste dni na końcu są informacją: tyle jeszcze
   * zostało do nadrobienia.
   */
  const wezZakres = zakresZDanymi(dni, zakres);
  const netto = seriaDni(dni, wezZakres, 'netto');
  const godzinySeria = seriaDni(dni, wezZakres, 'godziny');
  const stawkaSeria = seriaDni(dni, wezZakres, 'zlH');
  const suma = narastajaco(seriaDni(dni, zakres, 'netto'));
  const zawezone = wezZakres.od !== zakres.od || wezZakres.do !== zakres.do;
  const cd = celDzienny(cel, daty.length);
  const celLinia = liniaCelu(daty, cel);

  const sąDane = netto.some((p) => (p.wartosc ?? 0) > 0);
  const sąGodziny = godzinySeria.some((p) => (p.wartosc ?? 0) > 0);
  const sąStawki = stawkaSeria.some((p) => p.wartosc !== null);

  const osiągnięte = suma.at(-1)?.wartosc ?? 0;

  return (
    <>
      <Text style={s.wstep}>
        Wszystko poniżej dotyczy miesiąca {nazwaMiesiaca(zakres.od)} — tego samego, który jest
        ustawiony strzałkami u góry.
        {zawezone
          ? ` Oś dzienna pokazuje ${krotkaData(wezZakres.od)}–${krotkaData(wezZakres.do)} — tylko dni, w których coś się działo, bez ani jednego pustego pola z boku.`
          : ''}
      </Text>

      <KartaWykresu
        tytul="NETTO DZIEŃ PO DNIU"
        osY="zł netto (z napiwkami)"
        osX="dzień miesiąca"
        pusty={!sąDane}
        komunikatPusty="Brak zarobków w tym miesiącu."
        podpis={
          cd === null
            ? 'Ustaw cel miesięczny, a pojawi się linia tempa.'
            : `Przerywana linia to ${zl(cd)} dziennie — tempo równe do celu ${zl(cel?.targetAmount)}.`
        }
      >
        <SlupkiDni
          seria={netto}
          formatuj={(v) => String(Math.round(v))}
          odniesienie={cd === null ? null : { wartosc: cd }}
        />
      </KartaWykresu>

      <KartaWykresu
        tytul="NARASTAJĄCO W MIESIĄCU"
        osY="zł netto, suma od 1. dnia"
        osX="dzień miesiąca"
        pusty={!sąDane}
        komunikatPusty="Nie ma jeszcze czego sumować."
        podpis={
          celLinia.length === 0
            ? `Do dziś uzbierane: ${zl(osiągnięte)}.`
            : `Uzbierane ${zl(osiągnięte)} z ${zl(cel?.targetAmount)}. Linia nad przerywaną znaczy, że jesteś przed tempem.`
        }
      >
        <LiniaDni
          serie={[
            ...(celLinia.length > 0
              ? [{ punkty: celLinia, kolor: C.ostrzezenie, przerywana: true }]
              : []),
            { punkty: suma, kolor: C.akcent },
          ]}
          formatuj={(v) => String(Math.round(v))}
        />
        {celLinia.length > 0 ? (
          <Legenda
            pozycje={[
              { kolor: C.akcent, opis: 'zarobione' },
              { kolor: C.ostrzezenie, opis: 'tempo do celu' },
            ]}
          />
        ) : null}
      </KartaWykresu>

      <KartaWykresu
        tytul="STAWKA ZŁ/H"
        osY="zł na godzinę"
        osX="dzień miesiąca"
        pusty={!sąStawki}
        komunikatPusty="Żaden dzień w tym miesiącu nie ma zapisanych godzin."
        podpis="Przerwa w linii to dzień bez pracy. Stawka liczona z netto i sumy zmian — paliwo jej NIE pomniejsza."
      >
        <LiniaDni
          serie={[{ punkty: stawkaSeria, kolor: C.akcent, kropki: true }]}
          formatuj={(v) => String(Math.round(v))}
        />
      </KartaWykresu>

      <KartaWykresu
        tytul="GODZINY PRACY"
        osY="godziny (suma zmian)"
        osX="dzień miesiąca"
        pusty={!sąGodziny}
        komunikatPusty="Brak zapisanych zmian w tym miesiącu."
        podpis="Suma wszystkich zmian z doby — od kroku z `work_sessions` dzień może mieć ich kilka."
      >
        <SlupkiDni
          seria={godzinySeria}
          kolor="#60a5fa"
          formatuj={(v) => String(Math.round(v * 10) / 10)}
        />
      </KartaWykresu>

      <View style={s.stopka}>
        <Text style={s.stopkaTekst}>
          Wykresy nie reagują na dotknięcie — wybór dnia robi kalendarz i nie ma dwóch dróg do tego
          samego miejsca.
        </Text>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  wstep: { color: C.tekstPrzygaszony, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  stopka: { paddingHorizontal: 4, paddingBottom: 8 },
  stopkaTekst: { color: C.tekstPrzygaszony, fontSize: 11, lineHeight: 16 },
});
