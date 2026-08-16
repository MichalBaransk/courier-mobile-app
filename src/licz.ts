/**
 * Arytmetyka obronna — jedno miejsce na dzielenie i na sprawdzanie, czy liczba
 * w ogóle nadaje się do pokazania.
 *
 * Powód jest konkretny. `0/0` w JavaScripcie to `NaN`, `5/0` to `Infinity`,
 * a oba renderują się jako „NaN zł" i „Infinity zł/km" — czyli ekran, który
 * wygląda na zepsutą aplikację, choć dane są w porządku, tylko puste.
 * Dzielenie rozsypane po pięciu komponentach oznaczało pięć osobnych okazji,
 * żeby zapomnieć o warunku.
 *
 * Zasada jest ta sama, co przy geokodowaniu adresów (§8f): **lepiej nie podać
 * nic niż podać liczbę, która wygląda wiarygodnie i nie znaczy nic.**
 */

/** Liczba nadająca się do wyświetlenia, albo `null`. Odsiewa `NaN` i `±Infinity`. */
export function skonczona(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Number.isFinite(v) ? v : null;
}

/**
 * Dzielenie, które nigdy nie zwróci `NaN` ani `Infinity`.
 *
 * `null` znaczy „nie da się policzyć" i wywołujący MUSI to obsłużyć —
 * zwykle pokazując `—`. Domyślne zero byłoby gorsze: zero to konkretna
 * informacja („nic nie wydałem"), a tu chodzi o brak informacji.
 */
export function iloraz(licznik: number, mianownik: number): number | null {
  if (!Number.isFinite(licznik) || !Number.isFinite(mianownik)) return null;
  if (mianownik === 0) return null;
  const wynik = licznik / mianownik;
  return Number.isFinite(wynik) ? wynik : null;
}

/**
 * Zmiana procentowa względem `wtedy`.
 *
 * Podstawa zerowa daje `null`, a nie „+∞%": wzrost z zera nie ma sensownej
 * miary procentowej i pokazanie tam czegokolwiek byłoby wprowadzaniem w błąd.
 * `Math.abs` w mianowniku, żeby przy ujemnej podstawie znak wyniku nadal
 * mówił „w górę / w dół", a nie odwrotnie.
 */
export function procentZmiany(teraz: number, wtedy: number): number | null {
  if (!Number.isFinite(teraz) || !Number.isFinite(wtedy)) return null;
  if (wtedy === 0) return null;
  const wynik = ((teraz - wtedy) / Math.abs(wtedy)) * 100;
  return Number.isFinite(wynik) ? wynik : null;
}

/**
 * Udział w całości, przycięty do 0–100.
 *
 * Serwer przycina `progressPercent` po swojej stronie, ale pasek postępu
 * dostaje też wartości liczone tutaj — a `width: '-40%'` w React Native
 * nie jest błędem, tylko cicho psuje układ.
 */
export function procentUdzialu(czesc: number, calosc: number): number {
  const wynik = iloraz(czesc, calosc);
  if (wynik === null) return 0;
  return Math.min(100, Math.max(0, wynik * 100));
}
