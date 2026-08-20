import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';

import { odczytajAwarie, skasujAwarie, type Awaria } from './awaria';
import { czyTloDostepne, stanTla, type StanTla } from './gpsTlo';
import { C } from './theme';
import type { Ustawienia } from './ustawienia';

/**
 * Panel „Więcej" — piąta pozycja dolnego paska.
 *
 * DLACZEGO NIE SZUFLADA Z HAMBURGEREM. Prawy górny róg to najtrudniej
 * osiągalny punkt ekranu przy obsłudze jedną ręką, a ta aplikacja bywa
 * używana w rękawicy, przy motocyklu. Dolny pasek jest w zasięgu kciuka
 * z definicji — dlatego tam jest. Piąta pozycja nie powiela też sekcji
 * z paska, więc nie powstają dwie drogi do tego samego miejsca.
 *
 * OD 20.08 TO JEST MENU, NIE EKRAN USTAWIEŃ. Wcześniej panel mieszał wejście
 * do Portfela z trzema przełącznikami i diagnostyką — dopóki pozycji było
 * cztery, uchodziło to płazem. Przy dokładanych wykresach lista zrobiłaby się
 * na tyle długa, że przełącznik GPS-a i wejście do wykresów wyglądałyby jak
 * rzeczy tego samego rodzaju, a nie są. Teraz menu ma trzy wejścia,
 * a przełączniki mają własny podekran.
 *
 * PODEKRAN, NIE DRUGI `Modal`. Modal na modalu na Androidzie potrafi mrugnąć
 * przy animacji i gubi przycisk „wstecz". Jeden stan `podekran` w tym samym
 * oknie kosztuje jedno `useState` i nie ma tych wad.
 *
 * `Modal` z rdzenia React Native, bez `@react-navigation` — ten sam powód
 * co w `Nawigacja.tsx`: tamto ciągnie `react-native-screens`, czyli kolejny
 * moduł natywny i całą warstwę nawigacji, której tu nie ma po co mieć.
 */

type Podekran = 'menu' | 'ustawienia';

