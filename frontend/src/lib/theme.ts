export type Theme = 'light' | 'dark';
export const THEME_KEY = 'retail-theme';

// Trusted constant source. Web responses attach a CSP nonce; native static
// builds hash this script together with the bundled Next scripts.
export const themeBootstrap = `(function(){var t;try{t=localStorage.getItem('retail-theme')}catch(e){}if(t!=='light'&&t!=='dark')t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;})();`;
