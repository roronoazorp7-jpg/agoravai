import { Router } from "express";
import { db } from "@workspace/db";
import { guildConfigTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const router = Router();

const DISCORD_API = "https://discord.com/api/v10";
const BOT_TOKEN = process.env.DISCORD_TOKEN;

// Discord Components V2 message flags
const IS_COMPONENTS_V2 = 1 << 15; // 32768

type GuildCfg = typeof import("@workspace/db/schema").guildConfigTable.$inferSelect;

function buildTicketPanelPayload(cfg: GuildCfg) {
  const BTN_STYLE: Record<string, number> = {
    primary: 1, secondary: 2, success: 3, danger: 4,
  };

  const bannerPos = cfg.ticketBannerPosition ?? "top";
  const onlyBanner = cfg.ticketOnlyBanner ?? false;
  const components: object[] = [];

  // Container (Components V2 type=17)
  const containerChildren: object[] = [];

  if (onlyBanner) {
    if (cfg.ticketBanner) {
      containerChildren.push({
        type: 12, // MediaGallery
        items: [{ media: { url: cfg.ticketBanner } }],
      });
    }
  } else {
    const titleLine = cfg.ticketTitle ? `## ${cfg.ticketTitle}\n\n` : "";
    const base = cfg.ticketText ?? "Clique no botão abaixo para abrir um ticket.";
    const body = cfg.ticketUseSeparator ? `──────────────────────────────────\n\n${base}` : base;
    const fullText = `${titleLine}${body}`;

    if (cfg.ticketBanner && bannerPos === "top") {
      containerChildren.push({ type: 12, items: [{ media: { url: cfg.ticketBanner } }] });
    }

    if (cfg.ticketThumb) {
      containerChildren.push({
        type: 9, // Section
        components: [{ type: 10, content: fullText }], // TextDisplay
        accessory: { type: 11, media: { url: cfg.ticketThumb } }, // Thumbnail
      });
    } else {
      containerChildren.push({ type: 10, content: fullText });
    }

    if (cfg.ticketFooter) {
      containerChildren.push({ type: 14 }); // Separator
      containerChildren.push({ type: 10, content: `-# ${cfg.ticketFooter}` });
    }

    if (cfg.ticketBanner && bannerPos === "bottom") {
      containerChildren.push({ type: 12, items: [{ media: { url: cfg.ticketBanner } }] });
    }
  }

  // Accent color
  const container: Record<string, unknown> = { type: 17, components: containerChildren };
  if (cfg.ticketColor) {
    const parsed = parseInt(cfg.ticketColor.replace("#", ""), 16);
    if (!isNaN(parsed)) container.accent_color = parsed;
  }
  components.push(container);

  // Button row
  const label = cfg.ticketBtnLabel || "Abrir Ticket";
  const emojiRaw = (cfg.ticketBtnEmoji || "🎫").trim();
  const style = BTN_STYLE[cfg.ticketBtnStyle ?? "primary"] ?? 1;
  const btn: Record<string, unknown> = {
    type: 2, custom_id: "ticket_open", label, style,
  };
  const match = emojiRaw.match(/^<(a?):([^:>\s]+):(\d+)>$/);
  if (match) btn.emoji = { animated: match[1] === "a", name: match[2], id: match[3] };
  else if (emojiRaw) btn.emoji = { name: emojiRaw };

  components.push({ type: 1, components: [btn] });

  return { components, flags: IS_COMPONENTS_V2 };
}

function isValidGuildId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0;
}

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  approximate_member_count?: number;
}

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  email?: string | null;
  avatar?: string | null;
}

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  position: number;
}

async function fetchDiscordGuild(guildId: string): Promise<DiscordGuild | null> {
  if (!BOT_TOKEN) return null;
  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}?with_counts=true`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (!res.ok) return null;
    return await res.json() as DiscordGuild;
  } catch {
    return null;
  }
}

async function fetchDiscordUser(): Promise<DiscordUser | null> {
  if (!BOT_TOKEN) return null;
  try {
    const res = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (!res.ok) return null;
    return await res.json() as DiscordUser;
  } catch {
    return null;
  }
}

async function fetchDiscordChannels(guildId: string): Promise<DiscordChannel[] | null> {
  if (!BOT_TOKEN) return null;
  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (!res.ok) return null;
    return await res.json() as DiscordChannel[];
  } catch {
    return null;
  }
}

function guildIconUrl(guildId: string, icon: string | null): string | null {
  if (!icon) return null;
  const ext = icon.startsWith("a_") ? "gif" : "webp";
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${ext}?size=64`;
}

