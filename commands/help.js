const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const os = require('os');
const ms = require('ms');

// ==================== PREMIUM EMBED DESIGN ====================
class HelpEmbed {
    static main(client, totalCommands) {
        return new EmbedBuilder()
            .setAuthor({ name: '🎵 MELODY • PREMIUM MUSIC BOT', iconURL: 'https://cdn.discordapp.com/attachments/xxx/melody-logo.png' })
            .setTitle('✨ **WELCOME TO MELODY** ✨')
            .setDescription('> *The most powerful music bot on Discord*\n> **Your ultimate music experience starts here!**')
            .addFields(
                { name: '📊 **Bot Statistics**', value: '```yaml\n' +
                    `Servers: ${client.guilds.cache.size}\n` +
                    `Users: ${client.users.cache.size}\n` +
                    `Commands: ${totalCommands}\n` +
                    `Uptime: ${ms(client.uptime)}\n` +
                    `Latency: ${Math.round(client.ws.ping)}ms` +
                    '```', inline: true },
                { name: '🎵 **Features**', value: '```yaml\n' +
                    '• 24/7 Music Streaming\n' +
                    '• 20+ Audio Filters\n' +
                    '• Advanced Playlist System\n' +
                    '• DJ Role Management\n' +
                    '• Auto-play & Queue\n' +
                    '• Spotify Support\n' +
                    '• YouTube Playlists\n' +
                    '• Voice Recording\n' +
                    '• And much more!```', inline: true },
                { name: '🔗 **Quick Links**', value: '> [📥 Invite Bot](https://discord.com/oauth2/authorize?client_id=' + client.user.id + '&permissions=8&scope=bot%20applications.commands)\n> [🆘 Support Server](https://discord.gg/melody)\n> [🗳️ Vote on Top.gg](https://top.gg/bot/' + client.user.id + ')\n> [📚 Documentation](https://docs.melodybot.com)', inline: false }
            )
            .setColor(0x00FF00)
            .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))
            .setImage('https://i.imgur.com/help-banner.gif')
            .setFooter({ text: 'Use the buttons below to explore commands • Melody Premium', iconURL: client.user.displayAvatarURL() });
    }

    static category(name, description, commands, color, icon) {
        const commandsPerRow = 3;
        const rows = [];
        
        for (let i = 0; i < commands.length; i += commandsPerRow) {
            const row = commands.slice(i, i + commandsPerRow).map(cmd => 
                `\`/${cmd}\``
            ).join(' • ');
            rows.push(row);
        }
        
        return new EmbedBuilder()
            .setAuthor({ name: `${icon} MELODY • ${name.toUpperCase()} COMMANDS`, iconURL: 'https://cdn.discordapp.com/attachments/xxx/commands-icon.png' })
            .setTitle(`${icon} **${name} Commands**`)
            .setDescription(description)
            .addFields(
                { name: '📜 **Available Commands**', value: rows.map(row => `> ${row}`).join('\n'), inline: false },
                { name: '📊 **Total Commands**', value: `\`${commands.length}\` commands`, inline: true },
                { name: '💡 **Tip**', value: 'Use `/help` to go back to main menu', inline: true }
            )
            .setColor(color)
            .setTimestamp()
            .setFooter({ text: 'Melody • Premium Music Bot', iconURL: 'https://cdn.discordapp.com/attachments/xxx/footer.png' });
    }

    static commandInfo(command, description, usage, examples, aliases = [], permissions = []) {
        const embed = new EmbedBuilder()
            .setAuthor({ name: '📖 MELODY • COMMAND INFORMATION', iconURL: 'https://cdn.discordapp.com/attachments/xxx/info-icon.png' })
            .setTitle(`✨ /${command}`)
            .setDescription(description)
            .addFields(
                { name: '📝 **Usage**', value: `\`/${command} ${usage}\``, inline: false },
                { name: '📌 **Examples**', value: examples.map(ex => `\`/${command} ${ex}\``).join('\n'), inline: false }
            )
            .setColor(0x9B59B6)
            .setTimestamp();
        
        if (aliases.length) {
            embed.addFields({ name: '🔀 **Aliases**', value: aliases.map(a => `\`&${a}\``).join(', '), inline: true });
        }
        
        if (permissions.length) {
            embed.addFields({ name: '🔒 **Required Permissions**', value: permissions.map(p => `\`${p}\``).join(', '), inline: true });
        }
        
        embed.addFields({ name: '💡 **Pro Tip**', value: 'Use the buttons below to explore more commands!', inline: false });
        
        return embed;
    }

    static async search(query, allCommands, client) {
        const results = allCommands.filter(cmd => 
            cmd.name.toLowerCase().includes(query.toLowerCase()) ||
            cmd.description.toLowerCase().includes(query.toLowerCase())
        );
        
        if (!results.length) {
            return new EmbedBuilder()
                .setTitle('🔍 No Results Found')
                .setDescription(`No commands found for **${query}**`)
                .setColor(0xFF3366);
        }
        
        return new EmbedBuilder()
            .setAuthor({ name: '🔍 MELODY • COMMAND SEARCH', iconURL: 'https://cdn.discordapp.com/attachments/xxx/search-icon.png' })
            .setTitle(`Search Results for: **${query}**`)
            .setDescription(results.map(cmd => `\`/${cmd.name}\` - ${cmd.description}`).join('\n'))
            .addFields(
                { name: '📊 Results Found', value: `\`${results.length}\` commands`, inline: true },
                { name: '💡 Tip', value: 'Click on any command button to see details', inline: true }
            )
            .setColor(0x00FFCC);
    }

    static loading() {
        return new EmbedBuilder()
            .setTitle('⏳ **Loading Commands...**')
            .setDescription('> Please wait while we fetch all available commands')
            .setColor(0xF1C40F)
            .setTimestamp();
    }
}

