import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { dataPoPolsku, godziny, km, litry, zl, zlZeZnakiem } from './format';
import { iloraz } from './licz';
import { C } from './theme';
import type { DailySummary, DailyTotals, PeriodSummary, Saldo } from './types';

/**
 * Karty prezentacyjne — czyste funkcje danych, bez pobierania i bez stanu.
 * Odpowiednik `bot/cards.ts` po stronie aplikacji: renderowanie mieszka osobno
 * od logiki, tak jak w backendzie (§5).
 */

export function Wiersz({
  etykieta,
  wartosc,
  kolor,
  duzy,
}: {
  etykieta: string;
  wartosc: string;
  kolor?: string;
  duzy?: boolean;
}) {
  return (
    <View style={s.wiersz}>
      <Text style={s.etykieta}>{etykieta}</Text>
      <Text style={[s.wartosc, duzy && s.wartoscDuza, kolor ? { color: kolor } : null]}>
        {wartosc}
      </Text>
    </View>
  );
}

export function Sekcja({ tytul, children }: { tytul: string; children: ReactNode }) {
  return (
    <View style={s.karta}>
      <Text style={s.naglowekSekcji}>{tytul}</Text>
      {children}
    </View>
  );
}

/* ========================================================================== */
/*  Dzień                                                                     */
/* ========================================================================== */

export function KartaDnia({ dane }: { dane: DailySummary }) {
  const brakGodzin = dane.workHours === 0;

  return (
    <>
      <Sekcja tytul="ZAROBEK">
        <Wiersz etykieta="Brutto" wartosc={zl(dane.grossEarnings)} />
        <Wiersz etykieta="Netto ze zleceń" wartosc={zl(dane.netEarnings)} />
        <Wiersz etykieta="Napiwki gotówką" wartosc={zl(dane.cashTipsTotal)} />
        <View style={s.kreska} />
        <Wiersz etykieta="Razem netto" wartosc={zl(dane.totalNetto)} kolor={C.akcent} duzy />
      </Sekcja>

      <Sekcja tytul="PORTFEL">
        <Wiersz etykieta="Wypłacone z portfela" wartosc={zl(dane.walletPayouts)} />
        <Wiersz
          etykieta="Do przelewu"
          wartosc={zlZeZnakiem(dane.doPrzelewu)}
          kolor={dane.doPrzelewu < 0 ? C.blad : C.tekst}
        />
        <Text style={s.przypis}>Napiwki nie wchodzą do przelewu — są już w kieszeni.</Text>
      </Sekcja>

      <Sekcja tytul="ZMIANA">
        <Wiersz
          etykieta="Godziny"
          wartosc={dane.workFrom && dane.workTo ? `${dane.workFrom} – ${dane.workTo}` : '—'}
        />
        <Wiersz etykieta="Czas pracy" wartosc={brakGodzin ? '—' : godziny(dane.workHours)} />
        <Wiersz
          etykieta="Stawka"
          wartosc={brakGodzin ? '—' : `${zl(dane.hourlyRateNetto)}/h`}
          kolor={brakGodzin ? C.tekstPrzygaszony : C.akcent}
        />
        <Wiersz etykieta="Dystans" wartosc={km(dane.distanceKm)} />
      </Sekcja>

      <Sekcja tytul="PALIWO">
        <Wiersz etykieta="Koszt" wartosc={zl(dane.fuelCost)} />
        <Wiersz etykieta="Ilość" wartosc={dane.fuelLiters > 0 ? litry(dane.fuelLiters) : '—'} />
        <Wiersz
          etykieta="Cena za litr"
          wartosc={dane.fuelPricePerLiter != null ? `${zl(dane.fuelPricePerLiter)}/L` : '—'}
        />
      </Sekcja>
    </>
  );
}

/* ========================================================================== */
/*  Szczegóły dnia W MIEJSCU — bez opuszczania widoku tygodnia/miesiąca       */
/* ========================================================================== */

