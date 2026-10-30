import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * A PONTE ENTRE O SITE E O APP, injetada em toda página antes dela começar.
 *
 * Ela faz o site de sempre funcionar dentro do app sem saber disso:
 *
 * - `navigator.share` e `navigator.canShare`: o Guia já usa a folha do sistema
 *   no iPhone (PDF do Calendário, PDF do roteiro, carrossel, vídeo do Spott),
 *   mas dentro de app ela não existe. Aqui ela passa a mandar os arquivos para
 *   o lado nativo, que abre a folha de verdade ou salva na galeria.
 * - O `<a download>`: dentro de app o download do navegador não acontece, e o
 *   "Baixar" ficava sem fazer nada. O arquivo vai pelo mesmo caminho.
 * - O tema: o app pinta a faixa do relógio e a de baixo com as cores da página.
 *
 * E deixa `window.GuiaApp` para o site pedir o que só o app faz (o aviso da
 * Apple, o "Entrar com a Apple" e a assinatura pela Apple). O site sabe que está no app pelo `GuiaIconeApp` do user agent.
 *
 * OS ARQUIVOS VÃO EM PEDAÇOS de 3 MB (múltiplos de 3 bytes, para o base64 de
 * cada pedaço emendar no do seguinte): um vídeo do Spott inteiro numa
 * mensagem só seria uma string de centenas de MB na memória dos dois lados.
 */
export function ponte(): string {
  const versao = JSON.stringify(Constants.expoConfig?.version ?? "1.0.0");
  const plataforma = JSON.stringify(Platform.OS);
  return `(function () {
  if (window.GuiaApp) return;
  var RN = window.ReactNativeWebView;
  if (!RN) return;
  var seq = 0;
  var pendentes = {};
  function enviar(msg) { RN.postMessage(JSON.stringify(msg)); }
  function pedir(tipo, dados) {
    return new Promise(function (resolver, rejeitar) {
      var id = "p" + (++seq);
      pendentes[id] = { resolver: resolver, rejeitar: rejeitar };
      var msg = dados || {};
      msg.tipo = tipo;
      msg.pedido = id;
      enviar(msg);
    });
  }
  window.__guiaAppResponder = function (id, ok, valor) {
    var p = pendentes[id];
    if (!p) return;
    delete pendentes[id];
    if (ok) { p.resolver(valor); return; }
    var e = new Error((valor && valor.mensagem) || "Não foi possível concluir.");
    e.name = (valor && valor.nome) || "Error";
    p.rejeitar(e);
  };

  var PEDACO = 3 * 1024 * 1024;
  function lerBase64(blob) {
    return new Promise(function (resolver, rejeitar) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result); resolver(s.slice(s.indexOf(",") + 1)); };
      r.onerror = function () { rejeitar(r.error); };
      r.readAsDataURL(blob);
    });
  }
  function mandarArquivo(blob, nome, mime) {
    var id = "a" + (++seq);
    enviar({ tipo: "arquivo-inicio", arquivo: id, nome: nome || "arquivo", mime: mime || blob.type || "application/octet-stream" });
    var i = 0;
    function proximo() {
      if (i >= blob.size) return Promise.resolve(id);
      var pedaco = blob.slice(i, i + PEDACO);
      i += PEDACO;
      return lerBase64(pedaco).then(function (dados) {
        enviar({ tipo: "arquivo-pedaco", arquivo: id, dados: dados });
        return proximo();
      });
    }
    return proximo();
  }
  function compartilhar(d) {
    d = d || {};
    var arquivos = Array.prototype.slice.call(d.files || []);
    var ids = [];
    var fila = Promise.resolve();
    arquivos.forEach(function (f) {
      fila = fila.then(function () { return mandarArquivo(f, f.name, f.type); }).then(function (id) { ids.push(id); });
    });
    return fila.then(function () {
      return pedir("compartilhar", { arquivos: ids, titulo: d.title || "", texto: d.text || "", url: d.url || "" });
    });
  }
  try {
    Object.defineProperty(navigator, "share", { configurable: true, writable: true, value: function (d) { return compartilhar(d).then(function () {}); } });
    Object.defineProperty(navigator, "canShare", { configurable: true, writable: true, value: function () { return true; } });
  } catch (e) {}

  function baixar(a) {
    var href = a.href;
    var nome = a.getAttribute("download") || decodeURIComponent((href.split("?")[0].split("/").pop()) || "arquivo");
    return fetch(href)
      .then(function (r) { if (!r.ok) throw new Error("download"); return r.blob(); })
      .then(function (b) { return mandarArquivo(b, nome, b.type); })
      .then(function (id) { return pedir("compartilhar", { arquivos: [id] }); });
  }
  var clicarOriginal = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    var a = this;
    if (a.hasAttribute("download") && a.href) {
      baixar(a).catch(function () {});
      return;
    }
    return clicarOriginal.call(a);
  };
  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest("a[download]") : null;
    if (!a || !a.href) return;
    ev.preventDefault();
    baixar(a).catch(function () {});
  }, true);

  var ultimoTema = "";
  function tema() {
    var meta = document.querySelector('meta[name="theme-color"]');
    var t = { tipo: "tema", barra: meta ? meta.getAttribute("content") : null, escuro: document.documentElement.classList.contains("dark") };
    var chave = JSON.stringify(t);
    if (chave === ultimoTema) return;
    ultimoTema = chave;
    enviar(t);
  }
  function vigiarTema() {
    tema();
    new MutationObserver(tema).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    if (document.head) new MutationObserver(tema).observe(document.head, { subtree: true, childList: true, attributes: true, attributeFilter: ["content"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", vigiarTema);
  else vigiarTema();

  window.GuiaApp = {
    versao: ${versao},
    plataforma: ${plataforma},
    /** Pede a permissão do aviso e devolve { token } (Expo) ou rejeita com o motivo. */
    pedirAvisos: function () { return pedir("avisos", {}); },
    /** O login nativo da Apple: devolve { token, nonce, nome } para o signInWithIdToken. */
    entrarComApple: function () { return pedir("apple", {}); },
    /** Abre um endereço fora do app (navegador ou o app dele). */
    abrirFora: function (url) { enviar({ tipo: "abrir-fora", url: String(url) }); },
    /**
     * A assinatura pela Apple (src/assinatura.ts). Toda compra volta como
     * { transacao, id, produto }: o site confere a transação no servidor e só
     * então chama concluir(id). Quando chega compra sem a folha aberta (uma
     * renovação, uma compra que ficou no meio), a página recebe o evento
     * "guia-app-compra" e lê as pendentes.
     */
    assinatura: {
      produto: function () { return pedir("assinatura-produto", {}); },
      assinar: function (conta) { return pedir("assinatura-assinar", { conta: String(conta) }); },
      pendentes: function () { return pedir("assinatura-pendentes", {}); },
      concluir: function (id) { return pedir("assinatura-concluir", { id: String(id) }); },
      restaurar: function () { return pedir("assinatura-restaurar", {}); },
      gerenciar: function () { return pedir("assinatura-gerenciar", {}); }
    }
  };
  window.dispatchEvent(new Event("guia-app-pronto"));
})();
true;`;
}
