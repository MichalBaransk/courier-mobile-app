/**
 * Kolory. Ciemny motyw — kurier patrzy w telefon także po zmroku.
 *
 * Wydzielone z `App.tsx`, bo od kroku 3a używa ich też formularz dodawania
 * wpisu. Jedno źródło prawdy zamiast dwóch kopii, które i tak by się rozjechały.
 */
export const C = {
  tlo: '#0f1115',
  karta: '#191d24',
  obramowanie: '#272d38',
  tekst: '#e8ecf2',
  tekstPrzygaszony: '#8b95a5',
  akcent: '#4ade80',
  ostrzezenie: '#fbbf24',
  blad: '#f87171',
} as const;