/**
 * Zbudowana z `DailyTotals`, które i tak mamy z `/api/v1/dni`.
 *
 * Świadomie NIE pobieramy pełnego `/dzien/:data`: filtrowanie wykresu ma być
 * natychmiastowe, a wypłaty z portfela i tak nie zmieszczą się w tej karcie.
 */
export function SzczegolyDnia({
  dzien,
  data,
  onZamknij,
}: {
  dzien: DailyTotals | null;
  data: string;
  onZamknij: () => void;
}) {
  return (
    <View style={s.karta}>
      <View style={s.naglowekZKrzyzykiem}>
        <Text style={s.naglowekSekcji}>{dataNaglowek(data)}</Text>
        <Text style={s.zamknij} onPress={onZamknij}>
          ✕
        </Text>
      </View>

      {dzien === null ? (
        <Text style={s.przypis}>Brak wpisów tego dnia.</Text>
      ) : (
        <>
          <Wiersz etykieta="Brutto" wartosc={zl(dzien.grossEarnings)} />
          <Wiersz etykieta="Napiwki" wartosc={zl(dzien.cashTipsTotal)} />
          <Wiersz etykieta="Razem netto" wartosc={zl(dzien.totalNetto)} kolor={C.akcent} duzy />
          <View style={s.kreska} />
          <Wiersz
            etykieta="Czas pracy"
            wartosc={dzien.workHours > 0 ? godziny(dzien.workHours) : '—'}
          />
          <Wiersz etykieta="Dystans" wartosc={dzien.distanceKm > 0 ? km(dzien.distanceKm) : '—'} />
          <Wiersz etykieta="Paliwo" wartosc={zl(dzien.fuelCost)} />
        </>
      )}
    </View>
  );
}

/** Podsumowanie zaznaczonego tygodnia, liczone z danych, które już mamy. */
export function SzczegolyTygodnia({
  dni,
  etykieta,
  onZamknij,
}: {
  dni: DailyTotals[];
  etykieta: string;
  onZamknij: () => void;
}) {
  const suma = dni.reduce(
    (a, d) => ({
      brutto: a.brutto + d.grossEarnings,
      napiwki: a.napiwki + d.cashTipsTotal,
      netto: a.netto + d.totalNetto,
      godziny: a.godziny + d.workHours,
      dystans: a.dystans + d.distanceKm,
      paliwo: a.paliwo + d.fuelCost,
    }),
    { brutto: 0, napiwki: 0, netto: 0, godziny: 0, dystans: 0, paliwo: 0 }
  );

  return (
    <View style={s.karta}>
      <View style={s.naglowekZKrzyzykiem}>
        <Text style={s.naglowekSekcji}>{etykieta}</Text>
        <Text style={s.zamknij} onPress={onZamknij}>
          ✕
        </Text>
      </View>

      <Wiersz etykieta="Brutto" wartosc={zl(suma.brutto)} />
      <Wiersz etykieta="Napiwki" wartosc={zl(suma.napiwki)} />
      <Wiersz etykieta="Razem netto" wartosc={zl(suma.netto)} kolor={C.akcent} duzy />
      <View style={s.kreska} />
      <Wiersz etykieta="Czas pracy" wartosc={suma.godziny > 0 ? godziny(suma.godziny) : '—'} />
      <Wiersz etykieta="Dystans" wartosc={suma.dystans > 0 ? km(suma.dystans) : '—'} />
      <Wiersz etykieta="Paliwo" wartosc={zl(suma.paliwo)} />
      <Wiersz
        etykieta="Netto po paliwie"
        wartosc={zl(suma.netto - suma.paliwo)}
        kolor={C.ostrzezenie}
      />
      <Text style={s.przypis}>{dni.length} dni z wpisami.</Text>
    </View>
  );
}

/* ========================================================================== */
/*  Okres                                                                     */
/* ========================================================================== */

