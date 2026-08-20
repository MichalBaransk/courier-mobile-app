import * as TaskManager from 'expo-task-manager';

import { obsluzOdczyty, ZADANIE_GPS } from './gpsTlo';

/**
 * Rejestracja zadania GPS w tle. Jedna linia i cały plik dla niej.
 *
 * DLACZEGO OSOBNY PLIK. `TaskManager.defineTask` dotyka modułu natywnego już
 * przy WCZYTANIU pliku, nie przy wywołaniu czegokolwiek. Gdyby siedziało
 * w `gpsTlo.ts`, wciągnąłby je pierwszy `import { czyTloDostepne }` z `App.tsx`
 * albo z panelu ustawień — a statyczne importy wykonują się przed kodem pliku,
 * więc żaden `try/catch` w `index.ts` by ich nie objął.
 *
 * Efektem byłby wyjątek przy starcie aplikacji, ZANIM cokolwiek się narysuje:
 * biały ekran przy każdym otwarciu, do naprawy przez `eas update:rollback`
 * albo ponowną instalację APK. To nie jest hipotetyczne — `eas update` wysyła
 * wyłącznie JavaScript, a czy `expo-task-manager` jest w zainstalowanym
 * buildzie, rozstrzyga dopiero wiersz „Zadania w tle" w „Więcej → Wersja".
 *
 * Ten plik jest więc wczytywany WYŁĄCZNIE przez `require` w `try/catch`
 * w `index.ts`. Nie importuj go nigdzie indziej.
 */
TaskManager.defineTask(ZADANIE_GPS, obsluzOdczyty);
