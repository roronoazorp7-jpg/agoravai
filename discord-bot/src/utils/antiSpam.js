const USER_WINDOW_MS = 10_000;
const USER_LIMITS = {
  command: 5,
  component: 12,
  autocomplete: 15,
  message: 5,
};

const GUILD_WINDOW_MS = 10_000;
const GUILD_LIMIT = 100;
const records = new Map();
const guildRecords = new Map();
const noticeTimes = new Map();

function prune(timestamps, now, windowMs) {
  return timestamps.filter(timestamp => now - timestamp < windowMs);
}

function getRecord(map, key) {
  let record = map.get(key);
  if (!record) {
    record = { timestamps: [], blockedUntil: 0, strikes: 0, lastSeenAt: 0 };
    map.set(key, record);
  }
  return record;
}

function penaltyMs(strikes, kind) {
  const base = kind === 'message' ? 3_000 : 4_000;
  return Math.min(30_000, base * (2 ** Math.max(0, strikes - 1)));
}

function consumeUser(key, kind, now) {
  const record = getRecord(records, key);
  record.timestamps = prune(record.timestamps, now, USER_WINDOW_MS);
  record.lastSeenAt = now;

  if (record.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterMs: record.blockedUntil - now,
      strikes: record.strikes,
    };
  }

  if (record.timestamps.length >= USER_LIMITS[kind]) {
    record.strikes = Math.min(record.strikes + 1, 4);
    record.blockedUntil = now + penaltyMs(record.strikes, kind);
    record.timestamps = [];
    return {
      allowed: false,
      retryAfterMs: record.blockedUntil - now,
      strikes: record.strikes,
    };
  }

  record.timestamps.push(now);
  return { allowed: true, retryAfterMs: 0, strikes: record.strikes };
}

function consumeGuild(guildId, now) {
  if (!guildId) return true;
  const record = getRecord(guildRecords, guildId);
  record.timestamps = prune(record.timestamps, now, GUILD_WINDOW_MS);
  if (record.timestamps.length >= GUILD_LIMIT) return false;
  record.timestamps.push(now);
  return true;
}

function noticeKey(scope, guildId, userId) {
  return `${scope}:${guildId ?? 'dm'}:${userId}`;
}

export function shouldSendNotice(scope, guildId, userId, intervalMs = 8_000) {
  const key = noticeKey(scope, guildId, userId);
  const now = Date.now();
  const last = noticeTimes.get(key) ?? 0;
  if (now - last < intervalMs) return false;
  noticeTimes.set(key, now);
  return true;
}

export function checkInteractionSpam(interaction) {
  const isAutocomplete = interaction.isAutocomplete?.() ?? false;
  const isCommand = interaction.isChatInputCommand?.() ?? false;
  const isComponent = (
    interaction.isButton?.()
    || interaction.isStringSelectMenu?.()
    || interaction.isRoleSelectMenu?.()
    || interaction.isChannelSelectMenu?.()
    || interaction.isUserSelectMenu?.()
    || interaction.isModalSubmit?.()
  ) ?? false;

  if (!isAutocomplete && !isCommand && !isComponent) return { allowed: true };

  const kind = isAutocomplete ? 'autocomplete' : isCommand ? 'command' : 'component';
  const userKey = `${interaction.guildId ?? 'dm'}:${interaction.user.id}`;
  const userResult = consumeUser(userKey, kind, Date.now());

  if (!userResult.allowed) {
    return {
      ...userResult,
      scope: kind,
      reason: 'member',
    };
  }

  const guildAllowed = consumeGuild(interaction.guildId, Date.now());
  if (!guildAllowed) {
    return {
      allowed: false,
      retryAfterMs: 3_000,
      strikes: 1,
      scope: kind,
      reason: 'server',
    };
  }
  return { allowed: true };
}

export function checkMessageSpam(message) {
  if (!message.guildId || !message.author?.id) return { allowed: true };
  const result = consumeUser(
    `${message.guildId}:${message.author.id}`,
    'message',
    Date.now(),
  );
  return {
    ...result,
    scope: 'message',
    reason: 'member',
  };
}

export function formatRetryAfter(milliseconds) {
  const seconds = Math.max(1, Math.ceil(milliseconds / 1000));
  return `${seconds} segundo${seconds === 1 ? '' : 's'}`;
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of records) {
    if (now - record.lastSeenAt > 60_000 && record.blockedUntil <= now) records.delete(key);
  }
  for (const [key, record] of guildRecords) {
    record.timestamps = prune(record.timestamps, now, GUILD_WINDOW_MS);
    if (record.timestamps.length === 0) guildRecords.delete(key);
  }
  for (const [key, timestamp] of noticeTimes) {
    if (now - timestamp > 60_000) noticeTimes.delete(key);
  }
}, 60_000);
cleanupTimer.unref?.();