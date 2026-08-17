import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { godzinyLubMinuty } from './format';
import { C } from './theme';
import {
  czyUstawiony,
  DNI_SKROT,
  ileDniRoboczych,
  MAKS_GODZIN_DZIENNIE,
  PROPOZYCJA,
  PUSTY_TYDZIEN,
  sumaTygodnia,
  type TydzienPracy as Tydzien,
} from './tydzienPracy';

/**
 * Edytor tygodnia pracy.
 *
 * Założenie: ustawienie tego ma zająć kilka dotknięć, bo inaczej nikt tego
 * nie ustawi. Stąd dwa poziomy:
 *
 * 1. **Zwykły** — dotykasz dni, w które jeździsz, i wybierasz JEDNĄ liczbę
 *    godzin dla wszystkich. Pięć dotknięć i gotowe.
 * 2. **Rozwinięty** — dopiero gdy sam poprosisz, każdy dzień dostaje własne
 *    godziny.
 *
 * Domyślnie pokazujemy poziom pierwszy nawet wtedy, gdy zapisane godziny są
 * różne — wtedy pole zbiorcze jest puste, a nie kłamie średnią.
 */

const PRESETY = [4, 6, 8, 10, 12];
const KROK = 0.5;

interface Props {
  widoczny: boolean;
  wartosc: Tydzien;
  onZapisz: (t: Tydzien) => void;
  onZamknij: () => void;
}

