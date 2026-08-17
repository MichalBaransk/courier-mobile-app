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
import { ocenLiczbe, ocenParagon, ocenZmiane, polacz, type Ocena } from './limity';
import { nowyKlucz, toBrakSieci, type EndpointKolejki } from './kolejka';
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
 * Walidacja jest DWUWARSTWOWA i celowo asymetryczna.
 *
 * Reguły biznesowe (co wolno, jakie limity, jak liczyć godziny) zostają
 * po stronie serwera i to jego komunikaty pokazujemy — są po polsku i wskazują
 * konkretne pole. Duplikowanie ich tutaj skończyłoby się dwoma zestawami
 * zasad, które się rozjeżdżają.
 *
 * Ale limity serwera są luźne z premedytacją (napiwek do 10 000 zł), więc
 * literówka przechodzi bez mrugnięcia: `45,50` bez przecinka to `4550` —
 * kwota legalna i absurdalna zarazem. Dlatego `limity.ts` dokłada warstwę
 * „to wygląda dziwnie": nie blokuje, tylko żąda drugiego dotknięcia „Zapisz".
 * Użytkownik może mieć rację i musi mieć jak postawić na swoim.
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
  /**
   * Dzień zaznaczony w kalendarzu — formularz otwiera się od razu na nim.
   *
   * `null` znaczy „brak zaznaczenia", czyli domyślnie dzisiaj. Kurier, który
   * ogląda wtorek i dotyka „Dodaj wpis", chce dopisać coś do wtorku, a nie
   * do dzisiaj — a przestawianie daty przy każdym wpisie to najłatwiejsza
   * droga do wpisu w złym dniu.
   */
  domyslnaData: string | null;
  onZamknij: () => void;
  onZapisano: (wynik: ZapisOdpowiedz) => void;
  /**
   * Wpis do kolejki offline. Zwraca komunikat dla użytkownika albo `null`,
   * gdy się nie udało (kolejka pełna, nieznana data serwera).
   *
   * `id` jest KLUCZEM, którego użyła nieudana próba na żywo. Ponowienie
   * z tym samym kluczem serwer rozpozna jako powtórkę, więc jeśli żądanie
   * jednak doszło, nie powstanie drugi wpis.
   */
  onDoKolejki: (wpis: {
    endpoint: EndpointKolejki;
    cialo: Record<string, unknown>;
    opis: string;
    data: string | null;
    id: string;
  }) => string | null;
}

