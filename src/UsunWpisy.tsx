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

import { ApiError, postUsun, type UsunOdpowiedz, type ZakresUsuniecia } from './api';
import { toBrakSieci } from './kolejka';
import { godziny, km, numerZmiany, zl } from './format';
import { C } from './theme';
import type { DailySummary } from './types';

/**
 * Kasowanie wpisów z jednego dnia — wszystkie siedem zakresów, które obsługuje
 * `POST /api/v1/usun`.
 *
 * Wcześniej aplikacja umiała tylko `ALL_DAY`: żeby poprawić literówkę w brutto,
 * trzeba było skasować cały dzień i wpisać wszystko od nowa. Bot obsługuje
 * węższe zakresy od dawna — to tylko wystawienie ich na ekranie.
 *
 * Każdy przycisk wymaga DRUGIEGO dotknięcia. Kasowanie jest nieodwracalne
 * i nie ma tu żadnego „cofnij" — potwierdzenie jest jedyną barierą.
 * Dotknięcie innego przycisku kasuje oczekujące potwierdzenie, więc nie da się
 * przypadkiem potwierdzić czegoś innego, niż się zaczęło.
 */

interface Pozycja {
  /**
   * Klucz stanu „czeka na potwierdzenie" / „w toku".
   *
   * NIE jest nim `cel`, bo pozycji z celem `SHIFT` jest tyle, ile zmian w dobie.
   * Klucz to `SHIFT:41`, więc potwierdzenie jednej zmiany nie zapala drugiej.
   */
  klucz: string;
  cel: ZakresUsuniecia;
  /** Numer zmiany — wyłącznie przy `cel: 'SHIFT'`. */
  sesjaId?: number;
  etykieta: string;
  /** Co dokładnie zniknie — opis skutku, nie nazwa endpointu. */
  opis: string;
  /** Podgląd obecnej wartości; `null` = nie ma czego kasować. */
  teraz: (d: DailySummary) => string | null;
  grozny?: boolean;
}

const POZYCJE: Pozycja[] = [
  {
    klucz: 'LAST_TIP',
    cel: 'LAST_TIP',
    etykieta: 'Ostatni napiwek',
    opis: 'Kasuje jeden, najświeższy wpis napiwku.',
    teraz: (d) => (d.cashTipsTotal > 0 ? `razem ${zl(d.cashTipsTotal)}` : null),
  },
  {
    klucz: 'ALL_TIPS',
    cel: 'ALL_TIPS',
    etykieta: 'Wszystkie napiwki',
    opis: 'Kasuje każdy napiwek z tego dnia.',
    teraz: (d) => (d.cashTipsTotal > 0 ? zl(d.cashTipsTotal) : null),
  },
  {
    klucz: 'FUEL',
    cel: 'FUEL',
    etykieta: 'Paragony paliwowe',
    opis: 'Kasuje wszystkie tankowania z tego dnia.',
    teraz: (d) =>
      d.fuelReceiptCount > 0 ? `${d.fuelReceiptCount} szt. · ${zl(d.fuelCost)}` : null,
  },
  {
    klucz: 'LAST_SHIFT',
    cel: 'LAST_SHIFT',
    etykieta: 'Ostatnia zmiana',
    opis: 'Kasuje jedną, najpóźniejszą zmianę dnia. Wcześniejsze zostają.',
    teraz: (d) => {
      const ostatnia = d.sesje.at(-1);
      return ostatnia ? `${ostatnia.od} – ${ostatnia.do ?? 'trwa'}` : null;
    },
  },
  {
    klucz: 'HOURS',
    cel: 'HOURS',
    etykieta: 'Wszystkie zmiany',
    opis: 'Kasuje każdą zmianę z tego dnia. Reszta dnia zostaje.',
    teraz: (d) =>
      d.sesje.length > 0
        ? `${d.sesje.length} szt. · ${godziny(d.workHours)}`
        : null,
  },
  {
    klucz: 'EARNINGS',
    cel: 'EARNINGS',
    etykieta: 'Zarobek brutto',
    opis: 'Czyści samo brutto. Napiwki i paliwo zostają.',
    teraz: (d) => (d.grossEarnings > 0 ? zl(d.grossEarnings) : null),
  },
  {
    klucz: 'DISTANCE',
    cel: 'DISTANCE',
    etykieta: 'Dystans',
    opis: 'Czyści przejechane kilometry.',
    teraz: (d) => (d.distanceKm !== null && d.distanceKm > 0 ? km(d.distanceKm) : null),
  },
  {
    klucz: 'ALL_DAY',
    cel: 'ALL_DAY',
    etykieta: 'Cały dzień',
    opis: 'Kasuje wpis dnia, napiwki i paragony. Nie da się tego cofnąć.',
    teraz: () => null,
    grozny: true,
  },
];

