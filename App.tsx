import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import {
  ApiError,
  getDni,
  getDzien,
  getOkres,
  getSaldo,
  getToday,
  type ZapisOdpowiedz,
} from './src/api';
import { clearToken, readToken } from './src/storage';
import { dataPoPolsku, przesunDate } from './src/format';
import {
  etykietaTygodnia,
  nazwaMiesiaca,
  numerTygodniaISO,
  poniedzialek,
  przyszloscZablokowana,
  zakresMiesiaca,
  zakresTygodnia,
} from './src/okresy';
import { DodajWpis } from './src/DodajWpis';
import { EkranTokena } from './src/EkranTokena';
import {
  KartaDnia,
  KartaOkresu,
  KartaSalda,
  SzczegolyDnia,
  SzczegolyTygodnia,
} from './src/Karty';
import { KalendarzMiesiaca, WykresTygodnia } from './src/Wykresy';
import { C } from './src/theme';
import type { DailySummary, DailyTotals, PeriodSummary, Saldo } from './src/types';

type Widok = 'dzien' | 'tydzien' | 'miesiac';
type Stan = 'wczytywanie' | 'brakTokena' | 'gotowe';

const WIDOKI: Array<{ id: Widok; etykieta: string }> = [
  { id: 'dzien', etykieta: 'Dzień' },
  { id: 'tydzien', etykieta: 'Tydzień' },
  { id: 'miesiac', etykieta: 'Miesiąc' },
];

