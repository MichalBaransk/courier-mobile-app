import {
  Dimensions,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { C } from './theme';

/**
 * Pasek sekcji na dole ekranu.
 *
 * Napisany od zera, nie przez `@react-navigation/*`: tamto ciągnie
 * `react-native-screens` i `react-native-safe-area-context`, czyli DWA moduły
 * natywne. Za cztery przyciski przełączające stan to cena nie do przyjęcia —
 * koniec aktualizacji OTA i build APK przy każdej zmianie koloru.
 *
 * Ikona i podpis to DWA osobne węzły `Text`. Emoji razem z tekstem w jednym
 * `Text` już raz w tym projekcie wyświetliło się na telefonie jako sama ikona
 * z pustym polem obok (chipy „napiwek" i „dystans"). Nie odtworzyłem tego
 * u siebie, więc zamiast zgadywać przyczynę — nie łączę ich.
 */

export type Sekcja = 'kalendarz' | 'oferty' | 'cele' | 'portfel';

const SEKCJE: Array<{ id: Sekcja; ikona: string; podpis: string }> = [
  { id: 'kalendarz', ikona: '📅', podpis: 'Kalendarz' },
  { id: 'oferty', ikona: '🛵', podpis: 'Oferty' },
  { id: 'cele', ikona: '🎯', podpis: 'Cele' },
  { id: 'portfel', ikona: '💰', podpis: 'Portfel' },
];

/** Zapas na gest cofania, gdy nie da się zmierzyć belki systemowej. */
const ZAPAS_MIN = 12;
/** Górna granica — żeby błąd pomiaru nie zjadł kawałka ekranu. */
const ZAPAS_MAKS = 48;

/**
 * Wysokość belki nawigacji systemu Androida.
 *
 * Od Androida 15 aplikacje rysują się od krawędzi do krawędzi, więc pasek
 * sekcji lądował POD przyciskami systemu i dolny rząd robił się nieklikalny.
 * Poprawnie mierzy to `react-native-safe-area-context` — ale to moduł natywny,
 * czyli koniec OTA (§10 planu). Do czasu paczki natywnej liczymy to z różnicy
 * między wysokością ekranu a wysokością okna aplikacji.
 *
 * To jest PRZYBLIŻENIE, nie pomiar. Przy nawigacji gestowej różnica bywa
 * zerowa, przy trzech przyciskach to około 48 dp. Dlatego wynik jest przycięty
 * z obu stron: bez dolnej granicy pasek dotykałby krawędzi ekranu, bez górnej
 * jeden dziwny odczyt zostawiłby wielką dziurę.
 */
function zapasNaBelke(wysokoscOkna: number): number {
  if (Platform.OS !== 'android') return ZAPAS_MIN;

  const ekran = Dimensions.get('screen').height;
  const gora = StatusBar.currentHeight ?? 0;
  const roznica = ekran - wysokoscOkna - gora;

  if (!Number.isFinite(roznica)) return ZAPAS_MIN;
  return Math.min(ZAPAS_MAKS, Math.max(ZAPAS_MIN, Math.round(roznica)));
}

export function PasekSekcji({
  aktywna,
  onZmien,
}: {
  aktywna: Sekcja;
  onZmien: (sekcja: Sekcja) => void;
}) {
  // `useWindowDimensions` przelicza się przy obrocie i przy zmianie trybu
  // nawigacji systemowej — inaczej zapas zostałby z pierwszego renderu.
  const { height } = useWindowDimensions();
  const dol = zapasNaBelke(height);

  return (
    <View style={[s.pasek, { paddingBottom: dol }]}>
      {SEKCJE.map((sekcja) => {
        const wybrana = sekcja.id === aktywna;
        return (
          <Pressable
            key={sekcja.id}
            style={s.przycisk}
            onPress={() => onZmien(sekcja.id)}
            accessibilityRole="button"
            accessibilityLabel={sekcja.podpis}
          >
            <Text style={[s.ikona, !wybrana && s.przygaszona]}>{sekcja.ikona}</Text>
            <Text style={[s.podpis, wybrana && s.podpisAktywny]} numberOfLines={1}>
              {sekcja.podpis}
            </Text>
            <View style={[s.kreska, wybrana && s.kreskaAktywna]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  pasek: {
    flexDirection: 'row',
    backgroundColor: C.karta,
    borderTopColor: C.obramowanie,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  przycisk: { flex: 1, alignItems: 'center', paddingVertical: 2, paddingHorizontal: 2 },
  // Cztery zakładki zamiast trzech — ikona i podpis odrobinę mniejsze,
  // żeby „Kalendarz" nie musiał się łamać ani skracać wielokropkiem.
  ikona: { fontSize: 20, lineHeight: 24 },
  przygaszona: { opacity: 0.45 },
  podpis: { color: C.tekstPrzygaszony, fontSize: 10, marginTop: 2 },
  podpisAktywny: { color: C.akcent, fontWeight: '700' },
  kreska: {
    height: 2,
    width: 20,
    borderRadius: 999,
    marginTop: 5,
    backgroundColor: 'transparent',
  },
  kreskaAktywna: { backgroundColor: C.akcent },
});