interface Props {
  widoczny: boolean;
  token: string;
  /** `null` = dzisiaj według serwera. Ta sama umowa co przy zapisach. */
  data: string | null;
  /** Nagłówek — np. `sobota, 16 sierpnia`. */
  etykietaDnia: string;
  /** Stan dnia do podglądu wartości. `null`, gdy jeszcze się nie wczytał. */
  dzien: DailySummary | null;
  onZamknij: () => void;
  onUsunieto: (wynik: UsunOdpowiedz) => void;
}

export function UsunWpisy({
  widoczny,
  token,
  data,
  etykietaDnia,
  dzien,
  onZamknij,
  onUsunieto,
}: Props) {
  const [potwierdzany, setPotwierdzany] = useState<string | null>(null);
  const [pracuje, setPracuje] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  /** Komunikat serwera — także ten o niepowodzeniu („Brak napiwków…"). */
  const [komunikat, setKomunikat] = useState<string | null>(null);

  /**
   * Lista pozycji = stałe wpisy PLUS jedna pozycja na każdą zmianę doby.
   *
   * Kasowanie idzie po `id` zmiany, nie po jej pozycji na liście: po skasowaniu
   * pierwszej druga staje się pierwszą i przycisk odziedziczyłby cudzą rolę.
   *
   * Zmiany są PRZED „Wszystkie zmiany", żeby ten groźniejszy wariant nie stał
   * pod kciukiem jako pierwszy.
   */
  const pozycje: Pozycja[] = [
    ...POZYCJE.slice(0, 3),
    ...(dzien?.sesje ?? []).map((sz, idx) => ({
      klucz: `SHIFT:${sz.id}`,
      cel: 'SHIFT' as const,
      sesjaId: sz.id,
      etykieta: `${numerZmiany(idx + 1)} zmiana`,
      opis: 'Kasuje tę jedną zmianę. Pozostałe zostają.',
      teraz: () => `${sz.od} – ${sz.do ?? 'trwa'}`,
    })),
    ...POZYCJE.slice(3),
  ];

  const zamknij = () => {
    if (pracuje !== null) return;
    setPotwierdzany(null);
    setBlad(null);
    setKomunikat(null);
    onZamknij();
  };

  const dotknij = async (p: Pozycja) => {
    if (pracuje !== null) return;

    if (potwierdzany !== p.klucz) {
      setPotwierdzany(p.klucz);
      setBlad(null);
      setKomunikat(null);
      return;
    }

    setPracuje(p.klucz);
    setBlad(null);
    try {
      const wynik = await postUsun(token, p.cel, data, p.sesjaId ?? null);
      setPotwierdzany(null);
      // `usuniete: false` to NIE jest błąd — to „nie było czego kasować".
      // Komunikat serwera mówi to wprost, więc pokazuję go bez tłumaczenia.
      setKomunikat(wynik.komunikat);
      onUsunieto(wynik);
    } catch (err) {
      // Kasowanie NIE trafia do kolejki offline — decyzja uzgodniona.
      // Powód jest w nagłówku `kolejka.ts`: „usuń ostatni napiwek" wysłane
      // cztery godziny później skasuje inny wpis niż ten, który użytkownik
      // miał przed oczami. Kasowanie jest nieodwracalne, więc lepsza jest
      // odmowa niż zgadywanie.
      if (err instanceof ApiError && toBrakSieci(err.status)) {
        setBlad(
          'Kasowanie wymaga połączenia z serwerem. Bez zasięgu aplikacja nie wie, ' +
            'który wpis jest „ostatni", więc nie odkłada tego na później — ' +
            'skasowałaby coś innego, niż widzisz na ekranie.'
        );
      } else {
        setBlad(err instanceof ApiError ? err.message : 'Nie udało się usunąć.');
      }
    } finally {
      setPracuje(null);
    }
  };

  return (
    <Modal visible={widoczny} animationType="slide" transparent={false} onRequestClose={zamknij}>
      <View style={s.tlo}>
        <ScrollView contentContainerStyle={s.zawartosc}>
          <Text style={s.tytul}>Usuń wpisy</Text>
          <Text style={s.podtytul}>{etykietaDnia}</Text>

          {komunikat ? (
            <View style={s.pasekOk}>
              <Text style={s.pasekOkTekst}>{komunikat}</Text>
            </View>
          ) : null}

          {blad ? <Text style={s.blad}>{blad}</Text> : null}

          {pozycje.map((p) => {
            const wartosc = dzien ? p.teraz(dzien) : null;
            const pusty = dzien !== null && wartosc === null && !p.grozny;
            const czeka = potwierdzany === p.klucz;
            const wToku = pracuje === p.klucz;

            return (
              <Pressable
                key={p.klucz}
                style={[
                  s.pozycja,
                  pusty && s.pozycjaPusta,
                  czeka && (p.grozny ? s.pozycjaGrozna : s.pozycjaCzekajaca),
                ]}
                onPress={() => void dotknij(p)}
                disabled={pracuje !== null}
              >
                <View style={s.pozycjaSrodek}>
                  <Text style={[s.pozycjaEtykieta, p.grozny && s.tekstGrozny]}>{p.etykieta}</Text>
                  <Text style={s.pozycjaOpis}>
                    {czeka ? 'Dotknij ponownie, żeby usunąć.' : p.opis}
                  </Text>
                </View>

                {wToku ? (
                  <ActivityIndicator size="small" color={C.blad} />
                ) : (
                  <Text style={[s.pozycjaWartosc, pusty && s.pozycjaWartoscPusta]}>
                    {wartosc ?? (p.grozny ? '' : 'brak')}
                  </Text>
                )}
              </Pressable>
            );
          })}

          <Text style={s.przypis}>
            Kasowanie dotyczy wyłącznie dnia w nagłówku. Zmiana dnia — w oknie „Dodaj wpis".
          </Text>

          <Pressable style={s.zamknij} onPress={zamknij} disabled={pracuje !== null}>
            <Text style={s.zamknijTekst}>Zamknij</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  tlo: { flex: 1, backgroundColor: C.tlo },
  zawartosc: { padding: 20, paddingTop: 56, paddingBottom: 40 },

  tytul: { color: C.tekst, fontSize: 24, fontWeight: '700' },
  podtytul: { color: C.tekstPrzygaszony, fontSize: 14, marginTop: 4, marginBottom: 20 },

  pasekOk: {
    backgroundColor: '#16251b',
    borderColor: C.akcent,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  pasekOkTekst: { color: C.akcent, fontSize: 13, lineHeight: 18 },
  blad: { color: C.blad, fontSize: 14, marginBottom: 12 },

  pozycja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  pozycjaPusta: { opacity: 0.45 },
  pozycjaCzekajaca: { borderColor: C.ostrzezenie, backgroundColor: '#2a2416' },
  pozycjaGrozna: { borderColor: C.blad, backgroundColor: '#2a1a1a' },
  pozycjaSrodek: { flex: 1 },
  pozycjaEtykieta: { color: C.tekst, fontSize: 15, fontWeight: '600' },
  tekstGrozny: { color: C.blad },
  pozycjaOpis: { color: C.tekstPrzygaszony, fontSize: 12, marginTop: 3, lineHeight: 16 },
  pozycjaWartosc: {
    color: C.tekst,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  pozycjaWartoscPusta: { color: C.tekstPrzygaszony, fontWeight: '400' },

  przypis: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: 8, lineHeight: 15 },

  zamknij: {
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 18,
  },
  zamknijTekst: { color: C.tekst, fontSize: 15, fontWeight: '600' },
});
