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
