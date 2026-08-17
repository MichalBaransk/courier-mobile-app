import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { godzinyLubMinuty } from './format';
import { Suwak } from './Suwak';
import { C } from './theme';
import {
  czyUstawiony,
  DNI_SKROT,
  godzinyDnia,
  ileDniRoboczych,
  MAKS_GODZIN_DZIENNIE,
  naGodzine,
  opisDnia,
  PROPOZYCJA,
  PUSTY_TYDZIEN,
  sumaTygodnia,
  type DzienPracy,
  type TydzienPracy as Tydzien,
} from './tydzienPracy';

/**
 * Edytor tygodnia pracy.
 *
 * Godziny wybiera się SUWAKAMI, nie polami tekstowymi ani przyciskami ±.
 * Powód jest praktyczny: „od 10:00 do 18:00" to przedział, a przedział
 * najłatwiej ustawić przeciągając. Osobny suwak na godzinę (krok 1 h)
 * i osobny na minuty (krok 5 min) — grube ustawienie jednym ruchem,
 * dokładne drugim.
 *
 * Suwaki są własne (`Suwak.tsx`), bo `@react-native-community/slider` to
 * moduł natywny, czyli koniec OTA.
 *
 * Dwa poziomy, żeby zwykły przypadek zajmował kilka dotknięć:
 * 1. **Wspólny** — zaznaczasz dni i ustawiasz jeden przedział dla wszystkich.
 * 2. **Osobno** — dopiero na życzenie każdy dzień dostaje własne godziny.
 */

const DOMYSLNY: DzienPracy = { od: 600, do: 1080 };

interface Props {
  widoczny: boolean;
  wartosc: Tydzien;
  onZapisz: (t: Tydzien) => void;
  onZamknij: () => void;
}

/** Cztery suwaki opisujące jeden przedział pracy. */
function EdytorPrzedzialu({
  przedzial,
  onZmien,
}: {
  przedzial: DzienPracy;
  onZmien: (p: DzienPracy) => void;
}) {
  const godzin = godzinyDnia(przedzial);
  const zaDlugo = godzin > MAKS_GODZIN_DZIENNIE;

  return (
    <View>
      <Suwak
        etykieta="Początek — godzina"
        min={0}
        maks={23}
        krok={1}
        wartosc={Math.floor(przedzial.od / 60)}
        formatuj={(v) => `${String(v).padStart(2, '0')}:00`}
        onZmien={(v) => onZmien({ ...przedzial, od: v * 60 + (przedzial.od % 60) })}
      />
      <Suwak
        etykieta="Początek — minuty"
        min={0}
        maks={55}
        krok={5}
        wartosc={przedzial.od % 60}
        formatuj={(v) => `${String(v).padStart(2, '0')} min`}
        onZmien={(v) => onZmien({ ...przedzial, od: Math.floor(przedzial.od / 60) * 60 + v })}
      />

      <View style={s.kreska} />

      <Suwak
        etykieta="Koniec — godzina"
        min={0}
        maks={23}
        krok={1}
        wartosc={Math.floor(przedzial.do / 60)}
        formatuj={(v) => `${String(v).padStart(2, '0')}:00`}
        onZmien={(v) => onZmien({ ...przedzial, do: v * 60 + (przedzial.do % 60) })}
      />
      <Suwak
        etykieta="Koniec — minuty"
        min={0}
        maks={55}
        krok={5}
        wartosc={przedzial.do % 60}
        formatuj={(v) => `${String(v).padStart(2, '0')} min`}
        onZmien={(v) => onZmien({ ...przedzial, do: Math.floor(przedzial.do / 60) * 60 + v })}
      />

      <View style={[s.przedzial, zaDlugo && s.przedzialZly]}>
        <Text style={[s.przedzialTekst, zaDlugo && s.przedzialTekstZly]}>
          {naGodzine(przedzial.od)} – {naGodzine(przedzial.do)} · {godzinyLubMinuty(godzin)}
        </Text>
        {przedzial.do <= przedzial.od && godzin > 0 ? (
          <Text style={s.przezPolnoc}>przez północ</Text>
        ) : null}
      </View>

      {zaDlugo ? (
        <Text style={s.ostrzezenie}>
          {godzinyLubMinuty(godzin)} to dłużej niż {MAKS_GODZIN_DZIENNIE} h — serwer odrzuciłby
          taką zmianę (§8d). Sprawdź, czy początek i koniec nie są zamienione.
        </Text>
      ) : null}
    </View>
  );
}

