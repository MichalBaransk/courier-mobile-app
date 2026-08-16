import { StyleSheet, Text, View } from 'react-native';

import { godziny, km, zl } from './format';
import { C } from './theme';
import type { DailySummary, PeriodSummary } from './types';

/**
 * Analityka — porównania, których serwer nie liczy, bo są zestawieniem DWÓCH
 * odpowiedzi, a nie jednym zapytaniem.
 *
 * Każda liczba szacunkowa jest tu podpisana jako szacunek. To nie jest ozdoba:
 * projekt ma już jeden przypadek, w którym wiarygodnie wyglądająca liczba
 * (1,83 km z centroidu Katowic, §8f) doprowadziła do złej decyzji. Lepiej
 * pokazać „ok." niż udawać precyzję, której nie ma.
 */

/* ========================================================================== */
/*  Paliwo per dzień — szacunek, nie fakt                                     */
/* ========================================================================== */

/**
 * Koszt paliwa przypisany do JEDNEGO dnia.
 *
 * Problem jest realny: paragon z 10 sierpnia obciąża jeden dzień kwotą, która
 * finansuje jazdę przez następny tydzień. Odejmowanie go w dniu tankowania robi
 * z tego dnia stratę, a z pozostałych — fikcyjny zysk.
 *
 * Dlatego rozkładam koszt po kilometrach: średnia z ostatnich 30 dni
 * (`suma paliwa / suma km`) × dystans tego dnia. Dzień bez wpisanego dystansu
 * nie dostaje nic — zgadywanie kilometrów byłoby zgadywaniem na zgadywaniu.
 *
 * Serwerowy `totalNetto` zostaje NIETKNIĘTY. To wyłącznie warstwa prezentacji;
 * dług techniczny „paliwo nie pomniejsza czystego netto" (§17) nadal istnieje
 * i zamknie go dopiero decyzja po stronie backendu.
 */
export function kosztPaliwaNaKm(odniesienie: PeriodSummary | null): number | null {
  if (odniesienie === null) return null;
  if (odniesienie.totalDistanceKm <= 0 || odniesienie.totalFuelCost <= 0) return null;
  return odniesienie.totalFuelCost / odniesienie.totalDistanceKm;
}

export function KartaAnalizyDnia({
  dzien,
  odniesienie,
}: {
  dzien: DailySummary;
  /** Podsumowanie ostatnich 30 dni — tło, na którym oceniamy ten jeden dzień. */
  odniesienie: PeriodSummary | null;
}) {
  const zlNaKm = kosztPaliwaNaKm(odniesienie);
  const dystans = dzien.distanceKm ?? 0;
  const szacowanePaliwo = zlNaKm !== null && dystans > 0 ? zlNaKm * dystans : null;

  const sredniaStawka =
    odniesienie !== null && odniesienie.totalWorkHours > 0 ? odniesienie.avgHourlyRateNetto : null;
  const stawkaDnia = dzien.workHours > 0 ? dzien.hourlyRateNetto : null;

  if (odniesienie === null) {
    return null;
  }

  return (
    <View style={s.karta}>
      <Text style={s.naglowek}>ANALIZA DNIA NA TLE 30 DNI</Text>

      <Wiersz
        etykieta="Stawka tego dnia"
        wartosc={stawkaDnia === null ? '—' : `${zl(stawkaDnia)}/h`}
        delta={
          stawkaDnia !== null && sredniaStawka !== null && sredniaStawka > 0
            ? procent(stawkaDnia, sredniaStawka)
            : null
        }
      />
      <Wiersz
        etykieta="Średnia z 30 dni"
        wartosc={sredniaStawka === null ? '—' : `${zl(sredniaStawka)}/h`}
      />

      <View style={s.kreska} />

      <Wiersz etykieta="Dystans" wartosc={dystans > 0 ? km(dystans) : '—'} />
      <Wiersz
        etykieta="Paliwo (szacunek)"
        wartosc={szacowanePaliwo === null ? '—' : `≈ ${zl(szacowanePaliwo)}`}
      />
      <Wiersz
        etykieta="Netto po paliwie (szacunek)"
        wartosc={
          szacowanePaliwo === null ? '—' : `≈ ${zl(dzien.totalNetto - szacowanePaliwo)}`
        }
        kolor={C.ostrzezenie}
      />

      {dzien.fuelCost > 0 ? (
        <Text style={s.przypis}>
          Tego dnia zatankowałeś realnie za {zl(dzien.fuelCost)}. Ta kwota pracuje przez kolejne
          dni, dlatego w wierszu wyżej jest rozłożona po kilometrach, a nie odjęta w całości.
        </Text>
      ) : null}

      <Text style={s.przypis}>
        {zlNaKm === null
          ? 'Za mało danych z ostatnich 30 dni, żeby oszacować koszt paliwa na kilometr.'
          : `Szacunek liczony stawką ${zl(zlNaKm)}/km z ostatnich 30 dni. „Razem netto" wyżej jest bez paliwa — tak liczy serwer.`}
      </Text>
    </View>
  );
}

/* ========================================================================== */
/*  Porównanie dwóch okresów                                                  */
/* ========================================================================== */

