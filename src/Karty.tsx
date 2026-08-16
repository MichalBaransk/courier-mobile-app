import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { godziny, km, litry, zl, zlZeZnakiem } from './format';
import { C } from './theme';
import type { DailySummary, PeriodSummary, Saldo } from './types';

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
        {dane.totalDistanceKm > 0 && dane.totalFuelCost > 0 ? (
          <Wiersz
            etykieta="Koszt na kilometr"
            wartosc={`${zl(dane.totalFuelCost / dane.totalDistanceKm)}/km`}
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

const s = StyleSheet.create({
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
