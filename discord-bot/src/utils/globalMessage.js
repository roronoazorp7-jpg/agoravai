import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';

export const GLOBAL_MESSAGE_OWNER_ID = '1538243891155705877';

const SEND_INTERVAL_MS = 350;
const jobs = new Map();

export function isGlobalMessageOwner(userId) {
  return userId === GLOBAL_MESSAGE_OWNER_ID;
}

export function getGlobalMessageJob(ownerId = GLOBAL_MESSAGE_OWNER_ID) {
  return jobs.get(ownerId) ?? null;
}

function toJson(value) {
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value.toJSON === 'function') return value.toJSON();
  return value;
}

function serializePayload(payload) {
  const result = {};
  if (payload.content) result.content = payload.content;
  if (payload.embeds?.length) result.embeds = payload.embeds.map(toJson);
  if (payload.components?.length) result.components = payload.components.map(toJson);
  if (payload.flags !== undefined) result.flags = payload.flags;
  if (payload.allowedMentions) result.allowedMentions = toJson(payload.allowedMentions);
  return result;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function buildGlobalMessageConfirmPayload(session) {
  const itemCount =
    session.blocks.length
    + session.msgButtons.length
    + (session.banner ? 1 : 0)
    + (session.thumbnail ? 1 : 0);

  const embed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle('⚠️ Confirmar mensagem global')
    .setDescription(
      'Esta ação tentará enviar a mensagem por DM para todos os membros humanos ' +
      'dos servidores em que o bot está. Usuários com DMs fechadas serão contabilizados como falha.',
    )
    .addFields(
      { name: 'Itens montados', value: `${itemCount}`, inline: true },
      { name: 'Servidores', value: 'Todos os servidores acessíveis ao bot', inline: true },
      { name: 'Proteções', value: 'Bots ignorados · membros duplicados enviados uma vez', inline: false },
    )
    .setFooter({ text: 'Use somente para comunicações legítimas e esperadas pela comunidade.' });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('msg_global_confirm')
          .setLabel('Confirmar envio')
          .setEmoji('📣')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('msg_global_abort')
          .setLabel('Voltar')
          .setEmoji('↩️')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

export function buildGlobalMessageStatusPayload(job) {
  const isRunning = job?.status === 'running' || job?.status === 'collecting';
  const embed = new EmbedBuilder()
    .setColor(isRunning ? 0x5865F2 : 0x57F287)
    .setTitle(isRunning ? '📣 Envio global em andamento' : '📣 Último envio global')
    .setDescription(
      isRunning
        ? 'O bot está processando os membros em segundo plano. Você receberá um resumo ao terminar.'
        : 'O último envio global foi finalizado.',
    )
    .addFields(
      { name: 'Status', value: job?.status ?? 'desconhecido', inline: true },
      { name: 'Total', value: String(job?.total ?? 0), inline: true },
      { name: 'Enviadas', value: String(job?.sent ?? 0), inline: true },
      { name: 'Falhas', value: String(job?.failed ?? 0), inline: true },
      { name: 'Servidores não acessíveis', value: String(job?.guildErrors ?? 0), inline: true },
    );

  return { embeds: [embed] };
}

export function startGlobalMessageJob(client, payload, ownerId = GLOBAL_MESSAGE_OWNER_ID) {
  const current = jobs.get(ownerId);
  if (current?.status === 'running' || current?.status === 'collecting') return null;

  const job = {
    status: 'collecting',
    total: 0,
    sent: 0,
    failed: 0,
    guildErrors: 0,
    startedAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(ownerId, job);

  void runGlobalMessageJob(client, serializePayload(payload), ownerId, job);
  return job;
}

async function runGlobalMessageJob(client, payload, ownerId, job) {
  const recipients = new Map();

  for (const guild of client.guilds.cache.values()) {
    try {
      const members = await guild.members.fetch();
      for (const member of members.values()) {
        if (!member.user?.bot) recipients.set(member.user.id, member.user);
      }
    } catch (error) {
      job.guildErrors += 1;
      console.error(`[GLOBAL MESSAGE] Falha ao carregar membros de ${guild.id}:`, error.message);
    }
  }

  job.total = recipients.size;
  job.status = 'running';

  for (const user of recipients.values()) {
    try {
      await user.send(payload);
      job.sent += 1;
    } catch (error) {
      job.failed += 1;
      console.warn(`[GLOBAL MESSAGE] DM não enviada para ${user.id}:`, error.code ?? error.message);
    }
    await wait(SEND_INTERVAL_MS);
  }

  job.status = 'done';
  job.finishedAt = Date.now();

  try {
    const owner = await client.users.fetch(ownerId);
    await owner.send(
      `✅ **Envio global concluído.**\n` +
      `👥 Total: **${job.total}**\n` +
      `📨 Enviadas: **${job.sent}**\n` +
      `⚠️ Falhas: **${job.failed}**\n` +
      `🛑 Servidores não acessíveis: **${job.guildErrors}**`,
    );
  } catch (error) {
    console.warn('[GLOBAL MESSAGE] Não foi possível enviar o resumo ao proprietário:', error.message);
  }
}