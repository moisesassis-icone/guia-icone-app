import type { ExpoConfig } from "expo/config";

/**
 * O APP DO GUIA É O GUIA DE VERDADE, aberto por dentro, com as peças que um
 * site não tem: o aviso no celular pela Apple, salvar na galeria, a folha de
 * compartilhar do sistema e o login do Google e da Apple pela janela segura.
 *
 * Qual Guia ele abre vem do perfil do build (eas.json): o `producao` abre o
 * guiaicone.com e o `teste` e o `simulador` abrem o teste.guiaicone.com, para
 * provar uma mudança do site no app antes de ela chegar à main.
 */
const URL_DO_GUIA = process.env.URL_DO_GUIA ?? "https://guiaicone.com";
const EH_TESTE = URL_DO_GUIA.includes("teste.");

/**
 * O projeto no expo.dev. O `eas init` mostra esse id na primeira vez; ele
 * entra aqui, e é com ele que o Expo sabe para quem é cada aviso.
 */
const ID_DO_PROJETO_NO_EXPO = "285296b9-333a-49ac-8b09-011c3e2aca9d";

/** A organização da Ícone no expo.dev, dona do projeto. */
const DONO_NO_EXPO = "guiaicone";

const config: ExpoConfig = {
  name: EH_TESTE ? "Guia Teste" : "Guia Ícone",
  slug: "guia-icone",
  scheme: "guiaicone",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  // O Guia escolhe o próprio tema (claro por padrão); o app só acompanha.
  userInterfaceStyle: "automatic",
  backgroundColor: "#070C17",
  ios: {
    bundleIdentifier: "com.guiaicone.app",
    // Só iPhone: no iPad a Apple pediria outras capturas e outro desenho.
    supportsTablet: false,
    usesAppleSignIn: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: "Para tirar fotos e usar nas suas artes.",
      NSMicrophoneUsageDescription: "Para mandar áudio e vídeo para o Spott.",
      NSPhotoLibraryUsageDescription: "Para escolher fotos e vídeos para as suas artes e para o Spott.",
      NSPhotoLibraryAddUsageDescription: "Para salvar as suas artes e vídeos na galeria.",
    },
  },
  android: {
    package: "com.guiaicone.app",
    adaptiveIcon: {
      backgroundColor: "#070C17",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: { favicon: "./assets/favicon.png" },
  plugins: [
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 120,
        resizeMode: "contain",
        backgroundColor: "#070C17",
      },
    ],
    // A Apple manda os avisos do TestFlight e da loja pelo ambiente de produção.
    ["expo-notifications", { mode: "production", icon: "./assets/android-icon-monochrome.png", color: "#006EFE" }],
    [
      "expo-media-library",
      {
        photosPermission: "Para escolher fotos e vídeos para as suas artes e para o Spott.",
        savePhotosPermission: "Para salvar as suas artes e vídeos na galeria.",
      },
    ],
    "expo-web-browser",
    "expo-sharing",
    "expo-apple-authentication",
    // A compra da assinatura pela Apple (StoreKit 2).
    "expo-iap",
  ],
  extra: {
    urlDoGuia: URL_DO_GUIA,
    eas: { projectId: ID_DO_PROJETO_NO_EXPO },
  },
  owner: DONO_NO_EXPO,
};

export default config;
