require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  PermissionsBitField,
  REST, 
  Routes, 
  SlashCommandBuilder 
} = require('discord.js');

const { saveMessage, getMessages } = require('./database');
const { fetchChannelHistory, parseTimeframe } = require('./fetcher');
const { sendMessagesToTarget } = require('./forwarder');

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || '!';
const DEFAULT_SOURCE_GUILD_ID = process.env.SOURCE_GUILD_ID || null;
const ALLOWED_USER_IDS = process.env.ALLOWED_USER_IDS 
  ? process.env.ALLOWED_USER_IDS.split(',').map(id => id.trim()).filter(Boolean)
  : [];

if (!TOKEN || TOKEN === 'YOUR_BOT_TOKEN_HERE') {
  console.error('\n❌ ERROR: Discord bot token is missing!');
  console.error('Please open the .env file in this directory and put your bot token in DISCORD_TOKEN.\n');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel]
});

// Check permission to run forward commands
function isAuthorized(user, member) {
  if (ALLOWED_USER_IDS.length > 0) {
    return ALLOWED_USER_IDS.includes(user.id);
  }
  // Default: Admin or server owner
  if (member && member.permissions) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
           member.permissions.has(PermissionsBitField.Flags.ManageGuild);
  }
  return true;
}

client.once('ready', async () => {
  console.log(`\n===========================================`);
  console.log(`🤖 Logged in as: ${client.user.tag} (ID: ${client.user.id})`);
  console.log(`📡 Connected to ${client.guilds.cache.size} servers:`);
  client.guilds.cache.forEach(guild => {
    console.log(`   - "${guild.name}" (ID: ${guild.id})`);
  });
  console.log(`===========================================`);
  console.log(`⚡ Ready to capture and forward messages!`);
  console.log(`👉 Type "${PREFIX}help" in your Discord server for instructions.\n`);

  // Register Slash Commands
  try {
    const slashCommands = [
      new SlashCommandBuilder()
        .setName('forward')
        .setDescription('Forward messages from a source channel within a timeframe')
        .addStringOption(option =>
          option.setName('source_channel')
            .setDescription('Name or ID of the channel in the source server')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('timeframe')
            .setDescription('Timeframe (e.g. 1h, 6h, 24h, 3d, 7d). Default: 24h')
            .setRequired(false)),
      new SlashCommandBuilder()
        .setName('servers')
        .setDescription('List all connected servers and their channels')
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: slashCommands.map(c => c.toJSON()) }
    );
    console.log('✅ Global slash commands (/forward, /servers) registered successfully.');
  } catch (err) {
    console.warn('⚠️ Slash command registration notice:', err.message);
  }
});

