import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

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
  postLokalizacja,
  postZmiana,
  wyslijZKolejki,
  type UsunOdpowiedz,
  type ZapisOdpowiedz,
} from './src/api';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { PONOWIENIE_KOLEJKI_MS } from './src/config';
import { czyJestZgoda, sledzPozycje, zapytajOZgode } from './src/lokalizacja';
import {
  czySledzenieChodzi,
  czyTloDostepne,
  uruchomSledzenieTla,
  zatrzymajSledzenieTla,
} from './src/gpsTlo';
import { decyzjaSledzenia } from './src/gpsTloReguly';
import { minutTrwania } from './src/limity';
import {
  schowajPowiadomienieZmiany,
  zapewnijPowiadomienieZmiany,
} from './src/powiadomienieZmiany';
import {
  dodaj as dodajDoKolejki,
  nastepny,
  oznaczOdrzucony,
  podzielWygasle,
  poNieudanej,
  ponowWszystkie,
  toBrakSieci,
  usunPoWyslaniu,
  usunRecznie,
  type EndpointKolejki,
  type WpisKolejki,
} from './src/kolejka';
import { wczytajKolejke, zapiszKolejke } from './src/kolejkaMagazyn';
import { KolejkaPasek } from './src/KolejkaPasek';
import { clearToken, readToken } from './src/storage';
import { dataPoPolsku, krotkaData, przesunDate } from './src/format';
import {
  etykietaTygodnia,
  nazwaMiesiaca,
  numerTygodniaISO,
  poniedzialek,
  zakresMiesiaca,
} from './src/okresy';
import { DodajWpis } from './src/DodajWpis';
import { OcenOferte } from './src/OcenOferte';
import { EkranTokena } from './src/EkranTokena';
import { KartaDnia, KartaOkresu, KartaSalda, SzczegolyTygodnia } from './src/Karty';
import { KartaCelu, UstawCel } from './src/Cele';
import { EdytorTygodniaPracy } from './src/TydzienPracy';
import { czyUstawiony, opisDni, sumaTygodnia, PUSTY_TYDZIEN, type TydzienPracy } from './src/tydzienPracy';
import { wczytajTydzien, zapiszTydzien } from './src/tydzienPracyMagazyn';
import { KartaOfert } from './src/Oferty';
import { KartaAnalizyDnia, PorownanieOkresow } from './src/Analiza';
import { UsunWpisy } from './src/UsunWpisy';
import { WybierzDate } from './src/WybierzDate';
import { PasekSekcji, type Sekcja } from './src/Nawigacja';
import { PanelUstawien } from './src/Ustawienia';
import { DOMYSLNE as USTAWIENIA_DOMYSLNE, type Ustawienia } from './src/ustawienia';
import { wczytajUstawienia, zapiszUstawienia } from './src/ustawieniaMagazyn';
import { KalendarzMiesiaca } from './src/Wykresy';
import { WykresyDni } from './src/WykresyDni';
import { WykresyOfert } from './src/WykresyOfert';
import { WykresyProfilu } from './src/WykresyProfilu';
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

/** Co jest zaznaczone w kalendarzu: konkretny dzień albo cały tydzień. */
type Zaznaczenie = { rodzaj: 'dzien'; wartosc: string } | { rodzaj: 'tydzien'; wartosc: string };

/** Klucz mapy zaznaczeń — `2026-08`. */
const kluczMiesiaca = (iso: string): string => iso.slice(0, 7);

/**
 * Blokada równoległych wysyłek kolejki.
 *
 * Poza komponentem, bo `useState` aktualizuje się asynchronicznie i dwa
 * wywołania w tym samym takcie zdążyłyby oba zobaczyć `false`. Wysyłka MUSI
 * być pojedyncza: dwa równoległe upserty na ten sam dzień dają wynik zależny
 * od kolejności odpowiedzi, czyli losowy.
 */
let wysylkaWToku = false;

/**
 * Przepycha kolejkę, jeden wpis naraz, aż do pierwszej porażki.
 *
 * Zatrzymanie po pierwszym niepowodzeniu jest celowe: gdy nie ma zasięgu,
 * kolejny wpis też nie przejdzie, a każda próba to 10 sekund czekania
 * i kawałek baterii.
 */
