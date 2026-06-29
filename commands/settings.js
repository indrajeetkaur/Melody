const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const sqlite3 = require('better-sqlite3');
const ms = require('ms');
require('dotenv').config();

// ==================== DATABASE SETUP ====================
const db = new sqlite3(process.env.DB_PATH || 'melody.db');

// Create settings tables if not exists
db.exec(`
    CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        twenty_four_seven INTEGER DEFAULT 0,
        dj_role_id TEXT,
        history_enabled INTEGER DEFAULT 1,
        prefix TEXT DEFAULT '&',
        ignored_channels TEXT DEFAULT '[]',
        ignored_roles TEXT DEFAULT '[]',
        enabled_sources TEXT DEFAULT '["youtube","soundcloud"]',
        auto_dj INTEGER DEFAULT 0,
        default_volume INTEGER DEFAULT 50,
        max_queue_size INTEGER DEFAULT 500,
        max_song_duration INTEGER DEFAULT 0,
        announce_songs INTEGER DEFAULT 1,
        vote_skip INTEGER DEFAULT 0,
        vote_threshold INTEGER DEFAULT 50
    );
    
    CREATE TABLE IF NOT EXISTS music_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT,
        user_id TEXT,
        track_title TEXT,
        track_url TEXT,
        track_duration INTEGER,
        played_at INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS ignored_users (
        guild_id TEXT,
        user_id TEXT,
        ignored_at INTEGER,
        reason TEXT,
        PRIMARY KEY (guild_id, user_id)
    );
`);

// ==================== PREMIUM EMBED DESIGN ====================
class SettingsEmbed {
    static success(title, description, fields = []) {
        return new EmbedBuilder()
            .setAuthor({ name: '⚙️ MELODY • SERVER SETTINGS', iconURL: 'https://cdn.discordapp.com/attachments/xxx/settings-icon.png' })
            .setTitle(`✨ ${title}`)
            .setDescription(description)
            .addFields(fields)
            .setColor(0xE67E22)
            .setTimestamp()
            .setFooter({ text: 'Melody • Server Configuration', iconURL: 'https://cdn.discordapp.com/attachments/xxx/footer.png' });
    }

    static error(title, description, suggestion = null) {
        const embed = new EmbedBuilder()
            .setAuthor({ name: '❌ MELODY • SETTINGS ERROR', iconURL: 'https://cdn.discordapp.com/attachments/xxx/error-icon.png' })
            .setTitle(`❌ ${title}`)
            .setDescription(description)
            .setColor(0xFF3366)
            .setTimestamp()
            .setFooter({ text: 'Melody • Settings System' });
        
        if (suggestion) embed.addFields({ name: '💡 Suggestion', value: suggestion, inline: false });
        return embed;
    }

