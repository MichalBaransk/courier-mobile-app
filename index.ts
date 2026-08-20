// ⚠️ TA LINIA MUSI BYĆ PIERWSZA W CAŁEJ APLIKACJI.
//
// `react-native-gesture-handler` podmienia natywny system obsługi dotyku
// i musi to zrobić, zanim cokolwiek innego zdąży się zarejestrować.
// Zaimportowany później działa „prawie" — gesty łapią się losowo, a błąd
// nie pojawia się w żadnym logu.
import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';

import { pilnujAwarii } from './src/awaria';

/**
 * Zapis awarii PRZED czymkolwiek innym.
 *
 * Im wcześniej, tym więcej złapie — błąd przy wczytywaniu `App` też jest
 * awarią i też chcemy go zobaczyć w Diagnostyce, a nie zgadywać z opisu
 * „wywala mnie, chyba w ustawieniach".
 */
pilnujAwarii();

import App from './App';

/**
 * Rejestracja zadania GPS w tle — MUSI być tutaj, w zakresie modułu.
 *
 * `TaskManager.defineTask` ma zostać wywołane, zanim aplikacja się uruchomi;
 * wymaga tego dokumentacja Expo. Zadanie budzi się także wtedy, gdy aplikacja
 * jest ubita — wtedy nie ma żadnego komponentu, w którym dałoby się je
 * zarejestrować.
 *
 * ⚠️ `require` W `try/catch`, A NIE ZWYKŁY `import`. To nie jest ostrożność
 * na wyrost. `eas update` wysyła WYŁĄCZNIE JavaScript — modułów natywnych nie
 * wnosi. Gdyby `expo-task-manager` nie był wkompilowany w zainstalowany APK,
 * `defineTask` rzuciłby wyjątek przy starcie, czyli ZANIM cokolwiek się
 * narysuje: aplikacja wywalałaby się przy każdym otwarciu, a wyjściem byłby
 * `eas update:rollback` albo ponowna instalacja.
 *
 * Statyczny `import` jest wciągany przed wykonaniem tego pliku i żaden
 * `try/catch` by go nie objął. Stąd `require`.
 *
 * Aplikacja bez tego modułu działa dalej — wraca do śledzenia na pierwszym
 * planie, a „Więcej → Wersja" pokazuje wprost, że tła nie ma.
 */
try {
  require('./src/gpsTloZadanie');
} catch (err) {
  console.warn('[GPS tło] brak modułu natywnego w tym APK — zostaje pierwszy plan.', err);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
