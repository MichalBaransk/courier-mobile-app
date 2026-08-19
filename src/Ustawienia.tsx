import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';

import { C } from './theme';
import type { Ustawienia } from './ustawienia';

/**
 * Panel ustawień — piąta pozycja dolnego paska („Więcej").
 *
 * DLACZEGO NIE SZUFLADA Z HAMBURGEREM. Prawy górny róg to najtrudniej
 * osiągalny punkt ekranu przy obsłudze jedną ręką, a ta aplikacja bywa
 * używana w rękawicy, przy motocyklu. Dolny pasek jest w zasięgu kciuka
 * z definicji — dlatego tam jest. Piąta pozycja nie powiela też czterech
 * sekcji, więc nie powstają dwie drogi do tego samego miejsca.
 *
 * `Modal` z rdzenia React Native, bez `@react-navigation` — ten sam powód
 * co w `Nawigacja.tsx`: tamto ciągnie `react-native-screens`, czyli kolejny
 * moduł natywny i całą warstwę nawigacji, której tu nie ma po co mieć.
 */

export function PanelUstawien({
  widoczny,
  ustawienia,
  onZmien,
  onZamknij,
  onPortfel,
  blokadaEkranu,
  onZwolnijBlokade,
}: {
  widoczny: boolean;
  ustawienia: Ustawienia;
  onZmien: (zmiana: Partial<Ustawienia>) => void;
  onZamknij: () => void;
  /** Portfel zszedł z dolnego paska w kroku 30 — wejście jest tutaj. */
  onPortfel: () => void;
  /** Czy aplikacja UWAŻA, że trzyma blokadę ekranu. Patrz `Diagnostyka`. */
  blokadaEkranu: boolean;
  onZwolnijBlokade: () => void;
}) {
  const insets = useSafeAreaInsets();

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
            <Text style={s.tytul}>Ustawienia</Text>
            <Pressable
              onPress={onZamknij}
              style={s.zamknij}
              accessibilityRole="button"
              accessibilityLabel="Zamknij ustawienia"
            >
              <Text style={s.zamknijTekst}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={s.lista} contentContainerStyle={s.listaWnetrze}>
            <Pressable style={s.wejscie} onPress={onPortfel} accessibilityRole="button">
              <Text style={s.wejscieIkona}>💰</Text>
              <View style={s.wierszTekst}>
                <Text style={s.wierszTytul}>Portfel Glovo</Text>
                <Text style={s.wierszOpis}>Saldo i historia transakcji.</Text>
              </View>
              <Text style={s.wejscieStrzalka}>›</Text>
            </Pressable>

            <Przelacznik
              tytul="Ekran nie gaśnie na zmianie"
              opis="Działa tylko przy otwartej zmianie. Poza pracą nic nie robi."
              wartosc={ustawienia.ekranNieGasnie}
              onZmien={(v) => onZmien({ ekranNieGasnie: v })}
            />

            <Przelacznik
              tytul="Wysyłaj pozycję na zmianie"
              opis="Bot liczy z niej dojazd do restauracji. Wyłączenie oznacza powrót do liczenia od ostatniej pinezki wysłanej ręcznie."
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

            <Diagnostyka blokada={blokadaEkranu} onZwolnij={onZwolnijBlokade} />

            <WersjaAplikacji />
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
function Diagnostyka({ blokada, onZwolnij }: { blokada: boolean; onZwolnij: () => void }) {
  return (
    <View style={s.stopka}>
      <Text style={s.stopkaTytul}>Diagnostyka</Text>
      <View style={s.stopkaWiersz}>
        <Text style={s.stopkaEtykieta}>Blokada ekranu</Text>
        <Text style={[s.stopkaWartosc, { color: blokada ? C.ostrzezenie : C.tekstPrzygaszony }]}>
          {blokada ? 'założona' : 'zdjęta'}
        </Text>
      </View>
      <Pressable style={s.przyciskDiag} onPress={onZwolnij} accessibilityRole="button">
        <Text style={s.przyciskDiagTekst}>Zwolnij blokadę ręcznie</Text>
      </Pressable>
    </View>
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
});
