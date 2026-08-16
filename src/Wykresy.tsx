import { Pressable, StyleSheet, Text, View } from 'react-native';

import { zl } from './format';
import { dniZakresu, dzienTygodnia, numerTygodniaISO, poniedzialek, type Zakres } from './okresy';
import { C } from './theme';
import type { DailyTotals } from './types';

/**
 * Wykresy bez żadnej biblioteki — zwykłe `View` o wyliczonej wysokości
 * i przezroczystości.
 *
 * Powód nie jest ideologiczny: każda biblioteka wykresów dla React Native
 * ciągnie za sobą `react-native-svg`, czyli moduł natywny. A moduł natywny
 * oznacza koniec aktualizacji przez OTA i powrót do budowania APK przy każdej
 * zmianie. Przy słupkach i siatce kalendarza ta cena jest absurdalna.
 */

const DNI_SKROT = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'];

/** Mapa data → wpis, żeby nie szukać liniowo dla każdego dnia siatki. */
function poDacie(dni: DailyTotals[]): Map<string, DailyTotals> {
  return new Map(dni.map((d) => [d.date, d]));
}

/* ========================================================================== */
/*  Słupki tygodnia                                                           */
/* ========================================================================== */

export function WykresTygodnia({
  zakres,
  dni,
  wybrany,
  onWybierz,
}: {
  zakres: Zakres;
  dni: DailyTotals[];
  wybrany: string | null;
  onWybierz: (data: string) => void;
}) {
  const mapa = poDacie(dni);
  const daty = dniZakresu(zakres);
  const maks = Math.max(...daty.map((d) => mapa.get(d)?.totalNetto ?? 0), 1);

  return (
    <View style={s.karta}>
      <Text style={s.naglowek}>NETTO DZIEŃ PO DNIU</Text>

      <View style={s.slupki}>
        {daty.map((data, i) => {
          const wpis = mapa.get(data);
          const netto = wpis?.totalNetto ?? 0;
          const wysokosc = netto > 0 ? Math.max(4, Math.round((netto / maks) * 110)) : 2;
          const aktywny = wybrany === data;

          return (
            <Pressable key={data} style={s.kolumna} onPress={() => onWybierz(data)}>
              <Text style={[s.kwotaNadSlupkiem, aktywny && s.kwotaAktywna]}>
                {netto > 0 ? Math.round(netto) : ''}
              </Text>
              <View
                style={[
                  s.slupek,
                  { height: wysokosc },
                  netto === 0 && s.slupekPusty,
                  aktywny && s.slupekAktywny,
                ]}
              />
              <Text style={[s.podpisDnia, aktywny && s.podpisAktywny]}>{DNI_SKROT[i]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ========================================================================== */
/*  Kalendarz miesiąca (heatmapa)                                             */
/* ========================================================================== */

export function KalendarzMiesiaca({
  zakres,
  dni,
  wybrany,
  wybranyTydzien,
  onWybierz,
  onWybierzTydzien,
}: {
  zakres: Zakres;
  dni: DailyTotals[];
  wybrany: string | null;
  /** Poniedziałek zaznaczonego tygodnia albo `null`. */
  wybranyTydzien: string | null;
  onWybierz: (data: string) => void;
  onWybierzTydzien: (poniedzialek: string) => void;
}) {
  const mapa = poDacie(dni);
  const daty = dniZakresu(zakres);
  const maks = Math.max(...daty.map((d) => mapa.get(d)?.totalNetto ?? 0), 1);

  // Puste pola przed pierwszym dniem, żeby 1. wypadł we właściwej kolumnie.
  const przesuniecie = dzienTygodnia(zakres.od) - 1;
  const komorki: Array<string | null> = [...Array<null>(przesuniecie).fill(null), ...daty];

  // Dopełniamy do pełnych siódemek, żeby ostatni wiersz nie rozjechał kolumn.
  while (komorki.length % 7 !== 0) komorki.push(null);
  const tygodnie: Array<Array<string | null>> = [];
  for (let i = 0; i < komorki.length; i += 7) tygodnie.push(komorki.slice(i, i + 7));

  return (
    <View style={s.karta}>
      <Text style={s.naglowek}>KALENDARZ — IM JAŚNIEJ, TYM WIĘCEJ</Text>

      <View style={s.wiersze}>
        <View style={s.wiersz}>
          <Text style={s.gutterNaglowek}>tyg</Text>
          {DNI_SKROT.map((d) => (
            <Text key={d} style={s.naglowekKolumny}>
              {d}
            </Text>
          ))}
        </View>

        {tygodnie.map((tydzien) => {
          const pn = poniedzialek(tydzien.find((d): d is string => d !== null) ?? zakres.od);
          return (
            <View key={pn} style={s.wiersz}>
              <Pressable
                style={[s.gutter, wybranyTydzien === pn && s.gutterWybrany]}
                onPress={() => onWybierzTydzien(pn)}
              >
                <Text
                  style={[s.gutterTekst, wybranyTydzien === pn && s.gutterTekstWybrany]}
                >
                  {numerTygodniaISO(pn)}
                </Text>
              </Pressable>

              {tydzien.map((data, i) => {
                if (data === null) return <View key={`pusto-${pn}-${i}`} style={s.komorka} />;

                const netto = mapa.get(data)?.totalNetto ?? 0;
                const intensywnosc = netto > 0 ? 0.18 + 0.82 * (netto / maks) : 0;

                return (
                  <Pressable
                    key={data}
                    style={[s.komorka, wybrany === data && s.komorkaWybrana]}
                    onPress={() => onWybierz(data)}
                  >
                    <View
                      style={[
                        s.wypelnienie,
                        netto > 0
                          ? { backgroundColor: C.akcent, opacity: intensywnosc }
                          : { backgroundColor: C.obramowanie },
                      ]}
                    />
                    <Text
                      style={[s.numerDnia, netto > 0 && intensywnosc > 0.55 && s.numerNaJasnym]}
                    >
                      {Number(data.slice(8, 10))}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </View>

      <Text style={s.stopkaKalendarza}>
        Najlepszy dzień: {zl(maks)}. Dotknij dnia — albo numeru tygodnia po lewej.
      </Text>
    </View>
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
  naglowek: {
    color: C.tekstPrzygaszony,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 14,
  },

  slupki: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  kolumna: { alignItems: 'center', flex: 1 },
  kwotaNadSlupkiem: {
    color: C.tekstPrzygaszony,
    fontSize: 10,
    marginBottom: 4,
    height: 14,
    fontVariant: ['tabular-nums'],
  },
  kwotaAktywna: { color: C.akcent, fontWeight: '700' },
  slupek: { width: 22, borderRadius: 5, backgroundColor: C.akcent, opacity: 0.55 },
  slupekPusty: { backgroundColor: C.obramowanie, opacity: 1 },
  slupekAktywny: { opacity: 1 },
  podpisDnia: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: 6 },
  podpisAktywny: { color: C.tekst, fontWeight: '700' },

  wiersze: {},
  wiersz: { flexDirection: 'row', alignItems: 'center' },
  gutterNaglowek: {
    width: 26,
    textAlign: 'center',
    color: C.tekstPrzygaszony,
    fontSize: 9,
    marginBottom: 6,
  },
  gutter: {
    width: 26,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
  },
  gutterWybrany: { backgroundColor: C.obramowanie },
  gutterTekst: { color: C.tekstPrzygaszony, fontSize: 10, fontWeight: '600' },
  gutterTekstWybrany: { color: C.tekst },
  naglowekKolumny: {
    flex: 1,
    textAlign: 'center',
    color: C.tekstPrzygaszony,
    fontSize: 10,
    marginBottom: 6,
  },
  komorka: {
    flex: 1,
    aspectRatio: 1,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  komorkaWybrana: { borderRadius: 8, borderWidth: 2, borderColor: C.tekst },
  wypelnienie: { position: 'absolute', top: 2, left: 2, right: 2, bottom: 2, borderRadius: 7 },
  numerDnia: { color: C.tekst, fontSize: 12, fontWeight: '600' },
  numerNaJasnym: { color: C.tlo },

  stopkaKalendarza: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: 12 },
});
