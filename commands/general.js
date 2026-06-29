const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits, version: djsVersion } = require('discord.js');
const sqlite3 = require('better-sqlite3');
const ms = require('ms');
const axios = require('axios');
const os = require('os');
const moment = require('moment');
require('moment-duration-format');
require('dotenv').config();

// ==================== DATABASE SETUP ====================
const db = new sqlite3(process.env.DB_PATH || 'melody.db');

// Initialize tables if not exists
db.exec(`
    CREATE TABLE IF NOT EXISTS afk (
        user_id TEXT PRIMARY KEY,
        reason TEXT,
        timestamp INTEGER,
        guild_id TEXT
    );
    
    CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reporter_id TEXT,
        reported_id TEXT,
        reason TEXT,
        guild_id TEXT,
        message_link TEXT,
        timestamp INTEGER,
        status TEXT DEFAULT 'pending'
    );
    
    CREATE TABLE IF NOT EXISTS user_stats (
        user_id TEXT PRIMARY KEY,
        commands_used INTEGER DEFAULT 0,
        afk_count INTEGER DEFAULT 0,
        report_count INTEGER DEFAULT 0,
        first_seen INTEGER,
        last_seen INTEGER,
        voice_time INTEGER DEFAULT 0,
        messages_count INTEGER DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS votes (
        user_id TEXT PRIMARY KEY,
        last_vote INTEGER,
        total_votes INTEGER DEFAULT 0,
        reminder_sent INTEGER DEFAULT 0,
        premium_until INTEGER DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS partners (
        guild_id TEXT PRIMARY KEY,
        guild_name TEXT,
        guild_icon TEXT,
        invited_by TEXT,
        timestamp INTEGER,
        expires_at INTEGER,
        status TEXT DEFAULT 'pending'
    );
    
    CREATE TABLE IF NOT EXISTS blacklist (
        user_id TEXT PRIMARY KEY,
        reason TEXT,
        moderator_id TEXT,
        timestamp INTEGER,
        expires_at INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS prefixes (
        guild_id TEXT PRIMARY KEY,
        prefix TEXT DEFAULT '&'
    );
    
    CREATE TABLE IF NOT EXISTS suggestion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        suggestion TEXT,
        status TEXT DEFAULT 'pending',
        timestamp INTEGER,
        votes_up INTEGER DEFAULT 0,
        votes_down INTEGER DEFAULT 0
    );
`);

// ==================== PREMIUM EMBED DESIGN (BEAST MODE) ====================
class BeastEmbed {
    static success(title, description, fields = []) {
        const embed = new EmbedBuilder()
            .setAuthor({ name: '🎵 MELODY • PREMIUM MUSIC BOT', iconURL: 'https://cdn.discordapp.com/attachments/xxx/melody-logo.png' })
            .setTitle(`✨ ${title}`)
            .setDescription(description)
            .setColor(process.env.COLOR_SUCCESS || 0x00FFBB)
            .addFields(fields)
            .setTimestamp()
            .setFooter({ text: 'Powered by Melody • Premium Quality', iconURL: 'https://cdn.discordapp.com/attachments/xxx/footer.png' });
        
        if (fields.length > 0) embed.addFields(fields);
        return embed;
    }

    static error(title, description, suggestion = null) {
        const embed = new EmbedBuilder()
            .setAuthor({ name: '❌ MELODY • ERROR', iconURL: 'https://cdn.discordapp.com/attachments/xxx/error.png' })
            .setTitle(`❌ ${title}`)
            .setDescription(description)
            .setColor(process.env.COLOR_ERROR || 0xFF3366)
            .setTimestamp()
            .setFooter({ text: 'Please try again • Contact support if issue persists' });
        
        if (suggestion) embed.addFields({ name: '💡 Suggestion', value: suggestion, inline: false });
        return embed;
    }

    static info(title, description, thumbnail = null, fields = []) {
        const embed = new EmbedBuilder()
            .setAuthor({ name: 'ℹ️ MELODY • INFORMATION', iconURL: 'https://cdn.discordapp.com/attachments/xxx/info.png' })
            .setTitle(`ℹ️ ${title}`)
            .setDescription(description)
            .setColor(process.env.COLOR_INFO || 0x9B59B6)
            .setTimestamp();
        
        if (thumbnail) embed.setThumbnail(thumbnail);
        if (fields.length) embed.addFields(fields);
        return embed;
    }

    static loading(title, description) {
        return new EmbedBuilder()
            .setTitle(`⏳ ${title}`)
            .setDescription(`> ${description}\n\n*Please wait while we process your request...*`)
            .setColor(0xF1C40F)
            .setTimestamp()
            .setFooter({ text: 'MELODY • Processing' });
    }

    static music(title, description, thumbnail, fields = []) {
        return new EmbedBuilder()
            .setAuthor({ name: '🎵 MELODY • MUSIC PLAYER', iconURL: 'https://cdn.discordapp.com/attachments/xxx/music-icon.png' })
            .setTitle(title)
            .setDescription(description)
            .setThumbnail(thumbnail)
            .addFields(fields)
            .setColor(process.env.COLOR_MUSIC || 0xFF00FF)
            .setTimestamp()
            .setFooter({ text: '🎧 Enjoy the music!' });
    }

