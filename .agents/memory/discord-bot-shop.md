---
name: Discord Bot Shop System
description: Shop system (loja) for Slow bot — banners, roles, profile cards, interactions.
---

## Architecture

- Banners: defined globally in `discord-bot/src/utils/shopData.js` (8 banners with Unsplash URLs + gradient fallbacks). Fixed `key` IDs, not stored in DB.
- Roles: stored per-guild in `ShopRole` model (guildId + roleId + name + price + description).
- Purchases: stored in `UserPurchase` (userId, guildId, itemType="role"|"banner", itemRef=roleId|bannerKey).
- User profiles (active banner): stored in `UserProfile` (userId, guildId, activeBanner=bannerKey|null).

## Commands

- `/loja painel` — posts shop panel (not ephemeral, anyone can see)
- `/loja admin cargo @role <price>` — adds role to shop (admin only)
- `/loja admin remover <id>` — removes role from shop
- `/loja admin listar` — lists all roles in shop
- `/perfil [user]` — shows canvas profile card (900x340px), with "Mudar Banner" button for self

## Interaction customId prefixes

- `shop_comprar` → buy menu (select roles or banners)
- `shop_vitrine` → banner showcase
- `shop_converter` → conversion rates info
- `shop_saldo` → balance overview
- `shop_type_sel` → select menu: roles or banners category
- `shop_item_sel` → select menu: pick specific item
- `shop_vitrine_sel` → select menu: browse banners in vitrine
- `shop_buy_<type>:<ref>` → confirm purchase button
- `shop_ok_<type>:<ref>` → execute purchase button
- `shop_cancel` → cancel purchase
- `profile_banner_btn` → show owned banners to equip
- `profile_banner_sel` → select menu: equip banner on profile

All shop/profile interactions dispatched from `interactionCreate.js` → `handleShopInteraction()` in `shopHandlers.js`.

## Interaction timing

Purchase confirmation and execution acknowledge the Discord interaction before querying or writing Prisma, then finish with `editReply`.

**Why:** The Discord interaction window is short; slow Railway database access can otherwise make a valid shop button appear as “This interaction failed”.

**How to apply:** Keep this defer-first pattern for any new shop purchase, gifting, or other database-backed button action. If the final payload uses Components V2, include `IsComponentsV2` in the initial `deferReply`; it cannot be added only during `editReply`.

## Preview-before-equip pattern (ring/frame/color)

Ring color presets, frames, and custom hex colors (both ring and border) render a
throwaway canvas preview (`ringPreview.js` → `renderRingPreview`) in an ephemeral
deferred reply with "Equipar"/"Cancelar" buttons (`*_ring_confirm:<value>`,
`*_ringborder_confirm:<value>`, `*_ring_cancel`) BEFORE writing to `UserProfile`.
DB write only happens on confirm.

**Why:** User asked to see how a ring/frame/color would look without having to equip
every option one by one — equip-then-check was too slow for browsing many presets.

**How to apply:** Any new equippable cosmetic with multiple visual options should follow
this same defer→render→confirm/cancel flow instead of applying immediately, reusing
`sendRingPreview`/`sendRingBorderPreview` as the template. The generic `profile_`/`wallet_ring`
prefix routing in `interactionCreate.js` already covers any new suffix on these prefixes —
no interactionCreate.js changes needed when only adding new customId suffixes there.

## Profile card

- 900×340px canvas card using `@napi-rs/canvas`
- If activeBanner set: loads Unsplash URL as background image; gradient fallback on error
- Default: dark purple gradient
- Layout: left accent bar, circular avatar with purple gradient ring, username, banner badge, 3 stat cards (wallet, bank, items)

**Why:** Banners defined in code (not DB) to avoid per-guild seeding complexity and keep them consistent. Roles are per-guild because Discord roleIds are guild-specific.

**How to apply:** When adding new banners, add to `BANNERS` array in `shopData.js` — no DB migration needed. Roles always require admin to add via slash command.

## Banner image persistence

Discord attachment URLs are temporary, including URLs on both `cdn.discordapp.com` and
`media.discordapp.net`. Custom shop banners must be downloaded to the bot's local
banner storage when created or updated; old external banners are migrated on first
access. The bot serves that directory over its Railway HTTP port and stores a local
reference in `CustomBanner.imageUrl`.

**Why:** Refreshing Discord CDN URLs only postpones expiry. A local copy keeps shop
carousels, previews, and equipped banners independent from Discord attachment expiry.

**How to apply:** Route all custom-banner creation/update paths through the shared
cache helper and keep carousel/detail paths using the shared resolver so old records
are migrated instead of reading `imageUrl` directly.

## Shop panel banner configuration

The public shop panel must show only the image saved in `GuildConfig.lojaBanner`;
it must not fall back to or reinterpret the guild's own Discord banner. An empty
configuration intentionally means that the shop has no banner.

**Why:** The server banner prevented administrators from changing the shop visual
through `loja config` and made the shop inherit an unrelated guild asset.

**How to apply:** Keep the shop banner independent from `guild.bannerURL()` and
use the shared banner URL builder only for the explicitly configured shop image.