export function EdytorTygodniaPracy({ widoczny, wartosc, onZapisz, onZamknij }: Props) {
  const [robocza, setRobocza] = useState<Array<DzienPracy | null>>([...wartosc]);
  const [osobno, setOsobno] = useState(false);
  /** Który dzień jest rozwinięty w trybie „osobno". */
  const [edytowany, setEdytowany] = useState<number | null>(null);

  // `Modal` z `visible={false}` zostaje w drzewie, więc stan nie resetuje się
  // sam — bez tego edytor pamiętałby porzucone zmiany z poprzedniego otwarcia.
  const [poprzednioWidoczny, setPoprzednioWidoczny] = useState(false);
  if (widoczny !== poprzednioWidoczny) {
    setPoprzednioWidoczny(widoczny);
    if (widoczny) {
      setRobocza([...(czyUstawiony(wartosc) ? wartosc : PROPOZYCJA)]);
      setOsobno(false);
      setEdytowany(null);
    }
  }

  const aktywne = robocza.filter((d): d is DzienPracy => godzinyDnia(d) > 0);
  /** Wspólny przedział — tylko gdy wszystkie dni robocze mają ten sam. */
  const wspolny =
    aktywne.length > 0 && aktywne.every((d) => d.od === aktywne[0]?.od && d.do === aktywne[0]?.do)
      ? (aktywne[0] ?? DOMYSLNY)
      : null;

  const przelacz = (i: number) => {
    setRobocza((p) => {
      const n = [...p];
      n[i] = godzinyDnia(n[i] ?? null) > 0 ? null : (wspolny ?? DOMYSLNY);
      return n;
    });
  };

  const ustawWszystkim = (przedzial: DzienPracy) => {
    setRobocza((p) => p.map((d) => (godzinyDnia(d) > 0 ? przedzial : null)));
  };

  const ustawDzien = (i: number, przedzial: DzienPracy) => {
    setRobocza((p) => {
      const n = [...p];
      n[i] = przedzial;
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
            W które dni i w jakich godzinach zwykle jeździsz. Służy WYŁĄCZNIE do rozłożenia celu
            na dni, w które faktycznie pracujesz — nie zmienia tego, ile zarobiłeś.
          </Text>

          <Text style={s.etykieta}>Dni robocze</Text>
          <View style={s.chipy}>
            {DNI_SKROT.map((d, i) => {
              const wlaczony = godzinyDnia(robocza[i] ?? null) > 0;
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

          {!osobno ? (
            <>
              <Text style={s.etykieta}>Godziny pracy — wspólne dla zaznaczonych dni</Text>
              {wspolny === null && aktywne.length > 0 ? (
                <Text style={s.uwaga}>
                  Dni mają teraz różne godziny. Ruszenie suwaka ustawi wszystkim tę samą wartość.
                </Text>
              ) : null}
              <EdytorPrzedzialu przedzial={wspolny ?? DOMYSLNY} onZmien={ustawWszystkim} />

              <Pressable style={s.link} onPress={() => setOsobno(true)}>
                <Text style={s.linkTekst}>Różne godziny w różne dni ›</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={s.etykieta}>Godziny osobno dla każdego dnia</Text>
              {DNI_SKROT.map((nazwa, i) => {
                const d = robocza[i] ?? null;
                if (godzinyDnia(d) <= 0 || d === null) return null;
                const otwarty = edytowany === i;

                return (
                  <View key={nazwa} style={s.blokDnia}>
                    <Pressable
                      style={s.naglowekDnia}
                      onPress={() => setEdytowany(otwarty ? null : i)}
                    >
                      <Text style={s.nazwaDnia}>{nazwa}</Text>
                      <Text style={s.godzinyDnia}>{opisDnia(d)}</Text>
                      <Text style={s.strzalkaDnia}>{otwarty ? '▾' : '▸'}</Text>
                    </Pressable>

                    {otwarty ? (
                      <EdytorPrzedzialu
                        przedzial={d}
                        onZmien={(p) => ustawDzien(i, p)}
                      />
                    ) : null}
                  </View>
                );
              })}

              <Pressable style={s.link} onPress={() => setOsobno(false)}>
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

          <Pressable style={s.wyczysc} onPress={() => onZapisz(PUSTY_TYDZIEN)}>
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
  podtytul: {
    color: C.tekstPrzygaszony,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 17,
    marginBottom: 20,
  },

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

  kreska: { height: 1, backgroundColor: C.obramowanie, marginVertical: 10 },

  przedzial: {
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    alignItems: 'center',
  },
  przedzialZly: { borderColor: C.blad },
  przedzialTekst: {
    color: C.akcent,
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  przedzialTekstZly: { color: C.blad },
  przezPolnoc: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: 3 },

  blokDnia: {
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 10,
  },
  naglowekDnia: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  nazwaDnia: { color: C.tekst, fontSize: 15, fontWeight: '700', width: 40 },
  godzinyDnia: {
    flex: 1,
    color: C.tekstPrzygaszony,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  strzalkaDnia: { color: C.tekstPrzygaszony, fontSize: 13 },

  ostrzezenie: { color: C.ostrzezenie, fontSize: 12, marginTop: 10, lineHeight: 17 },
  uwaga: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: -4, marginBottom: 8, lineHeight: 16 },

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
