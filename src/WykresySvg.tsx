import { useWindowDimensions, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { C } from './theme';
import {
  linieSiatki,
  naY,
  sciezkaLamanej,
  zakresOsi,
  type PunktDnia,
  type ZakresOsi,
} from './wykresLicz';

/**
 * Rysowanie wykresów. Skala i kubełki siedzą w `wykresLicz.ts` — tutaj są
 * wyłącznie współrzędne i kolory.
 *
 * DLACZEGO SVG, A NIE `View` O WYLICZONEJ WYSOKOŚCI. Słupki da się zrobić na
 * `View` i tak zrobiony jest kalendarz w `Wykresy.tsx`. Linia, punkt i przerwa
 * w serii — już nie. `react-native-svg` jest wkompilowany w APK od kroku 30,
 * więc nie kosztuje ani nowego builda, ani utraty OTA.
 *
 * DLACZEGO BEZ BIBLIOTEKI WYKRESÓW. `victory-native` i pochodne ciągną za sobą
 * `react-native-reanimated` i `react-native-gesture-handler`, czyli DWA kolejne
 * moduły natywne — a to już oznaczałoby nowy APK. Za słupek i łamaną to cena
 * absurdalna.
 *
 * CZEGO TU NIE MA: dotknięcia słupka, podpowiedzi z wartością, powiększania.
 * Wybór dnia robi kalendarz i nie ma dwóch dróg do tego samego. Gdyby okazało
 * się w terenie, że brakuje — wtedy dołożymy.
 */

/* ========================================================================== */
/*  Wymiary                                                                   */
/* ========================================================================== */

/** Wysokość obszaru rysowania, bez podpisów. */
const WYS = 150;
/** Miejsce z lewej na wartości osi. Mieści „1 234". */
const LEWY = 40;
/** Miejsce pod spodem na podpisy dni. */
const DOLNY = 16;
/** Górny oddech, żeby najwyższy słupek nie dotykał krawędzi karty. */
const GORNY = 8;

const SIATKA = C.obramowanie;

function useSzerokosc(): number {
  const { width } = useWindowDimensions();
  // 16 px marginesu ekranu z każdej strony + 12 px wyściółki karty z każdej.
  return Math.max(220, width - 2 * 16 - 2 * 12);
}

/* ========================================================================== */
/*  Karta                                                                     */
/* ========================================================================== */

export function KartaWykresu({
  tytul,
  podpis,
  pusty,
  komunikatPusty,
  children,
}: {
  tytul: string;
  podpis?: string;
  /** `true` = nie ma czego rysować; zamiast pustej osi pokazujemy zdanie. */
  pusty: boolean;
  komunikatPusty: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.karta}>
      <Text style={s.naglowek}>{tytul}</Text>
      {pusty ? (
        <Text style={s.pusto}>{komunikatPusty}</Text>
      ) : (
        <>
          {children}
          {podpis !== undefined ? <Text style={s.podpis}>{podpis}</Text> : null}
        </>
      )}
    </View>
  );
}

/* ========================================================================== */
/*  Siatka i osie — wspólne dla wszystkich wykresów                           */
/* ========================================================================== */

