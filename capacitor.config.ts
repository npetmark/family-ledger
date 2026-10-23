import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.familyledger.app',
  appName: 'bearfinance',
  webDir: 'dist',
  server: {
    url: 'https://npetmark.github.io/family-ledger/',
    cleartext: true,
  },
};

export default config;
