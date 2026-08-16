import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ApiError, getInfo, getToday, type ZapisOdpowiedz } from './src/api';
import { clearToken, readToken, saveToken } from './src/storage';
import { dataPoPolsku, godziny, km, litry, zl, zlZeZnakiem } from './src/format';
import { DodajWpis } from './src/DodajWpis';
import { C } from './src/theme';
import type { DailySummary } from './src/types';

/* ========================================================================== */
/*  Ekran wpisania tokena                                                     */
/* ========================================================================== */

function EkranTokena({ onZapisano }: { onZapisano: (token: string) => void }) {
  const [wartosc, setWartosc] = useState('');
  const [sprawdzam, setSprawdzam] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);

  const zapisz = async () => {
    const token = wartosc.trim();
    if (!token) {
      setBlad('Wklej token z pliku .env na serwerze.');
      return;
    }

    setSprawdzam(true);
    setBlad(null);
    try {
      // Token sprawdzamy PRZED zapisaniem — inaczej aplikacja zapamiętałaby
      // wartość, która i tak nie działa, i trzeba by ją kasować ręcznie.
      await getInfo(token);
      await saveToken(token);
      onZapisano(token);
    } catch (err) {
      setBlad(err instanceof ApiError ? err.message : 'Nie udało się połączyć.');
    } finally {
      setSprawdzam(false);
    }
  };

  return (
    <View style={s.ekranSrodek}>
      <Text style={s.tytulDuzy}>GlovoBot</Text>
      <Text style={s.podtytul}>Wklej token API z pliku .env na serwerze</Text>

      <TextInput
        style={s.pole}
        value={wartosc}
        onChangeText={setWartosc}
        placeholder="API_TOKEN"
        placeholderTextColor={C.tekstPrzygaszony}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        editable={!sprawdzam}
      />

      {blad ? <Text style={s.blad}>{blad}</Text> : null}

      <Pressable
        style={({ pressed }) => [s.przycisk, pressed && s.przyciskWcisniety, sprawdzam && s.przyciskNieaktywny]}
        onPress={zapisz}
        disabled={sprawdzam}
      >
        {sprawdzam ? (
          <ActivityIndicator color={C.tlo} />
        ) : (
          <Text style={s.przyciskTekst}>Połącz</Text>
        )}
      </Pressable>

      <Text style={s.stopka}>
        Token trafia do szyfrowanego magazynu systemu, nie do kodu aplikacji.
      </Text>
    </View>
  );
}

/* ========================================================================== */
/*  Karta podsumowania dnia                                                   */
/* ========================================================================== */

function Wiersz({
  etykieta,
  wartosc,
  kolor,
  duzy,
}: {
  etykieta: string;
  wartosc: string;
  kolor?: string;
  duzy?: boolean;
}) {
  return (
    <View style={s.wiersz}>
      <Text style={s.etykieta}>{etykieta}</Text>
      <Text style={[s.wartosc, duzy && s.wartoscDuza, kolor ? { color: kolor } : null]}>{wartosc}</Text>
    </View>
  );
}

function Sekcja({ tytul, children }: { tytul: string; children: ReactNode }) {
  return (
    <View style={s.karta}>
      <Text style={s.naglowekSekcji}>{tytul}</Text>
      {children}
    </View>
  );
}

