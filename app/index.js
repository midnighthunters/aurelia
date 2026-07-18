/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {Speech} from './src/voice/Speech';
import {fetchCheckInPrompt} from './src/api/client';

AppRegistry.registerComponent(appName, () => App);

/**
 * Headless check-in task invoked by CheckInHeadlessService when the UI may not be mounted.
 * Speaks a short prompt through the current audio route (earbuds if connected).
 */
AppRegistry.registerHeadlessTask('AureliaCheckIn', () => async data => {
  try {
    const phase0 = !!(data && data.phase0);
    const prompt = phase0
      ? 'Phase zero probe. I am still alive in the background.'
      : await fetchCheckInPrompt();
    await Speech.speak(prompt);
  } catch (e) {
    // Best-effort — foreground service event path may still handle UI-mounted case
    console.warn('AureliaCheckIn headless failed', e);
  }
});
