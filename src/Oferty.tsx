import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { km, stawka, zl } from './format';
import { policzOferty } from './statystykiOfert';
import { C } from './theme';
import type { CourseOfferItem } from './types';

/**
 * Oferty kursów ocenione przez bota ze zrzutu ekranu.
 *
 * Statystyki liczy `statystykiOfert.ts` — po stronie telefonu, nie przez
 * `/api/v1/oferty/statystyki/:data`. Powód jest praktyczny: listę ofert całego
 * miesiąca i tak pobieram jednym żądaniem pod kalendarz, więc odpytywanie
 * serwera o sumy z jednego dnia byłoby drugą podróżą po liczby, które już leżą
 * w pamięci. Dzięki temu ten sam komponent obsługuje dzień, tydzień i miesiąc —
 * zmienia się tylko zakres listy, nie sposób liczenia.
 *
 * ⚠️ Wzory NIE są identyczne z tymi w bocie — patrz nagłówek
 * `statystykiOfert.ts`, tam jest wyjaśnienie i powód.
 */

const POKAZ_NA_START = 6;

export function KartaOfert({
  oferty,
  etykieta,
  minStawka,
}: {
  oferty: CourseOfferItem[];
  /** Np. `OFERTY — 16 SIERPNIA` albo `OFERTY MIESIĄCA`. */
  etykieta: string;
  /** Próg opłacalności z `/api/v1/info` — do podpisu pod listą. */
  minStawka: number | null;
}) {
  const [rozwiniete, setRozwiniete] = useState(false);

  if (oferty.length === 0) {
    return (
      <View style={s.karta}>
        <Text style={s.naglowek}>{etykieta}</Text>
        <Text style={s.przypis}>
          Brak ocenionych ofert w tym zakresie. Oferty trafiają do bazy ze zrzutów ekranu wysłanych
          do bota.
        </Text>
      </View>
    );
  }

  const st = policzOferty(oferty);
  const widoczne = rozwiniete ? oferty : oferty.slice(0, POKAZ_NA_START);

  return (
    <View style={s.karta}>
      <Text style={s.naglowek}>{etykieta}</Text>

      <View style={s.kafelki}>
        <Kafelek wartosc={String(st.ile)} podpis="ofert" />
        <Kafelek wartosc={String(st.oplacalne)} podpis="opłacalne" kolor={C.akcent} />
        <Kafelek wartosc={String(st.nieoplacalne)} podpis="odpadło" kolor={C.blad} />
        <Kafelek
          wartosc={stawka(st.wazonaStawka)}
          podpis="zł/km ważona"
        />
      </View>

      <View style={s.kreska} />

      <Wiersz
        etykieta="Średnia stawka oferty"
        wartosc={st.sredniaStawka === null ? '—' : `${stawka(st.sredniaStawka)} zł/km`}
      />
      <Wiersz
        etykieta="Najlepsza / najgorsza"
        wartosc={
          st.najlepsza === null || st.najgorsza === null
            ? '—'
            : `${stawka(st.najlepsza)} / ${stawka(st.najgorsza)} zł/km`
        }
      />
      <Wiersz etykieta="Suma brutto ofert" wartosc={zl(st.sumaBrutto)} />
      <Wiersz etykieta="Suma dystansu" wartosc={km(st.sumaKm)} />
      {st.przyjete + st.odrzucone > 0 ? (
        <Wiersz
          etykieta="Przyjęte / odrzucone"
          wartosc={`${st.przyjete} / ${st.odrzucone}${st.oczekujace > 0 ? ` (${st.oczekujace} bez decyzji)` : ''}`}
        />
      ) : null}

      <View style={s.kreska} />

      {widoczne.map((o) => (
        <Oferta key={o.id} oferta={o} />
      ))}

      {oferty.length > POKAZ_NA_START ? (
        <Pressable style={s.wiecej} onPress={() => setRozwiniete((w) => !w)}>
          <Text style={s.wiecejTekst}>
            {rozwiniete ? 'Zwiń listę' : `Pokaż wszystkie (${oferty.length})`}
          </Text>
        </Pressable>
      ) : null}

      <Text style={s.przypis}>
        {minStawka === null
          ? 'Stawka liczona z dystansu podanego przez aplikację Glovo.'
          : `Próg opłacalności: ${stawka(minStawka)} zł/km. Podstawą jest dystans z aplikacji Glovo, nie z Map.`}
      </Text>
    </View>
  );
}

/** Pojedynczy wiersz oferty. Kolor kropki = werdykt, nie status decyzji. */
function Oferta({ oferta }: { oferta: CourseOfferItem }) {
  const brakDystansu = oferta.distanceTotalKm <= 0;

  return (
    <View style={s.oferta}>
      <View style={[s.kropka, { backgroundColor: oferta.isProfitable ? C.akcent : C.blad }]} />

      <View style={s.ofertaSrodek}>
        <Text style={s.ofertaGora}>
          {oferta.time || '--:--'} · {zl(oferta.grossAmount)}
          {oferta.status === 'ACCEPTED' ? '  ✓' : oferta.status === 'REJECTED' ? '  ✕' : ''}
        </Text>
        <Text style={s.ofertaDol} numberOfLines={1}>
          {brakDystansu
            ? 'brak dystansu'
            : `${km(oferta.distanceTotalKm)} · ${oferta.rateBasis === 'MAPS' ? 'z Map' : 'z aplikacji'}`}
          {oferta.deliveryAddress ? ` · ${oferta.deliveryAddress}` : ''}
        </Text>
      </View>

      <Text
        style={[s.ofertaStawka, { color: oferta.isProfitable ? C.akcent : C.blad }]}
      >
        {brakDystansu ? '—' : `${stawka(oferta.netRatePerKm)}`}
      </Text>
    </View>
  );
}

function Kafelek({
  wartosc,
  podpis,
  kolor,
}: {
  wartosc: string;
  podpis: string;
  kolor?: string;
}) {
  return (
    <View style={s.kafelek}>
      <Text style={[s.kafelekWartosc, kolor ? { color: kolor } : null]}>{wartosc}</Text>
      <Text style={s.kafelekPodpis}>{podpis}</Text>
    </View>
  );
}

function Wiersz({ etykieta, wartosc }: { etykieta: string; wartosc: string }) {
  return (
    <View style={s.wiersz}>
      <Text style={s.etykieta}>{etykieta}</Text>
      <Text style={s.wartosc}>{wartosc}</Text>
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

  kafelki: { flexDirection: 'row', gap: 8 },
  kafelek: {
    flex: 1,
    backgroundColor: C.tlo,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  kafelekWartosc: {
    color: C.tekst,
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  kafelekPodpis: { color: C.tekstPrzygaszony, fontSize: 10, marginTop: 3 },

  kreska: { height: 1, backgroundColor: C.obramowanie, marginVertical: 10 },
  wiersz: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 4,
  },
  etykieta: { color: C.tekstPrzygaszony, fontSize: 13, flexShrink: 1, paddingRight: 8 },
  wartosc: { color: C.tekst, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },

  oferta: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 10 },
  kropka: { width: 8, height: 8, borderRadius: 4 },
  ofertaSrodek: { flex: 1 },
  ofertaGora: { color: C.tekst, fontSize: 14, fontWeight: '600' },
  ofertaDol: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: 2 },
  ofertaStawka: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },

  wiecej: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  wiecejTekst: { color: C.akcent, fontSize: 13, fontWeight: '600' },

  przypis: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: 10, lineHeight: 15 },
});
