import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C } from './theme';

/**
 * Pasek sekcji na dole ekranu.
 *
 * Napisany od zera, nie przez `@react-navigation/*`: tamto ciągnie
 * `react-native-screens`, czyli kolejny moduł natywny i całą warstwę
 * nawigacji, której tu nie ma po co mieć. Cztery przyciski przełączające
 * stan to cztery przyciski przełączające stan.
 *
 * Ikona i podpis to DWA osobne węzły `Text`. Emoji razem z tekstem w jednym
 * `Text` raz wyświetliło się na telefonie jako sama ikona z pustym polem
 * obok. Przyczyny nie ustaliłem — więc ich nie łączę.
 */

/**
 * `portfel` i `wykresy` NIE MAJĄ przycisku na pasku — wchodzi się do nich
 * z panelu „Więcej". Są jednak pełnoprawnymi sekcjami: mają własny nagłówek
 * i zajmują cały ekran, a nie okno na wierzchu. Ta sama maszyna stanu,
 * inne wejście.
 */
export type Sekcja = 'kalendarz' | 'oferty' | 'cele' | 'portfel' | 'wykresy';

/**
 * Na pasku są TRZY sekcje, nie cztery.
 *
 * `portfel` przeniesiony do panelu „Więcej" (krok 30). Nadal jest pełnoprawną
 * sekcją — zmienił się tylko sposób wejścia. Powód: pasek ma pięć miejsc,
 * a najczęstsza czynność dnia (start i koniec zmiany) zasługuje na jedno
 * z nich bardziej niż podgląd salda.
 */
const SEKCJE: Array<{ id: Sekcja; ikona: string; podpis: string }> = [
  { id: 'kalendarz', ikona: '📅', podpis: 'Kalendarz' },
  { id: 'oferty', ikona: '🛵', podpis: 'Oferty' },
  { id: 'cele', ikona: '🎯', podpis: 'Cele' },
];

/**
 * Piąta pozycja — „Więcej".
 *
 * CELOWO NIE JEST SEKCJĄ. Nie przełącza `aktywna`, tylko otwiera panel
 * ustawień. Dzięki temu maszyna stanu sekcji zostaje czterostanowa i nie
 * trzeba dla „Więcej" wymyślać nagłówka ani treści ekranu.
 *
 * Dlaczego tutaj, a nie jako hamburger w prawym górnym rogu: ten róg jest
 * najtrudniej osiągalnym punktem ekranu przy obsłudze jedną ręką, a telefon
 * bywa w uchwycie i w rękawicy. Dolny pasek jest w zasięgu kciuka z definicji.
 */
export function PasekSekcji({
  aktywna,
  onZmien,
  onWiecej,
  zmianaTrwa,
  onZmiana,
  zajety,
}: {
  aktywna: Sekcja;
  onZmien: (sekcja: Sekcja) => void;
  onWiecej: () => void;
  /** Któraś ze zmian dnia jest niezamknięta — przycisk pokazuje „Koniec". */
  zmianaTrwa: boolean;
  onZmiana: () => void;
  /** Żądanie w locie — blokuje podwójne kliknięcie. */
  zajety: boolean;
}) {
  /**
   * PRAWDZIWY margines bezpieczny, nie przybliżenie.
   *
   * Wcześniej liczyłem go z różnicy między wysokością ekranu a wysokością
   * okna i przycinałem do 12–48 dp. Działało „mniej więcej", czyli w praktyce
   * pasek nadal wchodził pod przyciski systemu — widać to było na zrzucie.
   *
   * `useSafeAreaInsets` czyta insety z systemu i sam przelicza je przy zmianie
   * trybu nawigacji (gesty kontra trzy przyciski) oraz przy obrocie. Dolna
   * podłoga 8 dp jest po to, żeby przy nawigacji gestowej (inset bliski zeru)
   * podpisy nie dotykały krawędzi ekranu.
   */
  const insets = useSafeAreaInsets();
  const dol = Math.max(8, insets.bottom);

  return (
    <View style={[s.pasek, { paddingBottom: dol }]}>
      {SEKCJE.map((sekcja) => {
        const wybrana = sekcja.id === aktywna;
        return (
          <Pressable
            key={sekcja.id}
            style={s.przycisk}
            onPress={() => onZmien(sekcja.id)}
            accessibilityRole="button"
            accessibilityLabel={sekcja.podpis}
          >
            <Text style={[s.ikona, !wybrana && s.przygaszona]}>{sekcja.ikona}</Text>
            <Text style={[s.podpis, wybrana && s.podpisAktywny]} numberOfLines={1}>
              {sekcja.podpis}
            </Text>
            <View style={[s.kreska, wybrana && s.kreskaAktywna]} />
          </Pressable>
        );
      })}

      <Pressable
        style={s.przycisk}
        onPress={onWiecej}
        accessibilityRole="button"
        accessibilityLabel="Więcej, portfel i ustawienia"
      >
        <Text style={[s.ikona, s.przygaszona]}>⚙️</Text>
        <Text style={s.podpis} numberOfLines={1}>
          Więcej
        </Text>
        {/* Kreska bez wypełnienia — „Więcej" nigdy nie jest sekcją aktywną,
            ale musi zajmować tyle samo miejsca co reszta, inaczej ikony
            przestają stać w jednej linii. */}
        <View style={s.kreska} />
      </Pressable>

      <PrzyciskZmiany trwa={zmianaTrwa} zajety={zajety} onPress={onZmiana} />
    </View>
  );
}