    static settings(settings, guild) {
        const twenty247 = settings.twenty_four_seven ? '✅ Enabled' : '❌ Disabled';
        const history = settings.history_enabled ? '✅ Enabled' : '❌ Disabled';
        const autoDJ = settings.auto_dj ? '✅ Enabled' : '❌ Disabled';
        const announce = settings.announce_songs ? '✅ Enabled' : '❌ Disabled';
        const voteSkip = settings.vote_skip ? `✅ ${settings.vote_threshold}% required` : '❌ Disabled';
        
        const djRole = settings.dj_role_id ? `<@&${settings.dj_role_id}>` : '`Not Set`';
        const prefix = `\`${settings.prefix}\``;
        const volume = `\`${settings.default_volume}%\``;
        const maxQueue = settings.max_queue_size ? `\`${settings.max_queue_size}\` songs` : '`Unlimited`';
        const maxDuration = settings.max_song_duration ? `\`${ms(settings.max_song_duration * 1000)}\`` : '`Unlimited`';
        
        const ignoredChannels = JSON.parse(settings.ignored_channels || '[]');
        const ignoredRoles = JSON.parse(settings.ignored_roles || '[]');
        const sources = JSON.parse(settings.enabled_sources || '["youtube","soundcloud"]');
        
        return new EmbedBuilder()
            .setAuthor({ name: '⚙️ MELODY • SERVER CONFIGURATION', iconURL: 'https://cdn.discordapp.com/attachments/xxx/config-icon.png' })
            .setTitle(`⚙️ **${guild.name} Settings**`)
            .setThumbnail(guild.iconURL({ size: 1024 }) || null)
            .addFields(
                { name: '🎵 **Music Settings**', value: '```yaml\n' +
                    `24/7 Mode: ${twenty247}\n` +
                    `Default Volume: ${volume}\n` +
                    `Auto-DJ: ${autoDJ}\n` +
                    `Announce Songs: ${announce}\n` +
                    `Vote Skip: ${voteSkip}` +
                    '```', inline: true },
                { name: '⚙️ **General Settings**', value: '```yaml\n' +
                    `Prefix: ${prefix}\n` +
                    `DJ Role: ${djRole}\n` +
                    `History: ${history}\n` +
                    `Max Queue: ${maxQueue}\n` +
                    `Max Song Duration: ${maxDuration}` +
                    '```', inline: true },
                { name: '🚫 **Ignored Items**', value: '```yaml\n' +
                    `Channels: ${ignoredChannels.length}\n` +
                    `Roles: ${ignoredRoles.length}\n` +
                    `Sources: ${sources.join(', ')}` +
                    '```', inline: false }
            )
            .setColor(0xE67E22)
            .setTimestamp()
            .setFooter({ text: 'Use the buttons below to modify settings • Admin only' });
    }

    static sourcesPanel(currentSources) {
        const youtubeEnabled = currentSources.includes('youtube');
        const soundcloudEnabled = currentSources.includes('soundcloud');
        const spotifyEnabled = currentSources.includes('spotify');
        const twitchEnabled = currentSources.includes('twitch');
        
        return new EmbedBuilder()
            .setAuthor({ name: '🎵 MELODY • MUSIC SOURCES', iconURL: 'https://cdn.discordapp.com/attachments/xxx/source-icon.png' })
            .setTitle('🌐 **ENABLED MUSIC SOURCES**')
            .setDescription('Toggle which platforms the bot can play from')
            .addFields(
                { name: '📺 YouTube', value: youtubeEnabled ? '✅ **Enabled**' : '❌ Disabled', inline: true },
                { name: '🎧 SoundCloud', value: soundcloudEnabled ? '✅ **Enabled**' : '❌ Disabled', inline: true },
                { name: '🎵 Spotify', value: spotifyEnabled ? '✅ **Enabled**' : '❌ Disabled', inline: true },
                { name: '📡 Twitch', value: twitchEnabled ? '✅ **Enabled**' : '❌ Disabled', inline: true }
            )
            .setColor(0x3498DB)
            .setFooter({ text: 'Click buttons below to toggle sources' });
    }

    static ignoredList(ignoredChannels, ignoredRoles, guild) {
        const channelsList = ignoredChannels.map(id => `<#${id}>`).join('\n') || '`None`';
        const rolesList = ignoredRoles.map(id => `<@&${id}>`).join('\n') || '`None`';
        
        return new EmbedBuilder()
            .setAuthor({ name: '🚫 MELODY • IGNORED ITEMS', iconURL: 'https://cdn.discordapp.com/attachments/xxx/ignore-icon.png' })
            .setTitle('🚫 **Ignored Channels & Roles**')
            .addFields(
                { name: '📝 Ignored Channels', value: channelsList, inline: true },
                { name: '🎭 Ignored Roles', value: rolesList, inline: true },
                { name: '💡 Tip', value: 'Commands will not work in ignored channels or for users with ignored roles', inline: false }
            )
            .setColor(0xFFA500);
    }
}