// Real-time message logger
client.on('messageCreate', async (message) => {
  if (!message.guild) return; // Ignore DMs

  // Save regular messages (skip bot messages from database logging if desired)
  if (!message.author.bot) {
    saveMessage(message);
    const timeStr = new Date().toLocaleTimeString();
    console.log(`[${timeStr}] [${message.guild.name} > #${message.channel.name}] ${message.author.tag}: ${message.content}`);
  }

  // Check for prefix commands
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  // Command: !help
  if (command === 'help') {
    const helpGuide = `
**📖 Discord Message Archiver & Sync Guide**
This bot archives messages from **🌅 🌴The Beach 🌊 🎋** and forwards them directly into this server on demand.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ **HOW TO FORWARD MESSAGES:**
• **\`${PREFIX}forward <channel> [timeframe] [style]\`**
  Fetches message history from The Beach and delivers them into this channel.
  *Examples:*
  - \`${PREFIX}forward the-beach 24h\` *(past 24 hours)*
  - \`${PREFIX}forward the-beach all\` *(entire channel history from all time!)*
  - \`${PREFIX}forward quotes 7d\` *(past 7 days)*
  - \`${PREFIX}forward 988846173878095902 12h\` *(by channel ID)*
  - \`${PREFIX}forward the-beach 6h ansi\` *(ANSI terminal color mode)*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏳ **SUPPORTED TIMEFRAMES:**
• **\`all\`** / **\`all-time\`**: All messages from the very beginning of the channel!
• **\`m\`**: Minutes (e.g., \`30m\`)
• **\`h\`**: Hours (e.g., \`1h\`, \`6h\`, \`12h\`, \`24h\`)
• **\`d\`**: Days (e.g., \`3d\`, \`7d\`, \`30d\`)
• **\`w\`**: Weeks (e.g., \`1w\`, \`2w\`)
• **\`mo\`**: Months (e.g., \`1mo\`, \`3mo\`)
• **\`y\`**: Years (e.g., \`1y\`)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 **VISUAL STYLES:**
• **Vibrant Speech Bubbles** *(default)*:
  - 10 distinct user color badges (\`🟣\`, \`🔵\`, \`🩵\`, \`🟢\`, \`🟡\`, \`🟠\`, \`🔴\`, \`🩷\`, \`🤎\`, \`⚪\`)
  - Left border accent lines (\`>\`) grouping replies and thoughts
  - Dynamic local timestamps and relative time tags
• **\`ansi\`**:
  - Terminal codeblock formatting with ANSI colored usernames.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 **CHANNEL DISCOVERY (The Beach):**
• **\`${PREFIX}channels\`** / **\`${PREFIX}servers\`**:
  Lists all channels available in The Beach with their IDs and plain names.
• **\`${PREFIX}search <keyword>\`**:
  Search for any channel in The Beach (e.g., \`${PREFIX}search quotes\`).
• **\`${PREFIX}ping\`**:
  Check bot response speed.
`;
    await message.reply(helpGuide);
    return;
  }

  // Command: !ping
  if (command === 'ping') {
    await message.reply(`🏓 Pong! Latency: ${client.ws.ping}ms`);
    return;
  }

  // Command: !servers / !channels
  if (command === 'servers' || command === 'channels') {
    if (!isAuthorized(message.author, message.member)) {
      await message.reply('❌ You do not have permission to run this command.');
      return;
    }

    const sourceGuild = client.guilds.cache.get(SOURCE_GUILD_ID);
    if (!sourceGuild) {
      await message.reply(`⚠️ Source server (ID: \`${SOURCE_GUILD_ID}\`) is not found or bot is not in it.`);
      return;
    }

    let fetchedChannels;
    try {
      fetchedChannels = await sourceGuild.channels.fetch();
    } catch {
      fetchedChannels = sourceGuild.channels.cache;
    }

    const textChannels = fetchedChannels
      .filter(c => c && c.isTextBased && c.isTextBased() && !c.isThread())
      .sort((a, b) => a.rawPosition - b.rawPosition);

    let lines = [`🏰 **Dedicated Source Server: ${sourceGuild.name}** \`(ID: ${sourceGuild.id})\`\n**Available Channels (${textChannels.size} text channels):**\n`];
    for (const ch of textChannels.values()) {
      const norm = ch.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
      const alias = norm !== ch.name ? ` *(plain: #${norm})*` : '';
      lines.push(`• #${ch.name}${alias} — \`${ch.id}\``);
    }

    // Also list destination servers
    const destServers = client.guilds.cache.filter(g => g.id !== SOURCE_GUILD_ID);
    if (destServers.size > 0) {
      lines.push(`\n📥 **Connected Destination Servers (${destServers.size}):**`);
      for (const dg of destServers.values()) {
        lines.push(`• ${dg.name} \`(${dg.id})\``);
      }
    }

    // Send in chunks of ~1800 characters so nothing is truncated
    let msgChunk = '';
    for (const line of lines) {
      if ((msgChunk.length + line.length + 1) > 1850) {
        await message.channel.send(msgChunk);
        msgChunk = line + '\n';
      } else {
        msgChunk += line + '\n';
      }
    }
    if (msgChunk.trim().length > 0) {
      await message.channel.send(msgChunk);
    }
    return;
  }

  // Command: !search
  if (command === 'search') {
    const q = args.join(' ').toLowerCase();
    if (!q) {
      await message.reply(`⚠️ Usage: \`${PREFIX}search <channel_name_or_keyword>\``);
      return;
    }

    const sourceGuild = client.guilds.cache.get(SOURCE_GUILD_ID);
    if (!sourceGuild) {
      await message.reply('⚠️ Source server (The Beach) is not reachable.');
      return;
    }

    let channels = await sourceGuild.channels.fetch().catch(() => sourceGuild.channels.cache);
    const results = [];
    for (const ch of channels.values()) {
      if (ch && ch.isTextBased && ch.isTextBased() && !ch.isThread()) {
        const norm = ch.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (norm.includes(q) || ch.name.toLowerCase().includes(q) || ch.id === q) {
          results.push(`• #${ch.name} \`(${ch.id})\``);
        }
      }
    }

    if (results.length === 0) {
      await message.reply(`🔍 No channels found in The Beach matching "${q}". If it is a private channel, make sure the bot has **View Channel** permission in that channel's settings!`);
    } else {
      await message.reply(`🔍 **Found matching channels in The Beach:**\n${results.slice(0, 25).join('\n')}`);
    }
    return;
  }

  // Command: !forward
  if (command === 'forward' || command === 'sync' || command === 'fetch') {
    if (!isAuthorized(message.author, message.member)) {
      await message.reply('❌ You do not have permission to run this command.');
      return;
    }

    const channelQuery = args[0];
    const timeframeStr = args[1] || '24h';
    const mode = args.some(a => a.toLowerCase() === 'ansi') ? 'ansi' : 'vibrant';

    if (!channelQuery) {
      await message.reply(`⚠️ Usage: \`${PREFIX}forward <channel_name_or_id> [timeframe] [ansi]\`\nExamples:\n• \`${PREFIX}forward the-beach 24h\`\n• \`${PREFIX}forward the-beach all\`\n• Type \`${PREFIX}help\` for full guide.`);
      return;
    }

    await handleForwardRequest(message.channel, channelQuery, timeframeStr, message.guild.id, null, mode);
  }
});

