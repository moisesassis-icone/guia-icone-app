# Guia Ícone, o app

O app do **Guia Ícone** para iPhone (e, quando for a hora, Android), feito em
Expo. O produto inteiro mora no site, no repositório `guia-icone`; este
repositório é só a casca nativa que abre o Guia e dá a ele o que um site não
tem. **Responda sempre em português do Brasil**, e escreva código, comentários
e commits em português, como no `guia-icone`. O dono não é programador e não
tem iPhone nem Mac: tudo é compilado e enviado pela nuvem do Expo (EAS).

Nada de travessão ("—") nem de meia-risca ("–") em lugar nenhum, a mesma regra
do site.

## O que o app faz

- Abre o Guia (`URL_DO_GUIA`, que vem do perfil do build em `eas.json`):
  `producao` abre o guiaicone.com; `teste` e `simulador` abrem o
  teste.guiaicone.com.
- Avisa o site que ele está no app pelo `GuiaIconeApp/<versão>` no fim do user
  agent. É por ele que o site troca a compra pelo Asaas pela compra da Apple (a
  Apple não deixa vender assinatura de outro jeito dentro do app) e o aviso do
  navegador pelo da Apple.
- Injeta a ponte (`src/ponte.ts`) em toda página: `navigator.share`,
  `navigator.canShare` e o `<a download>` passam a mandar os arquivos para o
  lado nativo (`src/arquivos.ts`), que abre a folha do sistema (um arquivo) ou
  salva na galeria (vários, o carrossel). E deixa `window.GuiaApp`:
  - `pedirAvisos()` devolve `{ token, plataforma }`, o endereço do aparelho no
    serviço de avisos do Expo (`src/avisos.ts`). O toque no aviso abre o
    `data.link` dele, o mesmo campo do web push do site.
  - `entrarComApple()` devolve `{ token, nonce, nome }` para o
    `supabase.auth.signInWithIdToken({ provider: "apple", token, nonce })`
    (`src/apple.ts`).
  - `abrirFora(url)` abre fora do app.
  - `assinatura` (`src/assinatura.ts`): `produto()` (o preço que a loja
    mostra), `assinar(idDaConta)`, `restaurar()`, `pendentes()`,
    `concluir(id)` e `gerenciar()`. A compra volta como transação assinada
    pela Apple e leva o id da conta do Guia (`appAccountToken`); quem libera o
    acesso é o servidor do Guia, que confere a transação, e só depois o site
    chama `concluir(id)`. A compra que chega sem a folha aberta dispara o
    evento `guia-app-compra` na página. O produto no App Store Connect é
    `com.guiaicone.app.mensal`, e a conta está no Programa para Pequenas
    Empresas (15% no Brasil).
- Decide quem abre onde (`src/config.ts` e `deixarAbrir` em `src/App.tsx`): o
  Guia e o login do Instagram ficam no app (o retorno do Instagram precisa da
  sessão do Guia, e é o fluxo que a Meta revisou); o login do Google vai para a
  janela segura do sistema (`src/entrar.ts`, o Google recusa login dentro de
  app); WhatsApp, Instagram e o resto saem do app.

## O que o site precisa ter (no `guia-icone`)

1. A rota `/auth/app`, que devolve a volta do Supabase para
   `guiaicone://entrar` com a mesma query, e ela na lista de endereços de volta
   do Supabase. Sem isso o login do Google não volta ao app.
2. Dentro do app: a tela de assinar é a da Apple (preço da loja, "Restaurar
   compras", Termos e Privacidade), sem Asaas, cupom nem link para comprar
   fora. O servidor confere a transação (`@apple/app-store-server-library`) e
   recebe os avisos da Apple (App Store Server Notifications V2): assinou,
   renovou, falhou, cancelou e reembolsou.
3. O aviso: guardar o token do `pedirAvisos()` e mandar pelo serviço do Expo
   (`https://exp.host/--/api/v2/push/send`), com as mesmas regras do web push.
4. O botão "Entrar com a Apple" no login e no cadastro, dentro do app, e o
   provedor Apple ligado no Supabase com o bundle `com.guiaicone.app`.

## Regras

- **Expo muda a cada versão (SDK 58 hoje).** Não confie na memória: leia os
  tipos em `node_modules` ou a documentação da versão.
- Pacote novo entra por `npx expo install`, que acerta a versão com o SDK.
  Nesta nuvem a rede não alcança o `api.expo.dev`; use
  `EXPO_OFFLINE=1 npx expo install <pacote>`.
- As pastas `ios/` e `android/` não existem no repositório: são geradas no
  build. Configuração nativa vai no `app.config.ts` e nos plugins.
- O ícone e a abertura (`assets/`) saem do `public/icon.svg` do site: o G
  branco com a seta azul sobre o `#070C17`.
- Antes de dar por pronto: `npm run tipos` e
  `EXPO_OFFLINE=1 npx expo export --platform ios` (confere se o app compila).

## Compilar e enviar

```bash
npm install -g eas-cli
eas login
npm run build:simulador       # o iPhone simulado, para abrir no Appetize
npm run build:teste           # para o TestFlight, abrindo o teste.guiaicone.com
npm run build:producao        # para a loja
npm run enviar:producao       # manda o último build para o App Store Connect
```

O projeto no expo.dev já existe (organização `guiaicone`, projeto
`guia-icone`) e o id dele está no `app.config.ts`. Falta o id do app no App
Store Connect, que entra no `ascAppId` do `eas.json`.
