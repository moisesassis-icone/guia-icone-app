import * as WebBrowser from "expo-web-browser";

import { URL_DO_GUIA, VOLTA_DO_LOGIN } from "./config";

/**
 * O LOGIN DO GOOGLE E DA APPLE PELA JANELA SEGURA DO SISTEMA.
 *
 * O site começa o login como sempre (`signInWithOAuth`, que navega para o
 * `/auth/v1/authorize` do Supabase) e o app segura essa navegação. Na janela
 * segura, a volta do Supabase não pode cair no `/auth/callback` direto: a
 * chave do login (o "code verifier" do PKCE) ficou guardada nos cookies da
 * tela do app, e a janela segura não os enxerga. Então:
 *
 * 1. O app troca o `redirect_to` de `/auth/callback?...` para `/auth/app?...`.
 * 2. O `/auth/app` do Guia só devolve tudo para `guiaicone://entrar?...`, e a
 *    janela segura fecha sozinha ao ver esse endereço.
 * 3. O app abre `/auth/callback?code=...` na tela dele, onde os cookies estão,
 *    e o Guia termina o login como termina no navegador.
 *
 * Precisa do `/auth/app` no Guia e dele na lista de endereços de volta do
 * Supabase (Authentication, URL Configuration).
 */
export async function entrarPelaJanelaSegura(url: URL): Promise<string | null> {
  const volta = url.searchParams.get("redirect_to");
  if (volta) {
    const destino = new URL(volta);
    destino.pathname = destino.pathname.replace(/\/auth\/callback$/, "/auth/app");
    url.searchParams.set("redirect_to", destino.toString());
  }

  const r = await WebBrowser.openAuthSessionAsync(url.toString(), VOLTA_DO_LOGIN, {
    // Sem guardar a sessão do Google no Safari: cada login pergunta a conta,
    // que é o que quem divide o celular espera.
    preferEphemeralSession: true,
  });
  if (r.type !== "success") return null;

  const devolvido = new URL(r.url);
  return `${URL_DO_GUIA}/auth/callback${devolvido.search}`;
}
