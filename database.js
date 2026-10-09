const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'messages.db');
const db = new Database(dbPath);

// Enable WAL mode for high performance concurrent read/writes
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

// Safe migrations if columns were not in previous table version
try { db.exec(`ALTER TABLE messages ADD COLUMN reply_to_id TEXT;`); } catch {}
try { db.exec(`ALTER TABLE messages ADD COLUMN reply_to_author TEXT;`); } catch {}
try { db.exec(`ALTER TABLE messages ADD COLUMN reply_to_content TEXT;`); } catch {}

const insertStmt = db.prepare(`
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

function saveMessage(msg) {
  if (!msg || !msg.id || !msg.guild) return;

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

  insertStmt.run({
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
  });
}

function getMessages({ guildId, channelId = null, startTime = 0, endTime = Date.now(), limit = 1000 }) {
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

  return db.prepare(query).all(...params);
}

module.exports = {
  db,
  saveMessage,
  getMessages
};