// Handle Slash Commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'servers') {
    if (!isAuthorized(interaction.user, interaction.member)) {
      await interaction.reply({ content: '❌ You do not have permission to run this command.', ephemeral: true });
      return;
    }

    const sourceGuild = client.guilds.cache.get(SOURCE_GUILD_ID);
    let report = `🏰 **Source Server:** ${sourceGuild ? sourceGuild.name : 'The Beach'}\n\n`;
    if (sourceGuild) {
      const textChannels = sourceGuild.channels.cache.filter(c => c.isTextBased && c.isTextBased() && !c.isThread());
      const channelList = textChannels.map(c => `  #${c.name} \`(${c.id})\``).slice(0, 25).join('\n');
      report += `${channelList}\n\n`;
    }

    await interaction.reply({ content: report.substring(0, 2000), ephemeral: true });
    return;
  }

  if (interaction.commandName === 'forward') {
    if (!isAuthorized(interaction.user, interaction.member)) {
      await interaction.reply({ content: '❌ You do not have permission to run this command.', ephemeral: true });
      return;
    }

    await interaction.deferReply();
    const channelQuery = interaction.options.getString('source_channel');
    const timeframeStr = interaction.options.getString('timeframe') || '24h';

    await handleForwardRequest(interaction.channel, channelQuery, timeframeStr, interaction.guildId, interaction, 'vibrant');
  }
});

/**
 * Common forward handler for both prefix and slash commands
 */
