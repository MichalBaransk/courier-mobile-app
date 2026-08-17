import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { C } from './theme';

/**
 * Suwak zbudowany z `View` i `PanResponder`.
 *
 * `@react-native-community/slider` to moduł NATYWNY — czyli koniec aktualizacji
 * OTA i build APK przy każdej zmianie. `PanResponder` siedzi w rdzeniu React
 * Native, więc kosztuje zero.
 *
 * Szerokość toru mierzymy przez `onLayout` i trzymamy w `ref`, nie w stanie:
 * odczytujemy ją w każdym zdarzeniu ruchu, a `PanResponder` tworzony jest raz
 * i domknąłby na starej wartości ze stanu.
 */

interface Props {
  min: number;
  maks: number;
  /** Ziarno — np. 1 dla godzin, 5 dla minut. */
  krok: number;
  wartosc: number;
  onZmien: (v: number) => void;
  /** Podpis nad suwakiem, np. `Godzina`. */
  etykieta: string;
  /** Jak pokazać bieżącą wartość. */
  formatuj: (v: number) => string;
}

export function Suwak({ min, maks, krok, wartosc, onZmien, etykieta, formatuj }: Props) {
  const szerokosc = useRef(0);
  const [dotykany, setDotykany] = useState(false);

  // W refie, bo `PanResponder` powstaje raz i domknąłby na pierwszej wartości.
  const przy = useRef(onZmien);
  przy.current = onZmien;

  const zZakresu = (x: number): number => {
    const w = szerokosc.current;
    if (w <= 0) return min;
    const udzial = Math.min(1, Math.max(0, x / w));
    const surowa = min + udzial * (maks - min);
    const doKroku = Math.round(surowa / krok) * krok;
    // Zaokrąglenie do dwóch miejsc ratuje przed 6.999999 przy kroku 0.5.
    return Math.min(maks, Math.max(min, Math.round(doKroku * 100) / 100));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        setDotykany(true);
        przy.current(zZakresu(e.nativeEvent.locationX));
      },
      onPanResponderMove: (_e, gest) => {
        // `locationX` w trakcie ruchu bywa liczony względem uchwytu, nie toru.
        // `moveX` jest w układzie ekranu, więc odejmujemy początek toru.
        przy.current(zZakresu(gest.moveX - poczatek.current));
      },
      onPanResponderRelease: () => setDotykany(false),
      onPanResponderTerminate: () => setDotykany(false),
    })
  ).current;

  const poczatek = useRef(0);

  const zmierz = (e: LayoutChangeEvent) => {
    szerokosc.current = e.nativeEvent.layout.width;
  };

  const udzial = maks > min ? (wartosc - min) / (maks - min) : 0;

  /**
   * Adnotacja `${number}%` jest KONIECZNA, nie ozdobna.
   *
   * `DimensionValue` w React Native to typ literałowy, a nie zwykły `string`.
   * Bez adnotacji stała rozszerza się do `string` i `<View style={{ width }}>`
   * przestaje się kompilować. W JSX-ie pisanym wprost (`width: \`${x}%\``)
   * problemu nie ma, bo typ narzuca kontekst — wychodzi dopiero przy
   * przypisaniu do zmiennej.
   */
  const procent: `${number}%` = `${Math.min(100, Math.max(0, udzial * 100))}%`;

  return (
    <View style={s.blok}>
      <View style={s.gora}>
        <Text style={s.etykieta}>{etykieta}</Text>
        <Text style={[s.wartosc, dotykany && s.wartoscDotykana]}>{formatuj(wartosc)}</Text>
      </View>

      <View
        style={s.obszarDotyku}
        onLayout={zmierz}
        onTouchStart={(e) => {
          // Zapamiętujemy, gdzie na ekranie zaczyna się tor — do przeliczeń
          // w trakcie przeciągania.
          poczatek.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
        }}
        {...responder.panHandlers}
      >
        <View style={s.tor}>
          <View style={[s.wypelnienie, { width: procent }]} />
        </View>
        <View style={[s.uchwyt, { left: procent }, dotykany && s.uchwytDotykany]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  blok: { marginBottom: 4 },
  gora: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  etykieta: { color: C.tekstPrzygaszony, fontSize: 12 },
  wartosc: {
    color: C.tekst,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  wartoscDotykana: { color: C.akcent },

  // Wysoki obszar dotyku przy niskim torze — palec trafia, oko widzi cienką linię.
  obszarDotyku: { height: 44, justifyContent: 'center' },
  tor: { height: 6, borderRadius: 999, backgroundColor: C.obramowanie, overflow: 'hidden' },
  wypelnienie: { height: '100%', backgroundColor: C.akcent, borderRadius: 999 },
  uchwyt: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: C.akcent,
    marginLeft: -11,
    borderColor: C.tlo,
    borderWidth: 2,
  },
  uchwytDotykany: { transform: [{ scale: 1.25 }] },
});