export function KartaOkresu({ dane }: { dane: PeriodSummary }) {
  const brakGodzin = dane.totalWorkHours === 0;

  return (
    <>
      <Sekcja tytul="RAZEM W OKRESIE">
        <Wiersz etykieta="Brutto" wartosc={zl(dane.totalGross)} />
        <Wiersz etykieta="Netto ze zleceń" wartosc={zl(dane.totalNettoEarnings)} />
        <Wiersz etykieta="Napiwki gotówką" wartosc={zl(dane.totalCashTips)} />
        <View style={s.kreska} />
        <Wiersz etykieta="Razem netto" wartosc={zl(dane.grandTotalNetto)} kolor={C.akcent} duzy />
        <View style={s.kreska} />
        {/* W skali okresu odjęcie paliwa jest dokładne, nie szacunkowe:
            tankowania się uśredniają, a suma się zgadza co do grosza. */}
        <Wiersz
          etykieta="Netto po odjęciu paliwa"
          wartosc={zl(dane.grandTotalNetto - dane.totalFuelCost)}
          kolor={C.ostrzezenie}
        />
      </Sekcja>

      <Sekcja tytul="PRACA">
        <Wiersz etykieta="Czas pracy" wartosc={brakGodzin ? '—' : godziny(dane.totalWorkHours)} />
        <Wiersz
          etykieta="Średnia stawka"
          wartosc={brakGodzin ? '—' : `${zl(dane.avgHourlyRateNetto)}/h`}
          kolor={brakGodzin ? C.tekstPrzygaszony : C.akcent}
        />
        <Wiersz etykieta="Dystans" wartosc={km(dane.totalDistanceKm)} />
      </Sekcja>

      <Sekcja tytul="PALIWO">
        <Wiersz etykieta="Koszt" wartosc={zl(dane.totalFuelCost)} />
        <Wiersz
          etykieta="Ilość"
          wartosc={dane.totalFuelLiters > 0 ? litry(dane.totalFuelLiters) : '—'}
        />
        <Wiersz
          etykieta="Średnia cena"
          wartosc={dane.avgPricePerLiter != null ? `${zl(dane.avgPricePerLiter)}/L` : '—'}
        />
        {dane.totalFuelCost > 0 && iloraz(dane.totalFuelCost, dane.totalDistanceKm) !== null ? (
          <Wiersz
            etykieta="Koszt na kilometr"
            wartosc={`${zl(iloraz(dane.totalFuelCost, dane.totalDistanceKm))}/km`}
          />
        ) : null}
      </Sekcja>
    </>
  );
}

/* ========================================================================== */
/*  Saldo                                                                     */
/* ========================================================================== */

export function KartaSalda({ saldo }: { saldo: Saldo }) {
  return (
    <Sekcja tytul="PORTFEL GLOVO">
      <Wiersz
        etykieta="Saldo"
        wartosc={zl(saldo.balance)}
        kolor={saldo.balance < 0 ? C.blad : C.tekst}
        duzy
      />
      <Text style={s.przypis}>
        {saldo.transactionCount} transakcji
        {saldo.lastDate ? ` · ostatnia ${saldo.lastDate}` : ''}
      </Text>
    </Sekcja>
  );
}

/* ========================================================================== */

/** `2026-08-16` → `Niedziela, 16 sierpnia` — nagłówek karty szczegółów. */
function dataNaglowek(iso: string): string {
  return dataPoPolsku(iso).toUpperCase();
}

const s = StyleSheet.create({
  naglowekZKrzyzykiem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  zamknij: { color: C.tekstPrzygaszony, fontSize: 18, paddingHorizontal: 6, paddingBottom: 8 },
  karta: {
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  naglowekSekcji: {
    color: C.tekstPrzygaszony,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  wiersz: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 5,
  },
  etykieta: { color: C.tekstPrzygaszony, fontSize: 14, flexShrink: 1, paddingRight: 8 },
  wartosc: { color: C.tekst, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  wartoscDuza: { fontSize: 22, fontWeight: '700' },
  kreska: { height: 1, backgroundColor: C.obramowanie, marginVertical: 8 },
  przypis: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: 10, lineHeight: 15 },
});
