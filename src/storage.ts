import * as SecureStore from 'expo-secure-store';
import { TOKEN_KEY } from './config';

/**
 * Token API w szyfrowanym magazynie systemu (Android Keystore).
 *
 * NIE AsyncStorage — tamten trzyma dane jawnym tekstem w katalogu aplikacji.
 * Token daje pełny odczyt zarobków, więc traktujemy go jak hasło.
 */

export function readToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export function saveToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export function clearToken(): Promise<void> {
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}
