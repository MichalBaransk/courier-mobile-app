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
 * ⚠️ TRZY BŁĘDY PIERWSZEJ WERSJI I CO Z NIMI ZROBIONO — bo każdy z nich jest
 * łatwy do powtórzenia przy następnej zmianie w tym pliku.
 *
 * 1. **Dotyk przesunięty w prawo.** Pozycję liczyłem z `gestureState.moveX`,
 *    czyli ze współrzędnej EKRANU, odejmując początek toru zapamiętany
 *    w `onTouchStart`. Ale `PanResponder` przechwytuje dotyk, więc
 *    `onTouchStart` w ogóle nie musi się odpalić — początek zostawał zerem
 *    i suwak liczył pozycję względem lewej krawędzi EKRANU zamiast toru.
 *    Teraz: pozycja startowa z `locationX` (względem toru), a ruch z
 *    `gestureState.dx`, czyli PRZESUNIĘCIA od chwili złapania. Żadnych
 *    współrzędnych bezwzględnych.
 *
 * 2. **Dłuższe przytrzymanie zabijało sterowanie.** Otaczający `ScrollView`
 *    przejmował responder w trakcie przeciągania. Teraz
 *    `onPanResponderTerminationRequest` zwraca `false` — raz złapany suwak
 *    nie oddaje dotyku, dopóki palec go nie puści.
 *
 * 3. **Dzieci przechwytywały dotyk.** Wypełnienie i uchwyt są nad torem, więc
 *    `locationX` bywało liczone względem nich, a nie względem toru. Mają teraz
 *    `pointerEvents="none"` — dotyk zawsze ląduje na tym samym elemencie,
 *    co responder.
 */

interface Props {
  min: number;
  maks: number;
  /** Ziarno — np. 1 dla godzin, 5 dla minut. */
  krok: number;
  wartosc: number;
  onZmien: (v: number) => void;
  /** Podpis nad suwakiem, np. `Początek — godzina`. */
  etykieta: string;
  /** Jak pokazać bieżącą wartość. */
  formatuj: (v: number) => string;
}

export function Suwak({ min, maks, krok, wartosc, onZmien, etykieta, formatuj }: Props) {
  const szerokosc = useRef(0);
  /** Gdzie na torze palec wylądował przy złapaniu — punkt odniesienia dla `dx`. */
  const start = useRef(0);
  const [dotykany, setDotykany] = useState(false);

  // W refie, bo `PanResponder` powstaje raz i domknąłby na pierwszej wartości.
  const przy = useRef(onZmien);
  przy.current = onZmien;
  const zakres = useRef({ min, maks, krok });
  zakres.current = { min, maks, krok };

  const zZakresu = (x: number): number => {
    const w = szerokosc.current;
    const { min: a, maks: b, krok: k } = zakres.current;
    if (w <= 0) return a;

    const udzial = Math.min(1, Math.max(0, x / w));
    const surowa = a + udzial * (b - a);
    const doKroku = Math.round(surowa / k) * k;
    // Zaokrąglenie do dwóch miejsc ratuje przed 6.999999 przy kroku 0,5.
    return Math.min(b, Math.max(a, Math.round(doKroku * 100) / 100));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Bez tego otaczający ScrollView przejmuje dotyk przy dłuższym
      // przeciąganiu i suwak przestaje reagować aż do puszczenia palca.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,

      onPanResponderGrant: (e) => {
        setDotykany(true);
        start.current = e.nativeEvent.locationX;
        przy.current(zZakresu(start.current));
      },
      onPanResponderMove: (_e, gest) => {
        // `dx` to przesunięcie OD CHWILI ZŁAPANIA — nie wymaga wiedzy o tym,
        // gdzie tor leży na ekranie.
        przy.current(zZakresu(start.current + gest.dx));
      },
      onPanResponderRelease: () => setDotykany(false),
      onPanResponderTerminate: () => setDotykany(false),
    })
  ).current;

  const zmierz = (e: LayoutChangeEvent) => {
    szerokosc.current = e.nativeEvent.layout.width;
  };

  const udzial = maks > min ? (wartosc - min) / (maks - min) : 0;

  /**
   * Adnotacja `${number}%` jest KONIECZNA, nie ozdobna.
   *
   * `DimensionValue` w React Native to typ literałowy, a nie zwykły `string`.
   * Bez adnotacji stała rozszerza się do `string` i `<View style={{ width }}>`
   * przestaje się kompilować. W JSX-ie pisanym wprost problemu nie ma, bo typ
   * narzuca kontekst — wychodzi dopiero przy przypisaniu do zmiennej.
   */
  const procent: `${number}%` = `${Math.min(100, Math.max(0, udzial * 100))}%`;

  return (
    <View style={s.blok}>
      <View style={s.gora}>
        <Text style={s.etykieta}>{etykieta}</Text>
        <Text style={[s.wartosc, dotykany && s.wartoscDotykana]}>{formatuj(wartosc)}</Text>
      </View>

      <View style={s.obszarDotyku} onLayout={zmierz} {...responder.panHandlers}>
        <View style={s.tor} pointerEvents="none">
          <View style={[s.wypelnienie, { width: procent }]} />
        </View>
        <View
          style={[s.uchwyt, { left: procent }, dotykany && s.uchwytDotykany]}
          pointerEvents="none"
        />
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

  // Wysoki obszar dotyku przy niskim torze — palec trafia, oko widzi cienką
  // linię. Szerokość mierzona przez `onLayout` MUSI odpowiadać szerokości
  // toru, bo to na niej opiera się przeliczanie pozycji.
  obszarDotyku: { height: 48, justifyContent: 'center' },
  tor: { height: 6, borderRadius: 999, backgroundColor: C.obramowanie, overflow: 'hidden' },
  wypelnienie: { height: '100%', backgroundColor: C.akcent, borderRadius: 999 },
  uchwyt: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: C.akcent,
    marginLeft: -12,
    borderColor: C.tlo,
    borderWidth: 2,
  },
  uchwytDotykany: { transform: [{ scale: 1.3 }] },
});
