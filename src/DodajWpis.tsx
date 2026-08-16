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
  postUsun,
  postDystans,
  postNapiwek,
  postPaliwo,
  postZmiana,
  type ZapisOdpowiedz,
} from './api';
import { DATA_TESTOWA } from './config';
import { krotkaData, normalizujGodzine, przesunDate } from './format';
import { WybierzDate } from './WybierzDate';
import { WybierzGodzine } from './WybierzGodzine';
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

/**
 * Etykiety bez emoji.
 *
 * Na telefonie użytkownika trzy chipy — napiwek, dystans i test — pokazywały
 * samą ikonę bez tekstu. Nie odtworzyłem tego u siebie, ale emoji w jednym
 * `Text` razem z podpisem to jedyna rzecz, którą te trzy miały wspólną.
 * Czysty tekst nie ma jak się zepsuć i czyta się lepiej.
 */
const RODZAJE: Array<{ id: Rodzaj; etykieta: string }> = [
  { id: 'napiwek', etykieta: 'Napiwek' },
  { id: 'dystans', etykieta: 'Dystans' },
  { id: 'brutto', etykieta: 'Brutto' },
  { id: 'paliwo', etykieta: 'Paliwo' },
  { id: 'zmiana', etykieta: 'Zmiana' },
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

  /**
   * Wpisy zapisane w TEJ sesji formularza. Modal nie zamyka się po zapisie —
   * kurier wprowadza kilka rzeczy naraz i zamykanie okna po każdej z nich
   * (a do tego przeskok do zakładki dnia) było najbardziej uciążliwą rzeczą
   * w poprzedniej wersji.
   */
  const [wSesji, setWSesji] = useState<Array<{ rodzaj: Rodzaj; opis: string }>>([]);
  /** Kasowanie dnia wymaga drugiego dotknięcia — bez cofania. */
  const [potwierdzKasowanie, setPotwierdzKasowanie] = useState(false);
  /** Które pole godziny otwarło zegar: `od`, `do`, albo żadne. */
  const [zegar, setZegar] = useState<'od' | 'do' | null>(null);
  /** Ostrzeżenie o nadpisaniu wpisu z tej sesji — czeka na drugie dotknięcie. */
  const [nadpisanie, setNadpisanie] = useState<string | null>(null);

  /** `null` = dzisiaj, czyli data wyznaczona po stronie serwera. */
  const [wybranaData, setWybranaData] = useState<string | null>(null);
  const [kalendarz, setKalendarz] = useState(false);

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
    setKalendarz(false);
    setWSesji([]);
    setPotwierdzKasowanie(false);
    setNadpisanie(null);
    setZegar(null);
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
    // Data wspólna dla wszystkich rodzajów wpisu. `null` = decyduje serwer.
    const data: string | null = wybranaData;

    if (rodzaj === 'zmiana') {
      if (od.trim() === '' && doGodz.trim() === '') return 'Podaj przynajmniej jedną godzinę.';

      // `9` znaczy `09:00`, `930` znaczy `09:30` — serwer przyjmuje tylko GG:MM.
      const wyjazd = od.trim() === '' ? null : normalizujGodzine(od);
      const zjazd = doGodz.trim() === '' ? null : normalizujGodzine(doGodz);
      if (od.trim() !== '' && wyjazd === null) return 'Nie rozumiem godziny wyjazdu.';
      if (doGodz.trim() !== '' && zjazd === null) return 'Nie rozumiem godziny zjazdu.';

      return () => postZmiana(token, wyjazd, zjazd, data);
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

    /**
     * Ostrzeżenie o nadpisaniu — tylko dla rodzajów, które serwer NADPISUJE.
     *
     * `dystans`, `brutto` i `zmiana` idą przez upsert na `daily_records`, więc
     * drugi zapis kasuje pierwszy bez śladu. Napiwki i paliwo to osobne wiersze
     * i dodanie drugiego jest zwykle zamierzone — tam ostrzeżenie tylko
     * przeszkadzałoby.
     */
    const nadpisujace: Rodzaj[] = ['dystans', 'brutto', 'zmiana'];
    const poprzedni = wSesji.find((w) => w.rodzaj === rodzaj);
    if (nadpisujace.includes(rodzaj) && poprzedni && nadpisanie === null) {
      setNadpisanie(poprzedni.opis);
      return;
    }
    setNadpisanie(null);

    setZapisuje(true);
    try {
      const wynik = await zadanie();
      const opis = opisWpisu();
      setWSesji((lista) => [...lista.filter((w) => w.rodzaj !== rodzaj || !nadpisujace.includes(rodzaj)), { rodzaj, opis }]);
      wyczysc();
      onZapisano(wynik);
    } catch (err) {
      setBlad(err instanceof ApiError ? err.message : 'Nie udało się zapisać.');
    } finally {
      setZapisuje(false);
    }
  };

  /** Krótki opis tego, co właśnie poszło — do listy „zapisane w tej sesji". */
  const opisWpisu = (): string => {
    if (rodzaj === 'zmiana') {
      return `zmiana ${normalizujGodzine(od) ?? '…'}–${normalizujGodzine(doGodz) ?? '…'}`;
    }
    const w = kwota.trim();
    if (rodzaj === 'napiwek') return `napiwek ${w} zł`;
    if (rodzaj === 'dystans') return `dystans ${w} km`;
    if (rodzaj === 'brutto') return `brutto ${w} zł`;
    return `paliwo ${w} zł`;
  };

  const usunDzien = async () => {
    if (!potwierdzKasowanie) {
      setPotwierdzKasowanie(true);
      return;
    }
    setZapisuje(true);
    setBlad(null);
    try {
      const wynik = await postUsun(token, 'ALL_DAY', wybranaData);
      setWSesji([]);
      setPotwierdzKasowanie(false);
      wyczysc();
      onZapisano({ dzien: wynik.dzien, ostrzezenie: wynik.komunikat });
    } catch (err) {
      setBlad(err instanceof ApiError ? err.message : 'Nie udało się usunąć.');
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

  /**
   * Data wybrana z kalendarza, czyli taka, która nie jest żadnym ze skrótów.
   * Służy tylko do podpisania chipu — sam zapis idzie z `wybranaData`.
   */
  const dataZKalendarza =
    wybranaData !== null &&
    wybranaData !== DATA_TESTOWA &&
    !dniWstecz.some((d) => d.iso === wybranaData)
      ? wybranaData
      : null;

  /** Pole godziny z przyciskiem otwierającym zegar obok. */
  const poleGodziny = (
    etykieta: string,
    wartosc: string,
    ustaw: (v: string) => void,
    placeholder: string,
    ktore: 'od' | 'do'
  ) => (
    <View style={s.poleBlok}>
      <Text style={s.etykieta}>{etykieta}</Text>
      <View style={s.rzadZZegarem}>
        <TextInput
          style={[s.pole, s.poleWRzedzie]}
          value={wartosc}
          onChangeText={ustaw}
          placeholder={placeholder}
          placeholderTextColor={C.tekstPrzygaszony}
          keyboardType="numbers-and-punctuation"
          editable={!zapisuje}
          autoCorrect={false}
        />
        <Pressable
          style={s.przyciskZegara}
          onPress={() => {
            if (zapisuje) return;
            setZegar(ktore);
          }}
        >
          <Text style={s.przyciskZegaraTekst}>🕐</Text>
        </Pressable>
      </View>
    </View>
  );

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
                <Text numberOfLines={1} style={[s.chipTekst, rodzaj === r.id && s.chipTekstAktywny]}>
                  {r.etykieta}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.etykieta}>Dzień wpisu</Text>
          <View style={s.chipy}>
            <Pressable
              style={[s.chipData, wybranaData === null && s.chipAktywny]}
              onPress={() => {
                if (zapisuje) return;
                setWybranaData(null);
                setBlad(null);
              }}
            >
              <Text style={[s.chipTekst, wybranaData === null && s.chipTekstAktywny]}>
                Dzisiaj
              </Text>
            </Pressable>

            {dniWstecz.map((d) => (
              <Pressable
                key={d.iso}
                style={[s.chipData, wybranaData === d.iso && s.chipAktywny]}
                onPress={() => {
                  if (zapisuje) return;
                  setWybranaData(d.iso);
                  setBlad(null);
                }}
              >
                <Text style={[s.chipTekst, wybranaData === d.iso && s.chipTekstAktywny]}>
                  {d.etykieta}
                </Text>
              </Pressable>
            ))}

            <Pressable
              style={[s.chipData, wybranaData === DATA_TESTOWA && s.chipTestowyAktywny]}
              onPress={() => {
                if (zapisuje) return;
                setWybranaData(DATA_TESTOWA);
                setBlad(null);
              }}
            >
              <Text style={[s.chipTekst, wybranaData === DATA_TESTOWA && s.chipTekstAktywny]}>
                Test
              </Text>
            </Pressable>

            <Pressable
              style={[s.chipData, dataZKalendarza !== null && s.chipAktywny]}
              disabled={dzisiaj === null}
              onPress={() => {
                if (zapisuje) return;
                setKalendarz(true);
                setBlad(null);
              }}
            >
              <Text style={[s.chipTekst, dataZKalendarza !== null && s.chipTekstAktywny]}>
                {dataZKalendarza === null ? 'Inna…' : krotkaData(dataZKalendarza)}
              </Text>
            </Pressable>
          </View>

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
              {poleGodziny('Wyjazd', od, setOd, '11:30 albo 9', 'od')}
              {poleGodziny('Zjazd', doGodz, setDoGodz, '21:15 albo 21', 'do')}
              <Text style={s.przypis}>
                Wystarczy jedna godzina. Samo „9" znaczy 9:00, „930" znaczy 9:30.
              </Text>
            </>
          ) : null}

          {rodzaj === 'dystans' ? (
            <Text style={s.przypis}>
              Dystans przejechany danego dnia, nie stan licznika.
            </Text>
          ) : null}

          {blad ? <Text style={s.blad}>{blad}</Text> : null}

          {nadpisanie !== null ? (
            <View style={s.ostrzezenie}>
              <Text style={s.ostrzezenieTekst}>
                W tej sesji zapisałeś już: {nadpisanie}
              </Text>
              <Text style={s.ostrzezeniePodpowiedz}>
                Serwer nadpisze tamtą wartość. Dotknij „Zapisz" ponownie, żeby potwierdzić.
              </Text>
            </View>
          ) : null}

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

          {wSesji.length > 0 ? (
            <View style={s.sesja}>
              <Text style={s.sesjaNaglowek}>Zapisane w tej sesji ({wSesji.length})</Text>
              {wSesji.map((w, i) => (
                <Text key={`${w.rodzaj}-${i}`} style={s.sesjaPozycja}>
                  • {w.opis}
                </Text>
              ))}
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [s.gotowe, pressed && s.wcisniety]}
            onPress={zamknij}
            disabled={zapisuje}
          >
            <Text style={s.gotoweTekst}>Gotowe — zamknij</Text>
          </Pressable>

          <Pressable
            style={[s.usun, potwierdzKasowanie && s.usunPotwierdzenie]}
            onPress={usunDzien}
            disabled={zapisuje}
          >
            <Text style={[s.usunTekst, potwierdzKasowanie && s.usunTekstPotwierdzenie]}>
              {potwierdzKasowanie
                ? 'Na pewno? Dotknij ponownie, żeby usunąć'
                : 'Usuń wszystkie wpisy z tego dnia'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <WybierzGodzine
        widoczny={zegar !== null}
        tytul={zegar === 'od' ? 'Godzina wyjazdu' : 'Godzina zjazdu'}
        wartosc={zegar === 'od' ? (normalizujGodzine(od) ?? '') : (normalizujGodzine(doGodz) ?? '')}
        onWybierz={(g) => {
          if (zegar === 'od') setOd(g);
          else setDoGodz(g);
          setZegar(null);
        }}
        onZamknij={() => setZegar(null)}
      />

      {dzisiaj !== null ? (
        <WybierzDate
          widoczny={kalendarz}
          wartosc={wybranaData}
          maks={dzisiaj}
          onWybierz={(data) => {
            setWybranaData(data);
            setKalendarz(false);
          }}
          onZamknij={() => setKalendarz(false)}
        />
      ) : null}
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
  chipTestowyAktywny: { backgroundColor: C.ostrzezenie, borderColor: C.ostrzezenie },
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

  rzadZZegarem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  poleWRzedzie: { flex: 1 },
  przyciskZegara: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  przyciskZegaraTekst: { fontSize: 22 },

  ostrzezenie: {
    backgroundColor: '#2a2416',
    borderColor: C.ostrzezenie,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  ostrzezenieTekst: { color: C.ostrzezenie, fontSize: 14, fontWeight: '700' },
  ostrzezeniePodpowiedz: { color: C.tekstPrzygaszony, fontSize: 12, marginTop: 4 },
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

  sesja: {
    backgroundColor: C.tlo,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  sesjaNaglowek: { color: C.akcent, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  sesjaPozycja: { color: C.tekstPrzygaszony, fontSize: 13, lineHeight: 19 },

  gotowe: {
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  gotoweTekst: { color: C.tekst, fontSize: 15, fontWeight: '600' },

  usun: { alignItems: 'center', paddingVertical: 16, marginTop: 6 },
  usunPotwierdzenie: {
    backgroundColor: '#2a1a1a',
    borderColor: C.blad,
    borderWidth: 1,
    borderRadius: 12,
  },
  usunTekst: { color: C.blad, fontSize: 13 },
  usunTekstPotwierdzenie: { fontWeight: '700' },
});
