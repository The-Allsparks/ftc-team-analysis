import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const ftcProxy = {
  '/ftc-proxy': {
    target: 'https://ftc-events.firstinspires.org',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/ftc-proxy/, ''),
  },
};

const portfolioLabProxy = {
  '/portfolio-lab-proxy': {
    target: 'https://www.ftcportfoliolab.org',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/portfolio-lab-proxy/, ''),
  },
};

const ftcScoutProxy = {
  '/ftcscout-proxy': {
    target: 'https://api.ftcscout.org',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/ftcscout-proxy/, ''),
  },
};

const ftcScoringProxy = {
  '/ftc-scoring-proxy': {
    target: 'https://ftc-scoring.firstinspires.org',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/ftc-scoring-proxy/, ''),
  },
};

const openAllianceProxy = {
  '/open-alliance-proxy': {
    target: 'https://api.theopenalliance.org',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/open-alliance-proxy/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      ...ftcProxy,
      ...portfolioLabProxy,
      ...ftcScoutProxy,
      ...ftcScoringProxy,
      ...openAllianceProxy,
    },
  },
  preview: {
    proxy: {
      ...ftcProxy,
      ...portfolioLabProxy,
      ...ftcScoutProxy,
      ...ftcScoringProxy,
      ...openAllianceProxy,
    },
  },
});