function userAvatarUrl(userId: string, avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  const ext = avatar.startsWith("a_") ? "gif" : "webp";
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${ext}?size=128`;
}

router.get("/me", async (req, res) => {
  if (!BOT_TOKEN) {
    res.status(401).json({ error: "Discord connection is not available" });
    return;
  }

  const user = await fetchDiscordUser();
  if (!user) {
    res.status(401).json({ error: "Discord connection is not available" });
    return;
  }

  res.json({
    id: user.id,
    username: user.username,
    globalName: user.global_name ?? null,
    email: user.email ?? null,
    avatar: userAvatarUrl(user.id, user.avatar),
  });
});

router.get("/guilds", async (req, res) => {
  try {
    const guilds = await db.select().from(guildConfigTable);

    const enriched = await Promise.all(
      guilds.map(async (g) => {
        const discord = await fetchDiscordGuild(g.guildId);
        return {
          id: g.id,
          guildId: g.guildId,
          welcomeEnabled: g.welcomeEnabled,
          partnerEnabled: g.partnerEnabled,
          hasTicketChannel: !!g.ticketChannel,
          hasShop: !!g.lojaTitle,
          memberCount: discord?.approximate_member_count ?? null,
          discordName: discord?.name ?? null,
          discordIcon: discord ? guildIconUrl(g.guildId, discord.icon) : null,
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Failed to list guilds");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/guilds/:guildId/channels", async (req, res) => {
  const { guildId } = req.params;
  if (!isValidGuildId(guildId)) {
    res.status(400).json({ error: "Invalid guild ID" });
    return;
  }
  if (!BOT_TOKEN) {
    res.status(503).json({ error: "DISCORD_TOKEN not set" });
    return;
  }

  try {
    const [config] = await db
      .select({ guildId: guildConfigTable.guildId })
      .from(guildConfigTable)
      .where(eq(guildConfigTable.guildId, guildId));

    if (!config) {
      res.status(404).json({ error: "Guild config not found" });
      return;
    }

    const channels = await fetchDiscordChannels(guildId);
    if (!channels) {
      res.status(502).json({ error: "Could not load Discord channels" });
      return;
    }

    res.json(
      channels
        .filter((channel) => channel.type === 0)
        .sort((a, b) => a.position - b.position)
        .map(({ id, name, type, position }) => ({ id, name, type, position })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list guild channels");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/guilds/:guildId/config", async (req, res) => {
  const { guildId } = req.params;
  if (!isValidGuildId(guildId)) {
    res.status(400).json({ error: "Invalid guild ID" });
    return;
  }

  try {
    const [config] = await db
      .select()
      .from(guildConfigTable)
      .where(eq(guildConfigTable.guildId, guildId));

    if (!config) {
      res.status(404).json({ error: "Guild config not found" });
      return;
    }

    res.json(config);
  } catch (err) {
    req.log.error({ err }, "Failed to get guild config");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/guilds/:guildId/config", async (req, res) => {
  const { guildId } = req.params;
  if (!isValidGuildId(guildId)) {
    res.status(400).json({ error: "Invalid guild ID" });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(guildConfigTable)
      .where(eq(guildConfigTable.guildId, guildId));

    if (!existing) {
      res.status(404).json({ error: "Guild config not found" });
      return;
    }

    const editableKeys = new Set([
      "ticketChannel", "ticketCategory", "ticketColor", "ticketBanner", "ticketThumb",
      "ticketFooter", "ticketTitle", "ticketText", "ticketPingRole", "ticketPingUser",
      "ticketBtnLabel", "ticketBtnEmoji", "ticketBtnStyle", "ticketOpenText",
      "ticketUseSeparator", "ticketBannerPosition", "ticketOnlyBanner", "ticketUseMenu",
      "ticketQuestion1", "ticketQuestion2", "ticketQuestion3",
      "instaChannel", "instaColor", "instaEmoji", "instaHandle",
      "tellonymChannel", "tellonymColor", "tellonymBanner", "tellonymThumb",
      "tellonymFooter", "tellonymTitle", "tellonymText", "tellonymBtnLabel", "tellonymBtnEmoji",
      "lojaTitle", "lojaText", "lojaBanner", "lojaThumb", "lojaColor", "lojaConversao",
      "lojaUseDivider", "shopEmojiComprar", "shopEmojiVitrine", "shopEmojiConverter",
      "shopEmojiSaldo", "shopEmojiGift",
      "welcomeEnabled", "welcomeChannel", "welcomeColor", "welcomeBanner", "welcomeThumb",
      "welcomeFooter", "welcomeTitle", "welcomeText", "welcomeRoles", "welcomeChannels",
      "welcomeUseDivider", "welcomeBannerPosition", "welcomeShowTitle", "welcomeShowAvatar",
      "welcomeDeleteAfter",
      "partnerEnabled", "partnerChannel", "partnerResponsibleRole", "partnerPingRole",
      "partnerRole", "partnerNotifyDm", "partnerMessage", "partnerImage", "partnerThumbnail",
      "partnerFooter", "partnerColor", "partnerRemoveOnLeave",
      "botIconUrl", "botBannerUrl", "botBio", "aiChannelId",
    ]);
    const updates = Object.fromEntries(
      Object.entries(req.body as Record<string, unknown>)
        .filter(([key]) => editableKeys.has(key)),
    );

    const [updated] = await db
      .update(guildConfigTable)
      .set(updates)
      .where(eq(guildConfigTable.guildId, guildId))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update guild config");
    res.status(500).json({ error: "Internal server error" });
  }
});

async function safeCount(query: ReturnType<typeof sql>): Promise<number> {
  try {
    const result = await db.execute<{ count: string }>(query);
    const rows = result as unknown as { count: string }[];
    return parseInt(rows[0]?.count ?? "0") || 0;
  } catch {
    return 0;
  }
}

async function safeEconomyStats(guildId: string) {
  try {
    const result = await db.execute<{ users: string; richest: string; total: string }>(
      sql`SELECT COUNT(*) as users, COALESCE(MAX("balance" + "bank"), 0) as richest, COALESCE(SUM("balance" + "bank"), 0) as total FROM "Economy" WHERE "guildId" = ${guildId}`
    );
    const rows = result as unknown as { users: string; richest: string; total: string }[];
    const row = rows[0];
    return {
      users: parseInt(row?.users ?? "0") || 0,
      richest: parseInt(row?.richest ?? "0") || 0,
      total: parseInt(row?.total ?? "0") || 0,
    };
  } catch {
    return { users: 0, richest: 0, total: 0 };
  }
}

router.post("/guilds/:guildId/panels/ticket/update", async (req, res) => {
  const { guildId } = req.params;
  if (!isValidGuildId(guildId)) {
    res.status(400).json({ error: "Invalid guild ID" });
    return;
  }
  if (!BOT_TOKEN) {
    res.status(503).json({ error: "DISCORD_TOKEN not set" });
    return;
  }

  try {
    const [config] = await db
      .select()
      .from(guildConfigTable)
      .where(eq(guildConfigTable.guildId, guildId));

    if (!config) {
      res.status(404).json({ error: "Guild config not found" });
      return;
    }

    const messageId = config.ticketPanelMessageId;
    const channelId = config.ticketPanelChannelId;

    if (!messageId || !channelId) {
      res.status(409).json({ error: "NO_PANEL_ID", message: "Nenhum painel rastreado. Use /ticket painel no Discord primeiro — a dashboard vai salvar o ID automaticamente." });
      return;
    }

    // Build the new panel payload (Components V2 style)
    const panel = buildTicketPanelPayload(config);

    const editRes = await fetch(
      `${DISCORD_API}/channels/${channelId}/messages/${messageId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(panel),
      }
    );

    if (!editRes.ok) {
      const err = await editRes.text();
      req.log.error({ err, status: editRes.status }, "Discord edit failed");
      if (editRes.status === 404) {
        res.status(404).json({ error: "PANEL_NOT_FOUND", message: "Mensagem não encontrada no Discord. Envie um novo painel com /ticket painel." });
      } else {
        res.status(502).json({ error: "Discord API error", detail: err });
      }
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update ticket panel");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/guilds/:guildId/panels/ticket/send", async (req, res) => {
  const { guildId } = req.params;
  if (!isValidGuildId(guildId)) {
    res.status(400).json({ error: "Invalid guild ID" });
    return;
  }
  if (!BOT_TOKEN) {
    res.status(503).json({ error: "DISCORD_TOKEN not set" });
    return;
  }

  try {
    const [config] = await db
      .select()
      .from(guildConfigTable)
      .where(eq(guildConfigTable.guildId, guildId));

    if (!config) {
      res.status(404).json({ error: "Guild config not found" });
      return;
    }

    const channelId = config.ticketChannel;
    if (!channelId) {
      res.status(400).json({ error: "NO_CHANNEL", message: "Configure o ID do canal antes de enviar o painel." });
      return;
    }

    const panel = buildTicketPanelPayload(config);

    const sendRes = await fetch(
      `${DISCORD_API}/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(panel),
      }
    );

    if (!sendRes.ok) {
      const err = await sendRes.text();
      req.log.error({ err, status: sendRes.status }, "Discord send failed");
      res.status(502).json({ error: "Discord API error", detail: err });
      return;
    }

    const msg = await sendRes.json() as { id: string };

    await db
      .update(guildConfigTable)
      .set({ ticketPanelMessageId: msg.id, ticketPanelChannelId: channelId })
      .where(eq(guildConfigTable.guildId, guildId));

    res.json({ ok: true, messageId: msg.id });
  } catch (err) {
    req.log.error({ err }, "Failed to send ticket panel");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/guilds/:guildId/stats", async (req, res) => {
  const { guildId } = req.params;
  if (!isValidGuildId(guildId)) {
    res.status(400).json({ error: "Invalid guild ID" });
    return;
  }

  const [totalTickets, openTickets, totalPartnerships, economy] = await Promise.all([
    safeCount(sql`SELECT COUNT(*) as count FROM "Ticket" WHERE "guildId" = ${guildId}`),
    safeCount(sql`SELECT COUNT(*) as count FROM "Ticket" WHERE "guildId" = ${guildId} AND "status" = 'open'`),
    safeCount(sql`SELECT COUNT(*) as count FROM "Partnership" WHERE "guildId" = ${guildId}`),
    safeEconomyStats(guildId),
  ]);

  res.json({
    guildId,
    totalUsers: economy.users,
    totalTickets,
    openTickets,
    totalPartnerships,
    richestBalance: economy.richest,
    totalEconomy: economy.total,
  });
});

export default router;
