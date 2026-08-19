import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { ApiError, postDecyzjaOferty, postOferte, type PozycjaOceny } from './api';
import { km, stawka, zl } from './format';
import { typObrazu } from './obraz';
import { biezacaPozycja } from './lokalizacja';
import { C } from './theme';
import type { WynikOceny } from './types';

/**
 * Ocena oferty kursu bez wychodzenia z aplikacji.
 *
 * DLACZEGO TO NIE JEST TO SAMO, CO WYSŁANIE ZDJĘCIA DO BOTA.
 *
 * Reguły oceny są identyczne — liczy je ten sam serwis po stronie serwera.
 * Różnica siedzi w POZYCJI. Bot zna tylko tę, którą aplikacja wysłała
 * ostatnim razem, więc Google Maps liczy dojazd od miejsca sprzed kilku minut.
 * Tutaj pytamy GPS w chwili oceny i pozycja ma wiek 1–3 sekund. To jest cała
 * różnica między kontrolą dojazdu, która coś znaczy, a liczbą, która wygląda
 * wiarygodnie i nie znaczy nic (§8f).
 *
 * Dlatego pozycję pobieramy PO wybraniu zdjęcia, a nie przy otwarciu ekranu:
 * między otwarciem a wyborem mija tyle czasu, ile trwa grzebanie w galerii.
 */

/** Jakość kompresji zrzutu. */
const JAKOSC = 0.7;

type Stan =
  | { faza: 'wybor' }
  | { faza: 'ocenianie'; krok: string }
  | { faza: 'wynik'; wynik: WynikOceny; decyzja: 'ACCEPTED' | 'REJECTED' | null };

