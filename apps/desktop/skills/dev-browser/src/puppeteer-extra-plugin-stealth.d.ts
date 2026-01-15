declare module 'puppeteer-extra-plugin-stealth' {
  import type { PlaywrightExtraPlugin } from 'playwright-extra';
  
  export default function StealthPlugin(): PlaywrightExtraPlugin;
}
