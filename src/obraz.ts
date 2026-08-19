/**
 * Rozpoznanie formatu obrazu z SAMYCH BAJTÓW, a nie z tego, co deklaruje picker.
 *
 * DLACZEGO NIE `asset.mimeType`. Dokumentacja Expo SDK 57 mówi o polu `base64`
 * wprost: „Base64-encoded string of the selected image's **JPEG** data".
 * Czyli picker potrafi oddać `mimeType: 'image/png'` przy zasobie, a w `base64`
 * mieć już przekodowany JPEG — zwłaszcza gdy podamy `quality`, bo kompresja
 * z definicji dotyczy JPEG-a. Wysłanie takiego obrazu z etykietą `image/png`
 * to podanie Gemini nieprawdy o tym, co dostaje.
 *
 * Sygnatury są krótkie i jednoznaczne, bo base64 koduje po 3 bajty na 4 znaki
 * i początek pliku zawsze wypada tak samo:
 *
 * | format | pierwsze bajty      | początek base64 |
 * |--------|---------------------|-----------------|
 * | JPEG   | `FF D8 FF`          | `/9j/`          |
 * | PNG    | `89 50 4E 47`       | `iVBORw0KGgo`   |
 *
 * Gdy nie pasuje ani jedno, ani drugie — mówimy `image/jpeg`. To nie jest
 * zgadywanie na oślep: serwer przyjmuje tylko te dwa typy, a zrzut ekranu
 * z telefonu po przejściu przez `quality` jest JPEG-iem w praktycznie każdym
 * przypadku. Odmowa wysłania byłaby gorsza od domysłu, bo kurier stoi nad
 * ofertą, która za chwilę zniknie.
 */
export type TypObrazu = 'image/jpeg' | 'image/png';

export function typObrazu(base64: string): TypObrazu {
  const poczatek = base64.slice(0, 16);
  if (poczatek.startsWith('iVBORw0KGgo')) return 'image/png';
  return 'image/jpeg';
}

/**
 * Klucz idempotencji wyliczony Z TRESCI OBRAZU.
 *
 * Po co. Ocena oferty to jedyny zapis w tej aplikacji, ktory kosztuje —
 * po drugiej stronie jest wywolanie modelu. Gdy zadanie utknie i uzytkownik
 * sprobuje ponownie z TYM SAMYM zrzutem, bez klucza powstaje drugi wiersz
 * w `course_offers` i druga oplata za odczyt. Z kluczem serwer rozpoznaje
 * powtorke i oddaje zapamietana odpowiedz, nie pytajac modelu drugi raz
 * (`api/idempotency.ts` po stronie bota).
 *
 * Klucz musi byc DETERMINISTYCZNY, bo ponowienie to nowe wybranie tego samego
 * zdjecia z galerii — losowy identyfikator nic by tu nie dal. Stad hasz
 * z samej tresci: ten sam zrzut zawsze daje ten sam klucz.
 *
 * FNV-1a, 32 bity, liczony po co 7. znaku. To NIE jest funkcja
 * kryptograficzna i nie musi nia byc — chodzi wylacznie o to, zeby dwa rozne
 * zrzuty prawie na pewno mialy rozne klucze. Pelny przebieg po dwumegowym
 * stringu na telefonie to zbedna praca; probkowanie plus dlugosc w kluczu
 * daje w praktyce to samo.
 *
 * Format wyniku pilnuje ograniczen serwera (`normalizujKlucz`): 8–128 znakow
 * ze zbioru `[A-Za-z0-9._:-]`.
 */
export function kluczObrazu(base64: string): string {
  let hasz = 0x811c9dc5;
  for (let i = 0; i < base64.length; i += 7) {
    hasz ^= base64.charCodeAt(i);
    hasz = Math.imul(hasz, 0x01000193) >>> 0;
  }
  return `oferta-${base64.length.toString(36)}-${hasz.toString(36)}`;
}