export function OcenOferte({
  widoczny,
  token,
  onZamknij,
  onOceniono,
}: {
  widoczny: boolean;
  token: string;
  onZamknij: () => void;
  /** Woła się po zapisaniu oferty — App odświeża listę i statystyki. */
  onOceniono: () => void;
}) {
  const [stan, setStan] = useState<Stan>({ faza: 'wybor' });
  const [blad, setBlad] = useState<string | null>(null);

  const zamknij = () => {
    if (stan.faza === 'ocenianie') return;
    setStan({ faza: 'wybor' });
    setBlad(null);
    onZamknij();
  };

  const ocen = async (zAparatu: boolean) => {
    setBlad(null);

    const zgoda = zAparatu
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!zgoda.granted) {
      setBlad(
        zAparatu
          ? 'Bez zgody na aparat nie da się zrobić zdjęcia oferty.'
          : 'Bez zgody na galerię nie da się wybrać zrzutu ekranu.'
      );
      return;
    }

    const opcje: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: JAKOSC,
      base64: true,
      allowsEditing: false,
    };

    const wybor = zAparatu
      ? await ImagePicker.launchCameraAsync(opcje)
      : await ImagePicker.launchImageLibraryAsync(opcje);

    if (wybor.canceled) return;

    const zdjecie = wybor.assets[0];
    if (!zdjecie?.base64) {
      setBlad('Nie udało się odczytać obrazu. Spróbuj innego zrzutu.');
      return;
    }

    setStan({ faza: 'ocenianie', krok: 'Pobieram pozycję…' });

    /**
     * Pozycja jest MIŁA, ale nie obowiązkowa.
     *
     * Gdy GPS nie odpowie (garaż, wyłączona lokalizacja, brak zgody), ocena
     * i tak ma się odbyć — podstawą stawki jest dystans z aplikacji Glovo,
     * a Maps to tylko kontrola. Zatrzymywanie oceny z powodu braku kontroli
     * byłoby odmową zrobienia rzeczy ważnej z powodu braku rzeczy pomocniczej.
     */
    let pozycja: PozycjaOceny | null = null;
    try {
      const odczyt = await biezacaPozycja(true);
      if (odczyt) {
        pozycja = { lat: odczyt.lat, lon: odczyt.lon, wiekMs: odczyt.wiekMs };
      }
    } catch {
      pozycja = null;
    }

    setStan({ faza: 'ocenianie', krok: 'Czytam ofertę…' });

    try {
      // Typ z BAJTÓW, nie z `asset.mimeType` — powód w nagłówku `obraz.ts`.
      const wynik = await postOferte(token, zdjecie.base64, typObrazu(zdjecie.base64), pozycja);
      setStan({ faza: 'wynik', wynik, decyzja: null });
      onOceniono();
    } catch (err) {
      setStan({ faza: 'wybor' });
      setBlad(
        err instanceof ApiError
          ? err.message
          : 'Nie udało się ocenić oferty. Spróbuj jeszcze raz.'
      );
    }
  };

  const zdecyduj = async (decyzja: 'ACCEPTED' | 'REJECTED') => {
    if (stan.faza !== 'wynik') return;
    // Pokazujemy decyzję od razu — zapis w tle. Kurier stoi nad ofertą,
    // która za chwilę zniknie z ekranu Glovo; czekanie na odpowiedź serwera
    // kosztuje go sekundy, których nie ma.
    setStan({ ...stan, decyzja });
    try {
      await postDecyzjaOferty(token, stan.wynik.offerId, decyzja);
      onOceniono();
    } catch {
      setBlad('Decyzja nie zapisała się na serwerze. Werdykt i tak jest w bazie.');
    }
  };

  return (
    <Modal visible={widoczny} animationType="slide" transparent={false} onRequestClose={zamknij}>
      <View style={s.tlo}>
        <ScrollView contentContainerStyle={s.zawartosc}>
          <Text style={s.tytul}>Oceń ofertę</Text>

          {blad ? <Text style={s.blad}>{blad}</Text> : null}

          {stan.faza === 'wybor' ? (
            <>
              <Text style={s.podtytul}>
                Zrzut ekranu oferty z aplikacji Glovo. Stawkę liczę z kilometrów, które podaje sama
                Glovo — Google Maps sprawdza tylko dojazd.
              </Text>

              <Pressable style={[s.przycisk, s.glowny]} onPress={() => void ocen(false)}>
                <Text style={s.przyciskTekst}>🖼️  Wybierz zrzut z galerii</Text>
              </Pressable>

              <Pressable style={s.przycisk} onPress={() => void ocen(true)}>
                <Text style={s.przyciskTekst}>📷  Zrób zdjęcie ekranu</Text>
              </Pressable>

              <Text style={s.przypis}>
                Pozycję GPS pobieram dopiero po wybraniu zdjęcia, żeby była z tej chwili, a nie
                sprzed grzebania w galerii.
              </Text>
            </>
          ) : null}

          {stan.faza === 'ocenianie' ? (
            <View style={s.czekanie}>
              <ActivityIndicator size="large" color={C.akcent} />
              <Text style={s.czekanieTekst}>{stan.krok}</Text>
              <Text style={s.przypis}>
                Odczyt zrzutu potrafi zająć kilkanaście sekund — obraz czeka w kolejce do modelu.
              </Text>
            </View>
          ) : null}

          {stan.faza === 'wynik' ? (
            <Werdykt wynik={stan.wynik} decyzja={stan.decyzja} onDecyzja={(d) => void zdecyduj(d)} />
          ) : null}

          <Pressable
            style={[s.przycisk, stan.faza === 'ocenianie' && s.nieaktywny]}
            onPress={zamknij}
            disabled={stan.faza === 'ocenianie'}
          >
            <Text style={s.przyciskTekst}>
              {stan.faza === 'wynik' ? 'Gotowe' : 'Zamknij'}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Wiersz({ etykieta, wartosc }: { etykieta: string; wartosc: string }) {
  return (
    <View style={s.wiersz}>
      <Text style={s.wierszEtykieta}>{etykieta}</Text>
      <Text style={s.wierszWartosc}>{wartosc}</Text>
    </View>
  );
}

const odcinek = (v: number | null) => (v === null ? '—' : km(v));

function Werdykt({
  wynik,
  decyzja,
  onDecyzja,
}: {
  wynik: WynikOceny;
  decyzja: 'ACCEPTED' | 'REJECTED' | null;
  onDecyzja: (d: 'ACCEPTED' | 'REJECTED') => void;
}) {
  const zrodlo: Record<WynikOceny['rateBasis'], string> = {
    APP: 'z aplikacji Glovo',
    MAPS: 'z Google Maps',
    NONE: 'brak danych o dystansie',
  };

  return (
    <>
      <View style={[s.werdykt, wynik.isProfitable ? s.werdyktDobry : s.werdyktZly]}>
        <Text style={s.werdyktTekst}>
          {wynik.isProfitable ? '✅  KURS OPŁACALNY' : '❌  KURS SŁABY'}
        </Text>
        <Text style={s.werdyktStawka}>
          {stawka(wynik.netRatePerKm)} zł/km netto
        </Text>
      </View>

      <View style={s.karta}>
        <Wiersz etykieta="Brutto" wartosc={zl(wynik.grossAmount)} />
        <Wiersz etykieta="Netto" wartosc={zl(wynik.netAmount)} />
        <View style={s.kreska} />
        <Wiersz etykieta="Odbiór" wartosc={wynik.pickupAddress} />
        <Wiersz etykieta="Dostawa" wartosc={wynik.deliveryAddress} />
      </View>

      <View style={s.karta}>
        <Text style={s.naglowek}>DYSTANS Z APLIKACJI GLOVO</Text>
        <Wiersz etykieta="Odbiór" wartosc={odcinek(wynik.appPickupKm)} />
        <Wiersz etykieta="Dostawa" wartosc={odcinek(wynik.appDeliveryKm)} />
        <Wiersz etykieta="Suma" wartosc={odcinek(wynik.appTotalKm)} />
      </View>

      <View style={s.karta}>
        <Text style={s.naglowek}>KONTROLA GOOGLE MAPS</Text>
        {wynik.mapsReason ? (
          <Text style={s.przypis}>{wynik.mapsReason}</Text>
        ) : (
          <>
            <Wiersz etykieta="Dojazd" wartosc={odcinek(wynik.mapsPickupKm)} />
            <Wiersz
              etykieta="Do klienta"
              wartosc={wynik.mapsDeliveryReason ?? odcinek(wynik.mapsDeliveryKm)}
            />
            <Text style={s.przypis}>
              Pozycja sprzed {wynik.mapsAgeMin === 0 ? 'chwili' : `${wynik.mapsAgeMin} min`}.
            </Text>
          </>
        )}
      </View>

      <Text style={s.przypis}>
        Stawka liczona z dystansu {zrodlo[wynik.rateBasis]}
        {wynik.totalKm > 0 ? ` (${km(wynik.totalKm)})` : ''}.
      </Text>

      {decyzja === null ? (
        <View style={s.decyzje}>
          <Pressable
            style={[s.przycisk, s.decyzja, s.przyjmij]}
            onPress={() => onDecyzja('ACCEPTED')}
          >
            <Text style={s.przyciskTekst}>✅  Przyjęty</Text>
          </Pressable>
          <Pressable
            style={[s.przycisk, s.decyzja, s.odrzuc]}
            onPress={() => onDecyzja('REJECTED')}
          >
            <Text style={s.przyciskTekst}>❌  Odrzucony</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={s.zapisano}>
          {decyzja === 'ACCEPTED' ? 'Zapisano jako przyjęty.' : 'Zapisano jako odrzucony.'}
        </Text>
      )}
    </>
  );
}

const s = StyleSheet.create({
  tlo: { flex: 1, backgroundColor: C.tlo },
  zawartosc: { padding: 16, paddingBottom: 40, gap: 10 },
  tytul: { color: C.tekst, fontSize: 22, fontWeight: '700' },
  podtytul: { color: C.tekstPrzygaszony, fontSize: 13, lineHeight: 18 },
  blad: { color: C.blad, fontSize: 13, lineHeight: 18 },
  przypis: { color: C.tekstPrzygaszony, fontSize: 12, lineHeight: 17 },

  przycisk: {
    backgroundColor: C.karta,
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  glowny: { backgroundColor: C.akcent },
  przyciskTekst: { color: C.tekst, fontSize: 15, fontWeight: '600' },
  nieaktywny: { opacity: 0.4 },

  czekanie: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  czekanieTekst: { color: C.tekst, fontSize: 15, fontWeight: '600' },

  werdykt: { borderRadius: 12, padding: 16, alignItems: 'center', gap: 4 },
  werdyktDobry: { backgroundColor: C.akcent },
  werdyktZly: { backgroundColor: C.blad },
  werdyktTekst: { color: C.tekst, fontSize: 17, fontWeight: '800' },
  werdyktStawka: { color: C.tekst, fontSize: 15, fontWeight: '600' },

  karta: { backgroundColor: C.karta, borderRadius: 12, padding: 14, gap: 6 },
  naglowek: { color: C.tekstPrzygaszony, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  kreska: { height: 1, backgroundColor: C.obramowanie, marginVertical: 4 },
  wiersz: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  wierszEtykieta: { color: C.tekstPrzygaszony, fontSize: 13, flexShrink: 0 },
  wierszWartosc: { color: C.tekst, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  decyzje: { flexDirection: 'row', gap: 10 },
  decyzja: { flex: 1 },
  przyjmij: { backgroundColor: C.akcent },
  odrzuc: { backgroundColor: C.blad },
  zapisano: { color: C.tekstPrzygaszony, fontSize: 13, textAlign: 'center', paddingVertical: 8 },
});