// ==================== HELPER FUNCTIONS ====================
function getGuildSettings(guildId) {
    let settings = db.prepare(`SELECT * FROM guild_settings WHERE guild_id = ?`).get(guildId);
    if (!settings) {
        db.prepare(`INSERT INTO guild_settings (guild_id) VALUES (?)`).run(guildId);
        settings = db.prepare(`SELECT * FROM guild_settings WHERE guild_id = ?`).get(guildId);
    }
    return settings;
}

function updateSetting(guildId, setting, value) {
    db.prepare(`UPDATE guild_settings SET ${setting} = ?, updated_at = ? WHERE guild_id = ?`).run(value, Date.now(), guildId);
}

function toggleSource(guildId, source, enabled) {
    const settings = getGuildSettings(guildId);
    let sources = JSON.parse(settings.enabled_sources || '["youtube","soundcloud"]');
    
    if (enabled && !sources.includes(source)) {
        sources.push(source);
    } else if (!enabled && sources.includes(source)) {
        sources = sources.filter(s => s !== source);
    }
    
    updateSetting(guildId, 'enabled_sources', JSON.stringify(sources));
    return sources;
}

function addIgnoredChannel(guildId, channelId) {
    const settings = getGuildSettings(guildId);
    let ignored = JSON.parse(settings.ignored_channels || '[]');
    if (!ignored.includes(channelId)) {
        ignored.push(channelId);
        updateSetting(guildId, 'ignored_channels', JSON.stringify(ignored));
    }
    return ignored;
}

function removeIgnoredChannel(guildId, channelId) {
    const settings = getGuildSettings(guildId);
    let ignored = JSON.parse(settings.ignored_channels || '[]');
    ignored = ignored.filter(id => id !== channelId);
    updateSetting(guildId, 'ignored_channels', JSON.stringify(ignored));
    return ignored;
}

function addIgnoredRole(guildId, roleId) {
    const settings = getGuildSettings(guildId);
    let ignored = JSON.parse(settings.ignored_roles || '[]');
    if (!ignored.includes(roleId)) {
        ignored.push(roleId);
        updateSetting(guildId, 'ignored_roles', JSON.stringify(ignored));
    }
    return ignored;
}

function removeIgnoredRole(guildId, roleId) {
    const settings = getGuildSettings(guildId);
    let ignored = JSON.parse(settings.ignored_roles || '[]');
    ignored = ignored.filter(id => id !== roleId);
    updateSetting(guildId, 'ignored_roles', JSON.stringify(ignored));
    return ignored;
}

function clearHistory(guildId) {
    const count = db.prepare(`SELECT COUNT(*) as count FROM music_history WHERE guild_id = ?`).get(guildId).count;
    db.prepare(`DELETE FROM music_history WHERE guild_id = ?`).run(guildId);
    return count;
}

