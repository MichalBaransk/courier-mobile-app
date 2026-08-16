import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { C } from './theme';

/**
 * Wybór godziny w dwóch krokach: najpierw godzina, potem minuty.
 *
 * Znowu bez modułu natywnego (`@react-native-community/datetimepicker`), z tego
 * samego powodu co kalendarz i wykresy: moduł natywny odcina aktualizacje OTA.
 * Dwie siatki przycisków to kilkadziesiąt linii.
 *
 * Minuty co 5 — kurier nie wpisuje zjazdu o 21:17, a 12 przycisków mieści się
 * bez przewijania. Dokładniejszą wartość zawsze można wpisać z klawiatury.
 */

const GODZINY = Array.from({ length: 24 }, (_, i) => i);
const MINUTY = Array.from({ length: 12 }, (_, i) => i * 5);

interface Props {
  widoczny: boolean;
  tytul: string;
  /** Wartość początkowa `GG:MM` albo pusty tekst. */
  wartosc: string;
  onWybierz: (godzina: string) => void;
  onZamknij: () => void;
}

export function WybierzGodzine({ widoczny, tytul, wartosc, onWybierz, onZamknij }: Props) {
  const startowa = /^(\d{2}):(\d{2})$/.exec(wartosc);
  const [godzina, setGodzina] = useState<number | null>(
    startowa?.[1] !== undefined ? Number(startowa[1]) : null
  );

  const wybierzMinuty = (m: number) => {
    if (godzina === null) return;
    onWybierz(`${String(godzina).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    setGodzina(null);
  };

  return (
    <Modal visible={widoczny} animationType="fade" transparent onRequestClose={onZamknij}>
      <Pressable style={s.przyciemnienie} onPress={onZamknij}>
        <Pressable style={s.karta} onPress={() => {}}>
          <Text style={s.tytul}>{tytul}</Text>
          <Text style={s.krok}>
            {godzina === null
              ? 'Wybierz godzinę'
              : `${String(godzina).padStart(2, '0')}:__  ·  wybierz minuty`}
          </Text>

          <ScrollView style={s.przewijanie}>
            <View style={s.siatka}>
              {godzina === null
                ? GODZINY.map((g) => (
                    <Pressable key={g} style={s.pole} onPress={() => setGodzina(g)}>
                      <Text style={s.poleTekst}>{String(g).padStart(2, '0')}</Text>
                    </Pressable>
                  ))
                : MINUTY.map((m) => (
                    <Pressable key={m} style={s.pole} onPress={() => wybierzMinuty(m)}>
                      <Text style={s.poleTekst}>{String(m).padStart(2, '0')}</Text>
                    </Pressable>
                  ))}
            </View>
          </ScrollView>

          <View style={s.stopka}>
            {godzina === null ? (
              <View />
            ) : (
              <Pressable onPress={() => setGodzina(null)}>
                <Text style={s.link}>‹ Godzina</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                setGodzina(null);
                onZamknij();
              }}
            >
              <Text style={s.link}>Zamknij</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  przyciemnienie: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 20,
  },
  karta: {
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    maxHeight: '80%',
  },
  tytul: { color: C.tekst, fontSize: 18, fontWeight: '700' },
  krok: { color: C.tekstPrzygaszony, fontSize: 13, marginTop: 4, marginBottom: 14 },

  przewijanie: { flexGrow: 0 },
  siatka: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pole: {
    width: '22%',
    aspectRatio: 1.6,
    backgroundColor: C.tlo,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poleTekst: { color: C.tekst, fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },

  stopka: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.obramowanie,
  },
  link: { color: C.akcent, fontSize: 14, fontWeight: '600' },
});
