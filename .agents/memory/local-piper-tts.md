---
name: TTS local do bot
description: Estratégia de síntese local em português do Brasil sem cota de API.
---

O bot usa exclusivamente XTTS-v2 local, com uma amostra de voz autorizada configurada em `XTTS_SPEAKER_WAV`.

**Why:** XTTS-v2 entrega uma fala mais fluida, humanizada e descontraída sem depender de cota externa. Usar outro sintetizador como fallback faria o bot voltar silenciosamente à voz antiga.

**Como aplicar:** O worker Python carrega o XTTS-v2 uma vez e atende uma fila local. Configure `XTTS_SPEAKER_WAV`, `XTTS_LANGUAGE` e `XTTS_USE_GPU`; se o XTTS falhar, o fluxo deve retornar erro para o fallback textual do bot, nunca para outra engine de voz.

No Railway usando Railpack com provider Node, as dependências Python precisam ser instaladas explicitamente no `.venv` durante o build; o worker deve usar esse mesmo interpretador, sem aceitar um `PYTHON_BIN` global que possa apontar para o Python do sistema.

**Why:** O provider Node não garante que `requirements.txt` seja aplicado automaticamente, e um Python global pode não conter o `coqui-tts` instalado no ambiente virtual.

**Como aplicar:** Mantenha a instalação de `requirements.txt` no comando de build, valide `from TTS.api import TTS` durante o build e deixe `XTTS_PYTHON` apontar para `.venv/bin/python` por padrão.
