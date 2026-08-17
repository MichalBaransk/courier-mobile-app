import * as SecureStore from 'expo-secure-store';

import { poprawTydzien, PUSTY_TYDZIEN, type TydzienPracy } from './tydzienPracy';

/**
 * Tydzień pracy na dysku.
 *
 * `expo-secure-store` z tego samego powodu co przy kolejce offline: w tym APK
 * nie ma nic innego, a `AsyncStorage` to moduł natywny, czyli koniec OTA.
 * Siedem liczb to ~40 bajtów — daleko od limitu 2048 B, o który trzeba się
 * martwić przy kolejce.
 *
 * To USTAWIENIE, a nie dane — dlatego, w odróżnieniu od kolejki, nie wysyła
 * się nigdzie i nie ma go w backupie. Utrata oznacza ponowne zaznaczenie
 * siedmiu pól, nie utratę zarobków.
 */

const KLUCZ = 'tydzien_pracy';

export async function wczytajTydzien(): Promise<TydzienPracy> {
  try {
    const surowy = await SecureStore.getItemAsync(KLUCZ);
    if (surowy === null) return PUSTY_TYDZIEN;
    return poprawTydzien(JSON.parse(surowy)) ?? PUSTY_TYDZIEN;
  } catch {
    return PUSTY_TYDZIEN;
  }
}

export async function zapiszTydzien(t: TydzienPracy): Promise<void> {
  await SecureStore.setItemAsync(KLUCZ, JSON.stringify(t));
}
