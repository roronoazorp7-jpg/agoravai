---
name: Mídia dos gatilhos
description: Restrição de persistência para arquivos usados pelas respostas automáticas do bot.
---

Os arquivos de resposta dos gatilhos não devem depender somente do disco local do processo nem de URLs temporárias do Discord. O cache local pode ser recriado em reinícios ou deploys, e links de anexos podem expirar.

**Why:** O bot roda fora do workspace em uma plataforma com filesystem efêmero; registros antigos podem continuar no banco enquanto o arquivo local desaparece.

**How to apply:** Ao evoluir os gatilhos, priorize armazenamento persistente e mantenha uma recuperação compatível para registros legados cujo link ainda esteja válido.