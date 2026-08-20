---
name: Railway Deploy — fallen-angels-bot
description: Lições sobre como o Railway builda e roda o discord-bot (fallen-angels-bot)
---

## Configuração atual (funcional)

- **Repositório GitHub**: `pedrohalmeida2207-gif/fallen-angels-bot`
- **Railway project**: `honest-flow` | serviceId: `c140ffbe-386d-4493-ace5-0ae430073452` | environmentId: `d25351c0-20be-4df8-b883-52f54f5da900`
- **rootDirectory** no Railway: `discord-bot` (definido via `serviceInstanceUpdate`)
- **Builder**: NIXPACKS (definido em `discord-bot/railway.json`)
- **nixpacksConfigPath**: `/discord-bot/nixpacks.toml`

## nixpacks.toml atual (funcional)

```toml
[variables]
NIXPACKS_NODE_VERSION = "22"

[phases.setup]
nixPkgs = ["ffmpeg"]

[phases.install]
cmds = ["npm install --legacy-peer-deps"]

[phases.build]
cmds = ["npx prisma generate"]

[start]
cmd = "npx prisma db push --accept-data-loss && node src/index.js"
```

## Regra crítica: package-lock.json gerado no Replit não pode ir ao GitHub

O npm no Replit usa um proxy interno (`package-firewall.replit.local`) e salva URLs desse proxy no `package-lock.json`. Railway não consegue resolver essas URLs → build falha com `ENOTFOUND`.

**Como aplicar**: `discord-bot/package-lock.json` está no `.gitignore`. Nunca remover essa entrada. Railway gera o próprio lock file durante o build.

## Regra: NUNCA adicionar `nodejs_XX` ou `nodePackages.npm` no nixpacks.toml

Nixpacks instala Node automaticamente. Adicionar `nodejs_22` em `nixPkgs` cria colisão com `nodejs_20` (puxado por `nodePackages.npm`):
```
error: collision between /nix/store/...-nodejs-20.18.1/... and /nix/store/...-nodejs-22.11.0/...
```

**Como aplicar**: Especificar versão do Node APENAS via `NIXPACKS_NODE_VERSION = "22"` na seção `[variables]`. Para FFmpeg e outros binários, adicionar em `nixPkgs` normalmente — só Node não pode entrar.

**Why:** Nixpacks detecta automaticamente o engine do package.json e instala um Node padrão. Qualquer outro nodejs_XX conflita com o que já foi instalado.

## Regra: prisma db push precisa rodar no start, não só no build

O banco SQLite (`bot.db`) é efêmero no Railway (sem volume). `prisma generate` no build phase gera o cliente; `prisma db push` no start command cria as tabelas a cada deploy.

**Como aplicar**: 
- `nixpacks.toml` → `[phases.build]` → inclui `npx prisma generate`
- `railway.json` → `startCommand`: `"npx prisma db push --accept-data-loss && node src/index.js"`

## Regra: loader.js deve registrar comandos em apenas UM escopo

Registrar guild + global ao mesmo tempo faz o `/perfil` aparecer duplicado no Discord. Usar `if (GUILD_ID) guild-only, else global-only`, e limpar o escopo oposto com `PUT [...] body:[]` para remover comandos antigos.

## Regra: fonte de GIFs das interações

`nekos.best` pode bloquear as requisições do bot com HTTP 403 e links antigos do Tenor podem retornar 404. As interações usam `api.otakugifs.xyz` com URLs CDN de fallback verificadas; `push` usa `punch`, pois `kick` não é uma reação aceita.

**Why:** Sem fallback, o comando continua respondendo texto e botões, mas o embed fica sem imagem quando a API externa falha.

**Como aplicar:** Manter o timeout da API, validar a URL HTTPS retornada e sempre retornar uma URL CDN estática válida como fallback.

## Regra: @napi-rs/canvas 1.0.0 não registra fontes TTF customizadas via API

No ambiente Nix/Replit, `GlobalFonts.register()`, `registerFromPath()` e `loadFontsFromDir()` retornam null/0 silenciosamente — fontes customizadas nunca aparecem em `getFamilies()`. Apenas fontes do SISTEMA (via fontconfig) são acessíveis.