function EkranDnia({ dane }: { dane: DailySummary }) {
  const brakGodzin = dane.workHours === 0;

  return (
    <>
      <Text style={s.data}>{dataPoPolsku(dane.date)}</Text>

      <Sekcja tytul="ZAROBEK">
        <Wiersz etykieta="Brutto" wartosc={zl(dane.grossEarnings)} />
        <Wiersz etykieta="Netto ze zleceń" wartosc={zl(dane.netEarnings)} />
        <Wiersz etykieta="Napiwki gotówką" wartosc={zl(dane.cashTipsTotal)} />
        <View style={s.kreska} />
        <Wiersz etykieta="Razem netto" wartosc={zl(dane.totalNetto)} kolor={C.akcent} duzy />
      </Sekcja>

      <Sekcja tytul="PORTFEL">
        <Wiersz etykieta="Wypłacone z portfela" wartosc={zl(dane.walletPayouts)} />
        <Wiersz
          etykieta="Do przelewu"
          wartosc={zlZeZnakiem(dane.doPrzelewu)}
          kolor={dane.doPrzelewu < 0 ? C.blad : C.tekst}
        />
        <Text style={s.przypis}>Napiwki nie wchodzą do przelewu — są już w kieszeni.</Text>
      </Sekcja>

      <Sekcja tytul="ZMIANA">
        <Wiersz
          etykieta="Godziny"
          wartosc={dane.workFrom && dane.workTo ? `${dane.workFrom} – ${dane.workTo}` : '—'}
        />
        <Wiersz etykieta="Czas pracy" wartosc={brakGodzin ? '—' : godziny(dane.workHours)} />
        <Wiersz
          etykieta="Stawka"
          wartosc={brakGodzin ? '—' : `${zl(dane.hourlyRateNetto)}/h`}
          kolor={brakGodzin ? C.tekstPrzygaszony : C.akcent}
        />
        <Wiersz etykieta="Dystans" wartosc={km(dane.distanceKm)} />
      </Sekcja>

      <Sekcja tytul="PALIWO">
        <Wiersz etykieta="Koszt" wartosc={zl(dane.fuelCost)} />
        <Wiersz etykieta="Ilość" wartosc={dane.fuelLiters > 0 ? litry(dane.fuelLiters) : '—'} />
        <Wiersz
          etykieta="Cena za litr"
          wartosc={dane.fuelPricePerLiter != null ? `${zl(dane.fuelPricePerLiter)}/L` : '—'}
        />
        {dane.fuelCost > 0 ? (
          <Text style={s.przypis}>
            Paliwo nie pomniejsza „razem netto" — świadoma decyzja, patrz dług techniczny §17.
          </Text>
        ) : null}
      </Sekcja>
    </>
  );
}

/* ========================================================================== */
/*  Korzeń aplikacji                                                          */
/* ========================================================================== */

type Stan = 'wczytywanie' | 'brakTokena' | 'gotowe';

