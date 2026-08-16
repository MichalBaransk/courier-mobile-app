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
  getCele,
  getDni,
  getDzien,
  getInfo,
  getOferty,
  getOkres,
  getSaldo,
  getToday,
  type UsunOdpowiedz,
  type ZapisOdpowiedz,
} from './src/api';
import { clearToken, readToken } from './src/storage';
import { dataPoPolsku, przesunDate } from './src/format';
import {
  etykietaTygodnia,
  nazwaMiesiaca,
  numerTygodniaISO,
  poniedzialek,
  zakresMiesiaca,
} from './src/okresy';
import { DodajWpis } from './src/DodajWpis';
import { EkranTokena } from './src/EkranTokena';
import { KartaDnia, KartaOkresu, KartaSalda, SzczegolyTygodnia } from './src/Karty';
import { KartaCelu, UstawCel } from './src/Cele';
import { KartaOfert } from './src/Oferty';
import { KartaAnalizyDnia, PorownanieOkresow } from './src/Analiza';
import { UsunWpisy } from './src/UsunWpisy';
import { KalendarzMiesiaca } from './src/Wykresy';
import { C } from './src/theme';
import type {
  ApiInfo,
  Cele,
  CourseOfferItem,
  DailySummary,
  DailyTotals,
  PeriodSummary,
  Saldo,
} from './src/types';

type Stan = 'wczytywanie' | 'brakTokena' | 'gotowe';

/** Ile dni wstecz stanowi tło do oceny pojedynczego dnia i kosztu paliwa na km. */
const OKNO_ODNIESIENIA_DNI = 30;

/**
 * JEDEN EKRAN zamiast trzech zakładek.
 *
 * Kalendarz jest nawigacją: dotknięcie dnia pokazuje pełną kartę tego dnia,
 * dotknięcie numeru tygodnia po lewej — podsumowanie tygodnia, brak zaznaczenia
 * — podsumowanie miesiąca. Strzałki u góry przesuwają miesiąc.
 *
 * Poprzedni podział na zakładki Dzień/Tydzień/Miesiąc wymagał trzymania w głowie,
 * w której się jest, i skakania między nimi, żeby porównać dwa dni.
 */