**Como aplicar**: Nunca depender de registro manual de fonte. Usar `GlobalFonts.loadSystemFonts()` + detecção dinâmica da família disponível. No Railway, garantir que fontconfig + apt-fonts estejam instalados (via railpack.toml com aptPkgs).

## Regra: usar railpack.toml (apt) em vez de nixpacks.toml (nix) para fontes no Railway

Nixpacks não configura fontconfig corretamente para o skia do @napi-rs/canvas. Com aptPkgs: ["fonts-dejavu-core","fonts-noto","fonts-liberation","fontconfig"] + fc-cache no build, o `loadSystemFonts()` funciona.

**Como aplicar**: Manter nixpacks.toml vazio/comentado. Não forçar builder no railway.json — deixar Railway auto-detectar o railpack.toml.

## Regra: fazer push via GitHub API quando git não está disponível no agente

O agente main não pode usar `git add/commit/push` diretamente. Usar GitHub Contents API:
1. `GET /repos/{owner}/{repo}/contents/{path}` → pega o `sha` do arquivo
2. `PUT /repos/{owner}/{repo}/contents/{path}` com `content` (base64) e `sha` → push direto

## Regra: erro "Project Token not found" via GraphQL = token não existe mais, não é falta de permissão

Ao testar RAILWAY_TOKEN via `Project-Access-Token` header na query `projectToken { id name projectId }`, um erro genérico "Not Authorized" pode significar objectId/serviceId errados, mas **"Project Token not found"** é definitivo: o token não corresponde a nenhum Project Token existente no Railway (foi revogado/deletado, ou nunca foi um Project Token válido).

**Como aplicar**: Se `railway status`/`railway whoami` da CLI E a query GraphQL `projectToken` retornarem erro, peça ao usuário para gerar um novo Project Token em Project Settings → Tokens no painel do Railway (não um Account/Team API token) e atualizar o Secret. Testar novo token imediatamente com `query { projectToken { id name projectId environmentId } }` antes de assumir que funciona.

**Why:** A CLI do Railway (`railway status`, `railway whoami`, `railway redeploy`) e a API "me"/"deployments" falham de forma idêntica e pouco informativa ("Invalid RAILWAY_TOKEN" / "Not Authorized") tanto para tokens revogados quanto para uso incorreto de escopo — a query `projectToken` é o único jeito de diferenciar as duas causas.

## Deploy automático via GitHub independe do RAILWAY_TOKEN

Se o serviço Railway está conectado ao repositório GitHub (deploy automático por push), atualizar a branch `main` no GitHub (via push normal ou GitHub API) já dispara o build no Railway sozinho — não é necessário um RAILWAY_TOKEN válido para isso. O token só é necessário para verificar status/logs ou forçar um redeploy manual via API/CLI.

## Regra: `repository forbidden` no Snapshot code acontece antes do build

Quando o Railway falha em `Initialization > Snapshot code` com `repository forbidden`, o commit não foi sequer baixado; nenhum ajuste no código ou no comando de build pode corrigir essa etapa.

**Como aplicar:** Reautorizar o app do Railway no GitHub para o repositório conectado e conferir se o serviço aponta para a organização/repositório e branch corretos antes de tentar outro deploy.

## Como buscar FutggId para novos jogadores

O CDN do FUT.GG (`cdn.futgg.com`) é inacessível da rede do Replit (timeout/000). Para encontrar futggId de jogadores:
- Não usar: sofifa.com, futbin.com, fut.gg (todos Cloudflare)
- Alternativa: o script `scripts/sync-futgg.js --force` roda no Railway/servidor externo onde o CDN é acessível
- Jogadores sem futggId mostram avatar com iniciais (comportamento esperado e já implementado)

## Backup do PostgreSQL Railway

- Para acessar o banco a partir do Replit, usar `DATABASE_PUBLIC_URL`; `DATABASE_URL` com host `postgres.railway.internal` só resolve dentro da rede do Railway.
- **Why:** o host interno falha por DNS fora do Railway; além disso, `pg_dump` precisa ser da mesma versão major ou mais nova que o servidor PostgreSQL.
- **Como aplicar:** validar a versão do servidor antes do dump e, se o cliente compatível não estiver disponível, exportar os dados por tabela e restaurar a estrutura a partir do schema Prisma.
- Em exportações CSV entre bancos Prisma, sempre importar com lista explícita de colunas; a ordem física pode mudar entre bancos mesmo com o mesmo schema.
