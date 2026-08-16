import * as SecureStore from 'expo-secure-store';

import type { WpisKolejki } from './kolejka';

/**
 * Trwałość kolejki w `expo-secure-store`.
 *
 * DLACZEGO AKURAT TU, skoro to nie są sekrety. Bo w tym APK nie ma nic innego.
 * `package.json` zawiera dokładnie `expo`, `expo-secure-store`,
 * `expo-status-bar` i `expo-updates` — `AsyncStorage` i `expo-file-system` to
 * moduły NATYWNE, a każdy z nich odcina aktualizacje OTA i wymusza nowy build
 * APK. Kolejka ma działać dziś, a nie po następnym buildzie. (Uzgodniony
 * wariant A; `AsyncStorage` wejdzie przy okazji paczki modułów natywnych.)
 *
 * Ograniczenie, które kształtuje cały ten plik: Expo ostrzega przy wartościach
 * powyżej **2048 bajtów** na Androidzie. Dlatego kolejka NIE jest jednym
 * `JSON.stringify(tablica)`, tylko:
 *
 *   `kolejka_indeks`  → lista identyfikatorów      (20 × ~36 zn. ≈ 750 B)
 *   `kolejka_<id>`    → pojedynczy wpis            (~200 B)
 *
 * Każda wartość zostaje daleko pod limitem, a kosztem jest jeden odczyt na
 * wpis przy starcie. Przy limicie 20 wpisów to nieistotne.
 *
 * Drugie ograniczenie: każdy odczyt i zapis to operacja kryptograficzna
 * w Android Keystore. Nadaje się do zapisu przy dodaniu wpisu do kolejki,
 * nie nadaje się do zapisu przy każdym naciśnięciu klawisza.
 */

const KLUCZ_INDEKSU = 'kolejka_indeks';
const PREFIKS = 'kolejka_';

/**
 * Identyfikatory z `kolejka.ts` są bezpieczne dla nazw kluczy (`k-<base36>…`),
 * ale wartość z dysku mogła pochodzić ze starszej wersji albo z uszkodzonego
 * zapisu. Nazwa klucza w SecureStore musi być alfanumeryczna — wpuszczenie
 * czegoś innego kończy się wyjątkiem przy odczycie, czyli utratą CAŁEJ kolejki.
 */
function poprawneId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(id);
}

function czyWpis(v: unknown): v is WpisKolejki {
  const w = v as Partial<WpisKolejki> | null;
  return (
    !!w &&
    typeof w.id === 'string' &&
    typeof w.endpoint === 'string' &&
    typeof w.cialo === 'string' &&
    typeof w.utworzony === 'number' &&
    typeof w.prob === 'number' &&
    typeof w.nastepnaProba === 'number' &&
    typeof w.opis === 'string'
  );
}

/**
 * Wczytuje kolejkę.
 *
 * Wpis, którego nie da się odczytać albo który nie ma właściwego kształtu,
 * jest POMIJANY, a nie wywraca całości. Jeden uszkodzony rekord nie może
 * kosztować dziewiętnastu zdrowych.
 */
export async function wczytajKolejke(): Promise<WpisKolejki[]> {
  let indeks: unknown;
  try {
    const surowy = await SecureStore.getItemAsync(KLUCZ_INDEKSU);
    if (surowy === null) return [];
    indeks = JSON.parse(surowy);
  } catch {
    return [];
  }

  if (!Array.isArray(indeks)) return [];

  const wpisy: WpisKolejki[] = [];
  for (const id of indeks) {
    if (!poprawneId(id)) continue;
    try {
      const surowy = await SecureStore.getItemAsync(`${PREFIKS}${id}`);
      if (surowy === null) continue;
      const wpis: unknown = JSON.parse(surowy);
      if (czyWpis(wpis)) wpisy.push(wpis);
    } catch {
      // Uszkodzony pojedynczy wpis — pomijamy.
    }
  }
  return wpisy;
}

/**
 * Zapisuje całą kolejkę.
 *
 * KOLEJNOŚĆ MA ZNACZENIE: najpierw wpisy, POTEM indeks. Gdyby proces zginął
 * w połowie, indeks nadal wskazuje stary, spójny zestaw. Odwrotna kolejność
 * dałaby indeks wskazujący na wpisy, których jeszcze nie ma — i po restarcie
 * kolejka byłaby krótsza, niż użytkownik widział.
 *
 * Osierocone klucze kasujemy DOPIERO po zapisaniu nowego indeksu.
 */
export async function zapiszKolejke(kolejka: WpisKolejki[]): Promise<void> {
  const poprzedni = await odczytajIndeks();

  for (const wpis of kolejka) {
    if (!poprawneId(wpis.id)) continue;
    await SecureStore.setItemAsync(`${PREFIKS}${wpis.id}`, JSON.stringify(wpis));
  }

  const nowyIndeks = kolejka.filter((w) => poprawneId(w.id)).map((w) => w.id);
  await SecureStore.setItemAsync(KLUCZ_INDEKSU, JSON.stringify(nowyIndeks));

  const zostawione = new Set(nowyIndeks);
  for (const id of poprzedni) {
    if (zostawione.has(id)) continue;
    try {
      await SecureStore.deleteItemAsync(`${PREFIKS}${id}`);
    } catch {
      // Nieudane skasowanie osieroconego klucza nie boli — indeks go pomija.
    }
  }
}

async function odczytajIndeks(): Promise<string[]> {
  try {
    const surowy = await SecureStore.getItemAsync(KLUCZ_INDEKSU);
    if (surowy === null) return [];
    const v: unknown = JSON.parse(surowy);
    return Array.isArray(v) ? v.filter(poprawneId) : [];
  } catch {
    return [];
  }
}