export default function App() {
  const [stan, setStan] = useState<Stan>('wczytywanie');
  const [token, setToken] = useState<string | null>(null);

  /** Dzisiejsza data WEDŁUG SERWERA — jedyny punkt odniesienia (§8a). */
  const [dzisiaj, setDzisiaj] = useState<string | null>(null);
  /** Dowolny dzień oglądanego miesiąca — wyznacza zakres kalendarza. */
  const [miesiac, setMiesiac] = useState<string | null>(null);

  const [wybranyDzien, setWybranyDzien] = useState<string | null>(null);
  const [wybranyTydzien, setWybranyTydzien] = useState<string | null>(null);

  const [dzien, setDzien] = useState<DailySummary | null>(null);
  const [dniMiesiaca, setDniMiesiaca] = useState<DailyTotals[]>([]);
  const [okres, setOkres] = useState<PeriodSummary | null>(null);
  const [okresPoprzedni, setOkresPoprzedni] = useState<PeriodSummary | null>(null);
  const [oferty, setOferty] = useState<CourseOfferItem[]>([]);
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [cele, setCele] = useState<Cele | null>(null);
  const [info, setInfo] = useState<ApiInfo | null>(null);
  /** Ostatnie 30 dni — tło pod analizę dnia i szacunek paliwa na kilometr. */
  const [odniesienie, setOdniesienie] = useState<PeriodSummary | null>(null);

  const [blad, setBlad] = useState<string | null>(null);
  const [laduje, setLaduje] = useState(false);
  const [odswiezam, setOdswiezam] = useState(false);
  const [dodawanie, setDodawanie] = useState(false);
  const [kasowanie, setKasowanie] = useState(false);
  const [potwierdzenie, setPotwierdzenie] = useState<string | null>(null);
  /** Który cel jest właśnie ustawiany; `null` = modal zamknięty. */
  const [celDoUstawienia, setCelDoUstawienia] = useState<'MONTHLY' | 'WEEKLY' | null>(null);
  const [kwotaCelu, setKwotaCelu] = useState<number | null>(null);

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
      await clearToken();
      setToken(null);
      setStan('brakTokena');
      return;
    }
    setBlad(err instanceof ApiError ? err.message : 'Coś poszło nie tak.');
  }, []);

  /** Start: serwer podaje dzisiejszą datę, ona ustawia miesiąc i zaznaczenie. */
  useEffect(() => {
    if (stan !== 'gotowe' || !token || dzisiaj !== null) return;
    void (async () => {
      setLaduje(true);
      try {
        const dane = await getToday(token);
        setDzien(dane);
        setDzisiaj(dane.date);
        setMiesiac(dane.date);
        setWybranyDzien(dane.date);
      } catch (err) {
        await obsluzBlad(err);
      } finally {
        setLaduje(false);
      }
    })();
  }, [stan, token, dzisiaj, obsluzBlad]);

  /**
   * Cele i metadane API.
   *
   * Osobno od danych miesiąca, bo nie zależą od tego, który miesiąc jest
   * oglądany: serwer liczy postęp WYŁĄCZNIE dla bieżącego okresu
   * (`getEffectiveDate` w `getTargetProgress`). Przewijanie kalendarza do
   * marca nie ma prawa zmienić paska postępu na sierpień.
   *
   * Błąd tutaj nie jest pokazywany jako awaria całego ekranu — brak celu to
   * normalny stan, a brak `/info` odbiera tylko podpis pod listą ofert.
   */
  const pobierzCele = useCallback((t: string) => {
    getCele(t)
      .then(setCele)
      .catch(() => setCele(null));
  }, []);

  useEffect(() => {
    if (stan !== 'gotowe' || !token) return;
    pobierzCele(token);
    getInfo(token)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [stan, token, pobierzCele]);

  /** Okno odniesienia liczone od daty SERWERA, nie od zegara telefonu. */
  const pobierzOdniesienie = useCallback((t: string, dzien: string) => {
    getOkres(t, przesunDate(dzien, -(OKNO_ODNIESIENIA_DNI - 1)), dzien)
      .then(setOdniesienie)
      .catch(() => setOdniesienie(null));
  }, []);

  useEffect(() => {
    if (stan !== 'gotowe' || !token || dzisiaj === null) return;
    pobierzOdniesienie(token, dzisiaj);
  }, [stan, token, dzisiaj, pobierzOdniesienie]);

  /**
   * Wszystko, co zależy od oglądanego miesiąca — jednym strzałem.
   *
   * Cztery żądania równolegle zamiast po kolei: sumy dzienne pod kalendarz,
   * podsumowanie miesiąca, oferty (jedno wywołanie na cały miesiąc, filtrowane
   * potem w pamięci) i miesiąc poprzedni pod porównanie.
   */
  const pobierzMiesiac = useCallback(async (t: string, wMiesiacu: string) => {
    const zakres = zakresMiesiaca(wMiesiacu);
    const poprzedni = zakresMiesiaca(przesunDate(zakres.od, -1));

    const [dni, podsumowanie, listaOfert, wczesniej] = await Promise.all([
      getDni(t, zakres.od, zakres.do),
      getOkres(t, zakres.od, zakres.do),
      getOferty(t, zakres.od, zakres.do).catch(() => [] as CourseOfferItem[]),
      getOkres(t, poprzedni.od, poprzedni.do).catch(() => null),
    ]);

    setDniMiesiaca(dni);
    setOkres(podsumowanie);
    setOferty(listaOfert);
    setOkresPoprzedni(wczesniej);
  }, []);

  useEffect(() => {
    if (stan !== 'gotowe' || !token || miesiac === null) return;
    setLaduje(true);
    pobierzMiesiac(token, miesiac)
      .catch(obsluzBlad)
      .finally(() => setLaduje(false));
  }, [stan, token, miesiac, pobierzMiesiac, obsluzBlad]);

  /**
   * Pełna karta dnia pobierana osobno.
   *
   * `/api/v1/dni` niesie tylko sumy pod wykres — nie ma tam godzin zmiany,
   * wypłat z portfela, litrów ani ceny za litr. Skoro dzień ma być pokazany
   * w komplecie, trzeba po niego sięgnąć.
   */
  useEffect(() => {
    if (stan !== 'gotowe' || !token || wybranyDzien === null) return;
    let aktualne = true;
    getDzien(token, wybranyDzien)
      .then((d) => {
        if (aktualne) setDzien(d);
      })
      .catch(obsluzBlad);
    return () => {
      aktualne = false;
    };
  }, [stan, token, wybranyDzien, obsluzBlad]);

  useEffect(() => {
    if (stan !== 'gotowe' || !token) return;
    getSaldo(token)
      .then(setSaldo)
      .catch(() => setSaldo(null));
  }, [stan, token]);

  const przesunMiesiac = useCallback(
    (kierunek: -1 | 1) => {
      if (miesiac === null) return;
      setPotwierdzenie(null);
      setWybranyDzien(null);
      setWybranyTydzien(null);
      setMiesiac(przesunDate(zakresMiesiaca(miesiac).od, kierunek === 1 ? 32 : -1));
    },
    [miesiac]
  );

  const odswiez = useCallback(async () => {
    if (!token || miesiac === null) return;
    setOdswiezam(true);
    try {
      await pobierzMiesiac(token, miesiac);
      if (wybranyDzien !== null) setDzien(await getDzien(token, wybranyDzien));
      setSaldo(await getSaldo(token));
      pobierzCele(token);
      if (dzisiaj !== null) pobierzOdniesienie(token, dzisiaj);
    } catch (err) {
      await obsluzBlad(err);
    } finally {
      setOdswiezam(false);
    }
  }, [
    token,
    miesiac,
    wybranyDzien,
    dzisiaj,
    pobierzMiesiac,
    pobierzCele,
    pobierzOdniesienie,
    obsluzBlad,
  ]);

  const rozlacz = useCallback(async () => {
    await clearToken();
    setToken(null);
    setDzisiaj(null);
    setMiesiac(null);
    setWybranyDzien(null);
    setWybranyTydzien(null);
    setDzien(null);
    setCele(null);
    setOferty([]);
    setOdniesienie(null);
    setBlad(null);
    setStan('brakTokena');
  }, []);

  const zaznaczDzien = useCallback((data: string) => {
    setPotwierdzenie(null);
    setWybranyTydzien(null);
    setWybranyDzien((poprzedni) => (poprzedni === data ? null : data));
  }, []);

  const zaznaczTydzien = useCallback((pn: string) => {
    setPotwierdzenie(null);
    setWybranyDzien(null);
    setWybranyTydzien((poprzedni) => (poprzedni === pn ? null : pn));
  }, []);

  /** Wspólne odświeżenie po każdej zmianie danych — zapis albo kasowanie. */
  const poZmianie = useCallback(
    (nowyDzien: DailySummary, komunikat: string | null) => {
      setDzien(nowyDzien);
      setWybranyDzien(nowyDzien.date);
      setWybranyTydzien(null);
      setBlad(null);
      setPotwierdzenie(komunikat);
      if (!token) return;
      if (miesiac !== null) void pobierzMiesiac(token, miesiac).catch(() => {});
      getSaldo(token)
        .then(setSaldo)
        .catch(() => {});
      pobierzCele(token);
      if (dzisiaj !== null) pobierzOdniesienie(token, dzisiaj);
    },
    [token, miesiac, dzisiaj, pobierzMiesiac, pobierzCele, pobierzOdniesienie]
  );

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

  const wPrzodZablokowany =
    miesiac !== null && dzisiaj !== null && zakresMiesiaca(miesiac).od >= zakresMiesiaca(dzisiaj).od;

  /**
   * Cele pokazujemy tylko przy oglądaniu BIEŻĄCEGO miesiąca.
   *
   * Serwer liczy postęp wyłącznie dla dzisiejszego okresu, więc przy marcu
   * pasek pokazywałby sierpniowe liczby pod marcowym nagłówkiem. Lepiej nie
   * pokazać nic, niż pokazać liczbę, która znaczy co innego, niż się wydaje.
   */
  const biezacyMiesiac =
    miesiac !== null && dzisiaj !== null && zakresMiesiaca(miesiac).od === zakresMiesiaca(dzisiaj).od;

  /** Zakres, z którego pokazujemy oferty — idzie za zaznaczeniem w kalendarzu. */
  const ofertyWidoku =
    wybranyDzien !== null
      ? oferty.filter((o) => o.date === wybranyDzien)
      : wybranyTydzien !== null
        ? oferty.filter((o) => poniedzialek(o.date) === wybranyTydzien)
        : oferty;

  const etykietaOfert =
    wybranyDzien !== null
      ? `OFERTY — ${dataPoPolsku(wybranyDzien).toUpperCase()}`
      : wybranyTydzien !== null
        ? `OFERTY — TYDZIEŃ ${numerTygodniaISO(wybranyTydzien)}`
        : 'OFERTY MIESIĄCA';

  /** Dzień, którego dotyczy kasowanie: zaznaczony albo dzisiejszy. */
  const dzienDoKasowania = wybranyDzien ?? dzisiaj;

  return (
    <View style={s.tlo}>
      <StatusBar style="light" />

      <View style={s.gora}>
        <Pressable style={s.strzalka} onPress={() => przesunMiesiac(-1)}>
          <Text style={s.strzalkaTekst}>‹</Text>
        </Pressable>

        <View style={s.naglowekBlok}>
          <Text style={s.naglowekTekst} numberOfLines={1}>
            {miesiac === null ? '…' : nazwaMiesiaca(miesiac)}
          </Text>
          {laduje ? <ActivityIndicator size="small" color={C.tekstPrzygaszony} /> : null}
        </View>

        <Pressable
          style={[s.strzalka, wPrzodZablokowany && s.strzalkaNieaktywna]}
          onPress={() => przesunMiesiac(1)}
          disabled={wPrzodZablokowany}
        >
          <Text style={s.strzalkaTekst}>›</Text>
        </Pressable>
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

        {miesiac !== null ? (
          <KalendarzMiesiaca
            zakres={zakresMiesiaca(miesiac)}
            dni={dniMiesiaca}
            wybrany={wybranyDzien}
            wybranyTydzien={wybranyTydzien}
            onWybierz={zaznaczDzien}
            onWybierzTydzien={zaznaczTydzien}
          />
        ) : null}

        <View style={s.przyciski}>
          <Pressable
            style={({ pressed }) => [s.dodaj, pressed && s.wcisniety]}
            onPress={() => {
              setPotwierdzenie(null);
              setDodawanie(true);
            }}
          >
            <Text style={s.dodajTekst}>+  Dodaj wpis</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.usun, pressed && s.wcisniety]}
            onPress={() => {
              setPotwierdzenie(null);
              setKasowanie(true);
            }}
          >
            <Text style={s.usunTekst}>Usuń</Text>
          </Pressable>
        </View>

        {wybranyDzien !== null && dzien !== null && dzien.date === wybranyDzien ? (
          <>
            <View style={s.naglowekWyboru}>
              <Text style={s.naglowekWyboruTekst}>{dataPoPolsku(wybranyDzien)}</Text>
              <Pressable onPress={() => setWybranyDzien(null)}>
                <Text style={s.zamknijWybor}>✕</Text>
              </Pressable>
            </View>
            <KartaDnia dane={dzien} />
            <KartaAnalizyDnia dzien={dzien} odniesienie={odniesienie} />
          </>
        ) : null}

        {wybranyTydzien !== null ? (
          <SzczegolyTygodnia
            etykieta={`TYDZIEŃ ${numerTygodniaISO(wybranyTydzien)} · ${etykietaTygodnia(wybranyTydzien)}`}
            dni={dniMiesiaca.filter((d) => poniedzialek(d.date) === wybranyTydzien)}
            onZamknij={() => setWybranyTydzien(null)}
          />
        ) : null}

        {wybranyDzien === null && wybranyTydzien === null && okres ? (
          <>
            <KartaOkresu dane={okres} />
            {miesiac !== null ? (
              <PorownanieOkresow
                biezacy={okres}
                poprzedni={okresPoprzedni}
                etykietaBiezacy={nazwaMiesiaca(miesiac)}
                etykietaPoprzedni={nazwaMiesiaca(przesunDate(zakresMiesiaca(miesiac).od, -1))}
              />
            ) : null}
          </>
        ) : null}

        {/* Karta ofert znika, gdy w CAŁYM miesiącu nie ma ani jednej oceny —
            pusta ramka na każdym ekranie byłaby tylko szumem. Przy dniu bez
            ofert, ale w miesiącu, który je ma, zostaje i mówi „brak". */}
        {oferty.length > 0 ? (
          <KartaOfert
            oferty={ofertyWidoku}
            etykieta={etykietaOfert}
            minStawka={info?.minStawkaNettoKm ?? null}
          />
        ) : null}

        {biezacyMiesiac ? (
          <>
            <KartaCelu
              postep={cele?.miesiac ?? null}
              etykieta="CEL MIESIĘCZNY"
              okres="MONTHLY"
              onUstaw={(o, kwota) => {
                setKwotaCelu(kwota);
                setCelDoUstawienia(o);
              }}
            />
            <KartaCelu
              postep={cele?.tydzien ?? null}
              etykieta="CEL TYGODNIOWY"
              okres="WEEKLY"
              onUstaw={(o, kwota) => {
                setKwotaCelu(kwota);
                setCelDoUstawienia(o);
              }}
            />
          </>
        ) : null}

        {saldo ? <KartaSalda saldo={saldo} /> : null}

        <Pressable style={s.linkTekstowy} onPress={rozlacz}>
          <Text style={s.linkTekstowyTekst}>Zmień token</Text>
        </Pressable>
      </ScrollView>

      {token ? (
        <>
          <DodajWpis
            widoczny={dodawanie}
            token={token}
            dzisiaj={dzisiaj}
            onZamknij={() => setDodawanie(false)}
            onZapisano={(wynik: ZapisOdpowiedz) => {
              // Modal zostaje otwarty — zamyka go dopiero „Gotowe".
              poZmianie(wynik.dzien, wynik.ostrzezenie ?? 'Zapisano.');
            }}
          />

          <UsunWpisy
            widoczny={kasowanie}
            token={token}
            data={dzienDoKasowania}
            etykietaDnia={
              dzienDoKasowania === null ? 'dzisiaj' : dataPoPolsku(dzienDoKasowania)
            }
            dzien={dzien !== null && dzien.date === dzienDoKasowania ? dzien : null}
            onZamknij={() => setKasowanie(false)}
            onUsunieto={(wynik: UsunOdpowiedz) => {
              poZmianie(wynik.dzien, null);
            }}
          />

          <UstawCel
            widoczny={celDoUstawienia !== null}
            token={token}
            okres={celDoUstawienia ?? 'MONTHLY'}
            kwotaStartowa={kwotaCelu}
            onZamknij={() => setCelDoUstawienia(null)}
            onZapisano={() => {
              pobierzCele(token);
              setPotwierdzenie('Cel zapisany.');
            }}
          />
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  tlo: { flex: 1, backgroundColor: C.tlo },
  srodek: { justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  zawartosc: { padding: 16, paddingBottom: 40 },

  gora: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
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
  naglowekTekst: {
    color: C.tekst,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'capitalize',
  },

  naglowekWyboru: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  naglowekWyboruTekst: {
    color: C.tekst,
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  zamknijWybor: { color: C.tekstPrzygaszony, fontSize: 18, paddingHorizontal: 6 },

  przyciski: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  dodaj: {
    flex: 1,
    backgroundColor: C.akcent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  wcisniety: { opacity: 0.75 },
  dodajTekst: { color: C.tlo, fontSize: 16, fontWeight: '700' },
  usun: {
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  usunTekst: { color: C.blad, fontSize: 15, fontWeight: '600' },

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
