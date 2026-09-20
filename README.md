# Infusion — casca mobile (Capacitor)

Este diretório contém o app nativo do Infusion para Android e iOS. Ele **não embute o frontend**: é uma casca [Capacitor](https://capacitorjs.com) cujo WebView carrega o site ao vivo em `https://bot.infusion.cloud`. Todo deploy da web atualiza o app instalado na hora, sem passar pelas lojas.

O que a casca acrescenta ao site:

- ícone, splash e barra de status nativos;
- login via navegador do sistema com retorno por deep link (`cloud.infusion.bot://login`);
- notificações push (FCM no Android, APNs no iOS) expostas à página web via `window.Capacitor`;
- App Links / Universal Links para `https://bot.infusion.cloud`.

Nada aqui depende de `frontend/` ou `backend/`; a pasta `www/` tem só um placeholder porque o Capacitor exige um `webDir`.

## Estrutura

| Caminho | Papel |
|---|---|
| `capacitor.config.ts` | `appId`, `appName`, `server.url` (site ao vivo), domínios permitidos e configuração dos plugins |
| `www/index.html` | placeholder; nunca é exibido em uso normal |
| `android/` | projeto Android gerado por `npx cap add android` (+ ajustes abaixo) |
| `ios/` | projeto Xcode gerado por `npx cap add ios`, com dependências via Swift Package Manager (`ios/App/CapApp-SPM`) |
| `../mobile/ci/mobile-android.yml` | build, assinatura e envio ao Play (faixa interna) |
| `../mobile/ci/mobile-ios.yml` | archive, exportação do IPA e envio ao TestFlight |

Plugins instalados: `@capacitor/app`, `@capacitor/browser`, `@capacitor/push-notifications`, `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/preferences`.

## Comandos

```bash
cd mobile
npm ci                 # dependências
npx cap sync           # copia www/, config e plugins para android/ e ios/
npx cap open android   # abre no Android Studio (precisa do SDK local)
npx cap open ios       # abre no Xcode (precisa de macOS)
```

Não há SDK Android, Java, CocoaPods nem Xcode no ambiente de desenvolvimento: **os binários são gerados pelo CI** (GitHub Actions).

## Contrato de login por deep link

1. A página web, ao detectar que roda dentro do app (`window.Capacitor?.isNativePlatform()`), abre o login do Infusion no **navegador do sistema** (plugin `Browser`, `Browser.open({ url })`), e não dentro do WebView.
2. A página de retorno do login redireciona para

   ```
   cloud.infusion.bot://login#codeMitra=...&stateMitra=...
   ```

3. O sistema operacional entrega a URL ao app (esquema registrado no `AndroidManifest.xml` e no `Info.plist`).
4. O sistema entrega essa URL ao app e o plugin `App` do Capacitor dispara o evento `appUrlOpen` na página que está na WebView. A página (`frontend/src/lib/nativo.ts`, `esperarRetornoDeLoginNoApp`) confere o `state`, troca o código e conclui o login **sem recarregar a WebView**, preservando a conversa. Nada é feito em código nativo além do padrão do Capacitor (`MainActivity` e `SceneDelegate` são os do template).


## Contrato de notificações push

A página web fala com o plugin diretamente pelo objeto global injetado no WebView:

```js
const { PushNotifications } = window.Capacitor.Plugins;

await PushNotifications.requestPermissions();          // pede permissão (Android 13+ / iOS)
await PushNotifications.register();                    // pede o token ao FCM/APNs

PushNotifications.addListener('registration', ({ value }) => {
  // `value` é o token do dispositivo: enviar ao backend junto com a identidade da pessoa
});
PushNotifications.addListener('registrationError', (err) => { /* tratar */ });
PushNotifications.addListener('pushNotificationReceived', (n) => { /* app em primeiro plano */ });
PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
  // pessoa tocou na notificação: navegar conforme notification.data
});
```

Também vale para a splash: a página chama `window.Capacitor.Plugins.SplashScreen.hide()` quando estiver pronta (a splash não some sozinha, `launchAutoHide: false`).

Lado nativo:

- **Android** — Firebase Cloud Messaging. O `google-services.json` **não é versionado**; o CI o escreve a partir de um secret. O plugin `com.google.gms.google-services` só é aplicado quando o arquivo existe (`android/app/build.gradle`).
- **iOS** — APNs direto. `AppDelegate.swift` repassa `didRegisterForRemoteNotificationsWithDeviceToken` / `didFailToRegisterForRemoteNotificationsWithError` ao Capacitor via `NotificationCenter`. O entitlement `aps-environment` está em `ios/App/App/App.entitlements` (valor `development`; o Xcode troca para `production` automaticamente no archive para a loja).

## Ajustes feitos sobre os projetos gerados

**Android**

- `AndroidManifest.xml`: intent-filter do esquema `cloud.infusion.bot` (host `login`), intent-filter de App Links com `autoVerify` para `https://bot.infusion.cloud`, permissão `POST_NOTIFICATIONS`.
- `MainActivity.java`: encaminhamento do deep link de login para o WebView.
- `app/build.gradle`: `versionCode`/`versionName` lidos de `ANDROID_VERSION_CODE`/`ANDROID_VERSION_NAME`; `signingConfig` de release lido de variáveis de ambiente (ver CI); comentário sobre o `google-services.json`.
- `build.gradle`: comentário sobre o classpath `com.google.gms:google-services` (já vem no template do Capacitor 8).
- `minSdk 24`, `targetSdk 36`, `compileSdk 36` — padrões do template em `variables.gradle`.

**iOS**

- `Info.plist`: `CFBundleURLTypes` com o esquema `cloud.infusion.bot`.
- `App.entitlements` (novo): `aps-environment = development` e `com.apple.developer.associated-domains = applinks:bot.infusion.cloud`. Referenciado no `project.pbxproj` (`CODE_SIGN_ENTITLEMENTS = App/App.entitlements` nas configurações Debug e Release do target `App`). Se o Xcode reclamar da referência, basta em *Signing & Capabilities* adicionar as capacidades **Push Notifications** e **Associated Domains**, apontando para esse arquivo.
- `AppDelegate.swift`: hooks de registro de push.
- `SceneDelegate.swift`: encaminhamento do deep link de login.

Para App Links / Universal Links funcionarem, o site precisa publicar:

- `https://bot.infusion.cloud/.well-known/assetlinks.json` (Android, com a impressão digital SHA-256 do certificado de assinatura);
- `https://bot.infusion.cloud/.well-known/apple-app-site-association` (iOS, com `TEAMID.cloud.infusion.bot`).

## CI — secrets por workflow

### `mobile-android.yml` (ubuntu, JDK 17, Android SDK)

| Secret | Obrigatório | Conteúdo |
|---|---|---|
| `ANDROID_GOOGLE_SERVICES_JSON` | sim | conteúdo do `google-services.json` do projeto Firebase (app `cloud.infusion.bot`) |
| `ANDROID_KEYSTORE_BASE64` | sim | keystore de release em base64 (`base64 -w0 release.keystore`) |
| `ANDROID_KEYSTORE_PASSWORD` | sim | senha do keystore |
| `ANDROID_KEY_ALIAS` | sim | alias da chave |
| `ANDROID_KEY_PASSWORD` | sim | senha da chave |
| `PLAY_SERVICE_ACCOUNT_JSON` | não | JSON da conta de serviço com acesso ao Play Console; se presente, envia o AAB à faixa **internal** |

Saída: artefato `infusion-android-aab` (`app-release.aab`). `versionCode` = número da execução do workflow.

### `mobile-ios.yml` (macos-latest, Xcode estável)

| Secret | Obrigatório | Conteúdo |
|---|---|---|
| `ASC_KEY_ID` | sim | Key ID da chave da App Store Connect API |
| `ASC_ISSUER_ID` | sim | Issuer ID |
| `ASC_KEY_P8_BASE64` | sim | `AuthKey_XXXX.p8` em base64 |
| `APPLE_TEAM_ID` | sim | Team ID (assinatura automática) |
| `IOS_GOOGLE_SERVICES_PLIST` | não | `GoogleService-Info.plist`; só útil se o Firebase iOS SDK for adicionado (o push do Capacitor usa APNs puro) |

Saída: artefato `infusion-ios-ipa` e envio ao TestFlight via `xcrun altool --upload-app`. A assinatura usa *cloud signing* do Xcode (`-allowProvisioningUpdates` + chave da API); o app `cloud.infusion.bot` precisa existir no App Store Connect antes da primeira execução. `CFBundleVersion` = número da execução do workflow.

Os dois workflows disparam por `workflow_dispatch` e por push que toque `mobile/**`.

## Pendências de configuração (uma vez)

- Criar o app no Firebase (Android) e no App Store Connect / Play Console.
- Gerar o keystore de release e a chave da App Store Connect API; cadastrar os secrets acima.
- Publicar `assetlinks.json` e `apple-app-site-association` no site.
- Substituir ícone e splash (`android/app/src/main/res/`, `ios/App/App/Assets.xcassets/`) pela marca do Infusion — por exemplo com `@capacitor/assets`.

## Onde os workflows moram (e por quê)

Os workflows ficam em `mobile/ci/` porque a credencial que este ambiente usa para o GitHub não tem permissão `workflows`, e o push de arquivos em `.github/workflows/` é recusado. Para ativar a CI, alguém com acesso ao repositório copia os dois arquivos para `.github/workflows/` (mesmo nome) e cadastra os segredos listados acima. Nada mais muda.

## Estado em 20/09/2026 (feito pelo agente com as credenciais de Flavio)

- Apple: identificador `cloud.infusion.bot` registrado (id `2NG7LGJTX2`) com Push Notifications e Associated Domains. **Falta criar o registro do app no App Store Connect** (My Apps → +, nome Infusion, esse identificador): a API não cria apps.
- Firebase (projeto `infusion-52009`): apps Android e iOS criados; `google-services.json` e `GoogleService-Info.plist` gerados (entram pelos segredos da CI). **Falta subir a chave APNs (`W9U44BN9GZ`, Team `P6W44YNWTY`) no console** (Project settings → Cloud Messaging → app iOS): não há API para isso.
- Google Play: app `cloud.infusion.bot` existe e a conta de serviço publica (testado com um edit). **A primeira AAB precisa ser enviada à mão** pelo console (exigência do Google); a CI gera o arquivo.
- Chave de upload Android: PKCS12 gerada fora do repositório (alias `infusion`); vai no segredo `ANDROID_KEYSTORE_BASE64`. O Gradle aceita `.p12` sem `storeType`.
- Push no servidor: SF `push_enviar` (FCM v1, segredo `FCM_SERVICE_ACCOUNT_JSON`), chamada por `demanda_reportar` e `avisos_enviar`.
- Os segredos da CI estão preparados; entram no GitHub assim que houver um token com permissão de Contents, Workflows e Secrets.
