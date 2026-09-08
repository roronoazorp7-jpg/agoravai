---
name: VIP call panel
description: Current VIP experience and the persistence convention for each member's configurable voice call.
---

The member-facing VIP command is `/vip` and publishes a public management panel in the channel where it is used. The server currently exposes one VIP benefit: a configurable voice call.

**Why:** The previous design created a temporary private text channel for the panel, but the intended experience is an in-place panel with the benefit managed directly from the chat.

**How to apply:** Authorize every panel and call action through an active `VipGrant`. Identify each member's call with the voice channel topic `vip-call:<guildId>:<userId>` so the configuration survives bot restarts without a new database model. The call settings are Discord channel properties and permissions.