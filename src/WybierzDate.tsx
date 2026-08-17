import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { przesunDate } from './format';
import { dniZakresu, dzienTygodnia, nazwaMiesiaca, zakresMiesiaca } from './okresy';
import { C } from './theme';
import { gestPrzewijania } from './Wykresy';

/**
 * Wybór daty z siatki miesiąca.
 *
 * Napisany od zera zamiast `@react-native-community/datetimepicker` z rozmysłem:
 * tamten jest modułem NATYWNYM, a każdy moduł natywny odcina aktualizacje przez
 * OTA i przywraca budowanie APK przy każdej zmianie. Siatka siedmiu kolumn to
 * kilkadziesiąt linii — nie ma powodu płacić za nią sześciominutowym buildem.
 *
 * Dni po `maks` są wygaszone i nieklikalne: wpis w przyszłość nie ma sensu.
 */

const DNI_SKROT = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'];

interface Props {
  widoczny: boolean;
  /** Zaznaczony dzień albo `null`. */
  wartosc: string | null;
  /** Najpóźniejszy wybieralny dzień — zwykle dzisiaj według serwera. */
  maks: string;
  /**
   * Miesiąc, na którym ma się otworzyć kalendarz, gdy nic nie jest zaznaczone.
   *
   * Bez tego modal otwierał się zawsze na dzisiaj — czyli po przewinięciu
   * listy ofert na marzec i dotknięciu „Wybierz dzień" trzeba było przewijać
   * kalendarz z powrotem do marca.
   */
  miesiac?: string | null;
  /** Dni, w których są oceniane oferty — do wyróżnienia kropką. */
  dniZOfertami?: ReadonlySet<string>;
  onWybierz: (data: string) => void;
  onZamknij: () => void;
}

export function WybierzDate({
  widoczny,
  wartosc,
  maks,
  miesiac,
  dniZOfertami,
  onWybierz,
  onZamknij,
}: Props) {
  const [kursor, setKursor] = useState(wartosc ?? miesiac ?? maks);

  /**
   * Kursor ustawiany PRZY KAŻDYM OTWARCIU, nie raz przy montowaniu.
   *
   * `Modal` z `visible={false}` zostaje w drzewie, więc `useState` odpalał się
   * dokładnie raz — kalendarz na zawsze pamiętał pierwszy miesiąc, jaki
   * zobaczył.
   */
  const [poprzednioWidoczny, setPoprzednioWidoczny] = useState(false);
  if (widoczny !== poprzednioWidoczny) {
    setPoprzednioWidoczny(widoczny);
    if (widoczny) setKursor(wartosc ?? miesiac ?? maks);
  }

  const wTyl = useRef<() => void>(() => {});
  const wPrzod = useRef<() => void>(() => {});
  const gest = useRef(
    gestPrzewijania(
      () => wPrzod.current(),
      () => wTyl.current()
    )
  ).current;

  const zakres = zakresMiesiaca(kursor);
  const daty = dniZakresu(zakres);
  const przesuniecie = dzienTygodnia(zakres.od) - 1;
  const komorki: Array<string | null> = [...Array<null>(przesuniecie).fill(null), ...daty];

  const wPrzodZablokowane = zakres.od >= zakresMiesiaca(maks).od;

  wTyl.current = () => setKursor(przesunDate(zakresMiesiaca(kursor).od, -1));
  wPrzod.current = () => {
    if (!wPrzodZablokowane) setKursor(przesunDate(zakresMiesiaca(kursor).od, 32));
  };

  return (
    <Modal visible={widoczny} animationType="fade" transparent onRequestClose={onZamknij}>
      <Pressable style={s.przyciemnienie} onPress={onZamknij}>
        {/* Pusty `onPress` zatrzymuje zamknięcie przy dotknięciu samej karty. */}
        <Pressable style={s.karta} onPress={() => {}} {...gest.panHandlers}>
          <View style={s.nawigacja}>
            <Pressable
              style={s.strzalka}
              onPress={() => setKursor(przesunDate(zakresMiesiaca(kursor).od, -1))}
            >
              <Text style={s.strzalkaTekst}>‹</Text>
            </Pressable>

            <Text style={s.tytul}>{nazwaMiesiaca(kursor)}</Text>

            <Pressable
              style={[s.strzalka, wPrzodZablokowane && s.nieaktywna]}
              disabled={wPrzodZablokowane}
              onPress={() => setKursor(przesunDate(zakresMiesiaca(kursor).od, 32))}
            >
              <Text style={s.strzalkaTekst}>›</Text>
            </Pressable>
          </View>

          <View style={s.siatka}>
            {DNI_SKROT.map((d) => (
              <Text key={d} style={s.naglowekKolumny}>
                {d}
              </Text>
            ))}

            {komorki.map((data, i) => {
              if (data === null) return <View key={`pusto-${i}`} style={s.komorka} />;

              const zablokowany = data > maks;
              const zaznaczony = data === wartosc;

              return (
                <Pressable
                  key={data}
                  style={s.komorka}
                  disabled={zablokowany}
                  onPress={() => onWybierz(data)}
                >
                  <View style={[s.kolko, zaznaczony && s.kolkoZaznaczone]}>
                    <Text
                      style={[
                        s.numer,
                        zablokowany && s.numerZablokowany,
                        zaznaczony && s.numerZaznaczony,
                      ]}
                    >
                      {Number(data.slice(8, 10))}
                    </Text>
                    {dniZOfertami?.has(data) ? <View style={s.kropkaOfert} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {dniZOfertami !== undefined ? (
            <View style={s.legenda}>
              <View style={s.kropkaLegenda} />
              <Text style={s.legendaTekst}>dzień z ocenionymi ofertami</Text>
            </View>
          ) : null}

          <Text style={s.podpowiedz}>Przesuń palcem w bok, żeby zmienić miesiąc.</Text>

          <View style={s.stopka}>
            <Pressable onPress={() => onWybierz(maks)}>
              <Text style={s.link}>Dzisiaj</Text>
            </Pressable>
            <Pressable onPress={onZamknij}>
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
  },

  nawigacja: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  strzalka: { paddingHorizontal: 12, paddingVertical: 2 },
  nieaktywna: { opacity: 0.25 },
  strzalkaTekst: { color: C.tekst, fontSize: 26, lineHeight: 30 },
  tytul: {
    flex: 1,
    color: C.tekst,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'capitalize',
  },

  siatka: { flexDirection: 'row', flexWrap: 'wrap' },
  naglowekKolumny: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    color: C.tekstPrzygaszony,
    fontSize: 10,
    marginBottom: 6,
  },
  komorka: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  kolko: {
    width: '86%',
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kolkoZaznaczone: { backgroundColor: C.akcent },
  numer: { color: C.tekst, fontSize: 14, fontWeight: '600' },
  numerZablokowany: { color: C.obramowanie },
  numerZaznaczony: { color: C.tlo, fontWeight: '700' },

  stopka: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.obramowanie,
  },
  link: { color: C.akcent, fontSize: 14, fontWeight: '600' },

  kropkaOfert: {
    position: 'absolute',
    bottom: 2,
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: C.ostrzezenie,
  },
  legenda: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  kropkaLegenda: { width: 5, height: 5, borderRadius: 999, backgroundColor: C.ostrzezenie },
  legendaTekst: { color: C.tekstPrzygaszony, fontSize: 11 },
  podpowiedz: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: 8 },
});
