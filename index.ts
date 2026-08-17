// ⚠️ TA LINIA MUSI BYĆ PIERWSZA W CAŁEJ APLIKACJI.
//
// `react-native-gesture-handler` podmienia natywny system obsługi dotyku
// i musi to zrobić, zanim cokolwiek innego zdąży się zarejestrować.
// Zaimportowany później działa „prawie" — gesty łapią się losowo, a błąd
// nie pojawia się w żadnym logu.
import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