export function EdytorTygodniaPracy({ widoczny, wartosc, onZapisz, onZamknij }: Props) {
  const [robocza, setRobocza] = useState<number[]>([...wartosc]);
  const [rozwiniete, setRozwiniete] = useState(false);

  // `Modal` z `visible={false}` zostaje w drzewie, więc stan nie resetuje się
  // sam — bez tego edytor pamiętałby porzucone zmiany z poprzedniego otwarcia.
  const [poprzednioWidoczny, setPoprzednioWidoczny] = useState(false);
  if (widoczny !== poprzednioWidoczny) {
    setPoprzednioWidoczny(widoczny);
    if (widoczny) {
      setRobocza([...(czyUstawiony(wartosc) ? wartosc : PROPOZYCJA)]);
      setRozwiniete(false);
    }
  }

  const aktywne = robocza.filter((g) => g > 0);
  /** Wspólne godziny — tylko gdy wszystkie dni robocze mają tę samą wartość. */
  const wspolne =
    aktywne.length > 0 && aktywne.every((g) => g === aktywne[0]) ? (aktywne[0] ?? 0) : null;

  const przelacz = (i: number) => {
    setRobocza((p) => {
      const n = [...p];
      n[i] = (n[i] ?? 0) > 0 ? 0 : (wspolne ?? 8);
      return n;
    });
  };

  const ustawWszystkim = (g: number) => {
    setRobocza((p) => p.map((stare) => (stare > 0 ? g : 0)));
  };

  const zmienDzien = (i: number, delta: number) => {
    setRobocza((p) => {
      const n = [...p];
      const nowa = Math.round(((n[i] ?? 0) + delta) * 2) / 2;
      n[i] = Math.min(MAKS_GODZIN_DZIENNIE, Math.max(0, nowa));
      return n;
    });
  };

  const suma = sumaTygodnia(robocza);
  const dni = ileDniRoboczych(robocza);

  return (
    <Modal visible={widoczny} animationType="slide" transparent={false} onRequestClose={onZamknij}>
      <View style={s.tlo}>
        <ScrollView contentContainerStyle={s.zawartosc}>
          <Text style={s.tytul}>Tydzień pracy</Text>
          <Text style={s.podtytul}>
            W które dni zwykle jeździsz i po ile godzin. Służy WYŁĄCZNIE do rozłożenia celu na
            dni, w które faktycznie pracujesz — nie zmienia tego, ile zarobiłeś.
          </Text>

          <Text style={s.etykieta}>Dni robocze</Text>
          <View style={s.chipy}>
            {DNI_SKROT.map((d, i) => {
              const wlaczony = (robocza[i] ?? 0) > 0;
              return (
                <Pressable
                  key={d}
                  style={[s.chip, wlaczony && s.chipAktywny]}
                  onPress={() => przelacz(i)}
                >
                  <Text style={[s.chipTekst, wlaczony && s.chipTekstAktywny]}>{d}</Text>
                </Pressable>
              );
            })}
          </View>

          {dni === 0 ? (
            <Text style={s.ostrzezenie}>
              Bez ani jednego dnia roboczego nie ma jak rozłożyć celu. Zaznacz przynajmniej jeden.
            </Text>
          ) : null}

          {!rozwiniete ? (
            <>
              <Text style={s.etykieta}>Godzin w dniu roboczym</Text>
              <View style={s.chipy}>
                {PRESETY.map((g) => (
                  <Pressable
                    key={g}
                    style={[s.chip, wspolne === g && s.chipAktywny]}
                    onPress={() => ustawWszystkim(g)}
                  >
                    <Text style={[s.chipTekst, wspolne === g && s.chipTekstAktywny]}>{g} h</Text>
                  </Pressable>
                ))}
              </View>

              <View style={s.krokRzad}>
                <Pressable style={s.krokPrzycisk} onPress={() => ustawWszystkim(Math.max(KROK, (wspolne ?? 8) - KROK))}>
                  <Text style={s.krokTekst}>−</Text>
                </Pressable>
                <Text style={s.krokWartosc}>
                  {wspolne === null ? 'różne' : godzinyLubMinuty(wspolne)}
                </Text>
                <Pressable
                  style={s.krokPrzycisk}
                  onPress={() => ustawWszystkim(Math.min(MAKS_GODZIN_DZIENNIE, (wspolne ?? 8) + KROK))}
                >
                  <Text style={s.krokTekst}>+</Text>
                </Pressable>
              </View>

              <Pressable style={s.link} onPress={() => setRozwiniete(true)}>
                <Text style={s.linkTekst}>Różne godziny w różne dni ›</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={s.etykieta}>Godziny osobno dla każdego dnia</Text>
              {DNI_SKROT.map((d, i) =>
                (robocza[i] ?? 0) > 0 ? (
                  <View key={d} style={s.wierszDnia}>
                    <Text style={s.nazwaDnia}>{d}</Text>
                    <View style={s.krokRzad}>
                      <Pressable style={s.krokPrzycisk} onPress={() => zmienDzien(i, -KROK)}>
                        <Text style={s.krokTekst}>−</Text>
                      </Pressable>
                      <Text style={s.krokWartosc}>{godzinyLubMinuty(robocza[i] ?? 0)}</Text>
                      <Pressable style={s.krokPrzycisk} onPress={() => zmienDzien(i, KROK)}>
                        <Text style={s.krokTekst}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null
              )}
              <Pressable style={s.link} onPress={() => setRozwiniete(false)}>
                <Text style={s.linkTekst}>‹ Wspólne godziny dla wszystkich dni</Text>
              </Pressable>
            </>
          )}

          <View style={s.podsumowanie}>
            <Text style={s.podsumowanieTekst}>
              {dni === 0
                ? 'Brak dni roboczych'
                : `${dni} ${dni === 1 ? 'dzień' : 'dni'} w tygodniu · ${godzinyLubMinuty(suma)} razem`}
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [s.zapisz, pressed && s.wcisniety]}
            onPress={() => onZapisz(robocza)}
          >
            <Text style={s.zapiszTekst}>Zapisz</Text>
          </Pressable>

          <Pressable style={s.wtorny} onPress={onZamknij}>
            <Text style={s.wtornyTekst}>Anuluj</Text>
          </Pressable>

          <Pressable
            style={s.wyczysc}
            onPress={() => {
              onZapisz(PUSTY_TYDZIEN);
            }}
          >
            <Text style={s.wyczyscTekst}>Wyłącz tydzień pracy</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  tlo: { flex: 1, backgroundColor: C.tlo },
  zawartosc: { padding: 20, paddingTop: 56, paddingBottom: 40 },

  tytul: { color: C.tekst, fontSize: 24, fontWeight: '700' },
  podtytul: { color: C.tekstPrzygaszony, fontSize: 12, marginTop: 6, lineHeight: 17, marginBottom: 20 },

  etykieta: { color: C.tekstPrzygaszony, fontSize: 13, marginBottom: 8 },
  chipy: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip: {
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: 52,
    alignItems: 'center',
  },
  chipAktywny: { backgroundColor: C.akcent, borderColor: C.akcent },
  chipTekst: { color: C.tekstPrzygaszony, fontSize: 14, fontWeight: '600' },
  chipTekstAktywny: { color: C.tlo },

  krokRzad: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  krokPrzycisk: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  krokTekst: { color: C.tekst, fontSize: 22, fontWeight: '700' },
  krokWartosc: {
    color: C.tekst,
    fontSize: 17,
    fontWeight: '600',
    minWidth: 110,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  wierszDnia: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  nazwaDnia: { color: C.tekst, fontSize: 15, fontWeight: '600', width: 48 },

  ostrzezenie: { color: C.ostrzezenie, fontSize: 12, marginTop: -10, marginBottom: 16, lineHeight: 17 },

  link: { paddingVertical: 16 },
  linkTekst: { color: C.akcent, fontSize: 14, fontWeight: '600' },

  podsumowanie: {
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  podsumowanieTekst: { color: C.tekst, fontSize: 14, fontWeight: '600' },

  zapisz: {
    backgroundColor: C.akcent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 18,
  },
  wcisniety: { opacity: 0.75 },
  zapiszTekst: { color: C.tlo, fontSize: 17, fontWeight: '700' },

  wtorny: { alignItems: 'center', paddingVertical: 14 },
  wtornyTekst: { color: C.tekst, fontSize: 15 },

  wyczysc: { alignItems: 'center', paddingVertical: 14 },
  wyczyscTekst: { color: C.blad, fontSize: 13 },
});