async function przeslijKolejke(
  token: string,
  poczatkowa: WpisKolejki[]
): Promise<{ kolejka: WpisKolejki[]; wyslane: number; komunikat: string | null }> {
  let kolejka = poczatkowa;
  let wyslane = 0;

  // Twardy limit obrotów — pętla nie ma prawa się zapętlić, nawet gdyby
  // któraś funkcja kolejki zaczęła zwracać ten sam wpis w kółko.
  for (let i = 0; i < 64; i++) {
    const wpis = nastepny(kolejka, Date.now());
    if (wpis === null) break;

    try {
      await wyslijZKolejki(token, wpis.endpoint, wpis.cialo, wpis.id);
      kolejka = usunPoWyslaniu(kolejka, wpis.id);
      wyslane += 1;
    } catch (err) {
      const status = err instanceof ApiError ? err.status : null;

      if (toBrakSieci(status) || status === 409) {
        // 409 = poprzednia próba z tym samym kluczem jeszcze trwa na serwerze.
        // Jedno i drugie znaczy „spróbuj później", nie „to jest złe".
        kolejka = poNieudanej(kolejka, wpis.id, Date.now());
        return {
          kolejka,
          wyslane,
          komunikat: wyslane > 0 ? `Wysłano ${wyslane}, reszta czeka.` : null,
        };
      }

      // Serwer odpowiedział błędem trwałym (400 — zła wartość). Ponawianie
      // nic nie zmieni, ale ciche skasowanie byłoby utratą danych, które
      // użytkownik wpisał świadomie. Zostaje z komunikatem i czeka na decyzję.
      kolejka = oznaczOdrzucony(
        kolejka,
        wpis.id,
        err instanceof ApiError ? err.message : 'Serwer odrzucił ten wpis.'
      );
    }
  }

  return {
    kolejka,
    wyslane,
    komunikat: wyslane > 0 ? `Wysłano ${wyslane} ${wyslane === 1 ? 'wpis' : 'wpisy'} z kolejki.` : null,
  };
}

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
/**
 * `SafeAreaProvider` musi opakowywać CAŁĄ aplikację.
 *
 * Bez niego `useSafeAreaInsets` w pasku sekcji zwraca same zera i wracamy
 * dokładnie do problemu, który ta paczka miała naprawić — tyle że po cichu,
 * bo zera to poprawna liczba, tylko nieprawdziwa.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <Aplikacja />
    </SafeAreaProvider>
  );
}

function Aplikacja() {
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
  const [ocenianieOferty, setOcenianieOferty] = useState(false);
  const [potwierdzenie, setPotwierdzenie] = useState<string | null>(null);
  /**
   * Która sekcja jest na wierzchu.
   *
   * Stan danych jest WSPÓLNY dla wszystkich trzech — przełączenie zakładki nic
   * nie pobiera na nowo i nie gubi zaznaczenia w kalendarzu. To celowe: dzień
   * wybrany w kalendarzu filtruje też listę ofert, więc obie sekcje mówią
   * o tym samym.
   */
  const [sekcja, setSekcja] = useState<Sekcja>('kalendarz');

  /**
   * Górny margines też z systemu, nie z oka.
   *
   * `paddingTop: 52` było zgadywaniem pod jeden telefon. Przy wyższym pasku
   * stanu nagłówek wchodził pod zegarek, przy niższym zostawała dziura.
   */
  const insets = useSafeAreaInsets();

  /** Niewysłane zapisy. Ładowane z dysku raz, przy starcie. */
  const [kolejka, setKolejka] = useState<WpisKolejki[]>([]);
  const [wysylamKolejke, setWysylamKolejke] = useState(false);
  /** Który cel jest właśnie ustawiany; `null` = modal zamknięty. */
  const [celDoUstawienia, setCelDoUstawienia] = useState<'MONTHLY' | 'WEEKLY' | null>(null);
  /**
   * Ostatnie zaznaczenie zdjęte przyciskiem „Cały miesiąc" w ofertach.
   *
   * Bez tego „Cały miesiąc" była drogą w jedną stronę: zaznaczenie znikało
   * razem z paskiem, więc nie było czego dotknąć, żeby wrócić do dnia,
   * na który się patrzyło.
   */
  const [poprzednieZawezenie, setPoprzednieZawezenie] = useState<Zaznaczenie | null>(null);

  /**
   * Zaznaczenie zapamiętane OSOBNO DLA KAŻDEGO MIESIĄCA, kluczem `RRRR-MM`.
   *
   * Przechodząc na inny miesiąc chcemy zobaczyć jego podsumowanie, a nie
   * przypadkowy dzień o tym samym numerze. Ale wracając tam, gdzie się już
   * było, chcemy zastać to, co się oglądało. Jedno wspólne zaznaczenie nie
   * potrafi obu naraz — stąd mapa.
   *
   * Żyje tylko w pamięci procesu. Po restarcie aplikacji zaczynamy od
   * dzisiejszego dnia i to jest w porządku: to wygoda w obrębie sesji,
   * nie ustawienie do zapamiętania na stałe.
   */
  const [pamiecMiesiecy, setPamiecMiesiecy] = useState<Record<string, Zaznaczenie | null>>({});
  /** Kalendarz otwierany z sekcji ofert — żeby nie trzeba było wracać do zakładki. */
  const [kalendarzOfert, setKalendarzOfert] = useState(false);
  /** Tydzień pracy — ustawienie lokalne, wpływa tylko na rozłożenie celu. */
  const [tydzien, setTydzien] = useState<TydzienPracy>(PUSTY_TYDZIEN);
  const [ustawienia, setUstawienia] = useState<Ustawienia>(USTAWIENIA_DOMYSLNE);
  const [panelUstawien, setPanelUstawien] = useState(false);
  /** Czy aplikacja UWAŻA, że trzyma blokadę ekranu. Patrz `Diagnostyka`. */
  const [blokadaEkranu, setBlokadaEkranu] = useState(false);
  const [przelaczamZmiane, setPrzelaczamZmiane] = useState(false);
  const [edytorTygodnia, setEdytorTygodnia] = useState(false);
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

  /**
   * Kolejka z dysku — RAZ, przy starcie.
   *
   * Od razu odsiewamy wpisy starsze niż 48 h. Telefon leżący tydzień
   * w szufladzie nie ma prawa wysłać po włączeniu napiwku sprzed tygodnia
   * — dane byłyby prawdziwe, ale kurier dawno o nich zapomniał i nie miałby
   * jak ich zweryfikować.
   */
  useEffect(() => {
    void (async () => {
      const zDysku = await wczytajKolejke();
      const { zywe, wygasle } = podzielWygasle(zDysku, Date.now());
      setKolejka(zywe);
      if (wygasle.length > 0) {
        await zapiszKolejke(zywe);
        setPotwierdzenie(
          `Porzucono ${wygasle.length} ${wygasle.length === 1 ? 'wpis starszy' : 'wpisy starsze'} niż 48 h.`
        );
      }
    })();
  }, []);

  /** Każda zmiana kolejki idzie od razu na dysk — inaczej restart ją zjada. */
  const ustawKolejke = useCallback((nowa: WpisKolejki[]) => {
    setKolejka(nowa);
    void zapiszKolejke(nowa).catch(() => {});
  }, []);

  useEffect(() => {
    void (async () => {
      setTydzien(await wczytajTydzien());
    })();
  }, []);

  /**
   * Ustawienia wczytujemy raz, przy starcie.
   *
   * Do czasu wczytania obowiązują domyślne, czyli dotychczasowe zachowanie.
   * Migotnięcie „ekran gaśnie / nie gaśnie" przez ułamek sekundy jest
   * niewidoczne, a alternatywa — wstrzymanie renderowania aplikacji do czasu
   * odczytu preferencji — byłaby wymianą czegoś niewidocznego na coś widocznego.
   */
  useEffect(() => {
    void (async () => {
      setUstawienia(await wczytajUstawienia());
    })();
  }, []);

  /**
   * Zmiana ustawienia działa NATYCHMIAST, zapis leci w tle.
   *
   * Odwrotna kolejność (najpierw dysk, potem stan) dałaby przełącznik, który
   * zwleka. Nieudany zapis oznacza tylko tyle, że po restarcie wróci poprzednia
   * wartość — i nie ma o czym alarmować w trakcie zmiany.
   */
  const zmienUstawienia = useCallback((zmiana: Partial<Ustawienia>) => {
    setUstawienia((poprzednie) => {
      const nowe = { ...poprzednie, ...zmiana };
      void zapiszUstawienia(nowe);
      return nowe;
    });
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

      const biezace: Zaznaczenie | null =
        wybranyDzien !== null
          ? { rodzaj: 'dzien', wartosc: wybranyDzien }
          : wybranyTydzien !== null
            ? { rodzaj: 'tydzien', wartosc: wybranyTydzien }
            : null;

      const nowy = przesunDate(zakresMiesiaca(miesiac).od, kierunek === 1 ? 32 : -1);
      const zapamietane = pamiecMiesiecy[kluczMiesiaca(nowy)] ?? null;

      setPamiecMiesiecy((p) => ({ ...p, [kluczMiesiaca(miesiac)]: biezace }));
      setPotwierdzenie(null);
      setPoprzednieZawezenie(null);
      setWybranyDzien(zapamietane?.rodzaj === 'dzien' ? zapamietane.wartosc : null);
      setWybranyTydzien(zapamietane?.rodzaj === 'tydzien' ? zapamietane.wartosc : null);
      setMiesiac(nowy);
    },
    [miesiac, wybranyDzien, wybranyTydzien, pamiecMiesiecy]
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
    // Kolejki NIE kasujemy przy zmianie tokena — token się zmienia, ale wpisy
    // należą do tego samego kuriera i mają dojechać. Skasowanie ich byłoby
    // utratą danych przy operacji, która o danych w ogóle nie jest.
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
    // Nowy wybór w kalendarzu unieważnia „wróć do" w ofertach — inaczej
    // przycisk odsyłałby do dnia, którego użytkownik dawno nie ogląda.
    setPoprzednieZawezenie(null);
    setWybranyDzien((poprzedni) => (poprzedni === data ? null : data));
  }, []);

  /**
   * Wybór dnia z kalendarza w modalu (sekcja ofert).
   *
   * Różni się od `zaznaczDzien` dwiema rzeczami. Po pierwsze NIE przełącza —
   * dotknięcie dnia, który już jest wybrany, ma go zostawić, a nie odznaczyć;
   * w modalu to byłoby zaskoczenie. Po drugie potrafi przeskoczyć na inny
   * miesiąc: modal pozwala przewijać kalendarz, a bez zmiany `miesiac` lista
   * ofert nadal pokazywałaby zakres, którego nie widać.
   */
  const wybierzDzienZKalendarza = useCallback(
    (data: string) => {
      setPotwierdzenie(null);
      setPoprzednieZawezenie(null);
      setWybranyTydzien(null);
      setWybranyDzien(data);

      if (miesiac !== null && kluczMiesiaca(data) !== kluczMiesiaca(miesiac)) {
        const biezace: Zaznaczenie | null =
          wybranyDzien !== null
            ? { rodzaj: 'dzien', wartosc: wybranyDzien }
            : wybranyTydzien !== null
              ? { rodzaj: 'tydzien', wartosc: wybranyTydzien }
              : null;
        setPamiecMiesiecy((p) => ({ ...p, [kluczMiesiaca(miesiac)]: biezace }));
        setMiesiac(data);
      }
    },
    [miesiac, wybranyDzien, wybranyTydzien]
  );

  const zaznaczTydzien = useCallback((pn: string) => {
    setPotwierdzenie(null);
    setWybranyDzien(null);
    setPoprzednieZawezenie(null);
    setWybranyTydzien((poprzedni) => (poprzedni === pn ? null : pn));
  }, []);

  /**
   * Wysyłka kolejki.
   *
   * Wywoływana po każdym udanym żądaniu (najtańszy dowód, że sieć działa),
   * przy starcie i przy powrocie aplikacji z tła.
   */
  const wyslijKolejke = useCallback(
    async (rowniezGdyOdlozone: boolean) => {
      if (!token || wysylkaWToku) return;
      if (kolejka.length === 0) return;

      const doWyslania = rowniezGdyOdlozone ? ponowWszystkie(kolejka, Date.now()) : kolejka;
      if (nastepny(doWyslania, Date.now()) === null) return;

      wysylkaWToku = true;
      setWysylamKolejke(true);
      try {
        const wynik = await przeslijKolejke(token, doWyslania);
        ustawKolejke(wynik.kolejka);
        if (wynik.komunikat !== null) setPotwierdzenie(wynik.komunikat);
        if (wynik.wyslane > 0) {
          if (miesiac !== null) void pobierzMiesiac(token, miesiac).catch(() => {});
          if (wybranyDzien !== null) {
            getDzien(token, wybranyDzien)
              .then(setDzien)
              .catch(() => {});
          }
          pobierzCele(token);
        }
      } finally {
        wysylkaWToku = false;
        setWysylamKolejke(false);
      }
    },
    [token, kolejka, miesiac, wybranyDzien, ustawKolejke, pobierzMiesiac, pobierzCele]
  );

  /**
   * „Trwa zmiana" — jeden warunek, dwa zastosowania.
   *
   * Któraś ze zmian dnia jest niezamknięta, i to na DZISIAJ. Przeglądanie
   * wpisu sprzed tygodnia nie jest pracą i nie ma prawa włączać ani GPS-a,
   * ani podtrzymywania ekranu.
   *
   * Warunek szuka teraz OTWARTEJ ZMIANY na liście, a nie pary
   * `workFrom != null && workTo == null`. Po wprowadzeniu `work_sessions`
   * tamten warunek dawałby fałsz przy drugiej zmianie dnia: `workTo`
   * pokazuje ostatni zjazd doby, więc po zamknięciu pierwszej zmiany był już
   * ustawiony i druga, trwająca, nie włączyłaby GPS-a.
   */
  /**
   * Godzina wyjazdu trwającej zmiany. `null` = zamknięta, `undefined` = NIE WIADOMO.
   *
   * ⚠️ TE TRZY STANY SĄ ISTOTNE. Wcześniej stało tu wyliczenie wprost
   * z `dzien` — czyli z dnia, na który AKURAT PATRZYSZ. Skutek: dotknięcie
   * daty wstecznej w kalendarzu przy otwartej zmianie robiło z `zmianaTrwa`
   * fałsz i:
   *
   *  - gasło podtrzymywanie ekranu,
   *  - zatrzymywało się śledzenie GPS (od kroku 32 razem z usługą w tle),
   *  - przycisk na pasku zmieniał się w „Start", więc dotknięcie go otwierało
   *    drugą zmianę i serwer odpowiadał 409.
   *
   * Do kroku 32 nikt tego nie zauważył, bo śledzenie na pierwszym planie
   * i tak ginęło przy przełączeniu okna. Usługa w tle ma żyć dalej — więc
   * warunek musi opisywać STAN DZISIEJSZEJ DOBY, a nie stan ekranu.
   *
   * `undefined` jest osobno, bo „nie wiem" nie może znaczyć „zamknięta":
   * przy starcie aplikacji zatrzymałoby to usługę, która poprawnie chodzi.
   */
  const [otwartaOd, setOtwartaOd] = useState<string | null | undefined>(undefined);

  /**
   * Licznik powrotów aplikacji na wierzch.
   *
   * Służy do jednego: wymusza ponowne uzgodnienie powiadomienia i śledzenia.
   * Zwykła zmienna by nie wystarczyła — efekt reaguje na zależności, a te
   * muszą się REALNIE zmienić, żeby przebiegł drugi raz.
   */
  const [przebudzenia, setPrzebudzenia] = useState(0);

  /** Każda odpowiedź dotycząca DZISIAJ aktualizuje stan zmiany. Inne dni ignorujemy. */
  useEffect(() => {
    if (dzien === null || dzisiaj === null || dzien.date !== dzisiaj) return;
    setOtwartaOd(dzien.sesje.find((sz) => sz.do === null)?.od ?? null);
  }, [dzien, dzisiaj]);

  /**
   * Jednorazowe ustalenie stanu przy starcie.
   *
   * Bez tego aplikacja otwarta z zaznaczonym dniem wstecznym nie wie nic
   * o dzisiejszej dobie — a to właśnie ta wiedza decyduje o zatrzymaniu
   * usługi w tle. Jedno dodatkowe żądanie na uruchomienie.
   */
  useEffect(() => {
    if (stan !== 'gotowe' || !token || dzisiaj === null || otwartaOd !== undefined) return;
    getDzien(token, dzisiaj)
      .then((d) => setOtwartaOd(d.sesje.find((sz) => sz.do === null)?.od ?? null))
      .catch(() => {
        /* nie wiemy — zostaje `undefined`, czyli nic nie zatrzymujemy */
      });
  }, [stan, token, dzisiaj, otwartaOd]);

  const zmianaTrwa = otwartaOd != null;


  /**
   * Sprzątanie po poprzedniej sesji — JEDEN RAZ, przy starcie.
   *
   * DLACZEGO TO ISTNIEJE (zgłoszone z terenu 19.08.2026):
   * „ekran świeci się cały czas, niezależnie od przełącznika".
   *
   * `activateKeepAwakeAsync` ustawia flagę na oknie aplikacji po stronie
   * Androida. Wersja z kroku 26 miała wyścig i potrafiła tę flagę zostawić
   * założoną. Aktualizacja OTA **przeładowuje JavaScript, ale nie ubija
   * procesu** — więc flaga z poprzedniej sesji zostaje, a nowy kod nic o niej
   * nie wie i nie ma jak jej zdjąć.
   *
   * To samo dotyczy każdego przyszłego przeładowania: `expo-updates` wymienia
   * kod pod działającym oknem. Zwolnienie na starcie jest tanie i zamyka całą
   * klasę takich sytuacji, nie tylko tę jedną.
   *
   * Kolejność ma znaczenie: ten efekt jest zadeklarowany PRZED efektem
   * zakładającym blokadę, więc przy pierwszym renderowaniu najpierw zwalnia,
   * a dopiero potem tamten zakłada, jeśli ma powód.
   */
  useEffect(() => {
    deactivateKeepAwake('ZMIANA');
    setBlokadaEkranu(false);
  }, []);

  /**
   * Ekran nie gaśnie, dopóki trwa zmiana.
   *
   * Telefon w uchwycie na kierownicy, w rękawicach — wybudzanie go przy każdym
   * spojrzeniu jest kosztem, którego nie widać w żadnym logu, a odczuwa się
   * go co kurs.
   *
   * Znacznik `ZMIANA` jest istotny: `deactivateKeepAwake` bez niego zdejmuje
   * blokadę załozoną przez KOGOKOLWIEK, więc dwa niezależne miejsca w kodzie
   * wyłączałyby się nawzajem. Dziś jesteśmy tu sami, ale to się zmienia cicho.
   *
   * ⚠️ WYŚCIG, KTÓRY TU BYŁ I ZOSTAŁ ZGŁOSZONY Z TERENU.
   *
   * Pierwsza wersja robiła `void activateKeepAwakeAsync(...)` i zwracała
   * synchroniczne sprzątanie. Gdy zmiana kończyła się szybko — na przykład
   * przez skasowanie godzin — kolejność wychodziła odwrotna do zamierzonej:
   * najpierw WYŁĄCZ, potem (po rozwiązaniu obietnicy) WŁĄCZ. Blokada
   * zostawała założona już po sprzątaniu i nie miał jej kto zdjąć — ekran
   * nie gasł do restartu aplikacji.
   *
   * Poprawka: flaga `anulowane`. Jeśli sprzątanie zdążyło pierwsze, blokada
   * jest zdejmowana natychmiast po tym, jak faktycznie powstanie.
   */
  useEffect(() => {
    if (!zmianaTrwa || !ustawienia.ekranNieGasnie) return;

    let anulowane = false;

    void activateKeepAwakeAsync('ZMIANA').then(
      () => {
        if (anulowane) {
          deactivateKeepAwake('ZMIANA');
          return;
        }
        setBlokadaEkranu(true);
      },
      () => {
        /* Brak podtrzymania ekranu nie jest powodem do przerywania pracy. */
      }
    );

    return () => {
      anulowane = true;
      deactivateKeepAwake('ZMIANA');
      setBlokadaEkranu(false);
    };
  }, [zmianaTrwa, ustawienia.ekranNieGasnie]);

  /**
   * Pozycja kuriera — wysyłana, dopóki aplikacja jest na wierzchu i trwa zmiana.
   *
   * PO CO: bot liczy dojazd do restauracji od ostatniej znanej pozycji. Do tej
   * pory była nią ręcznie przypięta pinezka w Telegramie, często sprzed
   * kilkunastu minut — i to jest jedna z dwóch przyczyn feralnej oceny oferty
   * opisanej w §8f (7,56 km zamiast 3,37 km, 1,91 zł/km zamiast 2,81).
   *
   * WARUNEK „TRWA ZMIANA": `workFrom` ustawione, `workTo` puste, i to na
   * DZISIAJ. Poza zmianą aplikacja nie dotyka GPS-a w ogóle — nie ma po co,
   * a bateria jest u kuriera zasobem krytycznym.
   *
   * NAJPIERW TŁO, PIERWSZY PLAN JAKO ZAPAS. `uruchomSledzenieTla()` zwraca
   * `false`, gdy modułu nie ma w APK albo gdy nie dostaliśmy zgody „zawsze" —
   * i dopiero wtedy wchodzi stary `sledzPozycje`. Kurier bez zgody na tło ma
   * mieć gorszą pozycję, a nie żadnej.
   *
   * Błędy wysyłki są POŁYKANE świadomie i jest to jedyne takie miejsce
   * w aplikacji. Pozycja to dane odtwarzalne — za dwadzieścia sekund będzie
   * następna. Pokazywanie „brak połączenia" co dwadzieścia sekund zasłoniłoby
   * komunikaty, które naprawdę wymagają reakcji.
   */
  useEffect(() => {
    if (stan !== 'gotowe' || !token || !zmianaTrwa || !ustawienia.wysylajPozycje) return;

    let zatrzymane = false;
    let zatrzymaj: (() => void) | null = null;

    void (async () => {
      if (await uruchomSledzenieTla(ustawienia.wysokaDokladnosc)) {
        /**
         * Nasz wpis w pasku schodzi DOPIERO TERAZ, gdy usługa naprawdę ruszyła
         * i wystawiła własny („Zmiana trwa — Wysyłam pozycję…").
         *
         * TU BYŁ BŁĄD zgłoszony z telefonu: powiadomienie twierdziło „GPS nie
         * wysyła pozycji", mimo zgody „zawsze" i działającego śledzenia.
         * Przyczyną był WYŚCIG DWÓCH EFEKTÓW. Ten uruchamia śledzenie, a efekt
         * uzgadniający pyta `hasStartedLocationUpdatesAsync` — i pyta w chwili,
         * gdy tutaj trwa jeszcze pytanie o zgodę. Dostaje „nie chodzi",
         * zakłada wpis z takim tekstem i nigdy go nie poprawia, bo nic w jego
         * zależnościach się już nie zmienia.
         *
         * Zdjęcie wpisu PO udanym starcie rozstrzyga to bez zgadywania:
         * kolejność jest wymuszona, a nie założona.
         */
        await schowajPowiadomienieZmiany();

        // Zadanie w tle żyje własnym życiem i NIE jest sprzątane przez
        // `return` tego efektu — ma przeżyć zamknięcie ekranu. Zatrzymuje je
        // osobny efekt uzgadniający, niżej.
        return;
      }

      /**
       * Tło się nie udało — wpis ma o tym powiedzieć.
       *
       * Efekt uzgadniający mógł go założyć wcześniej albo nie (zależy, który
       * wystartował pierwszy). Wołamy więc wprost: stały identyfikator sprawia,
       * że to podmiana, a nie drugie powiadomienie.
       */
      await zapewnijPowiadomienieZmiany(otwartaOd);

      if (!(await czyJestZgoda())) {
        const zgoda = await zapytajOZgode();
        if (zgoda !== 'przyznana') return;
      }
      if (zatrzymane) return;

      zatrzymaj = await sledzPozycje((odczyt) => {
        void postLokalizacja(token, odczyt).catch(() => {
          /* patrz komentarz wyżej */
        });
      }, ustawienia.wysokaDokladnosc);

      if (zatrzymane) zatrzymaj();
    })();

    return () => {
      zatrzymane = true;
      zatrzymaj?.();
    };
  }, [stan, token, zmianaTrwa, otwartaOd, ustawienia.wysylajPozycje, ustawienia.wysokaDokladnosc]);

  /**
   * Uzgodnienie stanu: śledzenie i powiadomienie kontra rzeczywistość.
   *
   * OSOBNY EFEKT, bo śledzenie w tle celowo nie jest sprzątane przez `return`
   * tamtego. Tamten efekt uruchamia; ten pilnuje, żeby to, co zastaliśmy, było
   * zgodne z tym, jak być powinno.
   *
   * Bez tego zostaje SIEROTA: ubijasz aplikację z otwartą zmianą, zamykasz
   * zmianę w Telegramie, odpalasz aplikację — a usługa pierwszoplanowa chodzi
   * dalej, bo nikt jej nie kazał przestać. Druga zapora, na wypadek gdybyś
   * aplikacji w ogóle nie otworzył, siedzi w samym zadaniu (`czyOsierocone`).
   *
   * DZIAŁA TEŻ W DRUGĄ STRONĘ — i to jest zmiana z P24. Powiadomienie miało
   * wisieć „dopóki trwa zmiana", a wisiało tylko dopóty, dopóki nic go nie
   * zdjęło. Padnie usługa GPS (cofnięta zgoda, oszczędzanie baterii, system
   * ubija usługę), zniknie razem z nią wpis w pasku — i przy trwającej zmianie
   * nie ma ŻADNEGO powiadomienia. `pokazPowiadomienieZmiany` jest tu
   * wywoływane bezwarunkowo przy trwającej zmianie właśnie po to: samo
   * sprawdza, czy jest co odtwarzać.
   *
   * Stąd `przebudzenia` w zależnościach: każdy powrót aplikacji na wierzch
   * jest okazją do sprawdzenia, czy pasek nadal mówi prawdę.
   */
  useEffect(() => {
    // `undefined` = nie wiemy, jak jest. Zatrzymywanie czegokolwiek na tej
    // podstawie byłoby zgadywaniem, a stawką jest usługa, która poprawnie chodzi.
    if (stan !== 'gotowe' || otwartaOd === undefined) return;

    void (async () => {
      const decyzja = decyzjaSledzenia({
        zmianaTrwa,
        wysylajPozycje: ustawienia.wysylajPozycje,
        zadanieChodzi: await czySledzenieChodzi(),
      });
      if (decyzja === 'stop') await zatrzymajSledzenieTla();

      /**
       * Powiadomienie idzie ZA decyzją o śledzeniu, nie przed nią — inaczej
       * przy zamykaniu zmiany zakładalibyśmy wpis, który linijkę wyżej ma
       * właśnie zniknąć razem z usługą.
       */
      if (zmianaTrwa) {
        await zapewnijPowiadomienieZmiany(otwartaOd);
      } else {
        await schowajPowiadomienieZmiany();
      }
    })();
  }, [stan, zmianaTrwa, otwartaOd, ustawienia.wysylajPozycje, przebudzenia]);

  /**
   * Powrót z tła to najlepszy moment na ponowienie.
   *
   * `AppState` jest w rdzeniu React Native — bez `@react-native-community/netinfo`,
   * który jest modułem natywnym i odciąłby aktualizacje OTA. Jego jedyną
   * zaletą byłoby wcześniejsze wykrycie sieci, a to nie jest warte buildu.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nowyStan: string) => {
      if (nowyStan !== 'active') return;
      void wyslijKolejke(true);
      // Przy okazji: sprawdzamy, czy powiadomienie o zmianie nadal wisi
      // i czy śledzenie nadal chodzi. Powody w efekcie uzgadniającym.
      setPrzebudzenia((n) => n + 1);
    });
    return () => sub.remove();
  }, [wyslijKolejke]);

  /**
   * Ponawianie kolejki przy OTWARTEJ aplikacji.
   *
   * Luka, którą to zamyka: dotychczas kolejka próbowała wysłać tylko przy
   * starcie i przy powrocie z tła. Gdy trzymasz aplikację otwartą, a sieć
   * wróci — nikt nie ponawiał i wpis czekał do następnego przełączenia okna.
   *
   * Celowo BEZ `expo-network`. Moduł ma otwarte zgłoszenia o niepoprawnym
   * raportowaniu stanu po rozłączeniu i ponownym połączeniu; fałszywe
   * „jest sieć" biłoby w mur, fałszywe „nie ma" nie wysłałoby nic. Odstęp
   * czasu niczego nie zakłada i nie potrafi skłamać.
   *
   * Referencja zamiast zależności: `wyslijKolejke` zmienia tożsamość przy
   * każdej zmianie kolejki, więc trzymanie jej w zależnościach kasowałoby
   * i zakładało interwał w kółko.
   */
  const wyslijRef = useRef(wyslijKolejke);
  useEffect(() => {
    wyslijRef.current = wyslijKolejke;
  }, [wyslijKolejke]);

  useEffect(() => {
    if (stan !== 'gotowe' || !token || kolejka.length === 0) return;

    const id = setInterval(() => {
      void wyslijRef.current(true);
    }, PONOWIENIE_KOLEJKI_MS);

    return () => clearInterval(id);
  }, [stan, token, kolejka.length]);

  /** Próba wysyłki przy starcie — gdy tylko wiadomo, że jest token i kolejka. */
  useEffect(() => {
    if (stan !== 'gotowe' || !token || kolejka.length === 0) return;
    void wyslijKolejke(false);
    // Celowo bez `wyslijKolejke` w zależnościach: ta funkcja zmienia się przy
    // każdej zmianie kolejki, a to zrobiłoby z tego pętlę wysyłkową.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stan, token, kolejka.length]);

  /** Dodanie wpisu do kolejki — wywoływane przez formularz przy braku sieci. */
  const doKolejki = useCallback(
    (wpis: {
      endpoint: EndpointKolejki;
      cialo: Record<string, unknown>;
      opis: string;
      data: string | null;
      id: string;
    }): string | null => {
      const wynik = dodajDoKolejki(kolejka, wpis, Date.now());
      if (!wynik.ok) {
        setBlad(wynik.powod);
        return null;
      }
      ustawKolejke(wynik.kolejka);
      setBlad(null);
      return `Brak połączenia — „${wpis.opis}" czeka w kolejce.`;
    },
    [kolejka, ustawKolejke]
  );

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
      // Udane żądanie to najtańszy dowód, że sieć wróciła.
      void wyslijKolejke(true);
    },
    [token, miesiac, dzisiaj, pobierzMiesiac, pobierzCele, pobierzOdniesienie, wyslijKolejke]
  );

  /**
   * Start i koniec zmiany jednym dotknięciem.
   *
   * Godzinę podstawia SERWER. Wysyłamy słowo `'TERAZ'`, a nie odczyt
   * `new Date()` z telefonu — bo zegar telefonu bywa przestawiony, strefa
   * bywa zła, a §8a mówi, że o czasie decyduje serwer. Do kroku 30 leciała
   * stąd godzina lokalna; to był świadomy dług i tu się kończy.
   *
   * Przycisk NIE jest już nigdy wyszarzony: doba może mieć wiele zmian,
   * więc drugi start nie ma czego nadpisać.
   */
  const przelaczZmiane = useCallback(async () => {
    if (!token || przelaczamZmiane) return;

    /**
     * Pytanie przy bardzo krótkiej zmianie.
     *
     * Serwer od 20.08 zapisuje zmianę dowolnej długości, łącznie z zerową —
     * bo wyjazd i natychmiastowy powrót to prawdziwe zdarzenie, a kurier
     * zostawał wcześniej z otwartą zmianą, której nie dało się zamknąć.
     *
     * Skoro zakazu nie ma, zostaje jedyne realne ryzyko: dwa dotknięcia
     * przycisku pod rząd, w rękawicy, przy motocyklu. Stąd pytanie zamiast
     * zakazu — decyzja wraca do człowieka, a dane nie są niczyim zakładnikiem.
     *
     * Liczone z zegara telefonu i to wystarcza: godzinę zjazdu wyznacza
     * serwer (`'TERAZ'`), a ta liczba służy wyłącznie do zadania pytania.
     */
    if (zmianaTrwa && otwartaOd) {
      const teraz = new Date();
      const minut = minutTrwania(
        otwartaOd,
        `${String(teraz.getHours()).padStart(2, '0')}:${String(teraz.getMinutes()).padStart(2, '0')}`
      );

      if (minut !== null && minut < 15) {
        const potwierdzone = await new Promise<boolean>((odpowiedz) => {
          Alert.alert(
            'Zamknąć zmianę?',
            minut === 0
              ? `Zmiana od ${otwartaOd} trwa niecałą minutę.`
              : `Zmiana od ${otwartaOd} trwa dopiero ${minut} min.`,
            [
              { text: 'Wróć', style: 'cancel', onPress: () => odpowiedz(false) },
              { text: 'Zamknij zmianę', onPress: () => odpowiedz(true) },
            ],
            { onDismiss: () => odpowiedz(false) }
          );
        });
        if (!potwierdzone) return;
      }
    }

    setPrzelaczamZmiane(true);
    setBlad(null);
    try {
      // Zmiana trwa → zamykamy (`do`). Nie trwa → otwieramy (`od`).
      const wynik = zmianaTrwa
        ? await postZmiana(token, { do: 'TERAZ' })
        : await postZmiana(token, { od: 'TERAZ' });

      const otwarta = wynik.dzien.sesje.find((sz) => sz.do === null);
      const ostatnia = wynik.dzien.sesje.at(-1);

      poZmianie(
        wynik.dzien,
        wynik.ostrzezenie ??
          (zmianaTrwa
            ? `Koniec zmiany ${ostatnia?.do ?? ''}.`.trim()
            : `Zmiana od ${otwarta?.od ?? ''}.`.trim())
      );
    } catch (err) {
      // Zmiana NIE trafia do kolejki offline. `TERAZ` wysłane cztery godziny
      // później opisywałoby inny moment niż ten, w którym kliknąłeś — a to
      // wprost psuje stawkę zł/h (§8d). Lepsza odmowa niż zmyślona godzina.
      //
      // 409 znaczy „masz niezamkniętą zmianę", zwykle z poprzedniego dnia.
      // To nie jest awaria i komunikat serwera mówi wprost, co zrobić.
      setBlad(
        err instanceof ApiError
          ? err.message
          : 'Nie udało się zapisać zmiany. Spróbuj z formularza.'
      );
    } finally {
      setPrzelaczamZmiane(false);
    }
  }, [token, przelaczamZmiane, zmianaTrwa, otwartaOd, poZmianie]);

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

  /** Dni miesiąca, w których jest choć jedna oceniona oferta — pod kropki w kalendarzu. */
  const dniZOfertami = new Set(oferty.map((o) => o.date));

  /** Opis zawężenia listy ofert; `null` = cały miesiąc. */
  const zawezenie =
    wybranyDzien !== null
      ? dataPoPolsku(wybranyDzien)
      : wybranyTydzien !== null
        ? `tydzień ${numerTygodniaISO(wybranyTydzien)} · ${etykietaTygodnia(wybranyTydzien)}`
        : null;

  /** Dzień, którego dotyczy kasowanie: zaznaczony albo dzisiejszy. */
  const dzienDoKasowania = wybranyDzien ?? dzisiaj;

  return (
    <View style={s.tlo}>
      <StatusBar style="light" />

      {sekcja === 'cele' || sekcja === 'portfel' ? (
        <View style={[s.gora, { paddingTop: insets.top + 10 }]}>
          <View style={s.naglowekBlok}>
            <Text style={s.naglowekTekst} numberOfLines={1}>
              {sekcja === 'cele' ? 'Cele zarobkowe' : 'Portfel Glovo'}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[s.gora, { paddingTop: insets.top + 10 }]}>
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
      )}

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

        {/* Widoczny w KAŻDEJ sekcji — niewysłany wpis to nie jest sprawa
            jednej zakładki i nie ma prawa zniknąć z oczu po przełączeniu. */}
        <KolejkaPasek
          kolejka={kolejka}
          wysylam={wysylamKolejke}
          onWyslij={() => {
            setPotwierdzenie(null);
            void wyslijKolejke(true);
          }}
          onUsun={(id) => ustawKolejke(usunRecznie(kolejka, id))}
        />

        {/* ================= KALENDARZ: wpisy, dzień, tydzień, miesiąc ============ */}
        {sekcja === 'kalendarz' ? (
          <>
            {miesiac !== null ? (
              <KalendarzMiesiaca
                zakres={zakresMiesiaca(miesiac)}
                dni={dniMiesiaca}
                wybrany={wybranyDzien}
                wybranyTydzien={wybranyTydzien}
                dniZOfertami={dniZOfertami}
                onNastepnyMiesiac={wPrzodZablokowany ? null : () => przesunMiesiac(1)}
                onPoprzedniMiesiac={() => przesunMiesiac(-1)}
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
          </>
        ) : null}

        {/* ================= OFERTY ============================================== */}
        {sekcja === 'oferty' ? (
          <>
            {/* Belka zakresu — bez wracania do kalendarza. Dotknięcie otwiera
                wybór dnia, „Cały miesiąc" zdejmuje zawężenie, a gdy już się
                je zdjęło, w tym samym miejscu pojawia się powrót. */}
            <View style={s.filtr}>
              <View style={s.filtrGlowny}>
                <Text style={s.filtrTekst} numberOfLines={1}>
                  {zawezenie === null ? 'Cały miesiąc' : zawezenie}
                </Text>
                <Text style={s.filtrPodpowiedz}>
                  {ofertyWidoku.length === 1
                    ? '1 oferta w tym zakresie'
                    : `${ofertyWidoku.length} ofert w tym zakresie`}
                </Text>
              </View>

              {zawezenie !== null ? (
                <Pressable
                  onPress={() => {
                    setPoprzednieZawezenie(
                      wybranyDzien !== null
                        ? { rodzaj: 'dzien', wartosc: wybranyDzien }
                        : wybranyTydzien !== null
                          ? { rodzaj: 'tydzien', wartosc: wybranyTydzien }
                          : null
                    );
                    setWybranyDzien(null);
                    setWybranyTydzien(null);
                  }}
                >
                  <Text style={s.filtrLink}>Cały miesiąc</Text>
                </Pressable>
              ) : poprzednieZawezenie !== null ? (
                <Pressable
                  onPress={() => {
                    if (poprzednieZawezenie.rodzaj === 'dzien') {
                      setWybranyDzien(poprzednieZawezenie.wartosc);
                      setWybranyTydzien(null);
                    } else {
                      setWybranyTydzien(poprzednieZawezenie.wartosc);
                      setWybranyDzien(null);
                    }
                    setPoprzednieZawezenie(null);
                  }}
                >
                  <Text style={s.filtrLink}>
                    ‹{' '}
                    {poprzednieZawezenie.rodzaj === 'dzien'
                      ? krotkaData(poprzednieZawezenie.wartosc)
                      : `tyg. ${numerTygodniaISO(poprzednieZawezenie.wartosc)}`}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <Pressable
              style={({ pressed }) => [s.wybierzDzien, pressed && s.wcisniety]}
              disabled={dzisiaj === null}
              onPress={() => setKalendarzOfert(true)}
            >
              <Text style={s.wybierzDzienIkona}>📅</Text>
              <Text style={s.wybierzDzienTekst}>
                {wybranyDzien === null ? 'Wybierz dzień' : `Zmień dzień · ${krotkaData(wybranyDzien)}`}
              </Text>
            </Pressable>

            {/* Ocena oferty NA MIEJSCU, bez przechodzenia do Telegrama.
                Przycisk stoi nad listą, bo to czynność robiona w ruchu, przy
                ofercie, która za chwilę zniknie — a lista jest do oglądania
                później. */}
            <Pressable style={s.ocenPrzycisk} onPress={() => setOcenianieOferty(true)}>
              <Text style={s.ocenPrzyciskTekst}>🛵  Oceń ofertę ze zrzutu</Text>
            </Pressable>

            <KartaOfert
              oferty={ofertyWidoku}
              etykieta={etykietaOfert}
              minStawka={info?.minStawkaNettoKm ?? null}
            />

            <Text style={s.podpowiedz}>
              Zakres jest wspólny z kalendarzem — zaznaczenie zrobione tutaj widać też tam.
              Strzałki u góry przesuwają miesiąc.
            </Text>
          </>
        ) : null}

        {/* ================= CELE I PORTFEL ====================================== */}
        {sekcja === 'cele' ? (
          <>
            <KartaCelu
              postep={cele?.miesiac ?? null}
              etykieta="CEL MIESIĘCZNY"
              okres="MONTHLY"
              tydzien={tydzien}
              dzisiaj={dzisiaj}
              odniesienie={odniesienie}
              onUstaw={(o, kwota) => {
                setKwotaCelu(kwota);
                setCelDoUstawienia(o);
              }}
            />
            <KartaCelu
              postep={cele?.tydzien ?? null}
              etykieta="CEL TYGODNIOWY"
              okres="WEEKLY"
              tydzien={tydzien}
              dzisiaj={dzisiaj}
              odniesienie={odniesienie}
              onUstaw={(o, kwota) => {
                setKwotaCelu(kwota);
                setCelDoUstawienia(o);
              }}
            />

            <Pressable style={s.kartaTygodnia} onPress={() => setEdytorTygodnia(true)}>
              <Text style={s.naglowekMaly}>TYDZIEŃ PRACY</Text>
              {czyUstawiony(tydzien) ? (
                <>
                  <Text style={s.tydzienGlowny}>{opisDni(tydzien)}</Text>
                  <Text style={s.tydzienPodpis}>
                    {sumaTygodnia(tydzien).toFixed(1).replace('.', ',')} h w tygodniu · dotknij,
                    żeby zmienić
                  </Text>
                </>
              ) : (
                <>
                  <Text style={s.tydzienGlowny}>Nie ustawiono</Text>
                  <Text style={s.tydzienPodpis}>
                    Ustaw dni i godziny, w które zwykle jeździsz — cel rozłoży się na nie zamiast
                    na wszystkie dni kalendarza.
                  </Text>
                </>
              )}
            </Pressable>

            <Text style={s.podpowiedz}>
              Postęp celu serwer liczy zawsze dla BIEŻĄCEGO okresu — przewijanie kalendarza
              do innego miesiąca go nie zmienia.
            </Text>
          </>
        ) : null}

        {/* ================= WYKRESY ============================================= */}
        {sekcja === 'wykresy' && miesiac !== null ? (
          <>
            <WykresyDni
              dni={dniMiesiaca}
              zakres={zakresMiesiaca(miesiac)}
              cel={cele?.miesiac ?? null}
            />
            {/* Oferty CAŁEGO miesiąca, nie `ofertyWidoku`. Rozkład stawek
                z jednego dnia to kilkanaście słupków po jednym. */}
            <WykresyOfert oferty={oferty} minStawka={info?.minStawkaNettoKm ?? null} />
            <WykresyProfilu dni={dniMiesiaca} zakres={zakresMiesiaca(miesiac)} />
          </>
        ) : null}

        {/* ================= PORTFEL ============================================= */}
        {sekcja === 'portfel' ? (
          <>
            {saldo ? (
              <KartaSalda saldo={saldo} />
            ) : (
              <View style={s.pustaSekcja}>
                <Text style={s.pustaSekcjaTekst}>Nie udało się pobrać salda.</Text>
                <Text style={s.podpowiedz}>Pociągnij w dół, żeby spróbować ponownie.</Text>
              </View>
            )}

            <Text style={s.podpowiedz}>
              Saldo to suma wszystkich transakcji Portfela ze znakiem. Transakcje trafiają do
              bazy ze zrzutów ekranu wysłanych do bota — aplikacja ich na razie nie dodaje.
            </Text>

            <Pressable style={s.linkTekstowy} onPress={rozlacz}>
              <Text style={s.linkTekstowyTekst}>Zmień token</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>

      <PasekSekcji
        aktywna={sekcja}
        onZmien={(nowa) => {
          setPotwierdzenie(null);
          setSekcja(nowa);
        }}
        onWiecej={() => {
          setPotwierdzenie(null);
          setPanelUstawien(true);
        }}
        zmianaTrwa={zmianaTrwa}
        onZmiana={() => void przelaczZmiane()}
        zajety={przelaczamZmiane}
      />

      <PanelUstawien
        widoczny={panelUstawien}
        ustawienia={ustawienia}
        onZmien={zmienUstawienia}
        onZamknij={() => setPanelUstawien(false)}
        onPortfel={() => {
          setPanelUstawien(false);
          setSekcja('portfel');
        }}
        onWykresy={() => {
          setPanelUstawien(false);
          setSekcja('wykresy');
        }}
        blokadaEkranu={blokadaEkranu}
        onZwolnijBlokade={() => {
          deactivateKeepAwake('ZMIANA');
          setBlokadaEkranu(false);
        }}
      />

      {token ? (
        <>
          <DodajWpis
            widoczny={dodawanie}
            token={token}
            dzisiaj={dzisiaj}
            domyslnaData={wybranyDzien}
            dzien={dzien}
            onZamknij={() => setDodawanie(false)}
            onZapisano={(wynik: ZapisOdpowiedz) => {
              // Modal zostaje otwarty — zamyka go dopiero „Gotowe".
              poZmianie(wynik.dzien, wynik.ostrzezenie ?? 'Zapisano.');
            }}
            onDoKolejki={doKolejki}
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

          <OcenOferte
            widoczny={ocenianieOferty}
            token={token}
            onZamknij={() => setOcenianieOferty(false)}
            onOceniono={() => {
              // Oferta wpada do bazy z datą serwera, więc odświeżamy miesiąc —
              // to jedno wywołanie, które i tak niesie listę ofert.
              if (miesiac !== null) void pobierzMiesiac(token, miesiac);
            }}
          />

          {dzisiaj !== null ? (
            <WybierzDate
              widoczny={kalendarzOfert}
              wartosc={wybranyDzien}
              maks={dzisiaj}
              miesiac={miesiac}
              dniZOfertami={dniZOfertami}
              onWybierz={(data) => {
                wybierzDzienZKalendarza(data);
                setKalendarzOfert(false);
              }}
              onZamknij={() => setKalendarzOfert(false)}
            />
          ) : null}

          <EdytorTygodniaPracy
            widoczny={edytorTygodnia}
            wartosc={tydzien}
            onZapisz={(t) => {
              setTydzien(t);
              void zapiszTydzien(t).catch(() => {});
              setEdytorTygodnia(false);
              setPotwierdzenie(
                czyUstawiony(t) ? 'Zapisano tydzień pracy.' : 'Tydzień pracy wyłączony.'
              );
            }}
            onZamknij={() => setEdytorTygodnia(false)}
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

  // `paddingTop` dokładany z insetów w miejscu użycia — patrz `insets.top`.
  gora: {
    flexDirection: 'row',
    alignItems: 'center',
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

  filtr: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  filtrGlowny: { flex: 1 },
  wybierzDzien: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderColor: C.akcent,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  wybierzDzienIkona: { fontSize: 17 },
  wybierzDzienTekst: { color: C.akcent, fontSize: 15, fontWeight: '700' },
  filtrTekst: { color: C.tekst, fontSize: 13, flexShrink: 1 },
  filtrPodpowiedz: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: 2 },
  filtrLink: { color: C.akcent, fontSize: 13, fontWeight: '600' },

  podpowiedz: { color: C.tekstPrzygaszony, fontSize: 11, lineHeight: 16, paddingHorizontal: 4 },

  // Cel dotykowy z zapasem — to przycisk używany w rękawicy, na postoju,
  // przy ofercie liczonej w sekundach.
  ocenPrzycisk: {
    backgroundColor: C.akcent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ocenPrzyciskTekst: { color: C.tlo, fontSize: 15, fontWeight: '800' },

  kartaTygodnia: {
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  naglowekMaly: {
    color: C.tekstPrzygaszony,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  tydzienGlowny: { color: C.tekst, fontSize: 17, fontWeight: '700', textTransform: 'capitalize' },
  tydzienPodpis: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: 6, lineHeight: 16 },

  pustaSekcja: {
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  pustaSekcjaTekst: { color: C.tekstPrzygaszony, fontSize: 14, marginBottom: 4 },

  linkTekstowy: { alignItems: 'center', paddingVertical: 18, marginTop: 4 },
  linkTekstowyTekst: { color: C.tekstPrzygaszony, fontSize: 13 },
});