// ==================== COMMAND DATA ====================
const commandCategories = {
    general: {
        name: 'General',
        description: '> *Basic utility and information commands*',
        icon: '🎮',
        color: 0x00FF00,
        commands: [
            { name: 'afk', description: 'Set AFK status', usage: '[reason]', example: 'afk Lunch break' },
            { name: 'avatar', description: 'Get user avatar in HD', usage: '[user]', example: 'avatar @user' },
            { name: 'banner', description: 'Get user banner', usage: '[user]', example: 'banner @user' },
            { name: 'help', description: 'Show all commands', usage: '[category]', example: 'help music' },
            { name: 'invite', description: 'Invite bot to server', usage: '', example: 'invite' },
            { name: 'ping', description: 'Check bot latency', usage: '', example: 'ping' },
            { name: 'stats', description: 'Bot statistics', usage: '', example: 'stats' },
            { name: 'support', description: 'Get support link', usage: '', example: 'support' },
            { name: 'uptime', description: 'Bot uptime', usage: '', example: 'uptime' },
            { name: 'vote', description: 'Vote for bot', usage: '', example: 'vote' },
            { name: 'profile', description: 'View user profile', usage: '[user]', example: 'profile @user' },
            { name: 'suggest', description: 'Suggest a feature', usage: '<suggestion>', example: 'suggest Add Spotify support' },
            { name: 'report', description: 'Report a user', usage: '<user> <reason>', example: 'report @user Spam' }
        ]
    },
    music: {
        name: 'Music',
        description: '> *Play, control, and manage your music*',
        icon: '🎵',
        color: 0xFF00FF,
        commands: [
            { name: 'play', description: 'Play a song', usage: '<song name/url>', example: 'play Never Gonna Give You Up' },
            { name: 'skip', description: 'Skip current song', usage: '', example: 'skip' },
            { name: 'stop', description: 'Stop playback', usage: '', example: 'stop' },
            { name: 'pause', description: 'Pause music', usage: '', example: 'pause' },
            { name: 'resume', description: 'Resume music', usage: '', example: 'resume' },
            { name: 'queue', description: 'Show queue', usage: '[page]', example: 'queue 2' },
            { name: 'clear', description: 'Clear queue', usage: '', example: 'clear' },
            { name: 'loop', description: 'Toggle loop', usage: '[off/song/queue]', example: 'loop song' },
            { name: 'volume', description: 'Set volume', usage: '<0-100>', example: 'volume 50' },
            { name: 'shuffle', description: 'Shuffle queue', usage: '', example: 'shuffle' },
            { name: 'nowplaying', description: 'Current song', usage: '', example: 'nowplaying' },
            { name: 'seek', description: 'Seek position', usage: '<time>', example: 'seek 1:30' },
            { name: 'replay', description: 'Replay song', usage: '', example: 'replay' },
            { name: 'join', description: 'Join voice', usage: '', example: 'join' },
            { name: 'disconnect', description: 'Leave voice', usage: '', example: 'disconnect' },
            { name: 'autoplay', description: 'Toggle autoplay', usage: '', example: 'autoplay' },
            { name: 'search', description: 'Search songs', usage: '<query>', example: 'search Bohemian Rhapsody' },
            { name: 'grab', description: 'Save current song', usage: '', example: 'grab' },
            { name: 'saved', description: 'Show saved songs', usage: '[page]', example: 'saved' }
        ]
    },
    filters: {
        name: 'Filters',
        description: '> *Apply cool audio effects to your music*',
        icon: '🎛️',
        color: 0x9B59B6,
        commands: [
            { name: '8d', description: '8D surround sound', usage: '', example: '8d' },
            { name: 'bass', description: 'Bass boost', usage: '', example: 'bass' },
            { name: 'china', description: 'Chinese effect', usage: '', example: 'china' },
            { name: 'darthvader', description: 'Darth Vader voice', usage: '', example: 'darthvader' },
            { name: 'daycore', description: 'Daycore effect', usage: '', example: 'daycore' },
            { name: 'doubletime', description: '2x speed', usage: '', example: 'doubletime' },
            { name: 'earrape', description: 'Maximum volume', usage: '', example: 'earrape' },
            { name: 'karaoke', description: 'Vocal removal', usage: '', example: 'karaoke' },
            { name: 'party', description: 'Party effect', usage: '', example: 'party' },
            { name: 'pitch', description: 'Pitch shift', usage: '', example: 'pitch' },
            { name: 'pop', description: 'Pop EQ', usage: '', example: 'pop' },
            { name: 'radio', description: 'Radio effect', usage: '', example: 'radio' },
            { name: 'rate', description: 'Vinyl effect', usage: '', example: 'rate' },
            { name: 'reset', description: 'Reset all filters', usage: '', example: 'reset' },
            { name: 'slow', description: 'Slow motion', usage: '', example: 'slow' },
            { name: 'speed', description: 'Speed up', usage: '', example: 'speed' },
            { name: 'tremolo', description: 'Tremolo effect', usage: '', example: 'tremolo' },
            { name: 'vaporwave', description: 'Vaporwave effect', usage: '', example: 'vaporwave' },
            { name: 'equalizer', description: 'Custom EQ', usage: '<preset>', example: 'equalizer bass' },
            { name: 'filters', description: 'Show all filters', usage: '', example: 'filters' }
        ]
    },
    playlist: {
        name: 'Playlist',
        description: '> *Create and manage your own playlists*',
        icon: '📀',
        color: 0x3498DB,
        commands: [
            { name: 'pl-create', description: 'Create playlist', usage: '<name> [description]', example: 'pl-create My Favourites' },
            { name: 'pl-delete', description: 'Delete playlist', usage: '<name/id>', example: 'pl-delete My Favourites' },
            { name: 'pl-add', description: 'Add current song', usage: '<playlist>', example: 'pl-add Favourites' },
            { name: 'pl-addqueue', description: 'Add queue to playlist', usage: '<playlist>', example: 'pl-addqueue Favourites' },
            { name: 'pl-removetrack', description: 'Remove track', usage: '<playlist> <position>', example: 'pl-removetrack Favourites 3' },
            { name: 'pl-load', description: 'Load playlist', usage: '<playlist>', example: 'pl-load Favourites' },
            { name: 'pl-list', description: 'List playlists', usage: '[page]', example: 'pl-list' },
            { name: 'pl-info', description: 'Playlist info', usage: '<playlist>', example: 'pl-info Favourites' },
            { name: 'pl-dupes', description: 'Find duplicates', usage: '<playlist>', example: 'pl-dupes Favourites' },
            { name: 'playlist', description: 'Search playlists', usage: '[query]', example: 'playlist rock' }
        ]
    },
    settings: {
        name: 'Settings',
        description: '> *Configure the bot for your server*',
        icon: '⚙️',
        color: 0xE67E22,
        commands: [
            { name: 'settings', description: 'View all settings', usage: '', example: 'settings' },
            { name: '247', description: 'Toggle 24/7 mode', usage: '', example: '247' },
            { name: 'djrole', description: 'Set DJ role', usage: '[role]', example: 'djrole @DJ' },
            { name: 'history', description: 'View music history', usage: '[limit]', example: 'history 10' },
            { name: 'clearhistory', description: 'Clear history', usage: '', example: 'clearhistory' },
            { name: 'prefix', description: 'Change prefix', usage: '<prefix>', example: 'prefix !' },
            { name: 'ignore', description: 'Ignore channel/role', usage: '<channel/role/list/remove>', example: 'ignore channel #general' },
            { name: 'togglesource', description: 'Toggle music source', usage: '<source>', example: 'togglesource spotify' }
        ]
    },
    favourite: {
        name: 'Favourite',
        description: '> *Save and manage your favourite songs*',
        icon: '❤️',
        color: 0xFF69B4,
        commands: [
            { name: 'like', description: 'Like current song', usage: '', example: 'like' },
            { name: 'unlike', description: 'Unlike a song', usage: '<query>', example: 'unlike 1' },
            { name: 'showliked', description: 'Show liked songs', usage: '[page]', example: 'showliked' },
            { name: 'playliked', description: 'Play liked songs', usage: '', example: 'playliked' },
            { name: 'clearlikes', description: 'Clear all likes', usage: '', example: 'clearlikes' },
            { name: 'profile', description: 'View profile', usage: '[user]', example: 'profile @user' },
            { name: 'bio', description: 'View bio', usage: '[user]', example: 'bio @user' },
            { name: 'bioset', description: 'Set your bio', usage: '<bio>', example: 'bioset I love music!' },
            { name: 'bioreset', description: 'Reset bio', usage: '', example: 'bioreset' }
        ]
    }
};

