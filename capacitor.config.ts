import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gridscape.app',
  appName: 'Gridscape',
  webDir: 'dist',
  android: {
    backgroundColor: '#f4d35e',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
