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

## Presenced para PS3 e Wii U

O modo `Presenced` é a adaptação integrada do sistema do repositório
[BenchatonDev/Presenced](https://github.com/BenchatonDev/Presenced). Ele monitora
um PS3 com WebMAN MOD e/ou um Wii U com o plugin Rich Presence U e atualiza a
atividade do Discord automaticamente.

Ele usa somente o IPC do Discord Desktop, sem token de usuário ou self-bot.
Por isso precisa ser executado no computador que tem o Discord aberto e que
consegue alcançar o console pela rede; não deve ser iniciado junto do bot no
Railway.

```bash
cp presenced.config.example.json presenced.config.json
# edite clientId e clientConfig.ps3.address, se necessário
npm run presenced
```

Também é possível configurar por variáveis de ambiente:

```bash
DISCORD_APPLICATION_ID=... PRESENCED_PS3_ADDRESS=192.168.1.100 npm run presenced
```

Use `npm run presenced -- --dry-run --once` para testar a leitura dos consoles
sem publicar uma atividade. As chaves `ps3`, `wiiu`, `unknown`, `nintendo`,
`pretendo` e `playstation` precisam existir como assets na aplicação do Discord
para que as imagens apareçam.

## Imagens e botões

Os campos `RPC_LARGE_IMAGE` e `RPC_SMALL_IMAGE` recebem as chaves dos assets
cadastrados na aplicação no Discord Developer Portal. Sem assets cadastrados,
o RPC funciona normalmente apenas com texto.

O Discord permite até dois botões, usando URLs `http://` ou `https://`.