// ==================== BUTTONS ====================
function getMainButtons() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('help_general').setLabel('🎮 General').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('help_music').setLabel('🎵 Music').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('help_filters').setLabel('🎛️ Filters').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('help_playlist').setLabel('📀 Playlist').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('help_settings').setLabel('⚙️ Settings').setStyle(ButtonStyle.Secondary)
        );
}

function getSecondRowButtons() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('help_favourite').setLabel('❤️ Favourite').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('help_all').setLabel('📋 All Commands').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('help_stats').setLabel('📊 Bot Stats').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('help_invite').setLabel('🔗 Invite').setStyle(ButtonStyle.Link).setURL('https://discord.com/oauth2/authorize?client_id=YOUR_BOT_ID&permissions=8&scope=bot%20applications.commands')
        );
}

function getBackButton() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('help_back').setLabel('◀️ Back to Main Menu').setStyle(ButtonStyle.Secondary)
        );
}

// ==================== HELP COMMAND HANDLER ====================
async function handleHelpCommands(interaction, client, allCommandsList) {
    const commandName = interaction.commandName;
    const category = interaction.options?.getString('category');
    
    // Get all commands from categories
    const allCommands = [];
    for (const cat of Object.values(commandCategories)) {
        allCommands.push(...cat.commands);
    }
    const totalCommands = allCommands.length;
    
    // Main help command
    if (commandName === 'help' && !category) {
        const embed = HelpEmbed.main(client, totalCommands);
        const row1 = getMainButtons();
        const row2 = getSecondRowButtons();
        
        await interaction.reply({ embeds: [embed], components: [row1, row2] });
        return;
    }
    
    // Category help
    if (category && commandCategories[category]) {
        const cat = commandCategories[category];
        const commandsList = cat.commands.map(c => c.name);
        const embed = HelpEmbed.category(cat.name, cat.description, commandsList, cat.color, cat.icon);
        const backButton = getBackButton();
        
        await interaction.reply({ embeds: [embed], components: [backButton] });
        return;
    }
}

