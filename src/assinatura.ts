import {
  ErrorCode,
  deepLinkToSubscriptions,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  type Purchase,
} from "expo-iap";

import { Cancelado } from "./arquivos";

/**
 * A ASSINATURA PELA APPLE.
 *
 * Dentro do app a Apple só deixa vender pela cobrança dela (regra 3.1.1), e o
 * Guia vende a mesma assinatura do site, pelo Programa para Pequenas Empresas
 * (15% no Brasil). O app só faz o que é da Apple: mostra o preço que a loja
 * devolve, abre a folha de compra e entrega ao site a transação assinada. QUEM
 * LIBERA O ACESSO É O SERVIDOR DO GUIA, que confere a assinatura da Apple na
 * transação e grava o prazo, igual faz com o aviso do Asaas. O app nunca diz
 * "pagou" por conta própria: um app adulterado não pode se dar acesso.
 *
 * A compra leva o id da conta do Guia (`appAccountToken`, um UUID, que é o
 * que o `user.id` do Supabase já é). É por ele que o aviso da Apple, que chega
 * ao servidor sem login nenhum, sabe de quem é a assinatura.
 */

/** O produto da assinatura mensal no App Store Connect. */
export const ASSINATURA_MENSAL = "com.guiaicone.app.mensal";

export type ProdutoDaAssinatura = {
  id: string;
  /** O preço escrito pela loja, na moeda da conta da pessoa ("R$ 149,90"). */
  preco: string;
  titulo: string;
  descricao: string;
};

/** O que vai para o site: a transação assinada pela Apple, e o id dela. */
export type CompraDaApple = { transacao: string; id: string; produto: string };

let conectado: Promise<boolean> | null = null;
function conectar(): Promise<boolean> {
  conectado ??= initConnection().catch((e) => {
    conectado = null;
    throw e;
  });
  return conectado;
}

/**
 * As transações que a Apple entregou e o site ainda não confirmou: a compra
 * que terminou com a tela fechada, a renovação que chegou com o app parado.
 * Ficam aqui até o site pedir (`comprasPendentes`), e a Apple as entrega de
 * novo a cada abertura enquanto não forem concluídas.
 */
const pendentes = new Map<string, Purchase>();

/** Quem está esperando a resposta da folha de compra aberta agora. */
let esperando: { resolver: (c: CompraDaApple) => void; rejeitar: (e: Error) => void } | null = null;

function paraOSite(p: Purchase): CompraDaApple | null {
  if (!p.purchaseToken) return null;
  return { transacao: p.purchaseToken, id: p.id, produto: p.productId };
}

function erroDaLoja(e: { code?: ErrorCode; message?: string }): Error {
  if (e.code === ErrorCode.UserCancelled) return new Cancelado();
  const erro = new Error(e.message || "A compra não foi concluída.");
  erro.name = e.code === ErrorCode.NetworkError ? "NetworkError" : "Error";
  return erro;
}

/**
 * Liga os ouvidos da loja, uma vez, na abertura do app. `aoChegar` avisa a
 * tela do Guia de que há compra para confirmar (a que chegou sem a folha
 * aberta: renovação, compra que ficou no meio).
 */
export function vigiarCompras(aoChegar: () => void): () => void {
  const compra = purchaseUpdatedListener((p) => {
    if (p.productId !== ASSINATURA_MENSAL) return;
    pendentes.set(p.id, p);
    const c = paraOSite(p);
    if (esperando && c) {
      esperando.resolver(c);
      esperando = null;
      return;
    }
    aoChegar();
  });
  const erro = purchaseErrorListener((e) => {
    if (!esperando) return;
    esperando.rejeitar(erroDaLoja(e));
    esperando = null;
  });
  conectar().catch(() => {});
  return () => {
    compra.remove();
    erro.remove();
  };
}

/** O preço e o nome da assinatura, como a loja da conta da pessoa mostra. */
export async function produtoDaAssinatura(): Promise<ProdutoDaAssinatura> {
  await conectar();
  const lista = await fetchProducts({ skus: [ASSINATURA_MENSAL], type: "subs" });
  const p = (lista ?? []).find((x) => x.id === ASSINATURA_MENSAL);
  if (!p) throw new Error("A assinatura ainda não está disponível na loja.");
  return { id: p.id, preco: p.displayPrice, titulo: p.title, descricao: p.description };
}

/**
 * Abre a folha de compra da Apple para a conta `conta` do Guia, e devolve a
 * transação assinada quando ela termina. A transação NÃO é concluída aqui: só
 * depois que o servidor do Guia gravou o acesso (`concluirCompra`), senão uma
 * queda no meio deixaria a pessoa paga e sem acesso, sem a Apple entregar de
 * novo.
 */
export async function assinar(conta: string): Promise<CompraDaApple> {
  if (!/^[0-9a-f-]{36}$/i.test(conta)) throw new Error("Conta do Guia inválida.");
  await conectar();
  if (esperando) esperando.rejeitar(new Cancelado());
  const resposta = new Promise<CompraDaApple>((resolver, rejeitar) => {
    esperando = { resolver, rejeitar };
  });
  try {
    await requestPurchase({
      request: { apple: { sku: ASSINATURA_MENSAL, appAccountToken: conta.toLowerCase() } },
      type: "subs",
    });
  } catch (e) {
    esperando = null;
    throw e;
  }
  return resposta;
}

/** As compras que chegaram e o site ainda não confirmou. */
export function comprasPendentes(): CompraDaApple[] {
  return [...pendentes.values()].map(paraOSite).filter((c): c is CompraDaApple => c !== null);
}

/** O site gravou o acesso: a Apple pode parar de entregar esta transação. */
export async function concluirCompra(id: string): Promise<void> {
  const p = pendentes.get(id);
  if (!p) return;
  await finishTransaction({ purchase: p, isConsumable: false });
  pendentes.delete(id);
}

/**
 * O "Restaurar compras", que a Apple exige na tela de assinatura: quem assinou
 * em outro iPhone, ou apagou o app, recupera o acesso sem pagar de novo.
 * Devolve as transações da assinatura para o site conferir de quem são.
 */
export async function restaurar(): Promise<CompraDaApple[]> {
  await conectar();
  await restorePurchases();
  const compras = await getAvailablePurchases();
  return (compras ?? [])
    .filter((p) => p.productId === ASSINATURA_MENSAL)
    .map(paraOSite)
    .filter((c): c is CompraDaApple => c !== null);
}

/** Abre o "Assinaturas" do iPhone, onde a pessoa cancela ou muda. */
export async function gerenciarAssinatura(): Promise<void> {
  await deepLinkToSubscriptions({});
}
