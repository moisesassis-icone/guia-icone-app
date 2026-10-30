import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import type { WebViewOpenWindowEvent, WebViewErrorEvent } from "react-native-webview/lib/WebViewTypes";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as WebBrowser from "expo-web-browser";
import * as Notifications from "expo-notifications";

import {
  MARCA_DO_APP,
  PRIMEIRA_TELA,
  URL_DO_GUIA,
  abreEmOutroApp,
  ehDoGuia,
  ehLoginDaMeta,
  ehLoginSocial,
} from "./config";
import { ponte } from "./ponte";
import { compartilhar, inicioDoArquivo, limparArquivosAntigos, pedacoDoArquivo } from "./arquivos";
import { enderecoDoAviso, pedirAvisos } from "./avisos";
import { entrarPelaJanelaSegura } from "./entrar";
import { entrarComApple } from "./apple";
import {
  assinar,
  comprasPendentes,
  concluirCompra,
  gerenciarAssinatura,
  produtoDaAssinatura,
  restaurar,
  vigiarCompras,
} from "./assinatura";

SplashScreen.preventAutoHideAsync().catch(() => {});

/*
 * As definições do react-native-webview dão `WebViewProps & P` com o `P`
 * padrão `undefined`, e o TypeScript de hoje reduz isso a `never` (nenhuma
 * prop passa). Fixar o `P` como objeto vazio devolve as props certas.
 */
const TelaWeb = WebView<object>;
type TelaWebRef = InstanceType<typeof TelaWeb>;

/** As cores do Guia (CLAUDE.md do site): o fundo claro, o escuro e a barra. */
const CLARO = "#F2F4FB";
const ESCURO = "#070C17";

type Tema = { barra: string; fundo: string; letraClara: boolean };
const TEMA_INICIAL: Tema = { barra: CLARO, fundo: CLARO, letraClara: false };

/** Se a cor é escura o bastante para pedir o relógio em branco. */
function ehEscura(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const luz = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return luz < 128;
}

function abrirFora(url: URL) {
  if (abreEmOutroApp(url)) {
    Linking.openURL(url.toString()).catch(() => {});
  } else {
    WebBrowser.openBrowserAsync(url.toString()).catch(() => {});
  }
}

/** O que a página pediu da assinatura pela Apple (`GuiaApp.assinatura`). */
async function pedidoDaAssinatura(msg: Record<string, unknown>): Promise<unknown> {
  switch (msg.tipo) {
    case "assinatura-produto":
      return produtoDaAssinatura();
    case "assinatura-assinar":
      return assinar(String(msg.conta));
    case "assinatura-pendentes":
      return comprasPendentes();
    case "assinatura-concluir":
      return concluirCompra(String(msg.id));
    case "assinatura-restaurar":
      return restaurar();
    default:
      return gerenciarAssinatura();
  }
}

