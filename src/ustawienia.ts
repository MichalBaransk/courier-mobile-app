/**
 * Ustawienia użytkownika — CZYSTA logika, bez magazynu i bez React Native.
 *
 * Ta sama zasada co przy `tydzienPracy.ts` i `kolejka.ts`: kształt danych
 * i ich walidacja żyją osobno od zapisu, więc dają się przetestować.
 */

export interface Ustawienia {
  /** Ekran nie gaśnie, dopóki trwa zmiana. */
  ekranNieGasnie: boolean;
  /** Czy wysyłać pozycję na serwer podczas zmiany. */
  wysylajPozycje: boolean;
  /**
   * Wysoka dokładność = prawdziwy GPS (5–15 m), oszczędna = sieć (~100 m).
   *
   * To nie jest kosmetyka: serwer liczy zaufanie do pozycji w metrach
   * (`niepewność + prędkość × wiek <= 300 m`), więc przy dokładności 100 m
   * jedna trzecia budżetu znika, zanim w ogóle ruszysz. Przełącznik istnieje
   * jako wyjście awaryjne, gdyby bateria nie wyrabiała.
   */
  wysokaDokladnosc: boolean;
}

/**
 * Wartości domyślne = dotychczasowe zachowanie aplikacji.
 *
 * Świadomie: użytkownik, który nigdy nie wejdzie w ustawienia, nie ma prawa
 * zauważyć, że one w ogóle powstały.
 */
export const DOMYSLNE: Ustawienia = {
  ekranNieGasnie: true,
  wysylajPozycje: true,
  wysokaDokladnosc: true,
};

/**
 * Kontrola tego, co przyszło z magazynu.
 *
 * ⚠️ RÓŻNICA WOBEC `poprawTydzien`, i jest ona celowa.
 *
 * Tydzień pracy przy jakiejkolwiek nieprawidłowości zwraca `null` — siedem
 * liczb łatwiej ustawić od nowa niż zgadywać, które są prawdziwe.
 *
 * Tutaj jest odwrotnie: **scalamy z domyślnymi, pole po polu**. Powód jest
 * praktyczny — gdy w przyszłej wersji dojdzie czwarte ustawienie, plik zapisany
 * przez wersję dzisiejszą nie ma go i nie może przez to skasować trzech
 * pozostałych. Odrzucanie całości przy każdej rozbudowie kasowałoby
 * użytkownikowi wybory przy każdej aktualizacji.
 *
 * Pole o złym typie jest po cichu zastępowane domyślnym. To jedyne miejsce
 * w projekcie, gdzie takie połykanie jest w porządku: ustawienie to
 * preferencja, nie dane. Nic nie ginie.
 */
export function poprawUstawienia(v: unknown): Ustawienia {
  if (typeof v !== 'object' || v === null) return { ...DOMYSLNE };

  const zapis = v as Record<string, unknown>;
  const bool = (klucz: keyof Ustawienia): boolean =>
    typeof zapis[klucz] === 'boolean' ? (zapis[klucz] as boolean) : DOMYSLNE[klucz];

  return {
    ekranNieGasnie: bool('ekranNieGasnie'),
    wysylajPozycje: bool('wysylajPozycje'),
    wysokaDokladnosc: bool('wysokaDokladnosc'),
  };
}
