---
name: Piper TTS local
description: Decisão de síntese local em português do Brasil para evitar cotas de APIs de voz no bot.
---

O bot usa Piper local com o modelo feminino `dii_pt-BR`, baixado durante o primeiro uso e convertido de WAV para MP3 pelo FFmpeg.

**Why:** A voz Dii é a alternativa feminina em português brasileiro compatível com Piper. Ela tem licença CC BY-NC-ND, portanto o uso deve permanecer não comercial e com atribuição à TigreGotico Lda. As vozes pt_BR oficiais do Piper são masculinas.

**Como aplicar:** Manter o runtime Python/Piper e o modelo fora do repositório (`.venv/` e `data/`); mudanças de modelo exigem verificar a licença e atualizar também a origem dos arquivos ONNX e JSON. Se o bot passar a ter uso comercial, trocar a voz ou obter autorização do detentor.
