import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C } from './theme';

/**
 * Pasek sekcji na dole ekranu.
 *
 * Napisany od zera, nie przez `@react-navigation/*`: tamto ciągnie
 * `react-native-screens`, czyli kolejny moduł natywny i całą warstwę
 * nawigacji, której tu nie ma po co mieć. Cztery przyciski przełączające
 * stan to cztery przyciski przełączające stan.
 *
 * Ikona i podpis to DWA osobne węzły `Text`. Emoji razem z tekstem w jednym
 * `Text` raz wyświetliło się na telefonie jako sama ikona z pustym polem
 * obok. Przyczyny nie ustaliłem — więc ich nie łączę.
 */

export type Sekcja = 'kalendarz' | 'oferty' | 'cele' | 'portfel';

const SEKCJE: Array<{ id: Sekcja; ikona: string; podpis: string }> = [
  { id: 'kalendarz', ikona: '📅', podpis: 'Kalendarz' },
  { id: 'oferty', ikona: '🛵', podpis: 'Oferty' },
  { id: 'cele', ikona: '🎯', podpis: 'Cele' },
  { id: 'portfel', ikona: '💰', podpis: 'Portfel' },
];

export function PasekSekcji({
  aktywna,
  onZmien,
}: {
  aktywna: Sekcja;
  onZmien: (sekcja: Sekcja) => void;
}) {
  /**
   * PRAWDZIWY margines bezpieczny, nie przybliżenie.
   *
   * Wcześniej liczyłem go z różnicy między wysokością ekranu a wysokością
   * okna i przycinałem do 12–48 dp. Działało „mniej więcej", czyli w praktyce
   * pasek nadal wchodził pod przyciski systemu — widać to było na zrzucie.
   *
   * `useSafeAreaInsets` czyta insety z systemu i sam przelicza je przy zmianie
   * trybu nawigacji (gesty kontra trzy przyciski) oraz przy obrocie. Dolna
   * podłoga 8 dp jest po to, żeby przy nawigacji gestowej (inset bliski zeru)
   * podpisy nie dotykały krawędzi ekranu.
   */
  const insets = useSafeAreaInsets();
  const dol = Math.max(8, insets.bottom);

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