function TelaDoGuia() {
  const tela = useRef<TelaWebRef>(null);
  const insets = useSafeAreaInsets();
  const [tema, setTema] = useState<Tema>(TEMA_INICIAL);
  const [semRede, setSemRede] = useState(false);
  const [podeVoltar, setPodeVoltar] = useState(false);
  const [endereco, setEndereco] = useState(PRIMEIRA_TELA);
  const script = useMemo(ponte, []);

  const abrirNoGuia = useCallback((caminho: string) => {
    const destino = caminho.startsWith("http") ? caminho : `${URL_DO_GUIA}${caminho.startsWith("/") ? "" : "/"}${caminho}`;
    tela.current?.injectJavaScript(`window.location.href = ${JSON.stringify(destino)}; true;`);
  }, []);

  const responder = useCallback((pedido: string, ok: boolean, valor: unknown) => {
    tela.current?.injectJavaScript(
      `window.__guiaAppResponder && window.__guiaAppResponder(${JSON.stringify(pedido)}, ${ok}, ${JSON.stringify(valor ?? null)}); true;`
    );
  }, []);

  // O toque no aviso: com o app fechado (o último toque) e com ele aberto.
  useEffect(() => {
    limparArquivosAntigos();
    const inicial = enderecoDoAviso(Notifications.getLastNotificationResponse());
    if (inicial) setEndereco(`${URL_DO_GUIA}${inicial}`);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const link = enderecoDoAviso(r);
      if (link) abrirNoGuia(link);
    });
    return () => sub.remove();
  }, [abrirNoGuia]);

  // A compra que chega sem a folha aberta (renovação, compra que ficou no
  // meio): a página do Guia lê as pendentes e confirma no servidor.
  useEffect(
    () =>
      vigiarCompras(() => {
        tela.current?.injectJavaScript(`window.dispatchEvent(new Event("guia-app-compra")); true;`);
      }),
    []
  );

  // O voltar do Android volta dentro do Guia antes de fechar o app.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!podeVoltar) return false;
      tela.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, [podeVoltar]);

  const aoMudarNavegacao = useCallback((n: WebViewNavigation) => setPodeVoltar(n.canGoBack), []);

  /**
   * QUEM ABRE ONDE. O Guia e o login do Instagram ficam no app; o login do
   * Google e da Apple vai para a janela segura; o resto sai do app (o
   * WhatsApp e o Instagram nos apps deles, um site qualquer no Safari por
   * cima do app). Só a navegação da página inteira passa por aqui: o que
   * carrega dentro dela (o CAPTCHA, um vídeo) segue normal.
   */
  const deixarAbrir = useCallback(
    (req: { url: string; isTopFrame?: boolean; mainDocumentURL?: string }) => {
      if (req.isTopFrame === false) return true;
      let url: URL;
      try {
        url = new URL(req.url);
      } catch {
        return true;
      }
      if (url.protocol === "about:" || url.protocol === "blob:" || url.protocol === "data:") return true;
      if (ehDoGuia(url) || ehLoginDaMeta(url)) return true;
      if (ehLoginSocial(url)) {
        entrarPelaJanelaSegura(url).then((volta) => {
          if (volta) abrirNoGuia(volta);
        });
        return false;
      }
      abrirFora(url);
      return false;
    },
    [abrirNoGuia]
  );

  const aoReceber = useCallback(
    async (ev: WebViewMessageEvent) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.nativeEvent.data);
      } catch {
        return;
      }
      const pedido = typeof msg.pedido === "string" ? msg.pedido : "";
      switch (msg.tipo) {
        case "arquivo-inicio":
          inicioDoArquivo(String(msg.arquivo), String(msg.nome), String(msg.mime));
          return;
        case "arquivo-pedaco":
          pedacoDoArquivo(String(msg.arquivo), String(msg.dados));
          return;
        case "compartilhar":
          try {
            const r = await compartilhar({
              arquivos: Array.isArray(msg.arquivos) ? msg.arquivos.map(String) : [],
              titulo: typeof msg.titulo === "string" ? msg.titulo : undefined,
              texto: typeof msg.texto === "string" ? msg.texto : undefined,
              url: typeof msg.url === "string" ? msg.url : undefined,
            });
            responder(pedido, true, r);
          } catch (e) {
            const erro = e as Error;
            responder(pedido, false, { nome: erro.name, mensagem: erro.message });
          }
          return;
        case "avisos":
          try {
            responder(pedido, true, await pedirAvisos());
          } catch (e) {
            const erro = e as Error;
            responder(pedido, false, { nome: erro.name, mensagem: erro.message });
          }
          return;
        case "apple":
          try {
            responder(pedido, true, await entrarComApple());
          } catch (e) {
            const erro = e as Error;
            responder(pedido, false, { nome: erro.name, mensagem: erro.message });
          }
          return;
        case "assinatura-produto":
        case "assinatura-assinar":
        case "assinatura-pendentes":
        case "assinatura-concluir":
        case "assinatura-restaurar":
        case "assinatura-gerenciar":
          try {
            responder(pedido, true, await pedidoDaAssinatura(msg));
          } catch (e) {
            const erro = e as Error;
            responder(pedido, false, { nome: erro.name, mensagem: erro.message });
          }
          return;
        case "abrir-fora":
          try {
            abrirFora(new URL(String(msg.url), URL_DO_GUIA));
          } catch {
            // Endereço quebrado: não há o que abrir.
          }
          return;
        case "tema": {
          const escuro = msg.escuro === true;
          const fundo = escuro ? ESCURO : CLARO;
          const barra = typeof msg.barra === "string" && msg.barra ? msg.barra : fundo;
          setTema({ barra, fundo, letraClara: ehEscura(barra) });
          return;
        }
      }
    },
    [responder]
  );

  return (
    <View style={[estilos.tudo, { backgroundColor: tema.fundo }]}>
      <StatusBar style={tema.letraClara ? "light" : "dark"} />
      {/*
        O Guia não desenha embaixo do relógio nem da barrinha do iPhone (o
        site não usa o viewport-fit=cover), então o app pinta essas duas
        faixas com as cores da página e deixa a tela no meio.
      */}
      <View style={{ height: insets.top, backgroundColor: tema.barra }} />
      <View style={estilos.tudo}>
        {semRede ? (
          <View style={[estilos.semRede, { backgroundColor: tema.fundo }]}>
            <Text style={[estilos.titulo, { color: tema.fundo === ESCURO ? CLARO : ESCURO }]}>Sem conexão</Text>
            <Text style={[estilos.texto, { color: tema.fundo === ESCURO ? "#C4CAD8" : "#2B3345" }]}>
              Confira a internet do celular e tente de novo.
            </Text>
            <Pressable
              style={estilos.botao}
              onPress={() => {
                setSemRede(false);
                tela.current?.reload();
              }}
            >
              <Text style={estilos.textoDoBotao}>Tentar de novo</Text>
            </Pressable>
          </View>
        ) : null}
        <TelaWeb
          ref={tela}
          source={{ uri: endereco }}
          style={[estilos.tudo, { backgroundColor: tema.fundo }, semRede && estilos.escondida]}
          applicationNameForUserAgent={MARCA_DO_APP}
          injectedJavaScriptBeforeContentLoaded={script}
          onMessage={aoReceber}
          onShouldStartLoadWithRequest={deixarAbrir}
          onOpenWindow={(ev: WebViewOpenWindowEvent) => {
            try {
              const url = new URL(ev.nativeEvent.targetUrl);
              if (deixarAbrir({ url: url.toString(), isTopFrame: true })) abrirNoGuia(url.toString());
            } catch {
              // Janela sem endereço: nada a abrir.
            }
          }}
          onNavigationStateChange={aoMudarNavegacao}
          onLoadEnd={() => SplashScreen.hideAsync().catch(() => {})}
          onError={(ev: WebViewErrorEvent) => {
            // -999 é a navegação cancelada pelo próprio app (o login social,
            // um link que saiu): não é falta de rede.
            if (ev.nativeEvent.code !== -999) setSemRede(true);
            SplashScreen.hideAsync().catch(() => {});
          }}
          // O iPhone mata a tela quando falta memória (um vídeo grande): sem
          // isto ela volta em branco.
          onContentProcessDidTerminate={() => tela.current?.reload()}
          renderLoading={() => (
            <View style={[estilos.carregando, { backgroundColor: tema.fundo }]}>
              <ActivityIndicator color="#006EFE" />
            </View>
          )}
          startInLoadingState
          sharedCookiesEnabled
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          // A câmera e o microfone do site (o áudio do Spott) sem a segunda
          // pergunta do navegador: a do sistema, do Info.plist, já basta.
          mediaCapturePermissionGrantType="grant"
          allowsLinkPreview={false}
          setSupportMultipleWindows
          textInteractionEnabled
          webviewDebuggingEnabled={__DEV__}
        />
      </View>
      <View style={{ height: insets.bottom, backgroundColor: tema.fundo }} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <TelaDoGuia />
    </SafeAreaProvider>
  );
}

const estilos = StyleSheet.create({
  tudo: { flex: 1 },
  escondida: { opacity: 0, height: 0, flex: 0 },
  carregando: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  semRede: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 },
  titulo: { fontSize: 20, fontWeight: "700" },
  texto: { fontSize: 15, textAlign: "center" },
  botao: { marginTop: 8, backgroundColor: "#006EFE", borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 },
  textoDoBotao: { color: "#F0F3FA", fontSize: 15, fontWeight: "600" },
});
