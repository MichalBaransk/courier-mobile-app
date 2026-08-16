import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ileZablokowanych, MAKS_PROB, type WpisKolejki } from './kolejka';
import { C } from './theme';

/**
 * Pasek „coś czeka na wysłanie".
 *
 * ⚠️ Wpisy z kolejki NIE są doliczane do kart dnia. To celowe i wbrew
 * pierwszemu odruchowi.
 *
 * Karta dnia pokazuje stan BAZY. Domieszanie do „Razem netto" wartości, która
 * jeszcze nie wyszła z telefonu, dałoby liczbę nieistniejącą po żadnej stronie
 * — i różniącą się od tego, co pokazuje bot. To dokładnie ten rodzaj
 * wiarygodnie wyglądającej bzdury, przed którym ostrzega §8f.
 *
 * Dlatego niewysłane wpisy mają własne, wyraźnie oddzielone miejsce.
 */
export function KolejkaPasek({
  kolejka,
  wysylam,
  onWyslij,
  onUsun,
}: {
  kolejka: WpisKolejki[];
  wysylam: boolean;
  onWyslij: () => void;
  onUsun: (id: string) => void;
}) {
  const [rozwiniety, setRozwiniety] = useState(false);

  if (kolejka.length === 0) return null;

  const zablokowane = ileZablokowanych(kolejka);
  const odrzucone = kolejka.filter((w) => typeof w.blad === 'string' && w.blad.length > 0);

  return (
    <View style={[s.pasek, zablokowane > 0 && s.paskaUwaga]}>
      <Pressable style={s.gora} onPress={() => setRozwiniety((r) => !r)}>
        <View style={s.gornyTekst}>
          <Text style={s.tytul}>
            {kolejka.length === 1 ? '1 wpis czeka na wysłanie' : `${kolejka.length} wpisy czekają na wysłanie`}
          </Text>
          <Text style={s.podtytul}>
            {odrzucone.length > 0
              ? `${odrzucone.length} odrzucone przez serwer — dotknij, żeby zobaczyć`
              : zablokowane > 0
                ? `${zablokowane} po ${MAKS_PROB} nieudanych próbach`
                : 'Nie są doliczone do kart dnia — pokazują je dopiero po wysłaniu.'}
          </Text>
        </View>
        <Text style={s.strzalka}>{rozwiniety ? '▾' : '▸'}</Text>
      </Pressable>

      {rozwiniety ? (
        <View style={s.lista}>
          {kolejka.map((w) => (
            <View key={w.id} style={s.pozycja}>
              <View style={s.pozycjaSrodek}>
                <Text style={s.pozycjaOpis} numberOfLines={1}>
                  {w.opis}
                </Text>
                {typeof w.blad === 'string' && w.blad.length > 0 ? (
                  <Text style={s.pozycjaBlad}>{w.blad}</Text>
                ) : w.prob > 0 ? (
                  <Text style={s.pozycjaProby}>
                    {w.prob === 1 ? '1 nieudana próba' : `${w.prob} nieudane próby`}
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={() => onUsun(w.id)} hitSlop={8}>
                <Text style={s.usun}>Usuń</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable
        style={({ pressed }) => [s.przycisk, pressed && s.wcisniety, wysylam && s.nieaktywny]}
        onPress={onWyslij}
        disabled={wysylam}
      >
        {wysylam ? (
          <ActivityIndicator size="small" color={C.tlo} />
        ) : (
          <Text style={s.przyciskTekst}>Wyślij teraz</Text>
        )}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  pasek: {
    backgroundColor: '#2a2416',
    borderColor: C.ostrzezenie,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  paskaUwaga: { borderColor: C.blad },

  gora: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gornyTekst: { flex: 1 },
  tytul: { color: C.ostrzezenie, fontSize: 14, fontWeight: '700' },
  podtytul: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: 3, lineHeight: 15 },
  strzalka: { color: C.tekstPrzygaszony, fontSize: 14, paddingHorizontal: 4 },

  lista: {
    marginTop: 10,
    borderTopColor: C.obramowanie,
    borderTopWidth: 1,
    paddingTop: 6,
  },
  pozycja: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  pozycjaSrodek: { flex: 1 },
  pozycjaOpis: { color: C.tekst, fontSize: 13 },
  pozycjaProby: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: 2 },
  pozycjaBlad: { color: C.blad, fontSize: 11, marginTop: 2, lineHeight: 15 },
  usun: { color: C.blad, fontSize: 12, fontWeight: '600' },

  przycisk: {
    backgroundColor: C.ostrzezenie,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 10,
  },
  wcisniety: { opacity: 0.75 },
  nieaktywny: { opacity: 0.6 },
  przyciskTekst: { color: C.tlo, fontSize: 14, fontWeight: '700' },
});
