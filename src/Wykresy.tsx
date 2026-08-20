import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { useRef } from 'react';

import { zl } from './format';
import { procentUdzialu, skonczona } from './licz';
import { dniZakresu, dzienTygodnia, numerTygodniaISO, poniedzialek, type Zakres } from './okresy';
import { C } from './theme';
import type { DailyTotals } from './types';

/**
 * Siatka kalendarza na zwykłych `View` — bez SVG i bez biblioteki wykresów.
 *
 * ⚠️ POPRAWKA 20.08. Stał tu argument: „każda biblioteka wykresów ciągnie
 * `react-native-svg`, czyli moduł natywny, a moduł natywny oznacza koniec
 * aktualizacji przez OTA". **To przestało być prawdą i nikt tego nie zauważył.**
 * `react-native-svg` jest w `package.json` (15.15.4) i jest wkompilowany w APK
 * od kroku 30 — czyli OTA działa. Uzasadnienie przeżyło swój powód o kilka
 * tygodni, dokładnie tak jak deterministyczny klucz idempotencji w `obraz.ts`.
 *
 * Kalendarz zostaje na `View`, ale już nie „bo SVG nie wolno" — tylko dlatego,
 * że siatka siedmiu kolumn to siatka siedmiu kolumn i SVG nic by tu nie dodał.
 * Właściwe wykresy rysuje `WykresySvg.tsx`, licząc skalę w `wykresLicz.ts`.
 */

const DNI_SKROT = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'];

/** Mapa data → wpis, żeby nie szukać liniowo dla każdego dnia siatki. */
function poDacie(dni: DailyTotals[]): Map<string, DailyTotals> {
  return new Map(dni.map((d) => [d.date, d]));
}

/**
 * Netto dnia sprowadzone do liczby nadającej się do rysowania.
 *
 * Jeden `NaN` w danych zatruwa `Math.max` (wynik `NaN`), a stamtąd całą skalę
 * wykresu: każdy słupek dostaje wysokość `NaN` i znika. Zamiana na 0 kosztuje
 * jeden słupek, a nie cały wykres.
 */
function doWykresu(wpis: DailyTotals | undefined): number {
  const v = skonczona(wpis?.totalNetto);
  return v !== null && v > 0 ? v : 0;
}

/* ========================================================================== */
/*  Kalendarz miesiąca (heatmapa)                                             */
/* ========================================================================== */

/** Ile pikseli w bok wystarczy, żeby uznać ruch za przewijanie miesiąca. */
const PROG_PRZECHWYCENIA = 12;
/** Ile trzeba przejechać ŁĄCZNIE, żeby miesiąc faktycznie się zmienił. */
const PROG_ZMIANY = 45;
/** Szybki ruch liczy się nawet przy krótkim dystansie. */
const PROG_PREDKOSCI = 0.25;

/**
 * Rozpoznanie przesunięcia w bok, wspólne dla kalendarza w zakładce i w modalu.
 *
 * ⚠️ KLUCZOWE JEST `Capture`, NIE SAM PRÓG.
 *
 * Pierwsza wersja używała zwykłego `onMoveShouldSetPanResponder` z progiem
 * 40 px i działała opornie: zanim palec przejechał te 40 px, dotyk zdążył
 * przejąć otaczający `ScrollView` razem z `RefreshControl` — więc ruch w bok
 * częściej wywoływał odświeżenie aplikacji niż zmianę miesiąca.
 *
 * W React Native przodek dostaje pytanie o responder w fazie PRZECHWYTYWANIA
 * wcześniej niż potomek w fazie zwykłej. Dlatego kalendarz musi pytać
 * w `...Capture`, i to przy niskim progu (12 px), żeby zgłosić się PRZED
 * scrollem. Do tego `onPanResponderTerminationRequest: () => false`, bo bez
 * niego scroll odbiera gest w trakcie przeciągania.
 *
 * Rozdzielone są dwa progi: **przechwycenia** (12 px — kiedy przestajemy
 * pozwalać scrollowi) i **zmiany** (45 px albo szybki ruch — kiedy miesiąc
 * naprawdę się przesuwa). Dzięki temu krótkie drgnięcie palca nic nie robi,
 * ale też nie ląduje w scrollu w połowie.
 *
 * Ruch w pionie nadal należy do scrolla: wymagamy, żeby poziomy był co
 * najmniej półtora raza większy.
 */