export function DodajWpis({
  widoczny,
  token,
  dzisiaj,
  domyslnaData,
  onZamknij,
  onZapisano,
  onDoKolejki,
}: Props) {
  /**
   * `null` zawsze znaczy „dzisiaj wyznaczone PO STRONIE SERWERA" (§8a).
   * Dlatego zaznaczenie równe dzisiejszej dacie zostawiamy jako `null` —
   * zegar telefonu nadal nie decyduje o niczym.
   */
  const startowaData = domyslnaData !== null && domyslnaData !== dzisiaj ? domyslnaData : null;
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
  const [wSesji, setWSesji] = useState<Array<{ rodzaj: Rodzaj; data: string | null; opis: string }>>(
    []
  );
  /** Kasowanie dnia wymaga drugiego dotknięcia — bez cofania. */
  const [potwierdzKasowanie, setPotwierdzKasowanie] = useState(false);
  /** Które pole godziny otwarło zegar: `od`, `do`, albo żadne. */
  const [zegar, setZegar] = useState<'od' | 'do' | null>(null);
  /**
   * Treść ostrzeżenia czekającego na potwierdzenie — nietypowa wartość albo
   * nadpisanie wpisu z tej sesji. `null` = nic nie czeka.
   */
  const [nadpisanie, setNadpisanie] = useState<string | null>(null);

  /** `null` = dzisiaj, czyli data wyznaczona po stronie serwera. */
  const [wybranaData, setWybranaData] = useState<string | null>(startowaData);
  const [kalendarz, setKalendarz] = useState(false);

  /**
   * Ponowne otwarcie formularza ma znowu trafić w dzień z kalendarza.
   *
   * `Modal` z `visible={false}` zostaje w drzewie, więc stan nie resetuje się
   * sam. Bez tego wystarczyło raz zmienić dzień w formularzu, żeby przy
   * następnym otwarciu została stara wartość, a nie ta z kalendarza.
   */
  const [poprzednioWidoczny, setPoprzednioWidoczny] = useState(false);
  if (widoczny !== poprzednioWidoczny) {
    setPoprzednioWidoczny(widoczny);
    if (widoczny) setWybranaData(startowaData);
  }

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
    setWybranaData(startowaData);
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
  type DoKolejki = { endpoint: EndpointKolejki; cialo: Record<string, unknown> };

  type Przygotowane =
    | { ok: false; blad: string }
    | {
        ok: true;
        ostrzezenie: string | null;
        zadanie: (klucz: string) => Promise<ZapisOdpowiedz>;
        doKolejki: DoKolejki;
      };

  const przygotuj = (): Przygotowane => {
    // Data wspólna dla wszystkich rodzajów wpisu. `null` = decyduje serwer.
    const data: string | null = wybranaData;
    const zBledem = (blad: string): Przygotowane => ({ ok: false, blad });
    const zOcena = (
      o: Ocena,
      zadanie: (klucz: string) => Promise<ZapisOdpowiedz>,
      doKolejki: DoKolejki
    ): Przygotowane =>
      o.blad !== null
        ? zBledem(o.blad)
        : { ok: true, ostrzezenie: o.ostrzezenie, zadanie, doKolejki };

    if (rodzaj === 'zmiana') {
      if (od.trim() === '' && doGodz.trim() === '')
        return zBledem('Podaj przynajmniej jedną godzinę.');

      // `9` znaczy `09:00`, `930` znaczy `09:30` — serwer przyjmuje tylko GG:MM.
      const wyjazd = od.trim() === '' ? null : normalizujGodzine(od);
      const zjazd = doGodz.trim() === '' ? null : normalizujGodzine(doGodz);
      if (od.trim() !== '' && wyjazd === null) return zBledem('Nie rozumiem godziny wyjazdu.');
      if (doGodz.trim() !== '' && zjazd === null) return zBledem('Nie rozumiem godziny zjazdu.');

      return zOcena(
        ocenZmiane(wyjazd, zjazd),
        (klucz) => postZmiana(token, wyjazd, zjazd, data, klucz),
        { endpoint: '/api/v1/zmiana', cialo: { od: wyjazd, do: zjazd } }
      );
    }

    const wartosc = liczba(kwota);
    if (wartosc === null) return zBledem('Wpisz liczbę.');

    switch (rodzaj) {
      case 'napiwek':
        return zOcena(
          ocenLiczbe('napiwek', wartosc),
          (klucz) => postNapiwek(token, wartosc, data, klucz),
          { endpoint: '/api/v1/napiwek', cialo: { kwota: wartosc } }
        );
      case 'dystans':
        return zOcena(
          ocenLiczbe('dystans', wartosc),
          (klucz) => postDystans(token, wartosc, data, klucz),
          { endpoint: '/api/v1/dystans', cialo: { km: wartosc } }
        );
      case 'brutto':
        return zOcena(
          ocenLiczbe('brutto', wartosc),
          (klucz) => postBrutto(token, wartosc, data, klucz),
          { endpoint: '/api/v1/brutto', cialo: { kwota: wartosc } }
        );
      case 'paliwo': {
        const l = liczba(litry);
        const c = liczba(cena);
        return zOcena(
          polacz(
            ocenLiczbe('paliwo', wartosc),
            ocenLiczbe('litry', l),
            ocenLiczbe('cenaZaLitr', c),
            ocenParagon(wartosc, l, c)
          ),
          (klucz) => postPaliwo(token, wartosc, l, c, data, klucz),
          { endpoint: '/api/v1/paliwo', cialo: { kwota: wartosc, litry: l, cenaZaLitr: c } }
        );
      }
    }

    // Nieosiągalne przy obecnym zestawie rodzajów — switch wyżej pokrywa
    // wszystkie. Zwykły `return` zamiast kontroli wyczerpania przez `never`,
    // bo tej drugiej nie miałem jak skompilować u siebie.
    return zBledem('Nieobsługiwany rodzaj wpisu.');
  };

  /**
   * Rodzaje, które serwer NADPISUJE.
   *
   * `dystans`, `brutto` i `zmiana` idą przez upsert na `daily_records`, więc
   * drugi zapis kasuje pierwszy bez śladu. Napiwki i paliwo to osobne wiersze
   * i dodanie drugiego jest zwykle zamierzone — tam ostrzeżenie tylko
   * przeszkadzałoby.
   */
  const NADPISUJACE: Rodzaj[] = ['dystans', 'brutto', 'zmiana'];

  /**
   * Usuwa z listy sesji wpis, który właśnie zostanie nadpisany.
   *
   * Tylko ten sam rodzaj W TYM SAMYM DNIU — inaczej zapisanie brutto na
   * 2 sierpnia kasowałoby z listy brutto z 1 sierpnia, choć oba są w bazie.
   */
  const zastapWSesji = (
    lista: Array<{ rodzaj: Rodzaj; data: string | null; opis: string }>,
    r: Rodzaj,
    d: string | null
  ) => (NADPISUJACE.includes(r) ? lista.filter((w) => !(w.rodzaj === r && w.data === d)) : lista);

  const zapisz = async () => {
    setBlad(null);

    const gotowe = przygotuj();
    if (!gotowe.ok) {
      setNadpisanie(null);
      setBlad(gotowe.blad);
      return;
    }

    /**
     * Ostrzeżenie o nadpisaniu dotyczy TEGO SAMEGO RODZAJU W TYM SAMYM DNIU.
     *
     * Brutto 500 zł na 1 sierpnia i brutto 300 zł na 2 sierpnia to dwa
     * niezależne wpisy — serwer trzyma je w osobnych wierszach `daily_records`
     * i jeden drugiego nie nadpisze. Wcześniej klucz był sam `rodzaj`, więc
     * druga kwota fałszywie alarmowała i wymagała potwierdzenia, choć nic
     * nie było zagrożone.
     */
    const poprzedni = wSesji.find((w) => w.rodzaj === rodzaj && w.data === wybranaData);
    const oNadpisaniu =
      NADPISUJACE.includes(rodzaj) && poprzedni
        ? `W tej sesji zapisałeś już: ${poprzedni.opis}. Serwer nadpisze tamtą wartość.`
        : null;

    /**
     * JEDEN mechanizm potwierdzania na dwa różne powody: nietypowa wartość
     * i nadpisanie wpisu z tej sesji. Tokenem jest sama TREŚĆ ostrzeżenia —
     * dzięki temu poprawienie kwoty po zobaczeniu komunikatu automatycznie
     * unieważnia potwierdzenie i trzeba potwierdzić nową wartość.
     */
    const doPotwierdzenia = [gotowe.ostrzezenie, oNadpisaniu].filter(Boolean).join('\n\n');
    if (doPotwierdzenia !== '' && nadpisanie !== doPotwierdzenia) {
      setNadpisanie(doPotwierdzenia);
      return;
    }
    setNadpisanie(null);

    /**
     * Klucz powstaje RAZ, przed próbą na żywo, i ten sam trafia do kolejki.
     *
     * Gdyby kolejka dostała nowy klucz, scenariusz „żądanie doszło, ale
     * odpowiedź zginęła w tunelu" dałby DWA wpisy w bazie — czyli dokładnie
     * to, przed czym idempotencja ma chronić.
     */
    const klucz = nowyKlucz(Date.now());
    const opis = opisWpisu();

    setZapisuje(true);
    try {
      const wynik = await gotowe.zadanie(klucz);
      setWSesji((lista) => [...zastapWSesji(lista, rodzaj, wybranaData), { rodzaj, data: wybranaData, opis }]);
      wyczysc();
      onZapisano(wynik);
    } catch (err) {
      // Brak sieci to nie jest błąd użytkownika — wpis idzie do kolejki.
      if (err instanceof ApiError && toBrakSieci(err.status)) {
        const komunikat = onDoKolejki({
          endpoint: gotowe.doKolejki.endpoint,
          cialo: gotowe.doKolejki.cialo,
          opis,
          // Data ZAMROŻONA w chwili dodania. `null` znaczyłoby „dzisiaj
          // według serwera W MOMENCIE WYSYŁKI" — a wpis dodany o 23:50
          // i wysłany o 00:10 wylądowałby w złej dobie.
          data: wybranaData ?? dzisiaj,
          id: klucz,
        });
        if (komunikat !== null) {
          setWSesji((lista) => [
            ...zastapWSesji(lista, rodzaj, wybranaData),
            { rodzaj, data: wybranaData, opis: `${opis} — czeka na wysłanie` },
          ]);
          wyczysc();
          setBlad(null);
        } else {
          setBlad('Brak połączenia, a kolejki nie da się już rozszerzyć.');
        }
      } else {
        setBlad(err instanceof ApiError ? err.message : 'Nie udało się zapisać.');
      }
    } finally {
      setZapisuje(false);
    }
  };

  /** Krótki opis tego, co właśnie poszło — do listy „zapisane w tej sesji". */
  /** `dzisiaj`, `wczoraj` albo `sob 15 sie` — do listy „zapisane w tej sesji". */
  const etykietaDnia = (d: string | null): string => {
    if (d === null) return 'dzisiaj';
    if (d === DATA_TESTOWA) return 'test';
    if (dzisiaj !== null && d === przesunDate(dzisiaj, -1)) return 'wczoraj';
    return krotkaData(d);
  };

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
      // Jak wyżej: kasowanie nie idzie do kolejki (patrz `kolejka.ts`).
      if (err instanceof ApiError && toBrakSieci(err.status)) {
        setBlad('Kasowanie wymaga połączenia z serwerem — nie odkładam go na później.');
      } else {
        setBlad(err instanceof ApiError ? err.message : 'Nie udało się usunąć.');
      }
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
              <Text style={s.ostrzezenieTekst}>{nadpisanie}</Text>
              <Text style={s.ostrzezeniePodpowiedz}>
                Dotknij „Zapisz" ponownie, żeby potwierdzić — albo popraw wartość.
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
              <Text style={s.sesjaPodpowiedz}>
                Dzień możesz zmieniać między zapisami — każdy wpis pamięta swój.
              </Text>
              {wSesji.map((w, i) => (
                <Text key={`${w.rodzaj}-${w.data ?? 'dzis'}-${i}`} style={s.sesjaPozycja}>
                  • {w.opis} · {etykietaDnia(w.data)}
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
  sesjaPodpowiedz: { color: C.obramowanie, fontSize: 11, marginBottom: 6 },

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
