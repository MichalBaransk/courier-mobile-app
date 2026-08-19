import AsyncStorage from '@react-native-async-storage/async-storage';

import { DOMYSLNE, poprawUstawienia, type Ustawienia } from './ustawienia';

/**
 * Zapis ustawień na dysku telefonu.
 *
 * `AsyncStorage`, nie `SecureStore` — świadomie. Ustawienia nie są sekretem,
 * a SecureStore ostrzega przy wartościach powyżej 2048 bajtów (to przez to
 * kolejka offline musi się dzielić na osobne klucze). Tutaj nie ma czego
 * chronić ani czego dzielić.
 *
 * Ani odczyt, ani zapis nie rzucają wyjątkiem. Preferencja, której nie udało
 * się wczytać, to niedogodność; wyjątek przy starcie aplikacji to biały ekran.
 */

const KLUCZ = 'glovo_ustawienia';

export async function wczytajUstawienia(): Promise<Ustawienia> {
  try {
    const surowe = await AsyncStorage.getItem(KLUCZ);
    if (surowe === null) return { ...DOMYSLNE };
    return poprawUstawienia(JSON.parse(surowe));
  } catch {
    return { ...DOMYSLNE };
  }
}

/** Zwraca `true`, gdy zapis się udał. Wywołujący może to zignorować. */
export async function zapiszUstawienia(u: Ustawienia): Promise<boolean> {
  try {
    await AsyncStorage.setItem(KLUCZ, JSON.stringify(u));
    return true;
  } catch {
    return false;
  }
}
