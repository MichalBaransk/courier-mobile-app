import { Pressable, StyleSheet, Text, View } from 'react-native';

import { C } from './theme';

/**
 * Pasek sekcji na dole ekranu.
 *
 * Napisany od zera, nie przez `@react-navigation/*`: tamto ciągnie
 * `react-native-screens` i `react-native-safe-area-context`, czyli DWA moduły
 * natywne. Za trzy przyciski przełączające stan to cena nie do przyjęcia —
 * koniec aktualizacji OTA i build APK przy każdej zmianie koloru.
 *
 * Ikona i podpis to DWA osobne węzły `Text`. Emoji razem z tekstem w jednym
 * `Text` już raz w tym projekcie wyświetliło się na telefonie jako sama ikona
 * z pustym polem obok (chipy „napiwek" i „dystans"). Nie odtworzyłem tego u
 * siebie, więc zamiast zgadywać przyczynę — nie łączę ich. Podpis jest zawsze,
 * także gdyby ikona nie miała się czym narysować.
 */

export type Sekcja = 'kalendarz' | 'oferty' | 'cele';

const SEKCJE: Array<{ id: Sekcja; ikona: string; podpis: string }> = [
  { id: 'kalendarz', ikona: '📅', podpis: 'Kalendarz' },
  { id: 'oferty', ikona: '🛵', podpis: 'Oferty' },
  { id: 'cele', ikona: '🎯', podpis: 'Cele' },
];

export function PasekSekcji({
  aktywna,
  onZmien,
}: {
  aktywna: Sekcja;
  onZmien: (sekcja: Sekcja) => void;
}) {
  return (
    <View style={s.pasek}>
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
            <Text style={[s.podpis, wybrana && s.podpisAktywny]}>{sekcja.podpis}</Text>
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
    // Zapas na gest cofania Androida i pasek nawigacji systemu.
    paddingBottom: 22,
  },
  przycisk: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  ikona: { fontSize: 22, lineHeight: 26 },
  przygaszona: { opacity: 0.45 },
  podpis: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: 2 },
  podpisAktywny: { color: C.akcent, fontWeight: '700' },
  kreska: {
    height: 2,
    width: 22,
    borderRadius: 999,
    marginTop: 5,
    backgroundColor: 'transparent',
  },
  kreskaAktywna: { backgroundColor: C.akcent },
});