    static profile(user, stats, badges = []) {
        const badgeEmojis = {
            owner: '👑', dev: '💻', premium: '💎', voter: '🗳️', partner: '🤝', early: '🌟', supporter: '❤️'
        };
        
        const badgeText = badges.map(b => badgeEmojis[b] || '📌').join(' ');
        
        return new EmbedBuilder()
            .setTitle(`📜 **${user.tag}'s PROFILE**`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 4096 }))
            .addFields(
                { name: '🆔 User ID', value: `\`${user.id}\``, inline: true },
                { name: '📅 Joined Discord', value: `<t:${Math.floor(user.createdTimestamp/1000)}:R>`, inline: true },
                { name: '🏆 Badges', value: badgeText || '`None`', inline: true },
                { name: '📊 Statistics', value: '```yaml\n' +
                    `Commands Used: ${stats.commands_used.toLocaleString()}\n` +
                    `AFK Count: ${stats.afk_count}\n` +
                    `Reports Filed: ${stats.report_count}\n` +
                    `Voice Time: ${moment.duration(stats.voice_time, 'seconds').format('h[h] m[m]')}\n` +
                    `Messages: ${stats.messages_count.toLocaleString()}` +
                    '```', inline: false }
            )
            .setColor(0xFF69B4)
            .setTimestamp();
    }
}

// ==================== PREFIX HANDLER ====================
function getPrefix(guildId) {
    const result = db.prepare(`SELECT prefix FROM prefixes WHERE guild_id = ?`).get(guildId);
    return result ? result.prefix : process.env.PREFIX || '&';
}

async function setPrefix(guildId, newPrefix) {
    db.prepare(`INSERT OR REPLACE INTO prefixes (guild_id, prefix) VALUES (?, ?)`).run(guildId, newPrefix);
}

// ==================== COMMANDS REGISTRATION (With Permissions) ====================
const commands = [
    // General Commands
    new SlashCommandBuilder().setName('afk').setDescription('🎯 Set AFK status - Auto reply when mentioned')
        .addStringOption(opt => opt.setName('reason').setDescription('Why are you going AFK?').setRequired(false)),
    
    new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Get user avatar in HD (4096px)')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(false)),
    
    new SlashCommandBuilder().setName('banner').setDescription('🎨 Get user banner (Nitro required)')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(false)),
    
    new SlashCommandBuilder().setName('help').setDescription('📚 Complete bot commands with categories')
        .addStringOption(opt => opt.setName('category').setDescription('Command category').setRequired(false)
            .addChoices(
                { name: '🎮 General', value: 'general' },
                { name: '🎵 Music', value: 'music' },
                { name: '🎛️ Filters', value: 'filters' },
                { name: '📀 Playlist', value: 'playlist' },
                { name: '⚙️ Settings', value: 'settings' }
            )),
    
    new SlashCommandBuilder().setName('invite').setDescription('🔗 Invite Melody to your server'),
    
    new SlashCommandBuilder().setName('partner').setDescription('🤝 Partner with Melody bot')
        .addStringOption(opt => opt.setName('server_name').setDescription('Your server name').setRequired(true))
        .addStringOption(opt => opt.setName('members').setDescription('Member count').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Why should we partner?').setRequired(false)),
    
    new SlashCommandBuilder().setName('ping').setDescription('🏓 Check bot latency and API status'),
    
    new SlashCommandBuilder().setName('report').setDescription('🚨 Report a user to bot admins')
        .addUserOption(opt => opt.setName('user').setDescription('User to report').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for report').setRequired(true))
        .addStringOption(opt => opt.setName('evidence').setDescription('Evidence link (optional)').setRequired(false)),
    
    new SlashCommandBuilder().setName('stats').setDescription('📊 Detailed bot statistics (System + Bot)'),
    
    new SlashCommandBuilder().setName('support').setDescription('🆘 Get support server link and help'),
    
    new SlashCommandBuilder().setName('uptime').setDescription('⏱️ Check bot uptime and next restart schedule'),
    
    new SlashCommandBuilder().setName('vote').setDescription('🗳️ Vote for Melody and get premium rewards'),
    
    new SlashCommandBuilder().setName('votecheck').setDescription('✅ Check your vote status and premium remaining'),
    
    new SlashCommandBuilder().setName('profile').setDescription('📜 View user profile and statistics')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(false)),
    
    new SlashCommandBuilder().setName('suggest').setDescription('💡 Suggest a feature for Melody')
        .addStringOption(opt => opt.setName('suggestion').setDescription('Your suggestion').setRequired(true)),
    
    new SlashCommandBuilder().setName('prefix').setDescription('⚙️ Change bot prefix for this server (Admin only)')
        .addStringOption(opt => opt.setName('new_prefix').setDescription('New prefix (max 3 characters)').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder().setName('userinfo').setDescription('👤 Get detailed user information')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(false)),
    
    new SlashCommandBuilder().setName('serverinfo').setDescription('🏠 Get detailed server information')
];