export default function App() {
  const [stan, setStan] = useState<Stan>('wczytywanie');
  const [token, setToken] = useState<string | null>(null);

  /**
   * Dzisiejsza data WEDŁUG SERWERA. Ustawiana przy pierwszym pobraniu i od tego
   * momentu jedyny punkt odniesienia dla nawigacji. Zegar telefonu nie bierze
   * udziału w niczym — doba kończy się o północy w Europe/Warsaw (§8a).
   */
  const [dzisiaj, setDzisiaj] = useState<string | null>(null);
  /** Dzień, na którym stoi nawigacja. */
  const [kursor, setKursor] = useState<string | null>(null);
  const [widok, setWidok] = useState<Widok>('dzien');

  const [dzien, setDzien] = useState<DailySummary | null>(null);
  const [dniOkresu, setDniOkresu] = useState<DailyTotals[]>([]);
  const [okres, setOkres] = useState<PeriodSummary | null>(null);
  const [saldo, setSaldo] = useState<Saldo | null>(null);

  const [blad, setBlad] = useState<string | null>(null);
  const [laduje, setLaduje] = useState(false);
  const [odswiezam, setOdswiezam] = useState(false);
  const [dodawanie, setDodawanie] = useState(false);
  const [potwierdzenie, setPotwierdzenie] = useState<string | null>(null);

  /**
   * Zaznaczenie WEWNĄTRZ widoku okresowego — filtruje w miejscu, bez skakania
   * do zakładki dnia. Przeskok był najbardziej uciążliwą rzeczą w poprzedniej
   * wersji: żeby obejrzeć trzy dni tygodnia, trzeba było trzy razy wracać.
   */
  const [wybranyDzien, setWybranyDzien] = useState<string | null>(null);
  const [wybranyTydzien, setWybranyTydzien] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const zapisany = await readToken();
      if (zapisany) {
        setToken(zapisany);
        setStan('gotowe');
      } else {
        setStan('brakTokena');
      }
    })();
  }, []);

  const obsluzBlad = useCallback(async (err: unknown) => {
    if (err instanceof ApiError && err.isUnauthorized) {
      // Token przestał działać (np. wymieniony na serwerze) — kasujemy go
      // i wracamy do ekranu wpisywania zamiast pokazywać wieczny błąd.
      await clearToken();
      setToken(null);
      setStan('brakTokena');
      return;
    }
    setBlad(err instanceof ApiError ? err.message : 'Coś poszło nie tak.');
  }, []);

  const pobierz = useCallback(
    async (t: string, doWidoku: Widok, naDzien: string | null) => {
      setBlad(null);
      setLaduje(true);
      try {
        if (doWidoku === 'dzien') {
          const dane = naDzien === null ? await getToday(t) : await getDzien(t, naDzien);
          setDzien(dane);
          setKursor(dane.date);
          setDzisiaj((poprzednie) => poprzednie ?? dane.date);
          return;
        }

        // Widoki okresowe potrzebują punktu odniesienia; przy pierwszym wejściu
        // bierzemy go z serwera, żeby nie zgadywać dnia z zegara telefonu.
        const kotwica = naDzien ?? dzisiaj ?? (await getToday(t)).date;
        const zakres = doWidoku === 'tydzien' ? zakresTygodnia(kotwica) : zakresMiesiaca(kotwica);

        const [dni, podsumowanie] = await Promise.all([
          getDni(t, zakres.od, zakres.do),
          getOkres(t, zakres.od, zakres.do),
        ]);
        setDniOkresu(dni);
        setOkres(podsumowanie);
        setKursor(kotwica);
        setDzisiaj((poprzednie) => poprzednie ?? kotwica);
      } catch (err) {
        await obsluzBlad(err);
      } finally {
        setLaduje(false);
      }
    },
    [dzisiaj, obsluzBlad]
  );

  /**
   * JEDNO miejsce, w którym cokolwiek się pobiera.
   *
   * Nawigacja wyłącznie ustawia stan (`kursor`, `widok`) — nigdy nie woła
   * pobierania sama. Poprzednia wersja robiła oba naraz i przy dotknięciu dnia
   * w kalendarzu powstawał wyścig: efekt startował ze STARYM kursorem, czyli
   * kotwicą miesiąca, i nadpisywał wynik kliknięcia. Stąd „wybieranie z
   * kalendarza nie działa".
   */
  useEffect(() => {
    if (stan !== 'gotowe' || !token || kursor === null) return;
    void pobierz(token, widok, kursor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stan, token, widok, kursor]);

  /** Pierwsze pobranie: serwer podaje dzisiejszą datę i ona staje się kursorem. */
  useEffect(() => {
    if (stan !== 'gotowe' || !token || kursor !== null) return;
    void pobierz(token, 'dzien', null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stan, token]);

  useEffect(() => {
    if (stan !== 'gotowe' || !token) return;
    getSaldo(token)
      .then(setSaldo)
      .catch(() => setSaldo(null));
  }, [stan, token]);

  const przesun = useCallback(
    (kierunek: -1 | 1) => {
      if (!token || !kursor) return;

      const nowy =
        widok === 'dzien'
          ? przesunDate(kursor, kierunek)
          : widok === 'tydzien'
            ? przesunDate(kursor, kierunek * 7)
            : // Miesiąc: przez pierwszy dzień bieżącego miesiąca, żeby przeskok
              // 31 → 30 dni nie gubił lutego ani nie przeskakiwał o dwa.
              przesunDate(zakresMiesiaca(kursor).od, kierunek === 1 ? 32 : -1);

      setPotwierdzenie(null);
      setKursor(nowy);
    },
    [token, kursor, widok]
  );

  const odswiez = useCallback(async () => {
    if (!token) return;
    setOdswiezam(true);
    await pobierz(token, widok, kursor);
    setOdswiezam(false);
  }, [token, widok, kursor, pobierz]);

  const rozlacz = useCallback(async () => {
    await clearToken();
    setToken(null);
    setDzien(null);
    setDzisiaj(null);
    setKursor(null);
    setBlad(null);
    setStan('brakTokena');
  }, []);

  /** Dotknięcie dnia zaznacza go W MIEJSCU. Drugie dotknięcie odznacza. */
  const zaznaczDzien = useCallback((data: string) => {
    setPotwierdzenie(null);
    setWybranyTydzien(null);
    setWybranyDzien((poprzedni) => (poprzedni === data ? null : data));
  }, []);

  /** Dotknięcie numeru tygodnia w kalendarzu — podsumowanie całego tygodnia. */
  const zaznaczTydzien = useCallback((pn: string) => {
    setPotwierdzenie(null);
    setWybranyDzien(null);
    setWybranyTydzien((poprzedni) => (poprzedni === pn ? null : pn));
  }, []);

  /** Zmiana okresu albo zakładki unieważnia zaznaczenie. */
  useEffect(() => {
    setWybranyDzien(null);
    setWybranyTydzien(null);
  }, [widok, kursor]);

  if (stan === 'wczytywanie') {
    return (
      <View style={[s.tlo, s.srodek]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={C.akcent} />
      </View>
    );
  }

  if (stan === 'brakTokena') {
    return (
      <View style={s.tlo}>
        <StatusBar style="light" />
        <EkranTokena
          onZapisano={(t) => {
            setToken(t);
            setStan('gotowe');
          }}
        />
      </View>
    );
  }

  const tydzien = kursor === null ? null : zakresTygodnia(kursor);
  const naglowek =
    kursor === null
      ? '…'
      : widok === 'dzien'
        ? dataPoPolsku(kursor)
        : widok === 'tydzien'
          ? `Tydzień ${numerTygodniaISO(kursor)} · ${etykietaTygodnia(kursor)}`
          : nazwaMiesiaca(kursor);

  // Blokada dotyczy KAŻDEGO widoku — przyszły tydzień i miesiąc są równie puste
  // jak przyszły dzień.
  const wPrzodZablokowane =
    kursor !== null && dzisiaj !== null && przyszloscZablokowana(widok, kursor, dzisiaj);

  return (
    <View style={s.tlo}>
      <StatusBar style="light" />

      <View style={s.gora}>
        <View style={s.zakladki}>
          {WIDOKI.map((w) => (
            <Pressable
              key={w.id}
              style={[s.zakladka, widok === w.id && s.zakladkaAktywna]}
              onPress={() => {
                setPotwierdzenie(null);
                setWidok(w.id);
              }}
            >
              <Text style={[s.zakladkaTekst, widok === w.id && s.zakladkaTekstAktywny]}>
                {w.etykieta}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={s.nawigacja}>
          <Pressable style={s.strzalka} onPress={() => przesun(-1)}>
            <Text style={s.strzalkaTekst}>‹</Text>
          </Pressable>

          <View style={s.naglowekBlok}>
            <Text style={s.naglowekTekst} numberOfLines={1}>
              {naglowek}
            </Text>
            {laduje ? <ActivityIndicator size="small" color={C.tekstPrzygaszony} /> : null}
          </View>

          <Pressable
            style={[s.strzalka, wPrzodZablokowane && s.strzalkaNieaktywna]}
            onPress={() => przesun(1)}
            disabled={wPrzodZablokowane}
          >
            <Text style={s.strzalkaTekst}>›</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.zawartosc}
        refreshControl={
          <RefreshControl refreshing={odswiezam} onRefresh={odswiez} tintColor={C.akcent} />
        }
      >
        {blad ? (
          <View style={s.pasekBledu}>
            <Text style={s.pasekBleduTekst}>{blad}</Text>
            <Text style={s.pasekBleduPodpowiedz}>Pociągnij w dół, żeby spróbować ponownie.</Text>
          </View>
        ) : null}

        {potwierdzenie ? (
          <View style={s.pasekOk}>
            <Text style={s.pasekOkTekst}>{potwierdzenie}</Text>
          </View>
        ) : null}

        {/* Dodawanie dostępne z każdego widoku — wpis i tak trafia na dzień
            wybrany w samym formularzu, więc blokowanie go w tygodniu było
            ograniczeniem bez powodu. */}
        <Pressable
          style={({ pressed }) => [s.dodaj, pressed && s.wcisniety]}
          onPress={() => {
            setPotwierdzenie(null);
            setDodawanie(true);
          }}
        >
          <Text style={s.dodajTekst}>+  Dodaj wpis</Text>
        </Pressable>

        {widok === 'dzien' ? (
          <>
            {dzien ? <KartaDnia dane={dzien} /> : null}
            {saldo ? <KartaSalda saldo={saldo} /> : null}
          </>
        ) : null}

        {widok === 'tydzien' && tydzien ? (
          <WykresTygodnia
            zakres={tydzien}
            dni={dniOkresu}
            wybrany={wybranyDzien}
            onWybierz={zaznaczDzien}
          />
        ) : null}

        {widok === 'miesiac' && kursor ? (
          <KalendarzMiesiaca
            zakres={zakresMiesiaca(kursor)}
            dni={dniOkresu}
            wybrany={wybranyDzien}
            wybranyTydzien={wybranyTydzien}
            onWybierz={zaznaczDzien}
            onWybierzTydzien={zaznaczTydzien}
          />
        ) : null}

        {widok !== 'dzien' && wybranyDzien !== null ? (
          <SzczegolyDnia
            data={wybranyDzien}
            dzien={dniOkresu.find((d) => d.date === wybranyDzien) ?? null}
            onZamknij={() => setWybranyDzien(null)}
          />
        ) : null}

        {widok === 'miesiac' && wybranyTydzien !== null ? (
          <SzczegolyTygodnia
            etykieta={`TYDZIEŃ ${numerTygodniaISO(wybranyTydzien)} · ${etykietaTygodnia(wybranyTydzien)}`}
            dni={dniOkresu.filter((d) => poniedzialek(d.date) === wybranyTydzien)}
            onZamknij={() => setWybranyTydzien(null)}
          />
        ) : null}

        {/* Podsumowanie całego okresu chowamy, gdy coś jest zaznaczone —
            dwie karty z liczbami obok siebie tylko mylą. */}
        {widok !== 'dzien' && okres && wybranyDzien === null && wybranyTydzien === null ? (
          <KartaOkresu dane={okres} />
        ) : null}

        {!blad && laduje && !dzien && widok === 'dzien' ? (
          <View style={s.srodek}>
            <ActivityIndicator size="large" color={C.akcent} />
          </View>
        ) : null}

        <Pressable style={s.linkTekstowy} onPress={rozlacz}>
          <Text style={s.linkTekstowyTekst}>Zmień token</Text>
        </Pressable>
      </ScrollView>

      {token ? (
        <DodajWpis
          widoczny={dodawanie}
          token={token}
          dzisiaj={dzisiaj}
          onZamknij={() => setDodawanie(false)}
          onZapisano={(wynik: ZapisOdpowiedz) => {
            // Serwer odesłał świeży stan dnia razem z potwierdzeniem zapisu,
            // więc przeskakujemy na ten dzień bez dodatkowego zapytania.
            // Modal zostaje otwarty — zamyka go dopiero „Gotowe". Tu tylko
            // odświeżamy to, co widać pod spodem, bez zmiany zakładki.
            setDzien(wynik.dzien);
            setBlad(null);
            setPotwierdzenie(wynik.ostrzezenie ?? 'Zapisano.');
            if (widok !== 'dzien' && kursor !== null && token !== null) {
              void pobierz(token, widok, kursor);
            }
            getSaldo(token)
              .then(setSaldo)
              .catch(() => {});
          }}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  tlo: { flex: 1, backgroundColor: C.tlo },
  srodek: { justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  zawartosc: { padding: 16, paddingBottom: 40 },

  gora: { paddingTop: 52, paddingHorizontal: 16, paddingBottom: 8 },

  zakladki: {
    flexDirection: 'row',
    backgroundColor: C.karta,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: C.obramowanie,
  },
  zakladka: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  zakladkaAktywna: { backgroundColor: C.akcent },
  zakladkaTekst: { color: C.tekstPrzygaszony, fontSize: 14, fontWeight: '600' },
  zakladkaTekstAktywny: { color: C.tlo, fontWeight: '700' },

  nawigacja: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  strzalka: { paddingHorizontal: 14, paddingVertical: 4 },
  strzalkaNieaktywna: { opacity: 0.25 },
  strzalkaTekst: { color: C.tekst, fontSize: 30, lineHeight: 34 },
  naglowekBlok: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  naglowekTekst: { color: C.tekst, fontSize: 16, fontWeight: '600', textAlign: 'center' },

  dodaj: {
    backgroundColor: C.akcent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  wcisniety: { opacity: 0.75 },
  dodajTekst: { color: C.tlo, fontSize: 16, fontWeight: '700' },

  pasekBledu: {
    backgroundColor: '#2a1a1a',
    borderColor: C.blad,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  pasekBleduTekst: { color: C.blad, fontSize: 14, fontWeight: '600' },
  pasekBleduPodpowiedz: { color: C.tekstPrzygaszony, fontSize: 12, marginTop: 4 },

  pasekOk: {
    backgroundColor: '#16251b',
    borderColor: C.akcent,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  pasekOkTekst: { color: C.akcent, fontSize: 14, fontWeight: '600' },

  linkTekstowy: { alignItems: 'center', paddingVertical: 18, marginTop: 4 },
  linkTekstowyTekst: { color: C.tekstPrzygaszony, fontSize: 13 },
});