export default function App() {
  const [stan, setStan] = useState<Stan>('wczytywanie');
  const [token, setToken] = useState<string | null>(null);
  const [dane, setDane] = useState<DailySummary | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [odswiezam, setOdswiezam] = useState(false);
  const [dodawanie, setDodawanie] = useState(false);
  /** Krótkie potwierdzenie po zapisie; znika przy następnej akcji. */
  const [potwierdzenie, setPotwierdzenie] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const zapisany = await readToken();
      if (zapisany) {
        setToken(zapisany);
        setStan('gotowe');
      } else {
        setStan('brakTokena');
      }
    })();
  }, []);

  const pobierz = useCallback(
    async (t: string) => {
      setBlad(null);
      try {
        setDane(await getToday(t));
      } catch (err) {
        if (err instanceof ApiError && err.isUnauthorized) {
          // Token przestał działać (np. wymieniony na serwerze) — kasujemy go
          // i wracamy do ekranu wpisywania zamiast pokazywać wieczny błąd.
          await clearToken();
          setToken(null);
          setDane(null);
          setStan('brakTokena');
          return;
        }
        setBlad(err instanceof ApiError ? err.message : 'Coś poszło nie tak.');
      }
    },
    []
  );

  useEffect(() => {
    if (stan === 'gotowe' && token) void pobierz(token);
  }, [stan, token, pobierz]);

  const odswiez = useCallback(async () => {
    if (!token) return;
    setOdswiezam(true);
    await pobierz(token);
    setOdswiezam(false);
  }, [token, pobierz]);

  const rozlacz = useCallback(async () => {
    await clearToken();
    setToken(null);
    setDane(null);
    setBlad(null);
    setStan('brakTokena');
  }, []);

  if (stan === 'wczytywanie') {
    return (
      <View style={[s.tlo, s.ekranSrodek]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={C.akcent} />
      </View>
    );
  }

  if (stan === 'brakTokena') {
    return (
      <View style={s.tlo}>
        <StatusBar style="light" />
        <EkranTokena
          onZapisano={(t) => {
            setToken(t);
            setStan('gotowe');
          }}
        />
      </View>
    );
  }

  return (
    <View style={s.tlo}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={s.zawartosc}
        refreshControl={
          <RefreshControl refreshing={odswiezam} onRefresh={odswiez} tintColor={C.akcent} />
        }
      >
        {blad ? (
          <View style={s.pasekBledu}>
            <Text style={s.pasekBleduTekst}>{blad}</Text>
            <Text style={s.pasekBleduPodpowiedz}>Pociągnij w dół, żeby spróbować ponownie.</Text>
          </View>
        ) : null}

        {potwierdzenie ? (
          <View style={s.pasekOk}>
            <Text style={s.pasekOkTekst}>{potwierdzenie}</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [s.dodaj, pressed && s.przyciskWcisniety]}
          onPress={() => {
            setPotwierdzenie(null);
            setDodawanie(true);
          }}
        >
          <Text style={s.dodajTekst}>+  Dodaj wpis</Text>
        </Pressable>

        {dane ? (
          <EkranDnia dane={dane} />
        ) : !blad ? (
          <View style={s.ekranSrodek}>
            <ActivityIndicator size="large" color={C.akcent} />
          </View>
        ) : null}

        <Pressable style={s.przyciskTekstowy} onPress={rozlacz}>
          <Text style={s.przyciskTekstowyTekst}>Zmień token</Text>
        </Pressable>
      </ScrollView>

      {token ? (
        <DodajWpis
          widoczny={dodawanie}
          token={token}
          dzisiaj={dane?.date ?? null}
          onZamknij={() => setDodawanie(false)}
          onZapisano={(wynik: ZapisOdpowiedz) => {
            // Serwer odesłał świeży stan dnia razem z potwierdzeniem zapisu,
            // więc odświeżamy kartę bez dodatkowego zapytania.
            setDane(wynik.dzien);
            setBlad(null);
            setPotwierdzenie(wynik.ostrzezenie ?? 'Zapisano.');
            setDodawanie(false);
          }}
        />
      ) : null}
    </View>
  );
}

/* ========================================================================== */

const s = StyleSheet.create({
  tlo: { flex: 1, backgroundColor: C.tlo },
  zawartosc: { padding: 16, paddingTop: 56, paddingBottom: 40 },
  ekranSrodek: { flex: 1, justifyContent: 'center', padding: 24 },

  tytulDuzy: { color: C.tekst, fontSize: 32, fontWeight: '700', textAlign: 'center' },
  podtytul: {
    color: C.tekstPrzygaszony,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 28,
  },

  pole: {
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: C.tekst,
    fontSize: 16,
  },

  przycisk: {
    backgroundColor: C.akcent,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 16,
  },
  przyciskWcisniety: { opacity: 0.75 },
  przyciskNieaktywny: { opacity: 0.5 },
  przyciskTekst: { color: C.tlo, fontSize: 16, fontWeight: '700' },

  stopka: { color: C.tekstPrzygaszony, fontSize: 12, textAlign: 'center', marginTop: 24 },

  data: {
    color: C.tekstPrzygaszony,
    fontSize: 15,
    marginBottom: 16,
  },

  karta: {
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  naglowekSekcji: {
    color: C.tekstPrzygaszony,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 12,
  },

  wiersz: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 5,
  },
  etykieta: { color: C.tekstPrzygaszony, fontSize: 14 },
  wartosc: { color: C.tekst, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  wartoscDuza: { fontSize: 22, fontWeight: '700' },

  kreska: { height: 1, backgroundColor: C.obramowanie, marginVertical: 8 },
  przypis: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: 10, lineHeight: 15 },

  pasekBledu: {
    backgroundColor: '#2a1a1a',
    borderColor: C.blad,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  pasekBleduTekst: { color: C.blad, fontSize: 14, fontWeight: '600' },
  pasekBleduPodpowiedz: { color: C.tekstPrzygaszony, fontSize: 12, marginTop: 4 },

  pasekOk: {
    backgroundColor: '#16251b',
    borderColor: C.akcent,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  pasekOkTekst: { color: C.akcent, fontSize: 14, fontWeight: '600' },

  dodaj: {
    backgroundColor: C.akcent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 16,
  },
  dodajTekst: { color: C.tlo, fontSize: 16, fontWeight: '700' },

  blad: { color: C.blad, fontSize: 13, marginTop: 12, textAlign: 'center' },

  przyciskTekstowy: { alignItems: 'center', paddingVertical: 18, marginTop: 4 },
  przyciskTekstowyTekst: { color: C.tekstPrzygaszony, fontSize: 13 },
});
