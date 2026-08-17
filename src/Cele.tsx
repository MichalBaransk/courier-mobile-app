import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ApiError, postCel } from './api';
import { godzinyLubMinuty, zl } from './format';
import { iloraz, skonczona } from './licz';
import { ocenLiczbe } from './limity';
import { C } from './theme';
import type { TargetProgress } from './types';

/**
 * Cele zarobkowe — pasek postępu i ustawianie kwoty.
 *
 * Cała arytmetyka (ile zostało, ile dziennie, ile godzin) jest liczona PO
 * STRONIE SERWERA w `getTargetProgress`. Aplikacja tylko rysuje. Powielenie
 * tych wzorów tutaj skończyłoby się dwoma zestawami reguł, które rozjadą się
 * przy pierwszej zmianie `NETTO_FACTOR` — to ta sama zasada, co przy walidacji
 * w formularzu wpisu.
 *
 * WAŻNE: serwer liczy postęp wyłącznie dla BIEŻĄCEGO okresu (`getEffectiveDate`).
 * Karty celu nie ma sensu pokazywać przy oglądaniu marca — i `App.tsx` jej
 * wtedy nie renderuje.
 */

/** Pasek postępu z czystych `View` — żadnego SVG, żadnego modułu natywnego. */
export function PasekPostepu({ procent, kolor }: { procent: number; kolor: string }) {
  // `Math.min(100, Math.max(0, NaN))` to nadal `NaN`, a `width: 'NaN%'` nie jest
  // w React Native błędem — po prostu cicho psuje układ. Stąd `skonczona`.
  const szerokosc = Math.max(0, Math.min(100, skonczona(procent) ?? 0));
  return (
    <View style={s.tor}>
      <View style={[s.wypelnienie, { width: `${szerokosc}%`, backgroundColor: kolor }]} />
    </View>
  );
}

export function KartaCelu({
  postep,
  etykieta,
  okres,
  onUstaw,
}: {
  postep: TargetProgress | null;
  /** `CEL MIESIĘCZNY` albo `CEL TYGODNIOWY`. */
  etykieta: string;
  okres: 'MONTHLY' | 'WEEKLY';
  onUstaw: (okres: 'MONTHLY' | 'WEEKLY', biezacaKwota: number | null) => void;
}) {
  if (postep === null) {
    return (
      <View style={s.karta}>
        <Text style={s.naglowek}>{etykieta}</Text>
        <Text style={s.przypis}>Nie ustawiono celu na ten okres.</Text>
        <Pressable style={s.przyciskWtorny} onPress={() => onUstaw(okres, null)}>
          <Text style={s.przyciskWtornyTekst}>Ustaw cel</Text>
        </Pressable>
      </View>
    );
  }

  const kolor = postep.isCompleted ? C.akcent : postep.progressPercent >= 60 ? C.akcent : C.ostrzezenie;

  /**
   * Godziny dziennie liczone TUTAJ, a nie brane z `hoursPerDayRequired`.
   *
   * Serwer zaokrągla to pole do 0,1 h, czyli do sześciu minut. Przy celu
   * rozłożonym na dwadzieścia dni wychodzi 0,02 h → zaokrągla się do zera →
   * karta pokazywała „—", jakby nie było czego liczyć. Oba składniki
   * (`estimatedHoursRemaining`, `daysRemaining`) przychodzą z serwera,
   * więc dzielenie tutaj nie duplikuje żadnej reguły biznesowej — poprawia
   * tylko rozdzielczość tego, co i tak jest już policzone.
   */
  const godzinDziennie = iloraz(postep.estimatedHoursRemaining, postep.daysRemaining);

  return (
    <View style={s.karta}>
      <View style={s.naglowekRzad}>
        <Text style={s.naglowek}>{etykieta}</Text>
        <Pressable onPress={() => onUstaw(okres, postep.targetAmount)}>
          <Text style={s.link}>Zmień</Text>
        </Pressable>
      </View>

      <View style={s.kwoty}>
        <Text style={[s.duzaKwota, { color: kolor }]}>{zl(postep.currentNetto)}</Text>
        <Text style={s.zKwoty}>z {zl(postep.targetAmount)}</Text>
      </View>

      <PasekPostepu procent={postep.progressPercent} kolor={kolor} />

      <View style={s.podPaskiem}>
        <Text style={[s.procent, { color: kolor }]}>
          {(skonczona(postep.progressPercent) ?? 0).toFixed(1).replace('.', ',')}%
        </Text>
        <Text style={s.dni}>
          {postep.daysRemaining === 1 ? 'ostatni dzień' : `zostało ${postep.daysRemaining} dni`}
        </Text>
      </View>

      {postep.isCompleted ? (
        <Text style={s.sukces}>Cel osiągnięty. Reszta to nadwyżka.</Text>
      ) : (
        <>
          <View style={s.kreska} />
          <Wiersz etykieta="Brakuje" wartosc={zl(postep.remainingNetto)} />
          <Wiersz etykieta="Dziennie trzeba" wartosc={zl(postep.dailyRequiredNetto)} kolor={kolor} />
          <Wiersz
            etykieta="To około"
            wartosc={
              godzinDziennie === null ? '—' : `${godzinyLubMinuty(godzinDziennie)} dziennie`
            }
          />
          {postep.estimatedHoursRemaining > 0 ? (
            <Wiersz
              etykieta="Do końca okresu"
              wartosc={godzinyLubMinuty(postep.estimatedHoursRemaining)}
            />
          ) : null}
          <Text style={s.przypis}>
            {postep.usedFallbackRate
              ? `Przeliczone stawką domyślną ${zl(postep.avgHourlyRate)}/h — brak własnych godzin w tym okresie.`
              : `Przy Twojej stawce ${zl(postep.avgHourlyRate)}/h z tego okresu.`}
          </Text>
        </>
      )}
    </View>
  );
}

