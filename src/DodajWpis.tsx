import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  ApiError,
  postBrutto,
  postDystans,
  postNapiwek,
  postPaliwo,
  postZmiana,
  type ZapisOdpowiedz,
} from './api';
import { krotkaData, poprawnaData, przesunDate } from './format';
import { C } from './theme';

/**
 * Formularz dodawania wpisu.
 *
 * Jeden ekran, pięć rodzajów wpisu — bo po stronie API jest pięć niezależnych
 * endpointów (jeden element = jeden zapis). Dzięki temu nieudany zapis paliwa
 * nie unieważnia zapisanych przed chwilą kilometrów.
 *
 * Walidacja jest tu MINIMALNA — sprawdzamy tylko, czy da się odczytać liczbę.
 * Resztą zajmuje się serwer i to jego komunikaty pokazujemy użytkownikowi:
 * są po polsku i wskazują konkretne pole. Duplikowanie tych reguł w aplikacji
 * skończyłoby się dwoma zestawami zasad, które się rozjeżdżają.
 */

type Rodzaj = 'napiwek' | 'paliwo' | 'dystans' | 'brutto' | 'zmiana';

const RODZAJE: Array<{ id: Rodzaj; etykieta: string }> = [
  { id: 'napiwek', etykieta: '💵 Napiwek' },
  { id: 'dystans', etykieta: '🚗 Dystans' },
  { id: 'brutto', etykieta: '💰 Brutto' },
  { id: 'paliwo', etykieta: '⛽ Paliwo' },
  { id: 'zmiana', etykieta: '⏱️ Zmiana' },
];

