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
import { godziny, km, zl } from './format';
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
  cel: ZakresUsuniecia;
  etykieta: string;
  /** Co dokładnie zniknie — opis skutku, nie nazwa endpointu. */
  opis: string;
  /** Podgląd obecnej wartości; `null` = nie ma czego kasować. */
  teraz: (d: DailySummary) => string | null;
  grozny?: boolean;
}

const POZYCJE: Pozycja[] = [
  {
    cel: 'LAST_TIP',
    etykieta: 'Ostatni napiwek',
    opis: 'Kasuje jeden, najświeższy wpis napiwku.',
    teraz: (d) => (d.cashTipsTotal > 0 ? `razem ${zl(d.cashTipsTotal)}` : null),
  },
  {
    cel: 'ALL_TIPS',
    etykieta: 'Wszystkie napiwki',
    opis: 'Kasuje każdy napiwek z tego dnia.',
    teraz: (d) => (d.cashTipsTotal > 0 ? zl(d.cashTipsTotal) : null),
  },
  {
    cel: 'FUEL',
    etykieta: 'Paragony paliwowe',
    opis: 'Kasuje wszystkie tankowania z tego dnia.',
    teraz: (d) =>
      d.fuelReceiptCount > 0 ? `${d.fuelReceiptCount} szt. · ${zl(d.fuelCost)}` : null,
  },
  {
    cel: 'HOURS',
    etykieta: 'Godziny pracy',
    opis: 'Czyści wyjazd, zjazd i czas pracy. Reszta dnia zostaje.',
    teraz: (d) =>
      d.workFrom || d.workTo
        ? `${d.workFrom ?? '—'} – ${d.workTo ?? '—'} (${godziny(d.workHours)})`
        : null,
  },
  {
    cel: 'EARNINGS',
    etykieta: 'Zarobek brutto',
    opis: 'Czyści samo brutto. Napiwki i paliwo zostają.',
    teraz: (d) => (d.grossEarnings > 0 ? zl(d.grossEarnings) : null),
  },
  {
    cel: 'DISTANCE',
    etykieta: 'Dystans',
    opis: 'Czyści przejechane kilometry.',
    teraz: (d) => (d.distanceKm !== null && d.distanceKm > 0 ? km(d.distanceKm) : null),
  },
  {
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
  const [potwierdzany, setPotwierdzany] = useState<ZakresUsuniecia | null>(null);
  const [pracuje, setPracuje] = useState<ZakresUsuniecia | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  /** Komunikat serwera — także ten o niepowodzeniu („Brak napiwków…"). */
  const [komunikat, setKomunikat] = useState<string | null>(null);

  const zamknij = () => {
    if (pracuje !== null) return;
    setPotwierdzany(null);
    setBlad(null);
    setKomunikat(null);
    onZamknij();
  };

  const dotknij = async (cel: ZakresUsuniecia) => {
    if (pracuje !== null) return;

    if (potwierdzany !== cel) {
      setPotwierdzany(cel);
      setBlad(null);
      setKomunikat(null);
      return;
    }

    setPracuje(cel);
    setBlad(null);
    try {
      const wynik = await postUsun(token, cel, data);
      setPotwierdzany(null);
      // `usuniete: false` to NIE jest błąd — to „nie było czego kasować".
      // Komunikat serwera mówi to wprost, więc pokazuję go bez tłumaczenia.
      setKomunikat(wynik.komunikat);
      onUsunieto(wynik);
    } catch (err) {
      setBlad(err instanceof ApiError ? err.message : 'Nie udało się usunąć.');
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

          {POZYCJE.map((p) => {
            const wartosc = dzien ? p.teraz(dzien) : null;
            const pusty = dzien !== null && wartosc === null && !p.grozny;
            const czeka = potwierdzany === p.cel;
            const wToku = pracuje === p.cel;

            return (
              <Pressable
                key={p.cel}
                style={[
                  s.pozycja,
                  pusty && s.pozycjaPusta,
                  czeka && (p.grozny ? s.pozycjaGrozna : s.pozycjaCzekajaca),
                ]}
                onPress={() => dotknij(p.cel)}
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