// ==================== COMMANDS REGISTRATION ====================
const settingsCommands = [
    new SlashCommandBuilder().setName('settings').setDescription('⚙️ View all server settings')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder().setName('247').setDescription('🕐 Toggle 24/7 mode (bot stays in voice channel)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder().setName('djrole').setDescription('🎭 Set DJ role for music commands')
        .addRoleOption(opt => opt.setName('role').setDescription('DJ role (leave empty to disable)').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder().setName('history').setDescription('📜 View recent song history')
        .addIntegerOption(opt => opt.setName('limit').setDescription('Number of songs to show (1-25)').setRequired(false)),
    
    new SlashCommandBuilder().setName('clearhistory').setDescription('🗑️ Clear server music history')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder().setName('prefix').setDescription('🔧 Change bot prefix for this server')
        .addStringOption(opt => opt.setName('new_prefix').setDescription('New prefix (max 3 characters)').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder().setName('ignore').setDescription('🚫 Ignore a channel or role from using the bot')
        .addSubcommand(sub => sub.setName('channel').setDescription('Ignore a channel')
            .addChannelOption(opt => opt.setName('channel').setDescription('Channel to ignore').setRequired(true)))
        .addSubcommand(sub => sub.setName('role').setDescription('Ignore a role')
            .addRoleOption(opt => opt.setName('role').setDescription('Role to ignore').setRequired(true)))
        .addSubcommand(sub => sub.setName('list').setDescription('List ignored channels and roles'))
        .addSubcommand(sub => sub.setName('remove').setDescription('Remove ignored channel or role')
            .addStringOption(opt => opt.setName('type').setDescription('Type to remove').setRequired(true)
                .addChoices({ name: 'Channel', value: 'channel' }, { name: 'Role', value: 'role' }))
            .addStringOption(opt => opt.setName('id').setDescription('ID of channel/role to remove').setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder().setName('togglesource').setDescription('🌐 Enable/disable music sources')
        .addStringOption(opt => opt.setName('source').setDescription('Source to toggle').setRequired(true)
            .addChoices(
                { name: 'YouTube', value: 'youtube' },
                { name: 'SoundCloud', value: 'soundcloud' },
                { name: 'Spotify', value: 'spotify' },
                { name: 'Twitch', value: 'twitch' }
            ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

// ==================== SETTINGS COMMAND HANDLER ====================
async function handleSettingsCommands(interaction, client) {
    const command = interaction.commandName;
    const settings = getGuildSettings(interaction.guild.id);
    
    // ==================== SETTINGS (View All) ====================
    if (command === 'settings') {
        const embed = SettingsEmbed.settings(settings, interaction.guild);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('settings_247').setLabel('🕐 24/7').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('settings_history').setLabel('📜 History').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('settings_prefix').setLabel('🔧 Prefix').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('settings_sources').setLabel('🌐 Sources').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('settings_ignore').setLabel('🚫 Ignore').setStyle(ButtonStyle.Danger)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== 24/7 COMMAND ====================
    else if (command === '247') {
        const newStatus = settings.twenty_four_seven ? 0 : 1;
        updateSetting(interaction.guild.id, 'twenty_four_seven', newStatus);
        
        const embed = SettingsEmbed.success(
            '24/7 Mode',
            `24/7 mode has been **${newStatus ? 'ENABLED' : 'DISABLED'}**`,
            [
                { name: '🕐 What is 24/7?', value: 'Bot stays in voice channel even when idle. Use `/disconnect` to manually remove.', inline: false },
                { name: '📊 Current Status', value: newStatus ? '✅ Bot will stay connected' : '❌ Bot will leave when idle', inline: true }
            ]
        );
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('settings_247').setLabel(newStatus ? '✅ 24/7 ON' : '❌ 24/7 OFF').setStyle(ButtonStyle[newStatus ? 'Success' : 'Danger']).setDisabled(true),
                new ButtonBuilder().setCustomId('settings_view').setLabel('⚙️ View Settings').setStyle(ButtonStyle.Secondary)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== DJROLE COMMAND ====================
    else if (command === 'djrole') {
        const role = interaction.options.getRole('role');
        
        if (!role) {
            updateSetting(interaction.guild.id, 'dj_role_id', null);
            const embed = SettingsEmbed.success('DJ Role Removed', 'DJ role has been disabled. Everyone can use music commands now.');
            return interaction.reply({ embeds: [embed] });
        }
        
        updateSetting(interaction.guild.id, 'dj_role_id', role.id);
        
        const embed = SettingsEmbed.success(
            'DJ Role Set',
            `**${role.name}** has been set as the DJ role`,
            [
                { name: '🎭 What does DJ role do?', value: 'Users with this role can use moderation commands like `/skip`, `/stop`, `/clear` without vote skip', inline: false },
                { name: '💡 Tip', value: 'You can also give DJ permissions to specific users manually', inline: true }
            ]
        );
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setLabel('👥 View Role').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${interaction.guild.id}/${role.id}`),
                new ButtonBuilder().setCustomId('settings_view').setLabel('⚙️ View Settings').setStyle(ButtonStyle.Secondary)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== HISTORY COMMAND ====================
    else if (command === 'history') {
        const limit = Math.min(interaction.options.getInteger('limit') || 10, 25);
        const history = db.prepare(`SELECT * FROM music_history WHERE guild_id = ? ORDER BY played_at DESC LIMIT ?`).all(interaction.guild.id, limit);
        
        if (!history.length) {
            return interaction.reply({ 
                embeds: [SettingsEmbed.error('No History', 'No songs have been played in this server yet!', 'Play some music using `/play` first')],
                ephemeral: true
            });
        }
        
        const embed = new EmbedBuilder()
            .setAuthor({ name: '📜 MELODY • RECENT HISTORY', iconURL: 'https://cdn.discordapp.com/attachments/xxx/history-icon.png' })
            .setTitle(`🎵 Recently Played Songs in ${interaction.guild.name}`)
            .setDescription(history.map((h, i) => `\`${i+1}.\` **${h.track_title}** \`[${ms(h.track_duration)}]\` — <@${h.user_id}> — <t:${Math.floor(h.played_at/1000)}:R>`).join('\n'))
            .addFields(
                { name: '📊 Total Songs', value: `\`${db.prepare(`SELECT COUNT(*) as count FROM music_history WHERE guild_id = ?`).get(interaction.guild.id).count}\` played`, inline: true },
                { name: '💡 Tip', value: 'Use `/clearhistory` to clear this list', inline: true }
            )
            .setColor(0x00FFCC)
            .setFooter({ text: `Last 10 songs shown • Use /history <limit> for more` });
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('settings_history_refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('settings_clear_history').setLabel('🗑️ Clear History').setStyle(ButtonStyle.Danger)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== CLEARHISTORY COMMAND ====================
    else if (command === 'clearhistory') {
        const count = clearHistory(interaction.guild.id);
        
        const embed = SettingsEmbed.success(
            'History Cleared',
            `**${count}** song${count !== 1 ? 's' : ''} have been removed from the history`,
            [
                { name: '📊 Previous Count', value: `\`${count}\` songs`, inline: true },
                { name: '🔄 New Status', value: '`Empty`', inline: true }
            ]
        );
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== PREFIX COMMAND ====================
    else if (command === 'prefix') {
        const newPrefix = interaction.options.getString('new_prefix');
        
        if (newPrefix.length > 3) {
            return interaction.reply({ 
                embeds: [SettingsEmbed.error('Invalid Prefix', 'Prefix cannot be longer than 3 characters!', 'Try a shorter prefix like `!` or `&` or `?`')],
                ephemeral: true
            });
        }
        
        updateSetting(interaction.guild.id, 'prefix', newPrefix);
        
        const embed = SettingsEmbed.success(
            'Prefix Updated',
            `Bot prefix has been changed to \`${newPrefix}\``,
            [
                { name: '📝 Example', value: `${newPrefix}play Never Gonna Give You Up`, inline: false },
                { name: '⚠️ Note', value: 'Slash commands (/) will still work alongside prefix commands', inline: false },
                { name: '💡 Tip', value: 'Use `/settings` to view all settings', inline: true }
            ]
        );
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setLabel('✅ Done').setStyle(ButtonStyle.Success).setCustomId('settings_prefix_done'),
                new ButtonBuilder().setCustomId('settings_view').setLabel('⚙️ View Settings').setStyle(ButtonStyle.Secondary)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== IGNORE COMMAND ====================
    else if (command === 'ignore') {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'channel') {
            const channel = interaction.options.getChannel('channel');
            addIgnoredChannel(interaction.guild.id, channel.id);
            
            const embed = SettingsEmbed.success(
                'Channel Ignored',
                `<#${channel.id}> has been added to ignore list`,
                [
                    { name: '🚫 Effect', value: 'Commands will not work in this channel', inline: true },
                    { name: '💡 Tip', value: 'Use `/ignore remove channel <id>` to unignore', inline: true }
                ]
            );
            await interaction.reply({ embeds: [embed] });
        }
        
        else if (subcommand === 'role') {
            const role = interaction.options.getRole('role');
            addIgnoredRole(interaction.guild.id, role.id);
            
            const embed = SettingsEmbed.success(
                'Role Ignored',
                `${role.name} role has been added to ignore list`,
                [
                    { name: '🚫 Effect', value: 'Users with this role cannot use bot commands', inline: true },
                    { name: '💡 Tip', value: 'Use `/ignore remove role <id>` to unignore', inline: true }
                ]
            );
            await interaction.reply({ embeds: [embed] });
        }
        
        else if (subcommand === 'list') {
            const settings = getGuildSettings(interaction.guild.id);
            const ignoredChannels = JSON.parse(settings.ignored_channels || '[]');
            const ignoredRoles = JSON.parse(settings.ignored_roles || '[]');
            
            const embed = SettingsEmbed.ignoredList(ignoredChannels, ignoredRoles, interaction.guild);
            await interaction.reply({ embeds: [embed] });
        }
        
        else if (subcommand === 'remove') {
            const type = interaction.options.getString('type');
            const id = interaction.options.getString('id');
            
            if (type === 'channel') {
                removeIgnoredChannel(interaction.guild.id, id);
                const embed = SettingsEmbed.success('Channel Removed', `<#${id}> has been removed from ignore list`);
                await interaction.reply({ embeds: [embed] });
            } else {
                removeIgnoredRole(interaction.guild.id, id);
                const embed = SettingsEmbed.success('Role Removed', `<@&${id}> has been removed from ignore list`);
                await interaction.reply({ embeds: [embed] });
            }
        }
    }
    
    // ==================== TOGGLESOURCE COMMAND ====================
    else if (command === 'togglesource') {
        const source = interaction.options.getString('source');
        const settings = getGuildSettings(interaction.guild.id);
        const currentSources = JSON.parse(settings.enabled_sources || '["youtube","soundcloud"]');
        const isEnabled = currentSources.includes(source);
        
        const newSources = toggleSource(interaction.guild.id, source, !isEnabled);
        
        const embed = new EmbedBuilder()
            .setAuthor({ name: '🌐 MELODY • MUSIC SOURCES', iconURL: 'https://cdn.discordapp.com/attachments/xxx/source-icon.png' })
            .setTitle(`${isEnabled ? '❌' : '✅'} ${source.toUpperCase()} ${isEnabled ? 'Disabled' : 'Enabled'}`)
            .setDescription(`**${source}** has been ${isEnabled ? 'disabled' : 'enabled'} for this server`)
            .addFields(
                { name: '📊 Current Sources', value: newSources.map(s => `✅ ${s}`).join('\n') || '`No sources enabled`', inline: true },
                { name: '⚠️ Note', value: 'Disabled sources will not be searchable in `/play`', inline: true }
            )
            .setColor(isEnabled ? 0xFF3366 : 0x00FF88)
            .setTimestamp();
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('settings_sources').setLabel('🌐 Manage Sources').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('settings_view').setLabel('⚙️ View Settings').setStyle(ButtonStyle.Secondary)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
}

// ==================== BUTTON HANDLER ====================
async function handleSettingsButtons(interaction, client) {
    const customId = interaction.customId;
    const guildId = interaction.guild.id;
    const settings = getGuildSettings(guildId);
    
    // View Settings button
    if (customId === 'settings_view') {
        const embed = SettingsEmbed.settings(settings, interaction.guild);
        await interaction.update({ embeds: [embed], components: [interaction.message.components[0]] });
    }
    
    // 24/7 toggle button
    else if (customId === 'settings_247') {
        const newStatus = settings.twenty_four_seven ? 0 : 1;
        updateSetting(guildId, 'twenty_four_seven', newStatus);
        
        const embed = SettingsEmbed.success(
            '24/7 Mode',
            `24/7 mode has been **${newStatus ? 'ENABLED' : 'DISABLED'}**`
        );
        
        const newSettings = getGuildSettings(guildId);
        const mainEmbed = SettingsEmbed.settings(newSettings, interaction.guild);
        await interaction.update({ embeds: [mainEmbed, embed], components: [interaction.message.components[0]] });
    }
    
    // Sources button
    else if (customId === 'settings_sources') {
        const currentSources = JSON.parse(settings.enabled_sources || '["youtube","soundcloud"]');
        const embed = SettingsEmbed.sourcesPanel(currentSources);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('source_youtube').setLabel('📺 YouTube').setStyle(ButtonStyle[currentSources.includes('youtube') ? 'Success' : 'Secondary']),
                new ButtonBuilder().setCustomId('source_soundcloud').setLabel('🎧 SoundCloud').setStyle(ButtonStyle[currentSources.includes('soundcloud') ? 'Success' : 'Secondary']),
                new ButtonBuilder().setCustomId('source_spotify').setLabel('🎵 Spotify').setStyle(ButtonStyle[currentSources.includes('spotify') ? 'Success' : 'Secondary']),
                new ButtonBuilder().setCustomId('source_twitch').setLabel('📡 Twitch').setStyle(ButtonStyle[currentSources.includes('twitch') ? 'Success' : 'Secondary']),
                new ButtonBuilder().setCustomId('settings_back').setLabel('← Back').setStyle(ButtonStyle.Secondary)
            );
        
        await interaction.update({ embeds: [embed], components: [row] });
    }
    
    // Source toggle buttons
    else if (customId.startsWith('source_')) {
        const source = customId.split('_')[1];
        const currentSources = JSON.parse(settings.enabled_sources || '["youtube","soundcloud"]');
        const isEnabled = currentSources.includes(source);
        
        toggleSource(guildId, source, !isEnabled);
        
        const newSettings = getGuildSettings(guildId);
        const newSources = JSON.parse(newSettings.enabled_sources || '["youtube","soundcloud"]');
        const embed = SettingsEmbed.sourcesPanel(newSources);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('source_youtube').setLabel('📺 YouTube').setStyle(ButtonStyle[newSources.includes('youtube') ? 'Success' : 'Secondary']),
                new ButtonBuilder().setCustomId('source_soundcloud').setLabel('🎧 SoundCloud').setStyle(ButtonStyle[newSources.includes('soundcloud') ? 'Success' : 'Secondary']),
                new ButtonBuilder().setCustomId('source_spotify').setLabel('🎵 Spotify').setStyle(ButtonStyle[newSources.includes('spotify') ? 'Success' : 'Secondary']),
                new ButtonBuilder().setCustomId('source_twitch').setLabel('📡 Twitch').setStyle(ButtonStyle[newSources.includes('twitch') ? 'Success' : 'Secondary']),
                new ButtonBuilder().setCustomId('settings_back').setLabel('← Back').setStyle(ButtonStyle.Secondary)
            );
        
        await interaction.update({ embeds: [embed], components: [row] });
    }
    
    // Back button
    else if (customId === 'settings_back') {
        const mainSettings = getGuildSettings(guildId);
        const embed = SettingsEmbed.settings(mainSettings, interaction.guild);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('settings_247').setLabel('🕐 24/7').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('settings_history').setLabel('📜 History').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('settings_prefix').setLabel('🔧 Prefix').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('settings_sources').setLabel('🌐 Sources').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('settings_ignore').setLabel('🚫 Ignore').setStyle(ButtonStyle.Danger)
            );
        
        await interaction.update({ embeds: [embed], components: [row] });
    }
    
    // History button
    else if (customId === 'settings_history') {
        const history = db.prepare(`SELECT * FROM music_history WHERE guild_id = ? ORDER BY played_at DESC LIMIT 10`).all(guildId);
        
        if (!history.length) {
            const embed = SettingsEmbed.error('No History', 'No songs have been played in this server yet!');
            return interaction.update({ embeds: [embed], components: [] });
        }
        
        const embed = new EmbedBuilder()
            .setAuthor({ name: '📜 MELODY • RECENT HISTORY', iconURL: 'https://cdn.discordapp.com/attachments/xxx/history-icon.png' })
            .setTitle(`🎵 Recently Played Songs`)
            .setDescription(history.map((h, i) => `\`${i+1}.\` **${h.track_title}** \`[${ms(h.track_duration)}]\` — <@${h.user_id}>`).join('\n'))
            .setColor(0x00FFCC);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('settings_back').setLabel('← Back').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('settings_clear_history').setLabel('🗑️ Clear').setStyle(ButtonStyle.Danger)
            );
        
        await interaction.update({ embeds: [embed], components: [row] });
    }
    
    // Clear history button
    else if (customId === 'settings_clear_history') {
        const count = clearHistory(guildId);
        
        const embed = SettingsEmbed.success('History Cleared', `**${count}** songs have been removed`);
        const mainSettings = getGuildSettings(guildId);
        const mainEmbed = SettingsEmbed.settings(mainSettings, interaction.guild);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('settings_247').setLabel('🕐 24/7').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('settings_history').setLabel('📜 History').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('settings_prefix').setLabel('🔧 Prefix').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('settings_sources').setLabel('🌐 Sources').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('settings_ignore').setLabel('🚫 Ignore').setStyle(ButtonStyle.Danger)
            );
        
        await interaction.update({ embeds: [mainEmbed, embed], components: [row] });
    }
    
    // History refresh button
    else if (customId === 'settings_history_refresh') {
        const history = db.prepare(`SELECT * FROM music_history WHERE guild_id = ? ORDER BY played_at DESC LIMIT 10`).all(guildId);
        
        const embed = new EmbedBuilder()
            .setAuthor({ name: '📜 MELODY • RECENT HISTORY', iconURL: 'https://cdn.discordapp.com/attachments/xxx/history-icon.png' })
            .setTitle(`🎵 Recently Played Songs`)
            .setDescription(history.map((h, i) => `\`${i+1}.\` **${h.track_title}** \`[${ms(h.track_duration)}]\` — <@${h.user_id}>`).join('\n'))
            .setColor(0x00FFCC);
        
        await interaction.update({ embeds: [embed] });
    }
    
    // Prefix done button
    else if (customId === 'settings_prefix_done') {
        const mainSettings = getGuildSettings(guildId);
        const embed = SettingsEmbed.settings(mainSettings, interaction.guild);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('settings_247').setLabel('🕐 24/7').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('settings_history').setLabel('📜 History').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('settings_prefix').setLabel('🔧 Prefix').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('settings_sources').setLabel('🌐 Sources').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('settings_ignore').setLabel('🚫 Ignore').setStyle(ButtonStyle.Danger)
            );
        
        await interaction.update({ embeds: [embed], components: [row] });
    }
    
    // Ignore button
    else if (customId === 'settings_ignore') {
        const ignoredChannels = JSON.parse(settings.ignored_channels || '[]');
        const ignoredRoles = JSON.parse(settings.ignored_roles || '[]');
        const embed = SettingsEmbed.ignoredList(ignoredChannels, ignoredRoles, interaction.guild);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('settings_back').setLabel('← Back').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('settings_ignore_add').setLabel('➕ Add Channel/Role').setStyle(ButtonStyle.Success)
            );
        
        await interaction.update({ embeds: [embed], components: [row] });
    }
}

// ==================== CHECK IF COMMAND IS ALLOWED ====================
function isCommandAllowed(guildId, channelId, memberRoles) {
    const settings = getGuildSettings(guildId);
    
    // Check ignored channels
    const ignoredChannels = JSON.parse(settings.ignored_channels || '[]');
    if (ignoredChannels.includes(channelId)) return false;
    
    // Check ignored roles
    const ignoredRoles = JSON.parse(settings.ignored_roles || '[]');
    for (const roleId of memberRoles) {
        if (ignoredRoles.includes(roleId)) return false;
    }
    
    return true;
}

// ==================== EXPORTS ====================
module.exports = {
    settingsCommands,
    handleSettingsCommands,
    handleSettingsButtons,
    getGuildSettings,
    isCommandAllowed,
    SettingsEmbed
};