// ==================== BUTTON HANDLER ====================
async function handleHelpButtons(interaction, client) {
    const customId = interaction.customId;
    
    if (customId === 'help_back') {
        const totalCommands = Object.values(commandCategories).reduce((acc, cat) => acc + cat.commands.length, 0);
        const embed = HelpEmbed.main(client, totalCommands);
        const row1 = getMainButtons();
        const row2 = getSecondRowButtons();
        
        await interaction.update({ embeds: [embed], components: [row1, row2] });
        return;
    }
    
    // Handle category buttons
    for (const [key, cat] of Object.entries(commandCategories)) {
        if (customId === `help_${key}`) {
            const commandsList = cat.commands.map(c => c.name);
            const embed = HelpEmbed.category(cat.name, cat.description, commandsList, cat.color, cat.icon);
            const backButton = getBackButton();
            
            await interaction.update({ embeds: [embed], components: [backButton] });
            return;
        }
    }
    
    if (customId === 'help_all') {
        const allCommandsList = [];
        for (const cat of Object.values(commandCategories)) {
            allCommandsList.push(`**${cat.icon} ${cat.name}**`);
            allCommandsList.push(...cat.commands.map(c => `\`/${c.name}\` - ${c.description}`));
            allCommandsList.push('');
        }
        
        const embed = new EmbedBuilder()
            .setAuthor({ name: '📋 MELODY • ALL COMMANDS', iconURL: 'https://cdn.discordapp.com/attachments/xxx/all-commands.png' })
            .setTitle('🎵 **Complete Command List**')
            .setDescription(allCommandsList.join('\n').slice(0, 4000))
            .addFields(
                { name: '📊 Total Commands', value: `\`${Object.values(commandCategories).reduce((acc, cat) => acc + cat.commands.length, 0)}\` commands`, inline: true },
                { name: '💡 Tip', value: 'Use `/help <category>` for detailed info', inline: true }
            )
            .setColor(0x00FFCC)
            .setFooter({ text: 'Melody • Premium Music Bot' });
        
        const backButton = getBackButton();
        await interaction.update({ embeds: [embed], components: [backButton] });
        return;
    }
    
    if (customId === 'help_stats') {
        const totalCommands = Object.values(commandCategories).reduce((acc, cat) => acc + cat.commands.length, 0);
        const embed = new EmbedBuilder()
            .setAuthor({ name: '📊 MELODY • BOT STATISTICS', iconURL: 'https://cdn.discordapp.com/attachments/xxx/stats-icon.png' })
            .setTitle('📈 **Bot Statistics**')
            .addFields(
                { name: '🤖 **Bot Info**', value: '```yaml\n' +
                    `Name: ${client.user.tag}\n` +
                    `Servers: ${client.guilds.cache.size}\n` +
                    `Users: ${client.users.cache.size}\n` +
                    `Uptime: ${ms(client.uptime)}\n` +
                    `Latency: ${Math.round(client.ws.ping)}ms` +
                    '```', inline: true },
                { name: '📚 **Commands**', value: '```yaml\n' +
                    `General: ${commandCategories.general.commands.length}\n` +
                    `Music: ${commandCategories.music.commands.length}\n` +
                    `Filters: ${commandCategories.filters.commands.length}\n` +
                    `Playlist: ${commandCategories.playlist.commands.length}\n` +
                    `Settings: ${commandCategories.settings.commands.length}\n` +
                    `Favourite: ${commandCategories.favourite.commands.length}\n` +
                    `Total: ${totalCommands}` +
                    '```', inline: true }
            )
            .setColor(0x00FF00)
            .setThumbnail(client.user.displayAvatarURL())
            .setTimestamp();
        
        const backButton = getBackButton();
        await interaction.update({ embeds: [embed], components: [backButton] });
        return;
    }
}

// ==================== SLASH COMMAND REGISTRATION ====================
const helpCommand = [
    new SlashCommandBuilder().setName('help').setDescription('📚 Show all bot commands')
        .addStringOption(opt => opt.setName('category').setDescription('Command category').setRequired(false)
            .addChoices(
                { name: '🎮 General', value: 'general' },
                { name: '🎵 Music', value: 'music' },
                { name: '🎛️ Filters', value: 'filters' },
                { name: '📀 Playlist', value: 'playlist' },
                { name: '⚙️ Settings', value: 'settings' },
                { name: '❤️ Favourite', value: 'favourite' }
            ))
];

// ==================== EXPORTS ====================
module.exports = {
    helpCommand,
    handleHelpCommands,
    handleHelpButtons,
    HelpEmbed,
    commandCategories
};