export function gestPrzewijania(onLewo: () => void, onPrawo: () => void) {
  return PanResponder.create({
    // Dotknięcie bez ruchu ma trafić do `Pressable` na dniu, nie tutaj.
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponderCapture: (_e, g) =>
      Math.abs(g.dx) > PROG_PRZECHWYCENIA && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,

    // Raz złapany gest nie wraca do scrolla ani do RefreshControl.
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,

    onPanResponderRelease: (_e, g) => {
      const wystarczy = Math.abs(g.dx) >= PROG_ZMIANY || Math.abs(g.vx) >= PROG_PREDKOSCI;
      if (!wystarczy) return;
      if (g.dx < 0) onLewo();
      else onPrawo();
    },
  });
}

export function KalendarzMiesiaca({
  zakres,
  dni,
  wybrany,
  wybranyTydzien,
  dniZOfertami,
  onNastepnyMiesiac,
  onPoprzedniMiesiac,
  onWybierz,
  onWybierzTydzien,
}: {
  zakres: Zakres;
  dni: DailyTotals[];
  wybrany: string | null;
  /** Poniedziałek zaznaczonego tygodnia albo `null`. */
  wybranyTydzien: string | null;
  /**
   * Dni, w których bot ocenił choć jedną ofertę.
   *
   * Osobny sygnał od jasności kafelka: ta mówi o ZAROBKU, kropka o tym, że
   * jest co oglądać w zakładce Oferty. Dzień bez wpisu zarobku może mieć
   * oceny ofert i odwrotnie.
   */
  dniZOfertami: ReadonlySet<string>;
  /** Przesunięcie palcem w lewo — miesiąc w przód. `null` = zablokowane. */
  onNastepnyMiesiac: (() => void) | null;
  /** Przesunięcie palcem w prawo — miesiąc wstecz. */
  onPoprzedniMiesiac: () => void;
  onWybierz: (data: string) => void;
  onWybierzTydzien: (poniedzialek: string) => void;
}) {
  const mapa = poDacie(dni);
  const daty = dniZakresu(zakres);
  const maks = Math.max(...daty.map((d) => doWykresu(mapa.get(d))), 1);

  // Puste pola przed pierwszym dniem, żeby 1. wypadł we właściwej kolumnie.
  const przesuniecie = dzienTygodnia(zakres.od) - 1;
  const komorki: Array<string | null> = [...Array<null>(przesuniecie).fill(null), ...daty];

  // Dopełniamy do pełnych siódemek, żeby ostatni wiersz nie rozjechał kolumn.
  while (komorki.length % 7 !== 0) komorki.push(null);
  const tygodnie: Array<Array<string | null>> = [];
  for (let i = 0; i < komorki.length; i += 7) tygodnie.push(komorki.slice(i, i + 7));

  const gest = useRef(
    gestPrzewijania(
      () => wPrzod.current?.(),
      () => wTyl.current?.()
    )
  ).current;

  // W refach, bo `PanResponder` powstaje raz i domknąłby na pierwszych
  // funkcjach — po zmianie miesiąca przesuwałby zawsze z tego samego miejsca.
  const wPrzod = useRef<(() => void) | null>(null);
  const wTyl = useRef<(() => void) | null>(null);
  wPrzod.current = onNastepnyMiesiac;
  wTyl.current = onPoprzedniMiesiac;

  return (
    <View style={s.karta} {...gest.panHandlers}>
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

                const netto = doWykresu(mapa.get(data));
                const intensywnosc = netto > 0 ? 0.18 + 0.82 * (procentUdzialu(netto, maks) / 100) : 0;

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
                    {/* JEDEN kolor, niezależnie od jasności kafelka.
                        Wcześniej na jasnym tle kropka przełączała się na kolor
                        tła, czyli granatowy — na zieleni czytało się to jak
                        czarną plamę i wyglądało na błąd renderowania. */}
                    {dniZOfertami.has(data) ? <View style={s.kropkaOfert} /> : null}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </View>

      <View style={s.legenda}>
        <View style={s.kropkaOfertLegenda} />
        <Text style={s.stopkaKalendarza}>dzień z ocenionymi ofertami</Text>
      </View>

      <Text style={s.stopkaKalendarza}>
        Najlepszy dzień: {zl(maks)}. Dotknij dnia albo numeru tygodnia po lewej. Przesuń palcem
        w bok, żeby zmienić miesiąc.
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

  kropkaOfert: {
    position: 'absolute',
    bottom: 4,
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: C.ostrzezenie,
  },
  legenda: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  kropkaOfertLegenda: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: C.ostrzezenie,
  },

  stopkaKalendarza: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: 12 },
});
