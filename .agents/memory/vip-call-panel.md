---
name: VIP call panel
description: Current VIP experience and the persistence convention for each member's configurable voice call.
---

The member-facing VIP command is `/vip` and publishes a public management panel in the channel where it is used. The server currently exposes one VIP benefit: a configurable voice call.

**Why:** The previous design created a temporary private text channel for the panel, but the intended experience is an in-place panel with the benefit managed directly from the chat.

**How to apply:** Authorize every panel and call action through an active `VipGrant`. Create calls in the configured VIP category and identify each member's call through that category plus the member's explicit `Connect` permission overwrite. Discord rejects `topic` on voice-channel creation with `CHANNEL_TOPIC_INVALID`; do not send it. Keep the legacy topic check only for cleanup compatibility.

**Why:** Discord's channel API accepts `topic` for text-like channels but rejects it on guild voice-channel creation, so the topic-only convention made `/vip` fail with error 50035.