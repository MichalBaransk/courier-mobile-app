#!/usr/bin/env bash
# Wysłanie zmian na telefon przez EAS Update: npm run wdroz "krotki opis"
#
# Ta sama nazwa co w repozytorium bota i to samo znaczenie — „dostarcz moje
# zmiany tam, gdzie działają". Tylko że tu celem jest telefon, nie serwer,
# a transportem OTA zamiast SSH.
#
# UWAGA: to wysyła WYŁĄCZNIE JavaScript. Zmiany natywne wymagają nowego APK —
# lista przypadków jest w WDRAZANIE.md.
set -euo pipefail

OPIS="${1:-aktualizacja $(date +%F' '%H:%M)}"
KANAL="${KANAL:-preview}"

echo "🔍 1/4  Sprawdzam typy…"
npm run sprawdz

echo
if [ -z "$(git status --porcelain)" ]; then
  echo "📦 2/4  Brak zmian do zacommitowania — pomijam."
else
  echo "📦 2/4  Commituję:"
  git status --short
  git add -A
  git commit -m "$OPIS"
fi

echo
echo "⬆️  3/4  Wypycham na GitHuba…"
git push

echo
echo "📲 4/4  Wysyłam aktualizację na kanał '$KANAL'…"
eas update --branch "$KANAL" --message "$OPIS"

echo
echo "🎉 Gotowe."
echo "   Zamknij aplikację na telefonie i otwórz DWA RAZY:"
echo "   pierwsze uruchomienie pobiera paczkę w tle, drugie ją stosuje."
