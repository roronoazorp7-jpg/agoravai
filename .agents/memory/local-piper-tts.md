---
name: Piper TTS local
description: Decisão de síntese local em português do Brasil para evitar cotas de APIs de voz no bot.
---

O bot usa Piper local com o modelo `pt_BR-faber-medium`, baixado durante o primeiro uso e convertido de WAV para MP3 pelo FFmpeg.

**Why:** O ElevenLabs tem cota de caracteres; a voz feminina pt-BR Dii encontrada para Piper tem licença CC BY-NC-ND com restrição para uso não comercial. Faber é a opção pt-BR oficial com licença compatível para este projeto, embora seja uma voz masculina.

**Como aplicar:** Manter o runtime Python/Piper e o modelo fora do repositório (`.venv/` e `data/`); mudanças de modelo exigem verificar a licença e atualizar também a origem dos arquivos ONNX e JSON.