// ==================== COMMAND HANDLER (BEAST MODE) ====================
async function handleGeneralCommands(interaction, client) {
    const command = interaction.commandName;
    const startTime = Date.now();
    
    // Check blacklist
    const blacklisted = db.prepare(`SELECT * FROM blacklist WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?)`).get(interaction.user.id, Date.now());
    if (blacklisted) {
        return interaction.reply({ 
            embeds: [BeastEmbed.error('Blacklisted', `You have been blacklisted from using Melody.\n**Reason:** ${blacklisted.reason}\n**Expires:** ${blacklisted.expires_at ? `<t:${Math.floor(blacklisted.expires_at/1000)}:R>` : 'Never'}`)],
            ephemeral: true
        });
    }
    
    // Update user stats
    const statsStmt = db.prepare(`
        INSERT INTO user_stats (user_id, commands_used, first_seen, last_seen) 
        VALUES (?, 1, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET 
            commands_used = commands_used + 1,
            last_seen = ?
    `);
    statsStmt.run(interaction.user.id, Date.now(), Date.now(), Date.now());
    
    // ==================== AFK COMMAND (BEAST) ====================
    if (command === 'afk') {
        const reason = interaction.options.getString('reason') || 'AFK';
        const userId = interaction.user.id;
        
        db.prepare(`INSERT OR REPLACE INTO afk (user_id, reason, timestamp, guild_id) VALUES (?, ?, ?, ?)`).run(userId, reason, Date.now(), interaction.guild.id);
        db.prepare(`UPDATE user_stats SET afk_count = afk_count + 1 WHERE user_id = ?`).run(userId);
        
        const embed = new EmbedBuilder()
            .setTitle('🔇 **AFK MODE ACTIVATED**')
            .setDescription(`> **${interaction.user.tag}** is now AFK`)
            .addFields(
                { name: '📝 Reason', value: `\`\`\`${reason}\`\`\``, inline: false },
                { name: '⏰ Since', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true },
                { name: '🔄 Auto-Reply', value: '`Enabled`', inline: true },
                { name: '⚡ Status', value: '`Will auto-remove on message`', inline: true }
            )
            .setColor(0xFFA500)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 1024 }))
            .setImage('https://i.imgur.com/afk-banner.gif')
            .setFooter({ text: 'MELODY • AFK System', iconURL: client.user.displayAvatarURL() });
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== AVATAR COMMAND (ULTRA BEAST) ====================
    else if (command === 'avatar') {
        const user = interaction.options.getUser('user') || interaction.user;
        const avatarURL = user.displayAvatarURL({ dynamic: true, size: 4096 });
        const formats = {
            png: user.displayAvatarURL({ format: 'png', size: 4096 }),
            jpg: user.displayAvatarURL({ format: 'jpg', size: 4096 }),
            webp: user.displayAvatarURL({ format: 'webp', size: 4096 }),
            gif: user.displayAvatarURL({ format: 'gif', size: 4096 })
        };
        
        const embed = new EmbedBuilder()
            .setTitle(`🖼️ **${user.tag}'s Avatar**`)
            .setDescription(`> **Format Options:** [PNG](${formats.png}) • [JPG](${formats.jpg}) • [WEBP](${formats.webp})${user.displayAvatarURL().endsWith('.gif') ? ` • [GIF](${formats.gif})` : ''}\n> **Resolution:** \`4096x4096\` • **Size:** \`${Math.ceil(avatarURL.length / 1024)}KB\``)
            .setImage(avatarURL)
            .setColor(0x00FFFF)
            .setFooter({ text: `Requested by ${interaction.user.tag} • User ID: ${user.id}`, iconURL: interaction.user.displayAvatarURL() });
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setLabel('PNG').setStyle(ButtonStyle.Link).setURL(formats.png),
                new ButtonBuilder().setLabel('JPG').setStyle(ButtonStyle.Link).setURL(formats.jpg),
                new ButtonBuilder().setLabel('WEBP').setStyle(ButtonStyle.Link).setURL(formats.webp)
            );
        
        if (user.displayAvatarURL().endsWith('.gif')) {
            row.addComponents(new ButtonBuilder().setLabel('GIF').setStyle(ButtonStyle.Link).setURL(formats.gif));
        }
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== BANNER COMMAND ====================
    else if (command === 'banner') {
        await interaction.deferReply();
        const user = interaction.options.getUser('user') || interaction.user;
        const fetchedUser = await user.fetch();
        
        if (!fetchedUser.banner) {
            const embed = BeastEmbed.error('No Banner Found', `${user.tag} doesn't have a banner!`, 'This user does not have Discord Nitro or hasn\'t set a banner.');
            return interaction.editReply({ embeds: [embed] });
        }
        
        const bannerURL = fetchedUser.bannerURL({ dynamic: true, size: 4096 });
        const embed = new EmbedBuilder()
            .setTitle(`🎨 **${user.tag}'s Banner**`)
            .setDescription(`> **User:** ${user.tag}\n> **Nitro:** \`Premium\`\n> **Resolution:** \`4096x2048\``)
            .setImage(bannerURL)
            .setColor(0xFF69B4)
            .setFooter({ text: `Nitro user • ${user.id}`, iconURL: user.displayAvatarURL() });
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setLabel('Download Banner').setStyle(ButtonStyle.Link).setURL(bannerURL),
                new ButtonBuilder().setLabel('View Profile').setStyle(ButtonStyle.Link).setURL(`https://discord.com/users/${user.id}`)
            );
        
        await interaction.editReply({ embeds: [embed], components: [row] });
    }
    
    // ==================== HELP COMMAND (INTERACTIVE BEAST) ====================
    else if (command === 'help') {
        const category = interaction.options.getString('category');
        
        const categories = {
            general: { name: '🎮 General Commands', value: '`afk` `avatar` `banner` `help` `invite` `partner` `ping` `profile` `report` `stats` `support` `suggest` `uptime` `userinfo` `serverinfo` `vote` `votecheck`', color: 0x00FF00 },
            music: { name: '🎵 Music Commands', value: '`play` `skip` `stop` `queue` `loop` `volume` `shuffle` `pause` `resume` `nowplaying` `seek` `forceskip` `clear` `disconnect` `join` `replay` `grab` `autoplay`', color: 0xFF00FF },
            filters: { name: '🎛️ Audio Filters', value: '`8d` `bass` `vaporwave` `karaoke` `slow` `speed` `daycore` `earrape` `china` `darthvader` `doubletime` `party` `pop` `radio` `rate` `tremolo` `reset`', color: 0x9B59B6 },
            playlist: { name: '📀 Playlist System', value: '`pl-create` `pl-load` `pl-add` `pl-list` `pl-delete` `pl-info` `pl-remove` `pl-addqueue` `pl-addnowplaying`', color: 0x3498DB },
            settings: { name: '⚙️ Server Settings', value: '`247` `djrole` `prefix` `history` `togglesource` `ignore`', color: 0xE67E22 }
        };
        
        if (category && categories[category]) {
            const cat = categories[category];
            const embed = new EmbedBuilder()
                .setTitle(`${cat.name} — ${interaction.client.user.username}`)
                .setDescription(cat.value)
                .setColor(cat.color)
                .setFooter({ text: `Total ${cat.value.split('`').length/2} commands • Use /help for all categories` });
            return interaction.reply({ embeds: [embed] });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🎵 **MELODY — PREMIUM MUSIC BOT**')
            .setDescription('> *The most powerful music bot on Discord*\n> **Support:** `/support` | **Invite:** `/invite` | **Vote:** `/vote`')
            .addFields(
                { name: '🎮 **General Commands**', value: '`afk` `avatar` `banner` `help` `invite` `partner` `ping` `profile` `report` `stats` `support` `suggest` `uptime` `userinfo` `serverinfo` `vote` `votecheck`', inline: false },
                { name: '🎵 **Music Commands**', value: '`play` `skip` `stop` `queue` `loop` `volume` `shuffle` `pause` `resume` `nowplaying`', inline: true },
                { name: '🎛️ **Audio Filters**', value: '`8d` `bass` `vaporwave` `karaoke` `slow` `speed` `daycore` `earrape` `reset`', inline: true },
                { name: '📀 **Playlist System**', value: '`pl-create` `pl-load` `pl-add` `pl-list` `pl-delete`', inline: true },
                { name: '⚙️ **Server Settings**', value: '`247` `djrole` `prefix` `history`', inline: true },
                { name: '🔗 **Useful Links**', value: '[Invite Bot](https://discord.com/oauth2/authorize?client_id=' + client.user.id + '&permissions=8&scope=bot%20applications.commands) | [Support Server](https://discord.gg/melody) | [Vote on Top.gg](https://top.gg/bot/' + client.user.id + ')', inline: false }
            )
            .setColor(0x00FF00)
            .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))
            .setImage('https://i.imgur.com/help-banner.gif')
            .setFooter({ text: `Requested by ${interaction.user.tag} • ${client.guilds.cache.size} servers • ${client.users.cache.size} users` });
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('help_general').setLabel('🎮 General').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('help_music').setLabel('🎵 Music').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('help_filters').setLabel('🎛️ Filters').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('help_playlist').setLabel('📀 Playlist').setStyle(ButtonStyle.Primary)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== INVITE COMMAND ====================
    else if (command === 'invite') {
        const inviteURL = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;
        
        const embed = new EmbedBuilder()
            .setTitle('🔗 **INVITE MELODY**')
            .setDescription('> *Add the most powerful music bot to your server*')
            .addFields(
                { name: '✨ **Premium Features**', value: '```\n• 24/7 Music Streaming\n• 20+ Audio Filters\n• Advanced Playlist System\n• DJ Role Management\n• Auto-play & Queue\n• Voice Recording\n• Spotify Support\n• YouTube Playlists```', inline: true },
                { name: '📊 **Bot Statistics**', value: '```yaml\n' +
                    `Servers: ${client.guilds.cache.size}\n` +
                    `Users: ${client.users.cache.size}\n` +
                    `Uptime: ${ms(client.uptime)}\n` +
                    `Commands: ${db.prepare(`SELECT SUM(commands_used) as total FROM user_stats`).get().total || 0}\n` +
                    `Response Time: <10ms\n` +
                    `Availability: 99.99%```', inline: true }
            )
            .setColor(0x7289DA)
            .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))
            .setFooter({ text: 'Melody • The Ultimate Music Experience' });
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setLabel('Invite Bot').setStyle(ButtonStyle.Link).setURL(inviteURL),
                new ButtonBuilder().setLabel('Support Server').setStyle(ButtonStyle.Link).setURL('https://discord.gg/melody'),
                new ButtonBuilder().setLabel('Vote on Top.gg').setStyle(ButtonStyle.Link).setURL(`https://top.gg/bot/${client.user.id}`)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== PARTNER COMMAND (BEAST) ====================
    else if (command === 'partner') {
        await interaction.deferReply({ ephemeral: true });
        const serverName = interaction.options.getString('server_name');
        const members = interaction.options.getString('members');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        // Check cooldown (7 days)
        const existing = db.prepare(`SELECT * FROM partners WHERE guild_id = ?`).get(interaction.guild.id);
        if (existing && existing.expires_at > Date.now()) {
            const remaining = ms(existing.expires_at - Date.now());
            return interaction.editReply({ 
                embeds: [BeastEmbed.error('Cooldown', `You can apply again in **${remaining}**`, 'Partner applications are limited to once per week to prevent spam')] 
            });
        }
        
        const guildIcon = interaction.guild.iconURL({ size: 1024 });
        
        // Send to partner channel
        const partnerChannel = client.channels.cache.get(process.env.PARTNER_CHANNEL_ID);
        if (partnerChannel) {
            const partnerEmbed = new EmbedBuilder()
                .setTitle('🤝 **New Partner Application**')
                .setDescription(`> **Server:** ${serverName}\n> **Members:** ${members}\n> **Owner:** <@${interaction.user.id}>\n> **Reason:** ${reason}`)
                .setColor(0xFFD700)
                .setThumbnail(guildIcon || client.user.displayAvatarURL())
                .addFields(
                    { name: '📅 Applied On', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
                    { name: '🆔 Server ID', value: `\`${interaction.guild.id}\``, inline: true },
                    { name: '👑 Owner ID', value: `\`${interaction.user.id}\``, inline: true }
                )
                .setTimestamp();
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setLabel('✅ Accept').setStyle(ButtonStyle.Success).setCustomId(`partner_accept_${interaction.guild.id}`),
                    new ButtonBuilder().setLabel('❌ Deny').setStyle(ButtonStyle.Danger).setCustomId(`partner_deny_${interaction.guild.id}`),
                    new ButtonBuilder().setLabel('👑 Contact Owner').setStyle(ButtonStyle.Primary).setCustomId(`partner_contact_${interaction.user.id}`)
                );
            
            await partnerChannel.send({ embeds: [partnerEmbed], components: [row] });
        }
        
        db.prepare(`INSERT OR REPLACE INTO partners (guild_id, guild_name, guild_icon, invited_by, timestamp, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(interaction.guild.id, serverName, guildIcon, interaction.user.id, Date.now(), Date.now() + 604800000, 'pending');
        
        const embed = BeastEmbed.success('Partner Application Submitted', 
            `**${serverName}** has been submitted for review!\nOur team will respond within 24-48 hours.`,
            [{ name: '📝 Application ID', value: `#${interaction.guild.id.slice(-6)}`, inline: true }]
        );
        
        await interaction.editReply({ embeds: [embed] });
    }
    
    // ==================== PING COMMAND (BEAST) ====================
    else if (command === 'ping') {
        const sent = await interaction.reply({ embeds: [BeastEmbed.loading('Pinging...', 'Measuring latency across systems')], fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(client.ws.ping);
        const dbLatencyStart = Date.now();
        db.prepare(`SELECT 1`).get();
        const dbLatency = Date.now() - dbLatencyStart;
        
        let statusColor = 0x00FF00;
        let statusText = '🟢 Excellent';
        if (latency > 200) { statusColor = 0xFFA500; statusText = '🟡 Good'; }
        if (latency > 500) { statusColor = 0xFF0000; statusText = '🔴 Poor'; }
        
        const embed = new EmbedBuilder()
            .setTitle('🏓 **PONG!**')
            .setDescription(`> **Status:** ${statusText}\n> **Response Time:** \`${latency}ms\``)
            .setColor(statusColor)
            .addFields(
                { name: '📡 Bot Latency', value: `\`\`\`yaml\n${latency}ms\`\`\``, inline: true },
                { name: '🌐 API Latency', value: `\`\`\`yaml\n${apiLatency}ms\`\`\``, inline: true },
                { name: '💾 Database', value: `\`\`\`yaml\n${dbLatency}ms\`\`\``, inline: true }
            )
            .setFooter({ text: '⚡ Lightning fast response • Melody Premium' });
        
        await interaction.editReply({ embeds: [embed] });
    }
    
    // ==================== REPORT COMMAND (BEAST) ====================
    else if (command === 'report') {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const evidence = interaction.options.getString('evidence') || 'No evidence provided';
        
        if (target.id === interaction.user.id) {
            return interaction.reply({ embeds: [BeastEmbed.error('Cannot report yourself', 'Please report someone else who violates the rules.', 'Use `/report` with a different user')] });
        }
        
        if (target.id === client.user.id) {
            return interaction.reply({ embeds: [BeastEmbed.error('Cannot report the bot', 'If you have an issue with the bot, please join our support server.', 'Use `/support` for help')] });
        }
        
        const reportId = db.prepare(`INSERT INTO reports (reporter_id, reported_id, reason, guild_id, message_link, timestamp) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(interaction.user.id, target.id, reason, interaction.guild.id, evidence, Date.now()).lastInsertRowid;
        
        db.prepare(`UPDATE user_stats SET report_count = report_count + 1 WHERE user_id = ?`).run(interaction.user.id);
        
        const reportChannel = client.channels.cache.get(process.env.REPORT_CHANNEL_ID);
        if (reportChannel) {
            const reportEmbed = new EmbedBuilder()
                .setTitle('🚨 **New User Report**')
                .setDescription(`> **Report ID:** #${reportId}\n> **Status:** \`Pending Review\``)
                .setColor(0xFF0000)
                .addFields(
                    { name: '👤 Reporter', value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true },
                    { name: '🚫 Reported', value: `${target.tag} (\`${target.id}\`)`, inline: true },
                    { name: '📝 Reason', value: `\`\`\`${reason}\`\`\``, inline: false },
                    { name: '🔗 Evidence', value: evidence !== 'No evidence provided' ? `[Click Here](${evidence})` : '`No evidence provided`', inline: false },
                    { name: '🏠 Server', value: interaction.guild.name, inline: true },
                    { name: '📅 Time', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Reported from ${interaction.guild.id}` });
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setLabel('✅ Review').setStyle(ButtonStyle.Success).setCustomId(`report_review_${reportId}`),
                    new ButtonBuilder().setLabel('❌ Dismiss').setStyle(ButtonStyle.Danger).setCustomId(`report_dismiss_${reportId}`)
                );
            
            await reportChannel.send({ embeds: [reportEmbed], components: [row] });
        }
        
        const embed = BeastEmbed.success('Report Submitted', 
            `**${target.tag}** has been reported for: \`${reason}\``,
            [
                { name: '📋 Report ID', value: `#${reportId}`, inline: true },
                { name: '👮 Review Time', value: '~24 hours', inline: true },
                { name: 'ℹ️ Note', value: 'False reports may lead to action against your account.', inline: false }
            ]
        );
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== STATS COMMAND (ULTRA BEAST) ====================
    else if (command === 'stats') {
        await interaction.deferReply();
        
        const totalCommands = db.prepare(`SELECT SUM(commands_used) as total FROM user_stats`).get().total || 0;
        const uniqueUsers = db.prepare(`SELECT COUNT(*) as count FROM user_stats`).get().count;
        const totalReports = db.prepare(`SELECT COUNT(*) as total FROM reports`).get().total || 0;
        const totalAFKs = db.prepare(`SELECT SUM(afk_count) as total FROM user_stats`).get().total || 0;
        const totalVotes = db.prepare(`SELECT SUM(total_votes) as total FROM votes`).get().total || 0;
        const premiumUsers = db.prepare(`SELECT COUNT(*) as count FROM votes WHERE premium_until > ?`).get(Date.now()).count;
        
        const cpuUsage = os.loadavg()[0];
        const totalMem = os.totalmem() / 1024 / 1024 / 1024;
        const freeMem = os.freemem() / 1024 / 1024 / 1024;
        const usedMem = totalMem - freeMem;
        
        const embed = new EmbedBuilder()
            .setTitle('📊 **MELODY SYSTEM STATUS**')
            .setDescription('> *Real-time bot and system statistics*')
            .setColor(0x00FFCC)
            .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))
            .addFields(
                { name: '🤖 **Bot Information**', value: '```yaml\n' +
                    `Name: ${client.user.tag}\n` +
                    `Discord.js: v${djsVersion}\n` +
                    `Node.js: ${process.version}\n` +
                    `Servers: ${client.guilds.cache.size.toLocaleString()}\n` +
                    `Users: ${client.users.cache.size.toLocaleString()}\n` +
                    `Channels: ${client.channels.cache.size.toLocaleString()}\n` +
                    `Uptime: ${ms(client.uptime)}` +
                    '```', inline: true },
                { name: '💻 **System Resources**', value: '```yaml\n' +
                    `CPU Load: ${cpuUsage.toFixed(2)}%\n` +
                    `RAM: ${usedMem.toFixed(2)}GB / ${totalMem.toFixed(2)}GB\n` +
                    `RAM Usage: ${((usedMem/totalMem)*100).toFixed(1)}%\n` +
                    `Platform: ${os.platform()} ${os.arch()}\n` +
                    `Process PID: ${process.pid}` +
                    '```', inline: true },
                { name: '📈 **Bot Analytics**', value: '```yaml\n' +
                    `Commands Executed: ${totalCommands.toLocaleString()}\n` +
                    `Unique Users: ${uniqueUsers.toLocaleString()}\n` +
                    `Reports Filed: ${totalReports}\n` +
                    `AFK Count: ${totalAFKs}\n` +
                    `Total Votes: ${totalVotes}\n` +
                    `Premium Users: ${premiumUsers}` +
                    '```', inline: false }
            )
            .setTimestamp()
            .setFooter({ text: `Last updated • Melody v4.0.0` });
        
        await interaction.editReply({ embeds: [embed] });
    }
    
    // ==================== SUPPORT COMMAND ====================
    else if (command === 'support') {
        const embed = new EmbedBuilder()
            .setTitle('🆘 **MELODY SUPPORT**')
            .setDescription('> *Need help? We\'ve got you covered!*')
            .addFields(
                { name: '📌 **Official Support Server**', value: '[**Click Here to Join**](https://discord.gg/melody-support)\n> *Get instant help, report bugs, suggest features*', inline: false },
                { name: '📧 **Email Support**', value: '`support@melodybot.com`\n> *For business inquiries and partnerships*', inline: true },
                { name: '🐦 **Twitter / X**', value: '[@MelodyBot](https://twitter.com/melodybot)\n> *Follow for updates and announcements*', inline: true },
                { name: '📚 **Documentation**', value: '[docs.melodybot.com](https://docs.melodybot.com)\n> *API reference, commands guide, and tutorials*', inline: true },
                { name: '⚡ **Response Time**', value: '> *Average response time: **< 5 minutes** in support server*', inline: false }
            )
            .setColor(0x9B59B6)
            .setThumbnail(client.user.displayAvatarURL())
            .setImage('https://i.imgur.com/support-banner.gif');
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setLabel('Join Support Server').setStyle(ButtonStyle.Link).setURL('https://discord.gg/melody-support'),
                new ButtonBuilder().setLabel('Read Documentation').setStyle(ButtonStyle.Link).setURL('https://docs.melodybot.com'),
                new ButtonBuilder().setLabel('Report a Bug').setStyle(ButtonStyle.Danger).setCustomId('report_bug')
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== UPTIME COMMAND ====================
    else if (command === 'uptime') {
        const uptime = ms(client.uptime);
        const startTime = Math.floor((Date.now() - client.uptime) / 1000);
        
        const embed = new EmbedBuilder()
            .setTitle('⏱️ **BOT UPTIME**')
            .setDescription(`> Melody has been online for **${uptime}**`)
            .addFields(
                { name: '📅 Started at', value: `<t:${startTime}:F>`, inline: true },
                { name: '⏰ Relative', value: `<t:${startTime}:R>`, inline: true },
                { name: '🟢 Status', value: '`🟢 Online & Operational`', inline: true },
                { name: '🔄 Next Restart', value: '`Scheduled: Never (Manual only)`', inline: true },
                { name: '📊 Sessions', value: `\`${client.ws.shards.size}\` shards active`, inline: true }
            )
            .setColor(0x00FF00)
            .setFooter({ text: '99.99% uptime guarantee • Melody Premium' });
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== VOTE COMMAND ====================
    else if (command === 'vote') {
        const embed = new EmbedBuilder()
            .setTitle('🗳️ **VOTE FOR MELODY**')
            .setDescription('> *Support Melody by voting on these platforms*\n> **Vote daily to keep premium features active!**')
            .addFields(
                { name: '⭐ **Top.gg**', value: '[**Click to Vote**](https://top.gg/bot/' + client.user.id + '/vote)\n> • Get **Premium Access** for 12 hours\n> • **Double XP** on all commands\n> • Exclusive **Voter Badge** on profile', inline: false },
                { name: '⭐ **Discord Bot List**', value: '[**Click to Vote**](https://discordbotlist.com/bots/' + client.user.id + '/upvote)\n> • Get **XP Boost** (2x)\n> • Unlock **Special Filters**\n> • Priority **Queue Position**', inline: false },
                { name: '🎁 **Vote Rewards**', value: '```\n✓ 12 Hours Premium Access\n✓ Spotify Playlist Support\n✓ Unlimited Playlists\n✓ 24/7 Voice Channel Mode\n✓ All Audio Filters Unlocked\n✓ Priority Support\n✓ Exclusive !/vote Command\n✓ Vote Leaderboard Access```', inline: true },
                { name: '📊 **Your Status**', value: `> Use \`/votecheck\` to see your current vote status\n> Vote resets every **12 hours**\n> **Don't forget to vote daily!**`, inline: true }
            )
            .setColor(0xFFD700)
            .setThumbnail('https://cdn.discordapp.com/emojis/vote.png')
            .setImage('https://i.imgur.com/vote-banner.gif');
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setLabel('Vote on Top.gg').setStyle(ButtonStyle.Link).setURL(`https://top.gg/bot/${client.user.id}/vote`),
                new ButtonBuilder().setLabel('Vote on DBL').setStyle(ButtonStyle.Link).setURL(`https://discordbotlist.com/bots/${client.user.id}/upvote`),
                new ButtonBuilder().setLabel('Check Vote Status').setStyle(ButtonStyle.Secondary).setCustomId('check_vote')
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== VOTECHECK COMMAND ====================
    else if (command === 'votecheck') {
        await interaction.deferReply({ ephemeral: true });
        
        const voteData = db.prepare(`SELECT * FROM votes WHERE user_id = ?`).get(interaction.user.id);
        const hasVoted = voteData && voteData.last_vote > Date.now() - 43200000;
        
        if (hasVoted) {
            const timeLeft = ms(voteData.last_vote + 43200000 - Date.now());
            const premiumTimeLeft = voteData.premium_until ? ms(voteData.premium_until - Date.now()) : 'Expired';
            
            const embed = BeastEmbed.success('✅ Vote Status', `You have already voted in the last 12 hours!`, [
                { name: '⏰ Next vote available', value: `\`${timeLeft}\``, inline: true },
                { name: '💎 Premium active', value: `\`${premiumTimeLeft}\``, inline: true },
                { name: '🗳️ Total votes', value: `\`${voteData.total_votes || 0}\` votes`, inline: true },
                { name: '🏆 Vote streak', value: `\`${Math.floor(voteData.total_votes / 2)}\` days`, inline: true }
            ]);
            await interaction.editReply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setTitle('⚠️ **No Active Vote**')
                .setDescription('You haven\'t voted in the last 12 hours.\nUse `/vote` to vote now and get **Premium rewards** instantly!')
                .addFields(
                    { name: '🎁 What you\'re missing', value: '```\n• 12 Hours Premium\n• All Filters Unlocked\n• Spotify Playlists\n• 24/7 Mode\n• Priority Support```', inline: false },
                    { name: '⚡ Quick Vote', value: '[**Vote on Top.gg Now**](https://top.gg/bot/' + client.user.id + '/vote)', inline: true }
                )
                .setColor(0xFFA500);
            await interaction.editReply({ embeds: [embed] });
        }
    }
    
    // ==================== PROFILE COMMAND ====================
    else if (command === 'profile') {
        const target = interaction.options.getUser('user') || interaction.user;
        const stats = db.prepare(`SELECT * FROM user_stats WHERE user_id = ?`).get(target.id) || {
            commands_used: 0, afk_count: 0, report_count: 0, voice_time: 0, messages_count: 0, first_seen: Date.now(), last_seen: Date.now()
        };
        
        const badges = [];
        if (process.env.OWNER_IDS?.includes(target.id)) badges.push('owner');
        if (stats.commands_used > 1000) badges.push('veteran');
        if (stats.voice_time > 3600) badges.push('music_lover');
        
        const voteData = db.prepare(`SELECT * FROM votes WHERE user_id = ?`).get(target.id);
        if (voteData && voteData.premium_until > Date.now()) badges.push('premium');
        if (voteData && voteData.total_votes > 10) badges.push('voter');
        
        const embed = BeastEmbed.profile(target, stats, badges);
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== SUGGEST COMMAND ====================
    else if (command === 'suggest') {
        const suggestion = interaction.options.getString('suggestion');
        
        const result = db.prepare(`INSERT INTO suggestion (user_id, suggestion, timestamp) VALUES (?, ?, ?)`).run(interaction.user.id, suggestion, Date.now());
        
        const suggestChannel = client.channels.cache.get(process.env.SUGGEST_CHANNEL_ID);
        if (suggestChannel) {
            const suggestEmbed = new EmbedBuilder()
                .setTitle('💡 **New Suggestion**')
                .setDescription(`> ${suggestion}`)
                .setColor(0x9B59B6)
                .addFields(
                    { name: '👤 Suggested by', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '🆔 Suggestion ID', value: `#${result.lastInsertRowid}`, inline: true },
                    { name: '📅 Created', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
                )
                .setFooter({ text: 'React with ✅ to approve, ❌ to deny' });
            
            const msg = await suggestChannel.send({ embeds: [suggestEmbed] });
            await msg.react('✅');
            await msg.react('❌');
        }
        
        const embed = BeastEmbed.success('Suggestion Submitted', `Thank you for your suggestion!\n**Suggestion ID:** #${result.lastInsertRowid}`, [
            { name: '📝 Your Suggestion', value: `\`\`\`${suggestion}\`\`\``, inline: false },
            { name: '⏱️ Review Time', value: 'Usually within 24-48 hours', inline: true }
        ]);
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== PREFIX COMMAND ====================
    else if (command === 'prefix') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ embeds: [BeastEmbed.error('Permission Denied', 'Only administrators can change the bot prefix!')], ephemeral: true });
        }
        
        const newPrefix = interaction.options.getString('new_prefix');
        
        if (newPrefix.length > 3) {
            return interaction.reply({ embeds: [BeastEmbed.error('Invalid Prefix', 'Prefix cannot be longer than 3 characters!')], ephemeral: true });
        }
        
        setPrefix(interaction.guild.id, newPrefix);
        
        const embed = BeastEmbed.success('Prefix Updated', `Bot prefix has been changed to \`${newPrefix}\``, [
            { name: '📝 Example', value: `${newPrefix}play Never Gonna Give You Up`, inline: false },
            { name: '⚠️ Note', value: 'Slash commands (/) will still work alongside prefix commands', inline: false }
        ]);
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== USERINFO COMMAND ====================
    else if (command === 'userinfo') {
        const target = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        
        const roles = member ? member.roles.cache.map(r => r.toString()).slice(0, 10).join(', ') : 'None';
        const statusEmojis = { online: '🟢', idle: '🌙', dnd: '🔴', offline: '⚫' };
        
        const embed = new EmbedBuilder()
            .setTitle(`👤 **${target.tag}**`)
            .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 1024 }))
            .setColor(member?.displayHexColor || 0x9B59B6)
            .addFields(
                { name: '🆔 User ID', value: `\`${target.id}\``, inline: true },
                { name: '📛 Nickname', value: member?.nickname || '`None`', inline: true },
                { name: '🟢 Status', value: `${statusEmojis[member?.presence?.status] || '⚫'} \`${member?.presence?.status || 'offline'}\``, inline: true },
                { name: '📅 Joined Discord', value: `<t:${Math.floor(target.createdTimestamp/1000)}:R>`, inline: true },
                { name: '🏠 Joined Server', value: member ? `<t:${Math.floor(member.joinedTimestamp/1000)}:R>` : '`Unknown`', inline: true },
                { name: '🎭 Roles', value: roles.length > 1024 ? roles.substring(0, 1000) + '...' : roles || '`None`', inline: false },
                { name: '🤖 Bot?', value: target.bot ? '`Yes`' : '`No`', inline: true }
            )
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== SERVERINFO COMMAND ====================
    else if (command === 'serverinfo') {
        const guild = interaction.guild;
        
        const verificationLevels = { NONE: 'None', LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', VERY_HIGH: 'Highest' };
        
        const embed = new EmbedBuilder()
            .setTitle(`🏠 **${guild.name}**`)
            .setThumbnail(guild.iconURL({ size: 1024 }) || null)
            .setColor(0x9B59B6)
            .addFields(
                { name: '🆔 Server ID', value: `\`${guild.id}\``, inline: true },
                { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
                { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp/1000)}:R>`, inline: true },
                { name: '👥 Members', value: `\`${guild.memberCount}\` members`, inline: true },
                { name: '💬 Channels', value: `\`${guild.channels.cache.size}\` channels`, inline: true },
                { name: '🎭 Roles', value: `\`${guild.roles.cache.size}\` roles`, inline: true },
                { name: '🔒 Verification', value: verificationLevels[guild.verificationLevel] || 'Unknown', inline: true },
                { name: '🎉 Boosts', value: `\`${guild.premiumSubscriptionCount}\` boosts (Level ${guild.premiumTier})`, inline: true },
                { name: '🌍 Language', value: guild.preferredLocale || 'en-US', inline: true }
            )
            .setImage(guild.bannerURL({ size: 1024 }) || null)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    }
    
    const execTime = Date.now() - startTime;
    console.log(`✅ ${command} executed by ${interaction.user.tag} in ${execTime}ms`);
}

// ==================== AFK EVENTS ====================
async function handleAFKEvent(message) {
    if (!message.guild || message.author.bot) return;
    
    for (const mention of message.mentions.users.values()) {
        const afkData = db.prepare(`SELECT * FROM afk WHERE user_id = ?`).get(mention.id);
        if (afkData) {
            const timeAgo = ms(Date.now() - afkData.timestamp);
            const embed = new EmbedBuilder()
                .setTitle('🔇 **User is AFK**')
                .setDescription(`<@${mention.id}> is currently AFK`)
                .addFields(
                    { name: '📝 Reason', value: `\`\`\`${afkData.reason}\`\`\``, inline: false },
                    { name: '⏰ For', value: `${timeAgo}`, inline: true },
                    { name: '🔄 Auto-reply', value: '`Enabled`', inline: true }
                )
                .setColor(0xFFA500);
            
            await message.reply({ embeds: [embed] }).catch(() => {});
            break;
        }
    }
}

async function handleRemoveAFK(message) {
    if (!message.guild || message.author.bot) return;
    
    const afkData = db.prepare(`SELECT * FROM afk WHERE user_id = ?`).get(message.author.id);
    if (afkData) {
        db.prepare(`DELETE FROM afk WHERE user_id = ?`).run(message.author.id);
        
        const embed = new EmbedBuilder()
            .setTitle('🔊 **Welcome Back!**')
            .setDescription(`<@${message.author.id}>, your AFK has been removed`)
            .addFields(
                { name: '⏰ Duration', value: `${ms(Date.now() - afkData.timestamp)}`, inline: true },
                { name: '📝 Old Reason', value: `\`${afkData.reason}\``, inline: true }
            )
            .setColor(0x00FF88);
        
        await message.reply({ embeds: [embed] }).catch(() => {});
    }
}

// ==================== EXPORTS ====================
module.exports = {
    commands,
    handleGeneralCommands,
    handleAFKEvent,
    handleRemoveAFK,
    getPrefix
};