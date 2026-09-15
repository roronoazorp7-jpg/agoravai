---
name: Groq model availability
description: Groq model IDs can be listed in documentation but still return model_not_found for a specific API key.
---

Do not assume that a model listed in Groq documentation is usable by the bot's key. Keep the chat model configurable through `GROQ_MODEL` with a known working fallback, and verify it with a real `/chat/completions` request when AI replies fail.

**Why:** A previously configured production model returned HTTP 404 `model_not_found` even though it appeared in the current model documentation, causing both normal and voice replies to fail.

**How to apply:** When Groq returns 404 for a model, query the active models or test candidate IDs with the deployed key before changing prompts or TTS. Keep all Groq flows on the same configurable model.