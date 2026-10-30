import Constants from "expo-constants";

/** O Guia que este build abre (ver `app.config.ts`). */
export const URL_DO_GUIA: string =
  (Constants.expoConfig?.extra?.urlDoGuia as string | undefined) ?? "https://guiaicone.com";

const ORIGEM = new URL(URL_DO_GUIA);

/** A primeira tela: o Início, que manda quem não entrou para o login. */
export const PRIMEIRA_TELA = `${URL_DO_GUIA}/inicio`;

/**
 * O que vai no fim do user agent. É por ele que o site sabe que está dentro do
 * app: troca a compra pelo Asaas pela da Apple (a Apple não deixa vender de
 * outro jeito dentro do app) e o aviso do navegador pelo da Apple.
 */
export const MARCA_DO_APP = `GuiaIconeApp/${Constants.expoConfig?.version ?? "1.0.0"}`;

/** O endereço de volta do login do Google e da Apple (o `scheme` do app). */
export const VOLTA_DO_LOGIN = "guiaicone://entrar";

/** As telas do próprio Guia, que abrem dentro do app. */
export function ehDoGuia(url: URL): boolean {
  return (
    url.hostname === ORIGEM.hostname ||
    url.hostname === `www.${ORIGEM.hostname}` ||
    url.hostname === ORIGEM.hostname.replace(/^www\./, "")
  );
}

/**
 * O LOGIN DO INSTAGRAM FICA DENTRO DO APP. Ele precisa da sessão do Guia na
 * volta (`/api/instagram/retorno` sabe de quem é a conta pelo login), e a
 * janela segura do sistema não tem essa sessão. É também o fluxo que a Meta
 * revisou. As páginas abaixo são as do login; o resto do Instagram (um post,
 * um perfil) abre no app do Instagram.
 */
const PAGINAS_DO_LOGIN_DA_META =
  /^\/(oauth|accounts|challenge|login|dialog|checkpoint|consent|v\d+(\.\d+)?\/dialog|two_factor|auth_platform|api\/v1\/web)/;

export function ehLoginDaMeta(url: URL): boolean {
  const host = url.hostname.replace(/^(www|m|api|l)\./, "");
  if (host !== "instagram.com" && host !== "facebook.com") return false;
  if (url.hostname.startsWith("api.")) return true;
  return PAGINAS_DO_LOGIN_DA_META.test(url.pathname);
}

/**
 * O LOGIN DO GOOGLE E DA APPLE NÃO PODE ACONTECER DENTRO DO APP. O Google
 * recusa login em navegador embutido ("disallowed_useragent"), e a Apple pede
 * a janela segura. Quem começa os dois é o Supabase, pelo `/auth/v1/authorize`.
 */
export function ehLoginSocial(url: URL): boolean {
  return url.pathname.endsWith("/auth/v1/authorize") && url.searchParams.has("provider");
}

/** Endereços que têm app próprio no iPhone e abrem nele, e não no navegador. */
const HOSTS_DE_APP = ["wa.me", "api.whatsapp.com", "whatsapp.com", "instagram.com", "apps.apple.com"];

export function abreEmOutroApp(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  const host = url.hostname.replace(/^www\./, "");
  return HOSTS_DE_APP.includes(host);
}
