# Codex Meter

[English](README.md) · **Português**

Veja sua conta, cota e uso de tokens do Codex na Activity Bar do VS Code.

> **Não oficial.** O Codex Meter é uma extensão da comunidade. Não é feito, endossado nem suportado pela OpenAI. "Codex" e "ChatGPT" são marcas registradas da OpenAI. Você precisa ter o Codex CLI ou a extensão oficial OpenAI Codex instalados e com login feito.

```
▼ CODEX METER: ACCOUNT & USAGE

  ACCOUNT
  you@example.com
  ChatGPT Plus

  USAGE
  Session (5h)                  7%
  ██░░░░░░░░░░░░░░░░░░
  Resets in 4h 36m

  Weekly (7d)                  60%
  ████████████░░░░░░░░
  Resets Sep 20, 18:04

  TOKENS
  Today                 22,534,095
  Last 7 days          111,060,238
  Lifetime           2,960,568,309
  Peak day             180,528,767
  Streak                10d (best 12d)
  ▁▂▁▅▃▇▂▁▃▄▆▂▅█  (last 14 days)

  Last updated: 16:27     ↻ Refresh
```

Os dados vêm do **Codex App Server** oficial, a interface JSON-RPC que a própria extensão do Codex para IDEs usa. A extensão nunca lê `~/.codex/auth.json` e nunca chama endpoints privados do ChatGPT.

## Como funciona

A extensão inicia `codex app-server` como processo filho e envia JSON-RPC delimitado por quebra de linha via stdio:

| Método | Usado para |
| --- | --- |
| `initialize` / `initialized` | Handshake (com `experimentalApi: true`) |
| `account/read` | E-mail e plano |
| `account/rateLimits/read` | `usedPercent`, `windowDurationMins` e `resetsAt` de cada janela de cota |
| `account/usage/read` | Tokens totais, buckets diários, sequências (streaks) e dia de pico |
| `account/rateLimits/updated` (notificação) | Atualizações de cota em tempo real entre as consultas |
| `account/updated` (notificação) | Dispara uma atualização após login ou logout |

Detalhes:

- **Os rótulos das janelas vêm de `windowDurationMins`.** `300` aparece como *Session (5h)* e `10080` como *Weekly (7d)*. Se a OpenAI mudar as janelas, os rótulos acompanham automaticamente.
- **Cota e tokens são exibidos separadamente.** Quanto da cota uma requisição consome depende do modelo, do contexto, do raciocínio e das ferramentas usadas. Não é uma contagem de tokens.
- **Versões antigas do Codex sem `account/usage/read`** (como a 0.118) recorrem à soma dos eventos `token_count` em `$CODEX_HOME/sessions/**/*.jsonl`. Esses números cobrem só esta máquina e o painel os marca como estimativas.

### Qual binário `codex` é usado

1. `codexMeter.codexPath`, se estiver definido.
2. O binário que vem com a extensão oficial **OpenAI Codex** do VS Code (`openai.chatgpt`), se estiver instalada. Normalmente é a versão mais recente.
3. `codex` do seu `PATH`.

## Configurações

| Configuração | Padrão | |
| --- | --- | --- |
| `codexMeter.codexPath` | `""` | Caminho do executável `codex` |
| `codexMeter.refreshIntervalSeconds` | `120` | Intervalo de consulta (mínimo 30) |
| `codexMeter.display` | `used` | Se as barras mostram a porcentagem usada (`used`) ou restante (`remaining`) |
| `codexMeter.statusBar` | `true` | Mostra `5% · 60%` na barra de status |
| `codexMeter.localTokenFallback` | `true` | Usa os logs de sessão locais quando `account/usage/read` não está disponível |

Comandos: **Codex Meter: Refresh**, **Restart Codex App Server**, **Show Log** e **Open Settings**.

## Desenvolvimento

```bash
npm install
npm test          # compila + testes unitários (node:test)
# F5 no VS Code → "Run Extension"
npm run package   # gera codex-meter-<versão>.vsix
```

```
src/
├─ extension.ts            ativação, comandos, ligação com as configurações
├─ UsageController.ts      conexão com o App Server, polling, notificações
├─ codex/
│  ├─ AppServerClient.ts   JSON-RPC via stdio (spawn, framing, timeouts, restart)
│  ├─ AccountService.ts    account/read
│  ├─ UsageService.ts      account/rateLimits/read, account/usage/read (+ fallback)
│  ├─ LocalSessionUsage.ts estimativa de tokens a partir dos logs de rollout
│  └─ resolveCodex.ts      escolhe o executável do codex
├─ views/
│  ├─ UsageViewProvider.ts WebviewViewProvider (CSP + nonce)
│  ├─ StatusBar.ts
│  └─ viewState.ts         dados puros → textos de exibição (com testes unitários)
├─ models/                 tipos do protocolo gerados por `codex app-server generate-ts`
└─ util/                   formatação, estatísticas de tokens
media/                     script do webview, CSS que segue o tema, ícone da Activity Bar
```

Para conferir os tipos do protocolo com o Codex instalado, rode `codex app-server generate-ts --out ./schema`.
