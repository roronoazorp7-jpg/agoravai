---
name: Mídia dos gatilhos
description: Restrição de persistência para arquivos usados pelas respostas automáticas do bot.
---

Os arquivos de resposta dos gatilhos não devem depender somente do disco local do processo nem de URLs temporárias do Discord. O cache local pode ser recriado em reinícios ou deploys, e links de anexos podem expirar.

**Why:** O bot roda fora do workspace em uma plataforma com filesystem efêmero; registros antigos podem continuar no banco enquanto o arquivo local desaparece.

**How to apply:** Para novos gatilhos, arquive o arquivo em uma mensagem privada do Discord e guarde os IDs do canal, mensagem e anexo; buscar a mensagem antes do envio renova a URL. Mantenha recuperação compatível para registros legados cujo link ainda esteja válido. Uploads antigos do TikTok podem não ter extensão nem MIME salvo; ao entregar um arquivo assim, inferir `.mp4` quando a origem indicar vídeo para que o Discord mostre o player.