function Wiersz({
  etykieta,
  wartosc,
  kolor,
}: {
  etykieta: string;
  wartosc: string;
  kolor?: string;
}) {
  return (
    <View style={s.wiersz}>
      <Text style={s.etykieta}>{etykieta}</Text>
      <Text style={[s.wartosc, kolor ? { color: kolor } : null]}>{wartosc}</Text>
    </View>
  );
}

/* ========================================================================== */
/*  Ustawianie celu                                                           */
/* ========================================================================== */

/** `12,50` i `12.50` znaczą to samo — polska klawiatura daje przecinek. */
function liczba(tekst: string): number | null {
  const t = tekst.trim().replace(',', '.');
  if (t.length === 0) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function UstawCel({
  widoczny,
  token,
  okres,
  kwotaStartowa,
  onZamknij,
  onZapisano,
}: {
  widoczny: boolean;
  token: string;
  okres: 'MONTHLY' | 'WEEKLY';
  /** Obecna kwota celu — wpisana od razu, żeby dało się ją tylko poprawić. */
  kwotaStartowa: number | null;
  onZamknij: () => void;
  onZapisano: () => void;
}) {
  const [kwota, setKwota] = useState('');
  const [zapisuje, setZapisuje] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  /** Nietypowa kwota czeka na drugie dotknięcie — jak w formularzu wpisu. */
  const [ostrzezenie, setOstrzezenie] = useState<string | null>(null);
  /**
   * `widoczny` przełącza się na `true` przy każdym otwarciu, ale komponent
   * NIE jest odmontowywany między otwarciami — `Modal` z `visible={false}`
   * zostaje w drzewie. Bez tego resetu pole pamiętałoby poprzedni wpis.
   */
  const [poprzednioWidoczny, setPoprzednioWidoczny] = useState(false);
  if (widoczny !== poprzednioWidoczny) {
    setPoprzednioWidoczny(widoczny);
    if (widoczny) {
      setKwota(kwotaStartowa === null ? '' : String(kwotaStartowa).replace('.', ','));
      setBlad(null);
      setOstrzezenie(null);
    }
  }

  const zapisz = async () => {
    const wartosc = liczba(kwota);
    if (wartosc === null) {
      setBlad('Wpisz kwotę.');
      return;
    }

    // Cel 60 000 zł na tydzień nie jest ambicją, tylko brakiem przecinka.
    const ocena = ocenLiczbe(okres === 'MONTHLY' ? 'celMiesieczny' : 'celTygodniowy', wartosc);
    if (ocena.blad !== null) {
      setBlad(ocena.blad);
      setOstrzezenie(null);
      return;
    }
    if (ocena.ostrzezenie !== null && ostrzezenie !== ocena.ostrzezenie) {
      setOstrzezenie(ocena.ostrzezenie);
      setBlad(null);
      return;
    }
    setOstrzezenie(null);

    setZapisuje(true);
    setBlad(null);
    try {
      await postCel(token, okres, wartosc);
      onZapisano();
      onZamknij();
    } catch (err) {
      setBlad(err instanceof ApiError ? err.message : 'Nie udało się zapisać celu.');
    } finally {
      setZapisuje(false);
    }
  };

  const nazwa = okres === 'MONTHLY' ? 'miesięczny' : 'tygodniowy';

  return (
    <Modal visible={widoczny} animationType="fade" transparent onRequestClose={onZamknij}>
      <KeyboardAvoidingView
        style={s.przyciemnienie}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.modal}>
          <Text style={s.tytulModalu}>Cel {nazwa}</Text>
          <Text style={s.przypisModalu}>
            Kwota netto — brutto po odjęciu {'≈'}18,6% plus napiwki gotówką. Ta sama liczba, którą
            aplikacja pokazuje jako „Razem netto".
          </Text>

          <TextInput
            style={s.pole}
            value={kwota}
            onChangeText={setKwota}
            placeholder={okres === 'MONTHLY' ? '6000' : '1500'}
            placeholderTextColor={C.tekstPrzygaszony}
            keyboardType="decimal-pad"
            editable={!zapisuje}
            autoFocus
          />

          {blad ? <Text style={s.blad}>{blad}</Text> : null}

          {ostrzezenie !== null ? (
            <View style={s.ostrzezenie}>
              <Text style={s.ostrzezenieTekst}>{ostrzezenie}</Text>
              <Text style={s.ostrzezeniePodpowiedz}>
                Dotknij „Zapisz cel" ponownie, żeby potwierdzić.
              </Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [s.zapisz, pressed && s.wcisniety, zapisuje && s.nieaktywny]}
            onPress={zapisz}
            disabled={zapisuje}
          >
            {zapisuje ? (
              <ActivityIndicator color={C.tlo} />
            ) : (
              <Text style={s.zapiszTekst}>Zapisz cel</Text>
            )}
          </Pressable>

          <Pressable style={s.anuluj} onPress={onZamknij} disabled={zapisuje}>
            <Text style={s.anulujTekst}>Anuluj</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  karta: {
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  naglowekRzad: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  naglowek: {
    color: C.tekstPrzygaszony,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  link: { color: C.akcent, fontSize: 13, fontWeight: '600', marginBottom: 12 },

  kwoty: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 10 },
  duzaKwota: { fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  zKwoty: { color: C.tekstPrzygaszony, fontSize: 14 },

  tor: {
    height: 10,
    borderRadius: 999,
    backgroundColor: C.obramowanie,
    overflow: 'hidden',
  },
  wypelnienie: { height: '100%', borderRadius: 999 },

  podPaskiem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  procent: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dni: { color: C.tekstPrzygaszony, fontSize: 12 },

  sukces: { color: C.akcent, fontSize: 13, fontWeight: '600', marginTop: 12 },

  kreska: { height: 1, backgroundColor: C.obramowanie, marginVertical: 10 },
  wiersz: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 4,
  },
  etykieta: { color: C.tekstPrzygaszony, fontSize: 14, flexShrink: 1, paddingRight: 8 },
  wartosc: { color: C.tekst, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  przypis: { color: C.tekstPrzygaszony, fontSize: 11, marginTop: 10, lineHeight: 15 },

  przyciskWtorny: {
    borderColor: C.akcent,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  przyciskWtornyTekst: { color: C.akcent, fontSize: 14, fontWeight: '700' },

  przyciemnienie: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: C.karta,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
  },
  tytulModalu: { color: C.tekst, fontSize: 20, fontWeight: '700', textTransform: 'capitalize' },
  przypisModalu: { color: C.tekstPrzygaszony, fontSize: 12, marginTop: 6, lineHeight: 17 },
  pole: {
    backgroundColor: C.tlo,
    borderColor: C.obramowanie,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: C.tekst,
    fontSize: 22,
    marginTop: 16,
    fontVariant: ['tabular-nums'],
  },
  blad: { color: C.blad, fontSize: 14, marginTop: 8 },
  ostrzezenie: {
    backgroundColor: '#2a2416',
    borderColor: C.ostrzezenie,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  ostrzezenieTekst: { color: C.ostrzezenie, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  ostrzezeniePodpowiedz: { color: C.tekstPrzygaszony, fontSize: 12, marginTop: 4 },

  zapisz: {
    backgroundColor: C.akcent,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 16,
  },
  wcisniety: { opacity: 0.75 },
  nieaktywny: { opacity: 0.5 },
  zapiszTekst: { color: C.tlo, fontSize: 16, fontWeight: '700' },
  anuluj: { alignItems: 'center', paddingVertical: 14 },
  anulujTekst: { color: C.tekstPrzygaszony, fontSize: 14 },
});
