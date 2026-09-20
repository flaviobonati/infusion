import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuração da casca nativa do Infusion.
 *
 * O app NÃO embute o frontend: o WebView carrega o site ao vivo em
 * https://bot.infusion.cloud. Assim, todo deploy web atualiza o app
 * instalado sem passar pelas lojas. A pasta `www` existe só porque o
 * Capacitor exige um webDir; ela contém um placeholder mínimo.
 */
const config: CapacitorConfig = {
  appId: 'cloud.infusion.bot',
  appName: 'Infusion',
  webDir: 'www',
  server: {
    // Site carregado ao vivo dentro do WebView.
    url: 'https://bot.infusion.cloud',
    // Só HTTPS: nada de tráfego em texto puro.
    cleartext: false,
    // Domínios que o WebView pode navegar sem abrir o navegador do sistema.
    allowNavigation: [
      'bot.infusion.cloud',
      'app.infusion.cloud',
      '*.infusion.cloud',
      'accounts.google.com',
    ],
  },
  plugins: {
    SplashScreen: {
      // A página web esconde a splash quando estiver pronta
      // (SplashScreen.hide() via window.Capacitor); por isso não some sozinha.
      launchAutoHide: false,
      backgroundColor: '#0b0f14',
    },
    PushNotifications: {
      // Como a notificação aparece quando o app está em primeiro plano (iOS).
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      // A barra de status não sobrepõe o conteúdo do WebView.
      overlaysWebView: false,
    },
  },
};

export default config;
