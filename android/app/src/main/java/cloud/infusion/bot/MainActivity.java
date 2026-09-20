package cloud.infusion.bot;

import com.getcapacitor.BridgeActivity;

/**
 * Atividade principal da casca do Infusion: o padrão do Capacitor.
 *
 * O deep link de login (cloud.infusion.bot://login#codeMitra=...&stateMitra=...)
 * NÃO é recarregado no WebView: o plugin App entrega a URL à página pelo evento
 * `appUrlOpen`, e é a página (frontend/src/lib/nativo.ts) que conclui o login
 * sem perder o estado da conversa.
 */
public class MainActivity extends BridgeActivity {}
