import { defineConfig } from 'vitest/config';

/**
 * Testy leżą OBOK kodu, w `src/`, i tylko takie są uruchamiane.
 *
 * To nie jest kwestia gustu. W repozytorium bota istniał `test/validation.test.ts`,
 * którego `include` nie obejmował — plik importował moduł, który już nie
 * istniał, i przez wiele wersji nikt się o tym nie dowiedział, bo `npm test`
 * pokazywał zielone „2 pliki" i nie wspominał o trzecim. Zepsuty test, który
 * się nie uruchamia, jest gorszy niż brak testu: udaje, że coś sprawdza.
 *
 * Pod testem są WYŁĄCZNIE pliki czyste — bez `react-native`, bez `fetch`, bez
 * `expo-secure-store`. Komponentów tu nie ma i nie ma ich udawać: renderowanie
 * wymagałoby `@testing-library/react-native` i całego środowiska DOM, a błędy,
 * które realnie kosztują dane, siedzą w arytmetyce, nie w układzie ekranu.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