function Siatka({
  os,
  szerokosc,
  formatuj,
}: {
  os: ZakresOsi;
  szerokosc: number;
  formatuj: (v: number) => string;
}) {
  return (
    <G>
      {linieSiatki(os).map((v) => {
        const y = GORNY + naY(v, os, WYS);
        return (
          <G key={v}>
            <Line x1={LEWY} y1={y} x2={szerokosc} y2={y} stroke={SIATKA} strokeWidth={1} />
            <SvgText
              x={LEWY - 6}
              y={y + 4}
              fill={C.tekstPrzygaszony}
              fontSize={10}
              textAnchor="end"
            >
              {formatuj(v)}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
}

/**
 * Podpisy pod osią poziomą.
 *
 * `podpis: null` znaczy „nic tu nie pisz". Trzydzieści jeden liczb pod rząd
 * zlewa się w szarą wstęgę, więc o tym, które etykiety w ogóle powstają,
 * decyduje ten, kto zna dane — a nie rysownik.
 */
function PodpisyOsi({ seria, szerokosc }: { seria: PunktSlupka[]; szerokosc: number }) {
  const krok = (szerokosc - LEWY) / Math.max(1, seria.length);

  return (
    <G>
      {seria.map((p, i) =>
        p.podpis === null ? null : (
          <SvgText
            key={p.klucz}
            x={LEWY + krok * (i + 0.5)}
            y={GORNY + WYS + 12}
            fill={C.tekstPrzygaszony}
            fontSize={9}
            textAnchor="middle"
          >
            {p.podpis}
          </SvgText>
        )
      )}
    </G>
  );
}

/* ========================================================================== */
/*  Słupki                                                                    */
/* ========================================================================== */

export interface PunktSlupka {
  /** Klucz Reacta. Data, numer kosza, godzina — cokolwiek unikalnego w serii. */
  klucz: string;
  /** Etykieta pod słupkiem. `null` = pomijamy, żeby oś się nie zlała. */
  podpis: string | null;
  wartosc: number | null;
  /** Kolor tego jednego słupka. Brak = kolor całej serii. */
  kolor?: string;
}

export function Slupki({
  seria,
  kolor = C.akcent,
  formatuj,
  odniesienie,
}: {
  seria: PunktSlupka[];
  kolor?: string;
  formatuj: (v: number) => string;
  /** Pozioma linia porównawcza (cel dzienny, próg opłacalności). */
  odniesienie?: { wartosc: number } | null;
}) {
  const szerokosc = useSzerokosc();
  const os = zakresOsi([...seria.map((p) => p.wartosc), odniesienie?.wartosc ?? null]);
  const krok = (szerokosc - LEWY) / Math.max(1, seria.length);
  // Zawsze zostaje szczelina między słupkami, ale przy 31 dniach słupek nie
  // może zejść poniżej 1 px, bo znika.
  const szerSlupka = Math.max(1, krok * 0.68);

  return (
    <Svg width={szerokosc} height={GORNY + WYS + DOLNY}>
      <Siatka os={os} szerokosc={szerokosc} formatuj={formatuj} />

      {seria.map((p, i) => {
        if (p.wartosc === null || p.wartosc <= 0) return null;
        const y = GORNY + naY(p.wartosc, os, WYS);
        return (
          <Rect
            key={p.klucz}
            x={LEWY + krok * i + (krok - szerSlupka) / 2}
            y={y}
            width={szerSlupka}
            height={Math.max(1, GORNY + WYS - y)}
            fill={p.kolor ?? kolor}
            rx={1.5}
          />
        );
      })}

      {odniesienie != null ? (
        <Line
          x1={LEWY}
          y1={GORNY + naY(odniesienie.wartosc, os, WYS)}
          x2={szerokosc}
          y2={GORNY + naY(odniesienie.wartosc, os, WYS)}
          stroke={C.ostrzezenie}
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      ) : null}

      <PodpisyOsi seria={seria} szerokosc={szerokosc} />
    </Svg>
  );
}

/**
 * Słupki dzień po dniu — `Slupki` z etykietami dat.
 *
 * Numer dnia co piąty plus zawsze pierwszy i ostatni. Bez tego wykres miesiąca
 * nie mówi, którego dnia dotyczy szczyt, a z pełnym kompletem — nie da się go
 * przeczytać.
 */
export function SlupkiDni({
  seria,
  kolor,
  formatuj,
  odniesienie,
}: {
  seria: PunktDnia[];
  kolor?: string;
  formatuj: (v: number) => string;
  odniesienie?: { wartosc: number } | null;
}) {
  return (
    <Slupki
      seria={naSlupkiDni(seria)}
      {...(kolor !== undefined ? { kolor } : {})}
      formatuj={formatuj}
      odniesienie={odniesienie ?? null}
    />
  );
}

export function naSlupkiDni(seria: PunktDnia[]): PunktSlupka[] {
  return seria.map((p, i) => ({
    klucz: p.data,
    podpis:
      i === 0 || i === seria.length - 1 || (i + 1) % 5 === 0
        ? String(Number.parseInt(p.data.slice(8, 10), 10))
        : null,
    wartosc: p.wartosc,
  }));
}

/* ========================================================================== */
/*  Łamana z przerwami                                                        */
/* ========================================================================== */

export interface Seria {
  punkty: PunktDnia[];
  kolor: string;
  /** Linia przerywana — pod serie porównawcze (poprzedni miesiąc, cel). */
  przerywana?: boolean;
  /** Kropki w punktach danych. Przy rzadkich seriach sama linia bywa niewidoczna. */
  kropki?: boolean;
}

export function LiniaDni({
  serie,
  formatuj,
}: {
  serie: Seria[];
  formatuj: (v: number) => string;
}) {
  const szerokosc = useSzerokosc();
  const wszystkie = serie.flatMap((s) => s.punkty.map((p) => p.wartosc));
  const os = zakresOsi(wszystkie);
  const dlugosc = Math.max(1, ...serie.map((s) => s.punkty.length));
  const krok = (szerokosc - LEWY) / dlugosc;

  return (
    <Svg width={szerokosc} height={GORNY + WYS + DOLNY}>
      <Siatka os={os} szerokosc={szerokosc} formatuj={formatuj} />

      {serie.map((seria, idx) => (
        <G key={idx}>
          <Path
            d={sciezkaLamanej(seria.punkty, os, krok, { lewy: LEWY, gorny: GORNY, wysokosc: WYS })}
            stroke={seria.kolor}
            strokeWidth={2}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            {...(seria.przerywana === true ? { strokeDasharray: '4 3' } : {})}
          />
          {seria.kropki === true
            ? seria.punkty.map((p, i) =>
                p.wartosc === null ? null : (
                  <Circle
                    key={p.data}
                    cx={LEWY + krok * (i + 0.5)}
                    cy={GORNY + naY(p.wartosc, os, WYS)}
                    r={2.5}
                    fill={seria.kolor}
                  />
                )
              )
            : null}
        </G>
      ))}

      <PodpisyOsi seria={naSlupkiDni(serie[0]?.punkty ?? [])} szerokosc={szerokosc} />
    </Svg>
  );
}

/* ========================================================================== */
/*  Legenda                                                                   */
/* ========================================================================== */

export function Legenda({ pozycje }: { pozycje: Array<{ kolor: string; opis: string }> }) {
  return (
    <View style={s.legenda}>
      {pozycje.map((p) => (
        <View key={p.opis} style={s.legendaPozycja}>
          <View style={[s.legendaKropka, { backgroundColor: p.kolor }]} />
          <Text style={s.legendaTekst}>{p.opis}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  karta: {
    backgroundColor: C.karta,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.obramowanie,
    padding: 12,
    marginBottom: 12,
  },
  naglowek: {
    color: C.tekstPrzygaszony,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },
  podpis: { color: C.tekstPrzygaszony, fontSize: 11, lineHeight: 16, marginTop: 8 },
  pusto: { color: C.tekstPrzygaszony, fontSize: 12, lineHeight: 18 },

  legenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  legendaPozycja: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendaKropka: { width: 8, height: 8, borderRadius: 4 },
  legendaTekst: { color: C.tekstPrzygaszony, fontSize: 11 },
});
