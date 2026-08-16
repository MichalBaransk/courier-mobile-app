# Wdrażanie aplikacji — ściąga

Wszystkie polecenia uruchamiasz **w WSL**, w `~/projekty/courier-app`.

```bash
cd ~/projekty/courier-app
```

Aplikacja nie ma nic wspólnego z serwerem. Działa na telefonie i tylko odpytuje API bota po HTTPS.

---

## 1. Nałóż patch przysłany w czacie

```bash
npm run patch -- /mnt/c/Users/micha/Downloads/nazwa-pliku.patch
```

Skrypt sam naprawia końce linii z Windowsa i rozpoznaje, że patch jest już nałożony.

---

## 2. Sprawdź, czy nic się nie zepsuło

```bash
npm run sprawdz
```

`tsc --noEmit`. Musi być zielone.

---

## 3. Wyślij na telefon

```bash
npm run wdroz "krotki opis zmiany"
```

Robi po kolei: typecheck → commit → push → `eas update` na kanał `preview`.

**Potem na telefonie zamknij aplikację i otwórz DWA RAZY.** `expo-updates` pobiera paczkę w tle przy starcie i stosuje ją dopiero przy następnym uruchomieniu. To nie jest błąd, tylko domyślne zachowanie — pierwsze otwarcie po aktualizacji zwykle pokazuje jeszcze starą wersję.

Trwa kilkanaście sekund, nie ma kolejki, nie ma reinstalacji.

---

## 4. Kiedy OTA NIE wystarczy — potrzebny nowy APK

`eas update` wysyła **wyłącznie JavaScript**. Nowy build jest konieczny, gdy:

| zmiana | dlaczego |
|---|---|
| nowy moduł natywny (`expo-location`, `expo-share-intent`, …) | kod natywny musi zostać wkompilowany |
| uprawnienia, ikony, nazwa, `package` w `app.json` | to część manifestu Androida |
| podbicie `expo.version` | `runtimeVersion` jest ustawione na `appVersion` — zmiana wersji odcina istniejący APK od aktualizacji |
| podniesienie Expo SDK | zmienia się cały runtime |

```bash
eas build -p android --profile preview
```

Trwa ok. 6 minut. Potem otwierasz link z terminala **na telefonie**, pobierasz APK i instalujesz.

Nowy APK instaluje się **na wierzch** starego: ten sam `package` i ten sam keystore z chmury Expo, więc Android traktuje go jak aktualizację. **Token w SecureStore przetrwa** — czyści go dopiero pełne odinstalowanie.

> Pułapka `runtimeVersion: appVersion`: jeśli podbijesz `version` w `app.json` i wyślesz OTA, telefon z poprzednim APK **nie dostanie tej aktualizacji** i nie zgłosi błędu — po prostu zostanie na starej wersji. Podbijaj `version` tylko razem z nowym buildem.

---

## Coś poszło nie tak

| objaw | co zrobić |
|---|---|
| `patch does not apply` | `git log --oneline -3` i wyślij mi wynik |
| typecheck na czerwono | **nie wysyłaj**, pokaż mi błąd |
| aplikacja nie widzi aktualizacji | otwórz ją dwa razy; sprawdź, czy `version` w `app.json` nie zostało podbite |
| „Serwer odrzucił token" | token wymieniony na serwerze — aplikacja sama wróci do ekranu wpisywania |
| „Brak połączenia z serwerem" | sprawdź bota: `docker compose --profile webhook logs --tail=20 bot` |

## Cofnięcie aktualizacji

```bash
eas update:rollback --branch preview
```

Cofa telefon do poprzedniej paczki bez przebudowy.

---

## Czego tu NIE ma

- **Serwera.** API i baza to repozytorium `courier-bot` i jego własne `WDRAZANIE.md`.
- **Sekretów.** Token API wpisujesz w aplikacji i ląduje w szyfrowanym magazynie Androida. W repozytorium nie ma nic wrażliwego.
- **Bazy danych po stronie telefonu.** Aplikacja niczego nie przechowuje — pyta API i wyświetla odpowiedź.
