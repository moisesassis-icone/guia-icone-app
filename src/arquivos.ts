import { Share } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Asset, requestPermissionsAsync } from "expo-media-library";

/**
 * OS ARQUIVOS QUE O SITE MANDA PELA PONTE (ver `ponte.ts`), montados pedaço a
 * pedaço numa pasta temporária. Cada pedaço é gravado só depois do anterior:
 * a escrita é assíncrona, e dois pedaços em paralelo trocariam de ordem.
 */
type Recebendo = { arquivo: File; mime: string; fila: Promise<void> };

const recebendo = new Map<string, Recebendo>();
const pasta = new Directory(Paths.cache, "compartilhar");

function nomeSeguro(nome: string): string {
  return nome.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "arquivo";
}

export function inicioDoArquivo(id: string, nome: string, mime: string) {
  if (!pasta.exists) pasta.create({ intermediates: true, idempotent: true });
  // A mesma pasta guarda vários arquivos de uma vez (um carrossel), e dois
  // slides podem ter o mesmo nome: o id na frente separa.
  const arquivo = new File(pasta, `${id}-${nomeSeguro(nome)}`);
  if (arquivo.exists) arquivo.delete();
  arquivo.create();
  recebendo.set(id, { arquivo, mime, fila: Promise.resolve() });
}

export function pedacoDoArquivo(id: string, dados: string) {
  const r = recebendo.get(id);
  if (!r) return;
  r.fila = r.fila.then(() => r.arquivo.write(dados, { encoding: "base64", append: true }));
}

async function pronto(id: string): Promise<Recebendo | null> {
  const r = recebendo.get(id);
  if (!r) return null;
  await r.fila;
  recebendo.delete(id);
  return r;
}

/** O que sobrou da última vez (o sistema também limpa o cache sozinho). */
export function limparArquivosAntigos() {
  try {
    if (pasta.exists) pasta.delete();
  } catch {
    // Arquivo em uso por uma folha ainda aberta: fica para a próxima.
  }
}

export class Cancelado extends Error {
  name = "AbortError";
}

/**
 * ABRE A FOLHA DO SISTEMA, ou salva na galeria.
 *
 * Um arquivo só vai pela folha, que tem "Salvar imagem", "Salvar vídeo",
 * "Salvar em Arquivos", o WhatsApp e o Instagram. Vários arquivos (o
 * carrossel inteiro) vão direto para a galeria: a folha do Expo só leva um de
 * cada vez, e o carrossel precisa estar inteiro na galeria para ir ao
 * Instagram. Sem arquivo, é texto ou link, pela folha de texto.
 */
export async function compartilhar(p: {
  arquivos: string[];
  titulo?: string;
  texto?: string;
  url?: string;
}): Promise<"compartilhado" | "na-galeria"> {
  const arquivos = (await Promise.all(p.arquivos.map(pronto))).filter((r): r is Recebendo => r !== null);

  if (arquivos.length === 0) {
    const mensagem = [p.texto, p.url].filter(Boolean).join("\n");
    const r = await Share.share({ message: mensagem, title: p.titulo || undefined });
    if (r.action === Share.dismissedAction) throw new Cancelado();
    return "compartilhado";
  }

  if (arquivos.length === 1) {
    const [a] = arquivos;
    await Sharing.shareAsync(a.arquivo.uri, { mimeType: a.mime, dialogTitle: p.titulo || undefined });
    return "compartilhado";
  }

  const permissao = await requestPermissionsAsync(true);
  if (!permissao.granted) throw new Error("Sem permissão para salvar na galeria.");
  for (const a of arquivos) await Asset.create(a.arquivo.uri);
  return "na-galeria";
}