async function handleForwardRequest(targetChannel, channelQuery, timeframeStr, currentGuildId, interaction = null, mode = 'vibrant') {
  const startTime = parseTimeframe(timeframeStr);
  const now = Date.now();

  const timeLabel = startTime === 0 ? 'ALL TIME (Entire Channel History)' : `the past ${timeframeStr}`;

  const statusMsg = interaction 
    ? await interaction.editReply(`🔍 Searching **The Beach** for **${channelQuery}** and pulling messages from **${timeLabel}**...`)
    : await targetChannel.send(`🔍 Searching **The Beach** for **${channelQuery}** and pulling messages from **${timeLabel}**...`);

  // Source server is strictly locked to The Beach
  const sourceGuild = client.guilds.cache.get(SOURCE_GUILD_ID);
  if (!sourceGuild) {
    const errText = `❌ Could not reach the source server (🌅 🌴The Beach 🌊 🎋, ID: \`${SOURCE_GUILD_ID}\`).`;
    if (interaction) await interaction.editReply(errText);
    else await targetChannel.send(errText);
    return;
  }

  // Find the source channel exclusively inside The Beach
  let cleanId = channelQuery.replace(/[^0-9]/g, '');
  let sourceChannel = null;

  if (cleanId.length > 10) {
    sourceChannel = sourceGuild.channels.cache.get(cleanId);
    if (!sourceChannel) {
      try {
        sourceChannel = await sourceGuild.channels.fetch(cleanId);
      } catch {}
    }
  }

  // By channel name inside The Beach
  if (!sourceChannel) {
    const rawSearch = channelQuery.replace(/^#/, '').toLowerCase().trim();
    const normalizedSearch = rawSearch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    
    let channels;
    try {
      channels = await sourceGuild.channels.fetch();
    } catch {
      channels = sourceGuild.channels.cache;
    }

    const matchingChannels = [];
    for (const ch of channels.values()) {
      if (!ch || !ch.isTextBased || !ch.isTextBased() || ch.isThread()) continue;

      const chRaw = ch.name.toLowerCase();
      const chNorm = ch.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

      // Exact match or normalized match or partial match
      if (chRaw === rawSearch || chNorm === normalizedSearch || chNorm.includes(normalizedSearch)) {
        matchingChannels.push(ch);
      }
    }

    if (matchingChannels.length > 0) {
      sourceChannel = matchingChannels[0];
    }
  }

  if (!sourceChannel) {
    const errText = `❌ Could not find a text channel in **The Beach** matching "${channelQuery}".\n• Try using the exact **Channel ID**: \`${PREFIX}forward <channel_id> ${timeframeStr}\`\n• Type \`${PREFIX}search ${channelQuery}\` to look it up.\n• If it is a private channel, make sure the bot has **View Channel** permission!`;
    if (interaction) await interaction.editReply(errText);
    else await targetChannel.send(errText);
    return;
  }

  try {
    // Attempt live fetch from Discord REST API directly to get all history
    let messages = await fetchChannelHistory(sourceChannel, startTime, now, 500);

    // If fetch returned 0 messages (or channel wasn't readable), fallback to local database query
    if (messages.length === 0) {
      messages = getMessages({
        channelId: sourceChannel.id,
        startTime: startTime,
        endTime: now,
        limit: 500
      });
    }

    if (messages.length === 0) {
      const msgText = `ℹ️ No messages were found in **#${sourceChannel.name}** (${sourceChannel.guild.name}) within the past **${timeframeStr}**.`;
      if (interaction) await interaction.editReply(msgText);
      else await targetChannel.send(msgText);
      return;
    }

    // Deliver messages to target channel
    await sendMessagesToTarget(targetChannel, messages, { mode });

  } catch (err) {
    console.error('Error forwarding messages:', err);
    const failText = `❌ An error occurred while retrieving messages: ${err.message}`;
    if (interaction) await interaction.editReply(failText);
    else await targetChannel.send(failText);
  }
}

// Log in
client.login(TOKEN).catch(err => {
  console.error('\n❌ Failed to log in with the provided token:', err.message);
  console.error('Please verify your DISCORD_TOKEN in the .env file.\n');
});
