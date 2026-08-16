import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, getInfo } from './api';
import { saveToken } from './storage';
import { C } from './theme';

/**
 * Pierwsze uruchomienie: wpisanie tokena API.
 *
 * Token jest sprawdzany przez `/api/v1/info` ZANIM trafi do magazynu — inaczej
 * literówka zostałaby zapamiętana i trzeba by ją kasować ręcznie.
 */
export function EkranTokena({ onZapisano }: { onZapisano: (token: string) => void }) {
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
    <View style={s.srodek}>
      <Text style={s.tytul}>GlovoBot</Text>
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
        style={({ pressed }) => [s.przycisk, pressed && s.wcisniety, sprawdzam && s.nieaktywny]}
        onPress={zapisz}
        disabled={sprawdzam}
      >
        {sprawdzam ? <ActivityIndicator color={C.tlo} /> : <Text style={s.przyciskTekst}>Połącz</Text>}
      </Pressable>

      <Text style={s.stopka}>
        Token trafia do szyfrowanego magazynu systemu, nie do kodu aplikacji.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  srodek: { flex: 1, justifyContent: 'center', padding: 24 },
  tytul: { color: C.tekst, fontSize: 32, fontWeight: '700', textAlign: 'center' },
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
  blad: { color: C.blad, fontSize: 13, marginTop: 12, textAlign: 'center' },
  przycisk: {
    backgroundColor: C.akcent,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 16,
  },
  wcisniety: { opacity: 0.75 },
  nieaktywny: { opacity: 0.5 },
  przyciskTekst: { color: C.tlo, fontSize: 16, fontWeight: '700' },
  stopka: { color: C.tekstPrzygaszony, fontSize: 12, textAlign: 'center', marginTop: 24 },
});
