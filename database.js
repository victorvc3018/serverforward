const path = require('path');

let db = null;
let insertStmt = null;
const memoryCache = new Map();

try {
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, 'messages.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      guild_name TEXT,
      channel_id TEXT NOT NULL,
      channel_name TEXT,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_avatar TEXT,
      content TEXT,
      attachments TEXT,
      created_at INTEGER NOT NULL,
      reply_to_id TEXT,
      reply_to_author TEXT,
      reply_to_content TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_guild_channel ON messages(guild_id, channel_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
  `);

  try { db.exec(`ALTER TABLE messages ADD COLUMN reply_to_id TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE messages ADD COLUMN reply_to_author TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE messages ADD COLUMN reply_to_content TEXT;`); } catch {}

  insertStmt = db.prepare(`
    INSERT OR REPLACE INTO messages (
      id, guild_id, guild_name, channel_id, channel_name,
      author_id, author_name, author_avatar, content, attachments, created_at,
      reply_to_id, reply_to_author, reply_to_content
    ) VALUES (
      @id, @guild_id, @guild_name, @channel_id, @channel_name,
      @author_id, @author_name, @author_avatar, @content, @attachments, @created_at,
      @reply_to_id, @reply_to_author, @reply_to_content
    )
  `);
} catch (err) {
  console.warn('⚠️ SQLite storage fallback active (using in-memory cache):', err.message);
  db = null;
}

function saveMessage(msg) {
  if (!msg || !msg.id || !msg.guild) return;

  try {
    const attachments = msg.attachments ? JSON.stringify(Array.from(msg.attachments.values()).map(a => a.url)) : '[]';

    let replyToId = msg.reference?.messageId || null;
    let replyToAuthor = null;
    let replyToContent = null;

    if (msg.referencedMessage) {
      replyToAuthor = msg.referencedMessage.author 
        ? (msg.referencedMessage.author.tag || msg.referencedMessage.author.username) 
        : null;
      replyToContent = msg.referencedMessage.content 
        ? msg.referencedMessage.content.substring(0, 300) 
        : null;
    }

    const record = {
      id: msg.id,
      guild_id: msg.guild.id,
      guild_name: msg.guild.name,
      channel_id: msg.channel.id,
      channel_name: msg.channel.name || 'unknown-channel',
      author_id: msg.author.id,
      author_name: msg.author.tag || msg.author.username,
      author_avatar: msg.author.displayAvatarURL ? msg.author.displayAvatarURL() : '',
      content: msg.content || '',
      attachments: attachments,
      created_at: msg.createdTimestamp || Date.now(),
      reply_to_id: replyToId,
      reply_to_author: replyToAuthor,
      reply_to_content: replyToContent
    };

    if (insertStmt) {
      insertStmt.run(record);
    } else {
      memoryCache.set(msg.id, record);
    }
  } catch (err) {
    // Non-fatal warning so commands never crash
    console.warn('Warning saving message:', err.message);
  }
}

function getMessages({ guildId, channelId = null, startTime = 0, endTime = Date.now(), limit = 1000 }) {
  if (db) {
    let query = `
      SELECT * FROM messages
      WHERE created_at >= ? AND created_at <= ?
    `;
    const params = [startTime, endTime];

    if (guildId) {
      query += ` AND guild_id = ?`;
      params.push(guildId);
    }

    if (channelId && channelId !== 'all') {
      query += ` AND channel_id = ?`;
      params.push(channelId);
    }

    query += ` ORDER BY created_at ASC LIMIT ?`;
    params.push(limit);

    try {
      return db.prepare(query).all(...params);
    } catch {
      return [];
    }
  }

  // Memory fallback
  const results = [];
  for (const m of memoryCache.values()) {
    if (m.created_at >= startTime && m.created_at <= endTime) {
      if (!guildId || m.guild_id === guildId) {
        if (!channelId || channelId === 'all' || m.channel_id === channelId) {
          results.push(m);
        }
      }
    }
  }
  return results.slice(0, limit);
}

module.exports = {
  db,
  saveMessage,
  getMessages
};
