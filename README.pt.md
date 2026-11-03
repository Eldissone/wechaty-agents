# Wechaty — guia em português

## O que é

O Wechaty é um SDK de automação conversacional (RPA) para criar bots. Ele fornece uma interface comum para plataformas de mensagens, como WeChat e WhatsApp: escreve-se a lógica do bot uma vez e escolhe-se o *puppet* (adaptador/protocolo) adequado à plataforma.

Este repositório contém o **SDK Wechaty**, na versão `2.0.0-alpha.1`; não é uma aplicação de bot final. O exemplo executável é `examples/ding-dong-bot.ts`.

## Requisitos

- Node.js 16 ou superior (o ambiente local usa Node.js 24.18.0);
- npm 7 ou superior;
- Uma conta e um protocolo/*puppet* compatível para iniciar sessão numa plataforma de mensagens.

## Preparação local

```powershell
npm install
npm start
```

`npm start` executa o exemplo "ding-dong": depois de autenticar o bot, uma mensagem `ding`, `ping`, `bing` ou `code` recebe `dong` como resposta.

Para gerar a distribuição JavaScript/TypeScript:

```powershell
npm run build
```

Para executar verificações e testes:

```powershell
npm test
```

## Protocolos (*puppets*)

O adaptador é definido pela variável de ambiente `WECHATY_PUPPET` ou nas opções de `WechatyBuilder.build()`. Os provedores disponíveis no README original incluem:

- `wechaty-puppet-wechat4u`: protocolo Web do WeChat;
- `wechaty-puppet-service`: serviço remoto, usado por fornecedores como WorkPro, Rock e PadLocal (normalmente requer token);
- `wechaty-puppet-mock`: simulador para testes.

Exemplo em PowerShell para usar o simulador em desenvolvimento:

```powershell
$env:WECHATY_PUPPET = 'wechaty-puppet-mock'
npm start
```

> O protocolo Web pode não estar disponível para todas as contas WeChat. Para provedores de serviço, configure também o token exigido pelo fornecedor. Não coloque tokens no repositório.

## Exemplo mínimo

```ts
import { WechatyBuilder } from 'wechaty'

const bot = WechatyBuilder.build()
bot
  .on('scan', (qrCode, status) => console.log(`Leia o QR Code: ${status}`))
  .on('login', user => console.log(`${user} iniciou sessão`))
  .on('message', message => console.log(`Mensagem: ${message}`))

await bot.start()
```

## Notas deste checkout

- A configuração local fixa TypeScript 5.0.4 e versões transitivas compatíveis de `wechaty-grpc` e `redux-observable`. As versões mais recentes quebram opções ou artefactos esperados por este código de 2021.
- Os ficheiros `*.spec.ts` são excluídos da distribuição: um teste interno (`ProtectedProperties`) contém uma verificação de tipos desatualizada. Isso permite compilar e executar o SDK; a correção desse teste é uma tarefa separada.
- O exemplo é executado a partir de `dist/esm`, sem o carregador SWC/ts-node. Isto evita uma falha de permissões do cache nativo SWC em alguns ambientes Windows.
- O README original em inglês continua em `README.md` e contém a referência completa da API, as integrações e os créditos.
