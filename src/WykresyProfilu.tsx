import { zl } from './format';
import type { Zakres } from './okresy';
import { C } from './theme';
import type { DailyTotals } from './types';
import { KartaWykresu, Legenda, LiniaDni, Slupki, type PunktSlupka } from './WykresySvg';
import { narastajaco, profilTygodnia, seriaDni, zakresZDanymi } from './wykresLicz';

/**
 * Profil tygodnia i koszty — trzecia partia wykresów.
 *
 * Znowu bez nowych żądań: `profilTygodnia()` i `seriaDni()` liczą wszystko
 * z `dniMiesiaca`.
 */

const DNI_SKROT = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'];

export function WykresyProfilu({ dni, zakres }: { dni: DailyTotals[]; zakres: Zakres }) {
  const profil = profilTygodnia(dni);

  const zarobekTygodnia: PunktSlupka[] = profil.map((p) => ({
    klucz: `z${p.dzien}`,
    podpis: DNI_SKROT[p.dzien] ?? '',
    wartosc: p.sredniNetto,
  }));

  const stawkaTygodnia: PunktSlupka[] = profil.map((p) => ({
    klucz: `s${p.dzien}`,
    podpis: DNI_SKROT[p.dzien] ?? '',
    wartosc: p.sredniaZlH,
  }));

  // Narastające zostają na pełnym miesiącu — suma od pierwszego dnia to
  // właśnie to, co mają pokazywać. Stawka na kilometr zawęża się do dni
  // z danymi, jak reszta wykresów dziennych.
  const netto = narastajaco(seriaDni(dni, zakres, 'netto'));
  const paliwo = narastajaco(seriaDni(dni, zakres, 'paliwo'));
  const zlKm = seriaDni(dni, zakresZDanymi(dni, zakres), 'zlKm');

  const sumaNetto = netto.at(-1)?.wartosc ?? 0;
  const sumaPaliwa = paliwo.at(-1)?.wartosc ?? 0;
  const udzialPaliwa = sumaNetto > 0 ? Math.round((sumaPaliwa / sumaNetto) * 100) : null;

  const najlepszy = [...profil]
    .filter((p) => p.sredniaZlH !== null && p.ile >= 2)
    .sort((a, b) => (b.sredniaZlH ?? 0) - (a.sredniaZlH ?? 0))[0];

  const sąDni = profil.some((p) => p.ile > 0);

  return (
    <>
      <KartaWykresu
        tytul="ŚREDNI ZAROBEK WG DNIA TYGODNIA"
        osY="zł netto (średnia z dnia)"
        osX="dzień tygodnia"
        pusty={!sąDni}
        komunikatPusty="Za mało przepracowanych dni, żeby liczyć średnie."
        podpis="Średnia z dni, w których pracowałeś. Dni wolne NIE wchodzą do średniej — inaczej każdy wolny poniedziałek ciągnąłby poniedziałki w dół i wyszłoby, że to najgorszy dzień tygodnia."
      >
        <Slupki seria={zarobekTygodnia} formatuj={(v) => String(Math.round(v))} />
      </KartaWykresu>

      <KartaWykresu
        tytul="ŚREDNIA STAWKA ZŁ/H WG DNIA TYGODNIA"
        osY="zł na godzinę"
        osX="dzień tygodnia"
        pusty={!sąDni}
        komunikatPusty="Żaden dzień w tym miesiącu nie ma zapisanych godzin."
        podpis={
          najlepszy === undefined
            ? 'Stawka ważona godzinami, nie średnia z dziennych stawek.'
            : `Najlepszy dzień to ${DNI_SKROT[najlepszy.dzien]} — ${zl(najlepszy.sredniaZlH)}/h z ${najlepszy.sumaGodzin} h. Stawka ważona godzinami: dzień z jedną godziną po 60 zł nie waży tyle, co dziesięć po 25.`
        }
      >
        <Slupki
          seria={stawkaTygodnia}
          kolor="#60a5fa"
          formatuj={(v) => String(Math.round(v))}
        />
      </KartaWykresu>

      <KartaWykresu
        tytul="PALIWO NA TLE ZAROBKU"
        osY="zł, suma od 1. dnia"
        osX="dzień miesiąca"
        pusty={sumaPaliwa <= 0}
        komunikatPusty="Brak zatankowanych paragonów w tym miesiącu."
        podpis={
          udzialPaliwa === null
            ? `Paliwo narastająco: ${zl(sumaPaliwa)}.`
            : `Paliwo zjadło ${udzialPaliwa}% zarobku netto (${zl(sumaPaliwa)} z ${zl(sumaNetto)}). UWAGA: bot NIE odejmuje paliwa od „czystego netto" ani od stawki zł/h — ten wykres jest jedynym miejscem, w którym ten koszt widać obok zarobku.`
        }
      >
        <LiniaDni
          serie={[
            { punkty: netto, kolor: C.akcent },
            { punkty: paliwo, kolor: C.blad },
          ]}
          formatuj={(v) => String(Math.round(v))}
        />
        <Legenda
          pozycje={[
            { kolor: C.akcent, opis: 'netto narastająco' },
            { kolor: C.blad, opis: 'paliwo narastająco' },
          ]}
        />
      </KartaWykresu>

      <KartaWykresu
        tytul="ZŁ NA PRZEJECHANY KILOMETR"
        osY="zł netto na kilometr"
        osX="dzień miesiąca"
        pusty={zlKm.every((p) => p.wartosc === null)}
        komunikatPusty="Żaden dzień nie ma zapisanego dystansu."
        podpis="Netto dnia podzielone przez kilometry z licznika — inna wielkość niż stawka oferty. Tamta liczy kilometry JEDNEGO kursu, ta wszystkie przejechane, razem z pustymi przejazdami między zamówieniami."
      >
        <LiniaDni
          serie={[{ punkty: zlKm, kolor: C.akcent, kropki: true }]}
          formatuj={(v) => String(Math.round(v * 10) / 10)}
        />
      </KartaWykresu>
    </>
  );
}
