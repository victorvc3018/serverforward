/**
 * Palette of 10 distinct, high-contrast, vibrant color badges.
 * Hashed deterministically so each user consistently gets their own unique color.
 */
const USER_BADGES = ['🟣', '🔵', '🩵', '🟢', '🟡', '🟠', '🔴', '🩷', '🤎', '⚪'];

const ANSI_COLORS = [
  '\u001b[1;35m', // Bold Magenta
  '\u001b[1;34m', // Bold Blue
  '\u001b[1;36m', // Bold Cyan
  '\u001b[1;32m', // Bold Green
  '\u001b[1;33m', // Bold Yellow
  '\u001b[1;31m', // Bold Red
];
const ANSI_RESET = '\u001b[0m';
const ANSI_GRAY = '\u001b[0;37m';

/**
 * Deterministic color picker based on user ID or username
 */
function getUserBadge(userId, authorName) {
  const str = userId || authorName || 'user';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return USER_BADGES[hash % USER_BADGES.length];
}

function getAnsiColor(userId, authorName) {
  const str = userId || authorName || 'user';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return ANSI_COLORS[hash % ANSI_COLORS.length];
}

/**
 * Send collected messages to the target channel with high-contrast, readable styling.
 * 
 * @param {import('discord.js').TextChannel} targetChannel 
 * @param {Array} messages List of message records
 * @param {Object} options { mode: 'vibrant' | 'ansi' }
 */
async function sendMessagesToTarget(targetChannel, messages, options = {}) {
  if (!messages || messages.length === 0) {
    await targetChannel.send({
      content: '⚠️ No messages were found matching your requested channel and timeframe.'
    });
    return;
  }

  const total = messages.length;
  const channelName = messages[0].channel_name || 'source-channel';
  const serverName = messages[0].guild_name || 'source-server';
  const mode = options.mode || 'vibrant';

  // Initial header banner
  await targetChannel.send({
    content: `💬 **Message History** • **${total}** messages from **#${channelName}** in **${serverName}**:`
  });

  if (mode === 'ansi') {
    await sendAnsiMessages(targetChannel, messages);
  } else {
    await sendVibrantMessages(targetChannel, messages);
  }
}

/**
 * Vibrant Mode: Color-coded user badges, Discord blockquote speech bubbles, and subtext timestamps.
 */
async function sendVibrantMessages(targetChannel, messages) {
  const chunks = [];
  let currentChunk = '';

  for (const m of messages) {
    const badge = getUserBadge(m.author_id, m.author_name);
    const unixSeconds = Math.floor(m.created_at / 1000);

    let attachments = [];
    try {
      attachments = JSON.parse(m.attachments || '[]');
    } catch {}

    // Header: Color badge + Author bold + Sleek subtext timestamp with relative time
    let entry = `${badge} **${m.author_name}** • -# <t:${unixSeconds}:t> (<t:${unixSeconds}:R>)\n`;

    // Reply context inside speech bubble
    if (m.reply_to_author) {
      const cleanSnippet = m.reply_to_content 
        ? m.reply_to_content.replace(/\r?\n+/g, ' ').trim() 
        : '';
      const snippet = cleanSnippet.length > 0 
        ? `: "${cleanSnippet.substring(0, 70)}${cleanSnippet.length > 70 ? '...' : ''}"` 
        : '';
      entry += `> ↩️ *Replying to **@${m.reply_to_author}**${snippet}*\n`;
    } else if (m.reply_to_id) {
      entry += `> ↩️ *Replying to an earlier message*\n`;
    }

    // Message body styled with Discord's left accent line (blockquote)
    if (m.content && m.content.trim().length > 0) {
      const contentLines = m.content.trim().split('\n');
      for (const line of contentLines) {
        entry += `> ${line}\n`;
      }
    } else if (attachments.length === 0) {
      entry += `> *(Empty message)*\n`;
    }

    // Attachments
    if (attachments.length > 0) {
      for (const att of attachments) {
        entry += `> 📎 ${att}\n`;
      }
    }

    entry += '\n'; // Spacing between messages

    if ((currentChunk.length + entry.length) > 1850) {
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = entry;
    } else {
      currentChunk += entry;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  // Send chunks with pacing
  for (let i = 0; i < chunks.length; i++) {
    try {
      await targetChannel.send({
        content: chunks[i],
        allowedMentions: { parse: [] }
      });
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 650));
      }
    } catch (err) {
      console.error('Error sending vibrant message chunk:', err.message);
    }
  }
}

/**
 * ANSI Mode: Terminal-style colored usernames inside code blocks.
 */
async function sendAnsiMessages(targetChannel, messages) {
  const chunks = [];
  let currentChunk = '```ansi\n';

  for (const m of messages) {
    const color = getAnsiColor(m.author_id, m.author_name);
    const d = new Date(m.created_at);
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let entry = `${color}${m.author_name}${ANSI_RESET} ${ANSI_GRAY}[${timeStr}]${ANSI_RESET}\n`;

    if (m.reply_to_author) {
      const snippet = m.reply_to_content ? ` "${m.reply_to_content.substring(0, 50)}..."` : '';
      entry += `${ANSI_GRAY}↳ Replying to @${m.reply_to_author}${snippet}${ANSI_RESET}\n`;
    }

    if (m.content && m.content.trim().length > 0) {
      entry += `${m.content.trim()}\n`;
    }

    entry += '\n';

    if ((currentChunk.length + entry.length + 5) > 1900) {
      currentChunk += '```';
      chunks.push(currentChunk);
      currentChunk = '```ansi\n' + entry;
    } else {
      currentChunk += entry;
    }
  }

  if (currentChunk.trim().length > 8) {
    currentChunk += '```';
    chunks.push(currentChunk);
  }

  for (let i = 0; i < chunks.length; i++) {
    try {
      await targetChannel.send({
        content: chunks[i],
        allowedMentions: { parse: [] }
      });
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 650));
      }
    } catch (err) {
      console.error('Error sending ANSI chunk:', err.message);
    }
  }
}

module.exports = {
  sendMessagesToTarget
};