/** `12,50` i `12.50` znaczą to samo. Polska klawiatura daje przecinek. */
function liczba(tekst: string): number | null {
  const t = tekst.trim().replace(',', '.');
  if (t.length === 0) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

interface Props {
  widoczny: boolean;
  token: string;
  /**
   * Dzisiejsza data WEDŁUG SERWERA (`dane.date` z ostatniej odpowiedzi).
   * Punkt odniesienia dla „wczoraj" i „przedwczoraj". `null`, gdy karta dnia
   * jeszcze się nie wczytała — wtedy zostaje tylko zapis na dzisiaj.
   */
  dzisiaj: string | null;
  onZamknij: () => void;
  onZapisano: (wynik: ZapisOdpowiedz) => void;
}

export function DodajWpis({ widoczny, token, dzisiaj, onZamknij, onZapisano }: Props) {
  const [rodzaj, setRodzaj] = useState<Rodzaj>('napiwek');
  const [kwota, setKwota] = useState('');
  const [litry, setLitry] = useState('');
  const [cena, setCena] = useState('');
  const [od, setOd] = useState('');
  const [doGodz, setDoGodz] = useState('');
  const [zapisuje, setZapisuje] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);

  /** `null` = dzisiaj, czyli data wyznaczona po stronie serwera. */
  const [wybranaData, setWybranaData] = useState<string | null>(null);
  const [trybInnej, setTrybInnej] = useState(false);
  const [innaData, setInnaData] = useState('');

  const wyczysc = () => {
    setKwota('');
    setLitry('');
    setCena('');
    setOd('');
    setDoGodz('');
    setBlad(null);
  };

  /** Zamknięcie modalu resetuje też wybór dnia — inaczej „wczoraj" zostałoby na potem. */
  const wyczyscWszystko = () => {
    wyczysc();
    setWybranaData(null);
    setTrybInnej(false);
    setInnaData('');
  };

  const zamknij = () => {
    if (zapisuje) return;
    wyczyscWszystko();
    onZamknij();
  };

  /**
   * Rozgałęzienie na `zmiana` vs reszta jest tu celowe: dzięki niemu sprawdzenie
   * `wartosc === null` zawęża typ i nie trzeba nigdzie rzutować przez `as`.
   */
  const zbudujZadanie = (): (() => Promise<ZapisOdpowiedz>) | string => {
    // Data ustalana raz, wspólna dla wszystkich rodzajów wpisu.
    let data: string | null = wybranaData;
    if (trybInnej) {
      const wpisana = innaData.trim();
      if (!poprawnaData(wpisana)) return 'Data musi być w formacie RRRR-MM-DD i istnieć w kalendarzu.';
      data = wpisana;
    }

    if (rodzaj === 'zmiana') {
      const doWyslania = od.trim();
      const doZjazdu = doGodz.trim();
      if (doWyslania === '' && doZjazdu === '') return 'Podaj przynajmniej jedną godzinę.';
      return () =>
        postZmiana(
          token,
          doWyslania === '' ? null : doWyslania,
          doZjazdu === '' ? null : doZjazdu,
          data
        );
    }

    const wartosc = liczba(kwota);
    if (wartosc === null) return 'Wpisz liczbę.';

    switch (rodzaj) {
      case 'napiwek':
        return () => postNapiwek(token, wartosc, data);
      case 'dystans':
        return () => postDystans(token, wartosc, data);
      case 'brutto':
        return () => postBrutto(token, wartosc, data);
      case 'paliwo':
        return () => postPaliwo(token, wartosc, liczba(litry), liczba(cena), data);
    }

    // Nieosiągalne przy obecnym zestawie rodzajów — switch wyżej pokrywa
    // wszystkie. Zwykły `return` zamiast kontroli wyczerpania przez `never`,
    // bo tej drugiej nie miałem jak skompilować u siebie.
    return 'Nieobsługiwany rodzaj wpisu.';
  };

  const zapisz = async () => {
    setBlad(null);

    const zadanie = zbudujZadanie();
    if (typeof zadanie === 'string') {
      setBlad(zadanie);
      return;
    }

    setZapisuje(true);
    try {
      const wynik = await zadanie();
      wyczysc();
      onZapisano(wynik);
    } catch (err) {
      setBlad(err instanceof ApiError ? err.message : 'Nie udało się zapisać.');
    } finally {
      setZapisuje(false);
    }
  };

  /**
   * Trzy dni wstecz jako skróty. Liczone od daty SERWERA, nie od zegara
   * telefonu — patrz komentarz przy `przesunDate`.
   */
  const dniWstecz =
    dzisiaj === null
      ? []
      : [1, 2, 3].map((n) => {
          const iso = przesunDate(dzisiaj, -n);
          return { iso, etykieta: n === 1 ? 'Wczoraj' : krotkaData(iso) };
        });

  const pole = (
    etykieta: string,
    wartosc: string,
    ustaw: (v: string) => void,
    placeholder: string,
    numeryczne = true
  ) => (
    <View style={s.poleBlok}>
      <Text style={s.etykieta}>{etykieta}</Text>
      <TextInput
        style={s.pole}
        value={wartosc}
        onChangeText={ustaw}
        placeholder={placeholder}
        placeholderTextColor={C.tekstPrzygaszony}
        keyboardType={numeryczne ? 'decimal-pad' : 'default'}
        editable={!zapisuje}
        autoCorrect={false}
      />
    </View>
  );

  return (
    <Modal visible={widoczny} animationType="slide" transparent={false} onRequestClose={zamknij}>
      <KeyboardAvoidingView
        style={s.tlo}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.zawartosc} keyboardShouldPersistTaps="handled">
          <Text style={s.tytul}>Dodaj wpis</Text>

          <View style={s.chipy}>
            {RODZAJE.map((r) => (
              <Pressable
                key={r.id}
                style={[s.chip, rodzaj === r.id && s.chipAktywny]}
                onPress={() => {
                  if (zapisuje) return;
                  setRodzaj(r.id);
                  setBlad(null);
                }}
              >
                <Text style={[s.chipTekst, rodzaj === r.id && s.chipTekstAktywny]}>
                  {r.etykieta}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.etykieta}>Dzień wpisu</Text>
          <View style={s.chipy}>
            <Pressable
              style={[s.chipData, wybranaData === null && !trybInnej && s.chipAktywny]}
              onPress={() => {
                if (zapisuje) return;
                setWybranaData(null);
                setTrybInnej(false);
                setBlad(null);
              }}
            >
              <Text
                style={[s.chipTekst, wybranaData === null && !trybInnej && s.chipTekstAktywny]}
              >
                Dzisiaj
              </Text>
            </Pressable>

            {dniWstecz.map((d) => (
              <Pressable
                key={d.iso}
                style={[s.chipData, wybranaData === d.iso && !trybInnej && s.chipAktywny]}
                onPress={() => {
                  if (zapisuje) return;
                  setWybranaData(d.iso);
                  setTrybInnej(false);
                  setBlad(null);
                }}
              >
                <Text
                  style={[s.chipTekst, wybranaData === d.iso && !trybInnej && s.chipTekstAktywny]}
                >
                  {d.etykieta}
                </Text>
              </Pressable>
            ))}

            <Pressable
              style={[s.chipData, trybInnej && s.chipAktywny]}
              onPress={() => {
                if (zapisuje) return;
                setTrybInnej(true);
                setBlad(null);
              }}
            >
              <Text style={[s.chipTekst, trybInnej && s.chipTekstAktywny]}>Inna…</Text>
            </Pressable>
          </View>

          {trybInnej
            ? pole('Data wpisu', innaData, setInnaData, dzisiaj ?? '2026-08-16', false)
            : null}

          {rodzaj === 'napiwek' ? pole('Kwota napiwku', kwota, setKwota, '5,50') : null}
          {rodzaj === 'dystans' ? pole('Przejechane dzisiaj', kwota, setKwota, '142,3') : null}
          {rodzaj === 'brutto' ? pole('Zarobek brutto', kwota, setKwota, '438,60') : null}

          {rodzaj === 'paliwo' ? (
            <>
              {pole('Kwota z paragonu', kwota, setKwota, '312,40')}
              {pole('Litry (opcjonalnie)', litry, setLitry, '48,2')}
              {pole('Cena za litr (opcjonalnie)', cena, setCena, '6,48')}
            </>
          ) : null}

          {rodzaj === 'zmiana' ? (
            <>
              {pole('Wyjazd', od, setOd, '11:30', false)}
              {pole('Zjazd', doGodz, setDoGodz, '21:15', false)}
              <Text style={s.przypis}>
                Wystarczy jedna godzina. Czas pracy policzy się, gdy będą obie.
              </Text>
            </>
          ) : null}

          {rodzaj === 'dystans' ? (
            <Text style={s.przypis}>
              Dystans przejechany danego dnia, nie stan licznika.
            </Text>
          ) : null}

          {blad ? <Text style={s.blad}>{blad}</Text> : null}

          <Pressable
            style={({ pressed }) => [s.zapisz, pressed && s.wcisniety, zapisuje && s.nieaktywny]}
            onPress={zapisz}
            disabled={zapisuje}
          >
            {zapisuje ? (
              <ActivityIndicator color={C.tlo} />
            ) : (
              <Text style={s.zapiszTekst}>Zapisz</Text>
            )}
          </Pressable>

          <Pressable style={s.anuluj} onPress={zamknij} disabled={zapisuje}>
            <Text style={s.anulujTekst}>Anuluj</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  tlo: { flex: 1, backgroundColor: C.tlo },
  zawartosc: { padding: 20, paddingTop: 56, paddingBottom: 40 },

  tytul: { color: C.tekst, fontSize: 24, fontWeight: '700', marginBottom: 20 },

  chipy: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  chip: {
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipData: {
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipAktywny: { backgroundColor: C.akcent, borderColor: C.akcent },
  chipTekst: { color: C.tekstPrzygaszony, fontSize: 14, fontWeight: '600' },
  chipTekstAktywny: { color: C.tlo },

  poleBlok: { marginBottom: 16 },
  etykieta: { color: C.tekstPrzygaszony, fontSize: 13, marginBottom: 6 },
  pole: {
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: C.tekst,
    fontSize: 18,
  },

  przypis: { color: C.tekstPrzygaszony, fontSize: 12, marginTop: -6, marginBottom: 8 },
  blad: { color: C.blad, fontSize: 14, marginTop: 4, marginBottom: 8 },

  zapisz: {
    backgroundColor: C.akcent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  wcisniety: { opacity: 0.75 },
  nieaktywny: { opacity: 0.5 },
  zapiszTekst: { color: C.tlo, fontSize: 17, fontWeight: '700' },

  anuluj: { alignItems: 'center', paddingVertical: 18 },
  anulujTekst: { color: C.tekstPrzygaszony, fontSize: 14 },
});
