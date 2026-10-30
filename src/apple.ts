import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

import { Cancelado } from "./arquivos";

/**
 * O "ENTRAR COM A APPLE", NATIVO.
 *
 * A Apple exige o login dela em todo app que oferece o do Google (regra 4.8
 * da revisão). Nativo, ele é a folha do sistema com o Face ID, sem senha nem
 * janela de navegador, e o Supabase aceita o resultado direto: o site chama
 * `signInWithIdToken({ provider: "apple", token, nonce })` com o que volta
 * daqui, e a sessão nasce nos cookies da tela do app, como no login comum.
 *
 * O nonce vai para a Apple em SHA-256 e para o Supabase em claro: é como o
 * Supabase confere que o token foi pedido agora, e não reaproveitado.
 */
export async function entrarComApple(): Promise<{ token: string; nonce: string; nome: string | null }> {
  if (!(await AppleAuthentication.isAvailableAsync())) {
    throw new Error("O Entrar com a Apple não está disponível neste aparelho.");
  }
  const nonce = Crypto.randomUUID();
  const emHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  try {
    const c = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: emHash,
    });
    if (!c.identityToken) throw new Error("A Apple não devolveu o login.");
    // O nome só vem no primeiro login de cada pessoa: o site guarda se vier.
    const nome = [c.fullName?.givenName, c.fullName?.familyName].filter(Boolean).join(" ") || null;
    return { token: c.identityToken, nonce, nome };
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") throw new Cancelado();
    throw e;
  }
}
