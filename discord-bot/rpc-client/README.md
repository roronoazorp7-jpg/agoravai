# Cliente RPC individual

Este cliente aplica um Rich Presence no **Discord Desktop do próprio membro**.
Ele não usa token de usuário, selfbot ou automação de conta.

## Configuração rápida

1. Abra o Discord Desktop.
2. Copie `.env.example` para `.env`.
3. No `DISCORD_APPLICATION_ID`, coloque o ID da aplicação do bot. O comando
   `/rpc` mostra esse ID automaticamente.
4. Execute:

```bash
npm start
```

Para remover a atividade manualmente:

```bash
npm run clear
```

Também é possível copiar `rpc.config.example.json` para `rpc.config.json` e
editar os textos. Argumentos da linha de comando sobrescrevem o arquivo:

```bash
npm start -- --details "Savagge" --state "Jogando com a comunidade"
```

## Imagens e botões

Os campos `RPC_LARGE_IMAGE` e `RPC_SMALL_IMAGE` recebem as chaves dos assets
cadastrados na aplicação no Discord Developer Portal. Sem assets cadastrados,
o RPC funciona normalmente apenas com texto.

O Discord permite até dois botões, usando URLs `http://` ou `https://`.