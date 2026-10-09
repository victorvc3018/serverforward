const { saveMessage } = require('./database');

/**
 * Fetch messages from a Discord channel between startTime and endTime.
 * Paginates backwards using Discord's REST API and resolves reply references.
 * 
 * @param {import('discord.js').TextChannel} channel 
 * @param {number} startTime Milliseconds timestamp
 * @param {number} endTime Milliseconds timestamp (default Date.now())
 * @param {number} maxMessages Safety limit to prevent infinite loops (default 500)
 * @returns {Promise<Array>} Array of message objects ordered chronologically
 */
async function fetchChannelHistory(channel, startTime, endTime = Date.now(), maxMessages = 500) {
  if (!channel || !channel.messages) {
    throw new Error('Invalid channel or bot cannot read channel messages.');
  }

  // If requesting all time (startTime = 0), expand limit up to 2500 messages
  const effectiveMax = startTime === 0 ? Math.max(maxMessages, 2500) : maxMessages;

  const collected = [];
  let lastId = null;
  let keepGoing = true;

  while (keepGoing && collected.length < effectiveMax) {
    const options = { limit: 100 };
    if (lastId) {
      options.before = lastId;
    }

    let messages;
    try {
      messages = await channel.messages.fetch(options);
    } catch (err) {
      console.error(`Error fetching messages in #${channel.name}:`, err.message);
      break;
    }

    if (!messages || messages.size === 0) {
      break;
    }

    for (const msg of messages.values()) {
      lastId = msg.id;

      // If message is newer than endTime, skip it
      if (msg.createdTimestamp > endTime) {
        continue;
      }

      // If message is older than startTime, we reached our cutoff
      if (msg.createdTimestamp < startTime) {
        keepGoing = false;
        break;
      }

      // Reply metadata resolution
      let replyToId = msg.reference?.messageId || null;
      let replyToAuthor = null;
      let replyToContent = null;

      if (msg.referencedMessage) {
        replyToAuthor = msg.referencedMessage.author 
          ? (msg.referencedMessage.author.tag || msg.referencedMessage.author.username) 
          : null;
        replyToContent = msg.referencedMessage.content || '';
      }

      // Valid message in timeframe
      collected.push({
        id: msg.id,
        guild_id: msg.guild?.id || '',
        guild_name: msg.guild?.name || '',
        channel_id: msg.channel.id,
        channel_name: msg.channel.name || 'unknown-channel',
        author_id: msg.author.id,
        author_name: msg.author.tag || msg.author.username,
        author_avatar: msg.author.displayAvatarURL ? msg.author.displayAvatarURL() : '',
        content: msg.content || '',
        attachments: msg.attachments ? JSON.stringify(Array.from(msg.attachments.values()).map(a => a.url)) : '[]',
        created_at: msg.createdTimestamp,
        reply_to_id: replyToId,
        reply_to_author: replyToAuthor,
        reply_to_content: replyToContent,
        _rawMsg: msg
      });

      // Save to database cache
      try {
        saveMessage(msg);
      } catch (dbErr) {
        // Continue even if DB write fails
      }

      if (collected.length >= effectiveMax) {
        break;
      }
    }

    if (messages.size < 100) {
      // Reached the very beginning of the channel history
      break;
    }

    // Gentle pacing to avoid hitting Discord REST rate limits when fetching many pages
    await new Promise(r => setTimeout(r, 150));
  }

  // Resolve any replies that were sent to messages within this batch
  const msgMap = new Map();
  for (const m of collected) {
    msgMap.set(m.id, m);
  }

  for (const m of collected) {
    if (m.reply_to_id && !m.reply_to_author) {
      if (msgMap.has(m.reply_to_id)) {
        const parent = msgMap.get(m.reply_to_id);
        m.reply_to_author = parent.author_name;
        m.reply_to_content = parent.content;
      } else if (m._rawMsg) {
        try {
          const ref = await m._rawMsg.fetchReference();
          if (ref) {
            m.reply_to_author = ref.author?.tag || ref.author?.username || 'Unknown';
            m.reply_to_content = ref.content || '';
          }
        } catch {}
      }
    }
    delete m._rawMsg; // Clean up memory
  }

  // Sort chronologically (oldest first)
  collected.sort((a, b) => a.created_at - b.created_at);
  return collected;
}

/**
 * Parse human timeframe string into milliseconds timestamp.
 * Examples: 'all', '1h', '24h', '3d', '7d', '30d', '1y', '30m'
 */
function parseTimeframe(input) {
  if (!input) return Date.now() - (24 * 60 * 60 * 1000); // Default: past 24 hours

  const str = input.trim().toLowerCase();

  // All time / entire channel history
  if (['all', 'all-time', 'alltime', 'everything', 'forever', 'start'].includes(str)) {
    return 0; // Epoch 0 -> beginning of time
  }

  const match = str.match(/^(\d+)\s*(m|min|mins|h|hr|hrs|d|day|days|w|week|weeks|mo|mon|month|months|y|yr|year|years)$/);
  
  if (!match) {
    // If it's just a number, assume hours
    const num = parseFloat(str);
    if (!isNaN(num) && num > 0) {
      return Date.now() - Math.floor(num * 60 * 60 * 1000);
    }
    return Date.now() - (24 * 60 * 60 * 1000);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm':
    case 'min':
    case 'mins':
      return Date.now() - (value * 60 * 1000);
    case 'h':
    case 'hr':
    case 'hrs':
      return Date.now() - (value * 60 * 60 * 1000);
    case 'd':
    case 'day':
    case 'days':
      return Date.now() - (value * 24 * 60 * 60 * 1000);
    case 'w':
    case 'week':
    case 'weeks':
      return Date.now() - (value * 7 * 24 * 60 * 60 * 1000);
    case 'mo':
    case 'mon':
    case 'month':
    case 'months':
      return Date.now() - (value * 30 * 24 * 60 * 60 * 1000);
    case 'y':
    case 'yr':
    case 'year':
    case 'years':
      return Date.now() - (value * 365 * 24 * 60 * 60 * 1000);
    default:
      return Date.now() - (24 * 60 * 60 * 1000);
  }
}

module.exports = {
  fetchChannelHistory,
  parseTimeframe
};