export function PanelUstawien({
  widoczny,
  ustawienia,
  onZmien,
  onZamknij,
  onPortfel,
  onWykresy,
  blokadaEkranu,
  onZwolnijBlokade,
}: {
  widoczny: boolean;
  ustawienia: Ustawienia;
  onZmien: (zmiana: Partial<Ustawienia>) => void;
  onZamknij: () => void;
  /** Portfel zszedł z dolnego paska w kroku 30 — wejście jest tutaj. */
  onPortfel: () => void;
  /** Wykresy są sekcją jak Portfel: panel się zamyka, ekran się przełącza. */
  onWykresy: () => void;
  /** Czy aplikacja UWAŻA, że trzyma blokadę ekranu. Patrz `Diagnostyka`. */
  blokadaEkranu: boolean;
  onZwolnijBlokade: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [podekran, setPodekran] = useState<Podekran>('menu');

  /**
   * Zamknięcie panelu wraca do menu.
   *
   * Bez tego następne otwarcie „Więcej" ląduje w ustawieniach — bo stan
   * podekranu przeżywa zamknięcie modala. Wyglądałoby to jak przypadkowe
   * wejście nie tam, gdzie się dotknęło.
   */
  useEffect(() => {
    if (!widoczny) setPodekran('menu');
  }, [widoczny]);

  const wUstawieniach = podekran === 'ustawienia';

  return (
    <Modal
      visible={widoczny}
      animationType="slide"
      transparent
      onRequestClose={onZamknij}
      statusBarTranslucent
    >
      <View style={s.tlo}>
        <View style={[s.panel, { paddingBottom: Math.max(16, insets.bottom) }]}>
          <View style={s.gora}>
            {wUstawieniach ? (
              <Pressable
                onPress={() => setPodekran('menu')}
                style={s.zamknij}
                accessibilityRole="button"
                accessibilityLabel="Wróć do menu"
              >
                <Text style={s.zamknijTekst}>‹</Text>
              </Pressable>
            ) : null}

            <Text style={s.tytul}>{wUstawieniach ? 'Ustawienia' : 'Więcej'}</Text>

            <Pressable
              onPress={onZamknij}
              style={s.zamknij}
              accessibilityRole="button"
              accessibilityLabel="Zamknij panel"
            >
              <Text style={s.zamknijTekst}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={s.lista} contentContainerStyle={s.listaWnetrze}>
            {wUstawieniach ? (
              <>
                <Przelacznik
                  tytul="Ekran nie gaśnie na zmianie"
                  opis="Działa tylko przy otwartej zmianie. Poza pracą nic nie robi."
                  wartosc={ustawienia.ekranNieGasnie}
                  onZmien={(v) => onZmien({ ekranNieGasnie: v })}
                />

                <Przelacznik
                  tytul="Wysyłaj pozycję na zmianie"
                  opis={
                    'Bot liczy z niej dojazd do restauracji. Przy zgodzie „zawsze" leci też ' +
                    'przy schowanym telefonie — bez niej tylko przy tej aplikacji na wierzchu.'
                  }
                  wartosc={ustawienia.wysylajPozycje}
                  onZmien={(v) => onZmien({ wysylajPozycje: v })}
                />

                <Przelacznik
                  tytul="Wysoka dokładność GPS"
                  opis="Włączona: prawdziwy GPS, 5–15 m, ale radio pracuje ciągle. Wyłączona: pozycja z sieci, około 100 m — a serwer liczy zaufanie w metrach, więc zjada to jedną trzecią budżetu, zanim ruszysz."
                  wartosc={ustawienia.wysokaDokladnosc}
                  onZmien={(v) => onZmien({ wysokaDokladnosc: v })}
                  wylaczony={!ustawienia.wysylajPozycje}
                />

                <Diagnostyka blokada={blokadaEkranu} onZwolnij={onZwolnijBlokade} widoczny={widoczny} />
              </>
            ) : (
              <>
                <Wejscie
                  ikona="💰"
                  tytul="Portfel Glovo"
                  opis="Saldo i historia transakcji."
                  onPress={onPortfel}
                />

                <Wejscie
                  ikona="📊"
                  tytul="Wykresy"
                  opis="Zarobki, godziny i stawki oglądane miesiącem."
                  onPress={onWykresy}
                />

                <Wejscie
                  ikona="⚙️"
                  tytul="Ustawienia"
                  opis="Ekran, GPS i diagnostyka blokady."
                  onPress={() => setPodekran('ustawienia')}
                />

                {/* Wersja zostaje NA POZIOMIE MENU, nie w ustawieniach.
                    To najczęściej sprawdzana rzecz w całym panelu — służy do
                    odpowiedzi „czy OTA doszło" i jest tak opisana w kompendium.
                    Schowanie jej dwa dotknięcia głębiej wydłużyłoby procedurę,
                    którą wykonuje się po każdym wdrożeniu. */}
                <WersjaAplikacji />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Diagnostyka blokady ekranu.
 *
 * DLACZEGO TO ISTNIEJE. Zgłoszenie z terenu: „ekran świeci się cały czas,
 * niezależnie od przełącznika". Kod ma warunek i zależność na tym przełączniku,
 * więc powinien reagować — a nie reaguje. Dwie hipotezy już upadły (wyścig,
 * flaga zaległa po aktualizacji OTA), więc zamiast wymyślać trzecią, pokazujemy
 * stan wprost.
 *
 * Ten znacznik mówi, co aplikacja **uważa**, że zrobiła. Jeśli pokazuje
 * „zdjęta", a ekran nadal się nie wygasza, to znaczy, że problem leży poza
 * naszym kodem — w systemie albo w module natywnym. To zupełnie inny błąd niż
 * „aplikacja nie zauważyła przełącznika" i szuka się go gdzie indziej.
 *
 * Przycisk zwalnia blokadę bezwarunkowo, także wtedy, gdy stan mówi „zdjęta" —
 * właśnie po to, żeby dało się sprawdzić przypadek rozjazdu.
 */
function Diagnostyka({
  blokada,
  onZwolnij,
  widoczny,
}: {
  blokada: boolean;
  onZwolnij: () => void;
  /** Odświeżamy przy każdym otwarciu panelu — stan tła zmienia się bez nas. */
  widoczny: boolean;
}) {
  const [tlo, setTlo] = useState<StanTla | null>(null);
  const [awaria, setAwaria] = useState<Awaria | null>(null);

  useEffect(() => {
    if (!widoczny) return;
    let aktualne = true;
    void stanTla().then((s) => {
      if (aktualne) setTlo(s);
    });
    void odczytajAwarie().then((a) => {
      if (aktualne) setAwaria(a);
    });
    return () => {
      aktualne = false;
    };
  }, [widoczny]);

  return (
    <View style={s.stopka}>
      <Text style={s.stopkaTytul}>Diagnostyka</Text>
      <View style={s.stopkaWiersz}>
        <Text style={s.stopkaEtykieta}>Blokada ekranu</Text>
        <Text style={[s.stopkaWartosc, { color: blokada ? C.ostrzezenie : C.tekstPrzygaszony }]}>
          {blokada ? 'założona' : 'zdjęta'}
        </Text>
      </View>

      {/* Kolejność wierszy = kolejność sprawdzeń w `uruchomSledzenieTla`.
          Pierwszy wiersz na „nie" wskazuje ogniwo, na którym się urywa. */}
      <Tak etykieta="Moduł zadań w tle" wartosc={tlo?.dostepne} />
      <Tak etykieta="Zadanie zdefiniowane" wartosc={tlo?.zdefiniowane} />
      {/* „NIE" w tym wierszu przed pierwszym udanym startem jest POPRAWNE —
          do trwałego rejestru systemu zadanie trafia dopiero po nim. */}
      <Tak etykieta="W rejestrze systemu" wartosc={tlo?.zarejestrowane} />
      <Tak etykieta={'Zgoda „zawsze"'} wartosc={tlo?.zgodaTla} />
      <Tak etykieta="Śledzenie w tle chodzi" wartosc={tlo?.chodzi} />

      {tlo?.powod != null ? <Text style={s.powod}>Ostatnia odmowa: {tlo.powod}</Text> : null}

      {/* Ostatnia awaria — zapisana przez `pilnujAwarii()` w `index.ts`.
          Po wywaleniu aplikacji komunikat przepada; bez tego zapisu zostaje
          tylko „wywala mnie, chyba w ustawieniach". */}
      {awaria !== null ? (
        <View style={s.awaria}>
          <Text style={s.powod}>
            Ostatnia awaria{awaria.smiertelny ? ' (śmiertelna)' : ''}: {awaria.komunikat}
          </Text>
          <Text style={s.stos}>{awaria.stos}</Text>
          <Pressable
            style={s.przyciskDiag}
            onPress={() => {
              void skasujAwarie();
              setAwaria(null);
            }}
            accessibilityRole="button"
          >
            <Text style={s.przyciskDiagTekst}>Skasuj zapis awarii</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable style={s.przyciskDiag} onPress={onZwolnij} accessibilityRole="button">
        <Text style={s.przyciskDiagTekst}>Zwolnij blokadę ręcznie</Text>
      </Pressable>
    </View>
  );
}

/**
 * Wiersz „tak / nie / —".
 *
 * `undefined` to NIE to samo, co `false`: znaczy „jeszcze nie sprawdziłem".
 * Pokazanie wtedy „nie" byłoby zmyślaniem odpowiedzi — ta sama zasada, co przy
 * `null` na wykresach.
 */
function Tak({ etykieta, wartosc }: { etykieta: string; wartosc: boolean | undefined }) {
  const opis = wartosc === undefined ? '…' : wartosc ? 'tak' : 'NIE';
  const kolor =
    wartosc === undefined ? C.tekstPrzygaszony : wartosc ? C.akcent : C.blad;

  return (
    <View style={s.stopkaWiersz}>
      <Text style={s.stopkaEtykieta}>{etykieta}</Text>
      <Text style={[s.stopkaWartosc, { color: kolor }]}>{opis}</Text>
    </View>
  );
}

/** Pozycja menu prowadząca gdzie indziej. Cel dotykowy na całą szerokość. */
function Wejscie({
  ikona,
  tytul,
  opis,
  onPress,
}: {
  ikona: string;
  tytul: string;
  opis: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={s.wejscie} onPress={onPress} accessibilityRole="button">
      <Text style={s.wejscieIkona}>{ikona}</Text>
      <View style={s.wierszTekst}>
        <Text style={s.wierszTytul}>{tytul}</Text>
        <Text style={s.wierszOpis}>{opis}</Text>
      </View>
      <Text style={s.wejscieStrzalka}>›</Text>
    </Pressable>
  );
}

function Przelacznik({
  tytul,
  opis,
  wartosc,
  onZmien,
  wylaczony = false,
}: {
  tytul: string;
  opis: string;
  wartosc: boolean;
  onZmien: (v: boolean) => void;
  wylaczony?: boolean;
}) {
  return (
    <View style={[s.wiersz, wylaczony ? s.wierszWylaczony : null]}>
      <View style={s.wierszTekst}>
        <Text style={s.wierszTytul}>{tytul}</Text>
        <Text style={s.wierszOpis}>{opis}</Text>
      </View>
      <Switch
        value={wartosc}
        onValueChange={onZmien}
        disabled={wylaczony}
        trackColor={{ false: C.obramowanie, true: C.akcent }}
        thumbColor={C.tekst}
      />
    </View>
  );
}

/**
 * Która wersja JavaScriptu faktycznie siedzi na telefonie.
 *
 * Powstało z realnej potrzeby: kilka razy w trakcie pracy nie wiedzieliśmy,
 * czy aktualizacja OTA doszła, i sprawdzaliśmy to okrężnie — przez logi
 * serwera albo obserwując, czy zmiana jest widoczna. Ten blok rozstrzyga to
 * na miejscu.
 *
 * `isEmbeddedLaunch` mówi rzecz najważniejszą: `tak` znaczy, że działa
 * JavaScript wbudowany w APK, czyli ŻADNA aktualizacja OTA się nie zastosowała.
 */
function WersjaAplikacji() {
  const identyfikator = Updates.updateId ?? null;

  /**
   * Czy moduł zadań w tle jest w TYM APK.
   *
   * `eas update` wysyła wyłącznie JavaScript — modułu natywnego nie wniesie.
   * Bez tego wiersza „GPS w tle nie działa" i „GPS w tle nie ma w tym buildzie"
   * wyglądają identycznie, a naprawia się je zupełnie inaczej: pierwsze kodem,
   * drugie komendą `eas build`.
   */
  const [tlo, setTlo] = useState<boolean | null>(null);
  useEffect(() => {
    let aktualne = true;
    void czyTloDostepne().then((v) => {
      if (aktualne) setTlo(v);
    });
    return () => {
      aktualne = false;
    };
  }, []);

  return (
    <View style={s.stopka}>
      <Text style={s.stopkaTytul}>Wersja</Text>
      <Wiersz etykieta="Aplikacja" wartosc={Updates.runtimeVersion ?? '—'} />
      <Wiersz etykieta="Kanał" wartosc={Updates.channel ?? '—'} />
      <Wiersz
        etykieta="Kod z APK"
        wartosc={Updates.isEmbeddedLaunch ? 'tak — brak OTA' : 'nie — działa OTA'}
      />
      <Wiersz
        etykieta="Aktualizacja"
        wartosc={identyfikator === null ? 'wbudowana' : identyfikator.slice(0, 8)}
      />
      <Wiersz
        etykieta="Zadania w tle"
        wartosc={tlo === null ? '…' : tlo ? 'dostępne' : 'brak w tym APK'}
      />
    </View>
  );
}

function Wiersz({ etykieta, wartosc }: { etykieta: string; wartosc: string }) {
  return (
    <View style={s.stopkaWiersz}>
      <Text style={s.stopkaEtykieta}>{etykieta}</Text>
      <Text style={s.stopkaWartosc} numberOfLines={1}>
        {wartosc}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  tlo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  panel: {
    backgroundColor: C.karta,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: C.obramowanie,
    maxHeight: '86%',
  },
  gora: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
  },
  tytul: { flex: 1, color: C.tekst, fontSize: 20, fontWeight: '700' },
  // 44 dp to najmniejszy cel dotykowy, który da się trafić w rękawicy.
  zamknij: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  zamknijTekst: { color: C.tekstPrzygaszony, fontSize: 22 },
  lista: { flexGrow: 0 },
  listaWnetrze: { paddingHorizontal: 18, paddingBottom: 8 },
  wiersz: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderColor: C.obramowanie,
  },
  wierszWylaczony: { opacity: 0.4 },
  wierszTekst: { flex: 1 },
  wierszTytul: { color: C.tekst, fontSize: 16, fontWeight: '600' },
  wierszOpis: { color: C.tekstPrzygaszony, fontSize: 13, lineHeight: 18, marginTop: 3 },
  wejscie: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  wejscieIkona: { fontSize: 22 },
  wejscieStrzalka: { color: C.tekstPrzygaszony, fontSize: 26 },
  stopka: { marginTop: 18, paddingTop: 12, borderTopWidth: 1, borderColor: C.obramowanie },
  przyciskDiag: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.obramowanie,
    alignItems: 'center',
  },
  przyciskDiagTekst: { color: C.tekst, fontSize: 14 },
  stopkaTytul: { color: C.tekstPrzygaszony, fontSize: 12, letterSpacing: 1, marginBottom: 8 },
  stopkaWiersz: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  stopkaEtykieta: { color: C.tekstPrzygaszony, fontSize: 13 },
  stopkaWartosc: { color: C.tekst, fontSize: 13, maxWidth: '60%' },
  powod: { color: C.blad, fontSize: 12, lineHeight: 17, marginTop: 8 },
  awaria: { marginTop: 6 },
  stos: { color: C.tekstPrzygaszony, fontSize: 10, lineHeight: 14, marginTop: 4 },
});