export function PorownanieOkresow({
  biezacy,
  poprzedni,
  etykietaBiezacy,
  etykietaPoprzedni,
}: {
  biezacy: PeriodSummary;
  poprzedni: PeriodSummary | null;
  etykietaBiezacy: string;
  etykietaPoprzedni: string;
}) {
  if (poprzedni === null) return null;

  const pusty =
    poprzedni.grandTotalNetto === 0 &&
    poprzedni.totalWorkHours === 0 &&
    poprzedni.totalDistanceKm === 0;

  return (
    <View style={s.karta}>
      <Text style={s.naglowek}>PORÓWNANIE OKRESÓW</Text>

      <View style={s.legenda}>
        <Text style={s.legendaTekst} numberOfLines={1}>
          {etykietaBiezacy}
        </Text>
        <Text style={s.legendaTekst} numberOfLines={1}>
          vs {etykietaPoprzedni}
        </Text>
      </View>

      {pusty ? (
        <Text style={s.przypis}>Brak danych w poprzednim okresie — nie ma z czym porównać.</Text>
      ) : (
        <>
          <WierszPorownania
            etykieta="Razem netto"
            teraz={zl(biezacy.grandTotalNetto)}
            wtedy={zl(poprzedni.grandTotalNetto)}
            delta={procent(biezacy.grandTotalNetto, poprzedni.grandTotalNetto)}
          />
          <WierszPorownania
            etykieta="Brutto"
            teraz={zl(biezacy.totalGross)}
            wtedy={zl(poprzedni.totalGross)}
            delta={procent(biezacy.totalGross, poprzedni.totalGross)}
          />
          <WierszPorownania
            etykieta="Czas pracy"
            teraz={godziny(biezacy.totalWorkHours)}
            wtedy={godziny(poprzedni.totalWorkHours)}
            delta={procent(biezacy.totalWorkHours, poprzedni.totalWorkHours)}
          />
          <WierszPorownania
            etykieta="Stawka"
            teraz={`${zl(biezacy.avgHourlyRateNetto)}/h`}
            wtedy={`${zl(poprzedni.avgHourlyRateNetto)}/h`}
            delta={procent(biezacy.avgHourlyRateNetto, poprzedni.avgHourlyRateNetto)}
          />
          <WierszPorownania
            etykieta="Dystans"
            teraz={km(biezacy.totalDistanceKm)}
            wtedy={km(poprzedni.totalDistanceKm)}
            delta={procent(biezacy.totalDistanceKm, poprzedni.totalDistanceKm)}
          />
          <WierszPorownania
            etykieta="Paliwo"
            teraz={zl(biezacy.totalFuelCost)}
            wtedy={zl(poprzedni.totalFuelCost)}
            /* Wzrost kosztu to zmiana NA GORSZE — kolor odwrócony. */
            delta={procent(biezacy.totalFuelCost, poprzedni.totalFuelCost)}
            odwrocKolor
          />

          <Text style={s.przypis}>
            Bieżący okres jest zwykle niepełny — porównanie procentowe nabiera sensu dopiero pod
            koniec miesiąca.
          </Text>
        </>
      )}
    </View>
  );
}

/* ========================================================================== */

/** Zmiana procentowa. `null`, gdy podstawa to zero — dzielenie nie ma sensu. */
function procent(teraz: number, wtedy: number): number | null {
  if (wtedy === 0) return null;
  return ((teraz - wtedy) / Math.abs(wtedy)) * 100;
}

function Delta({ wartosc, odwrocKolor }: { wartosc: number | null; odwrocKolor?: boolean }) {
  if (wartosc === null) return <Text style={s.deltaPusta}>—</Text>;

  const zaokraglona = Math.round(wartosc);
  const dobre = odwrocKolor ? zaokraglona < 0 : zaokraglona > 0;
  const kolor = zaokraglona === 0 ? C.tekstPrzygaszony : dobre ? C.akcent : C.blad;
  const znak = zaokraglona > 0 ? '+' : '';

  return (
    <Text style={[s.delta, { color: kolor }]}>
      {znak}
      {zaokraglona}%
    </Text>
  );
}

function Wiersz({
  etykieta,
  wartosc,
  kolor,
  delta,
}: {
  etykieta: string;
  wartosc: string;
  kolor?: string;
  delta?: number | null;
}) {
  return (
    <View style={s.wiersz}>
      <Text style={s.etykieta}>{etykieta}</Text>
      <View style={s.prawaStrona}>
        <Text style={[s.wartosc, kolor ? { color: kolor } : null]}>{wartosc}</Text>
        {delta !== undefined ? <Delta wartosc={delta} /> : null}
      </View>
    </View>
  );
}

function WierszPorownania({
  etykieta,
  teraz,
  wtedy,
  delta,
  odwrocKolor,
}: {
  etykieta: string;
  teraz: string;
  wtedy: string;
  delta: number | null;
  odwrocKolor?: boolean;
}) {
  return (
    <View style={s.wierszPorownania}>
      <View style={s.kolumnaEtykiety}>
        <Text style={s.etykieta}>{etykieta}</Text>
        <Text style={s.wtedy}>{wtedy}</Text>
      </View>
      <View style={s.prawaStrona}>
        <Text style={s.wartosc}>{teraz}</Text>
        <Delta wartosc={delta} odwrocKolor={odwrocKolor} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  karta: {
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  naglowek: {
    color: C.tekstPrzygaszony,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 12,
  },

  legenda: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  legendaTekst: { color: C.tekstPrzygaszony, fontSize: 11, flexShrink: 1 },

  wiersz: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 5,
  },
  wierszPorownania: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  kolumnaEtykiety: { flexShrink: 1, paddingRight: 8 },
  etykieta: { color: C.tekstPrzygaszony, fontSize: 14 },
  wtedy: { color: C.obramowanie, fontSize: 11, marginTop: 2, fontVariant: ['tabular-nums'] },

  prawaStrona: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  wartosc: { color: C.tekst, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  delta: { fontSize: 12, fontWeight: '700', minWidth: 46, textAlign: 'right' },
  deltaPusta: { color: C.obramowanie, fontSize: 12, minWidth: 46, textAlign: 'right' },

  kreska: { height: 1, backgroundColor: C.obramowanie, marginVertical: 8 },
  przypis: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: 10, lineHeight: 15 },
});