/**
 * Start i koniec zmiany — najczęstsza czynność dnia, więc na pasku.
 *
 * Jedno dotknięcie, godzinę podstawia SERWER (aplikacja wysyła `'TERAZ'`).
 *
 * Stan „Zamknięta" ZNIKNĄŁ razem z `work_sessions`. Wcześniej baza trzymała
 * jedną parę `work_from`/`work_to` na dzień, więc drugi start nadpisałby
 * pierwszy i zmiana zniknęłaby bez śladu — przycisk był wtedy wyszarzany,
 * bo cicha utrata danych jest gorsza niż nieaktywny przycisk. Teraz każda
 * zmiana to osobny wiersz i nie ma czego nadpisać, więc przycisk jest
 * aktywny zawsze poza czasem trwania żądania.
 */
function PrzyciskZmiany({
  trwa,
  zajety,
  onPress,
}: {
  trwa: boolean;
  zajety: boolean;
  onPress: () => void;
}) {
  const nieaktywny = zajety;

  const ikona = trwa ? '⏹️' : '▶️';
  const podpis = trwa ? 'Koniec' : 'Start';

  return (
    <Pressable
      style={[s.przycisk, nieaktywny && s.nieaktywny]}
      onPress={nieaktywny ? undefined : onPress}
      disabled={nieaktywny}
      accessibilityRole="button"
      accessibilityState={{ disabled: nieaktywny }}
      accessibilityLabel={trwa ? 'Zakończ zmianę' : 'Rozpocznij zmianę'}
    >
      <Text style={[s.ikona, nieaktywny && s.przygaszona]}>{ikona}</Text>
      <Text
        style={[s.podpis, trwa && s.podpisTrwa, !trwa && s.podpisStart]}
        numberOfLines={1}
      >
        {podpis}
      </Text>
      <View style={[s.kreska, trwa && s.kreskaTrwa]} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  pasek: {
    flexDirection: 'row',
    backgroundColor: C.karta,
    borderTopColor: C.obramowanie,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  przycisk: { flex: 1, alignItems: 'center', paddingVertical: 2, paddingHorizontal: 2 },
  // Pięć zakładek — ikona i podpis odrobinę mniejsze, żeby „Kalendarz"
  // nie musiał się łamać ani skracać wielokropkiem.
  ikona: { fontSize: 19, lineHeight: 23 },
  przygaszona: { opacity: 0.45 },
  podpis: { color: C.tekstPrzygaszony, fontSize: 9.5, marginTop: 2 },
  podpisAktywny: { color: C.akcent, fontWeight: '700' },
  kreska: {
    height: 2,
    width: 20,
    borderRadius: 999,
    marginTop: 5,
    backgroundColor: 'transparent',
  },
  kreskaAktywna: { backgroundColor: C.akcent },
  kreskaTrwa: { backgroundColor: C.ostrzezenie },
  // Trwająca zmiana świeci ostrzegawczo, bo to stan, o którym trzeba pamiętać:
  // zapomniany zjazd psuje stawkę zł/h i prognozy celów (§8d).
  podpisTrwa: { color: C.ostrzezenie, fontWeight: '700' },
  podpisStart: { color: C.akcent, fontWeight: '700' },
  nieaktywny: { opacity: 0.35 },
});
