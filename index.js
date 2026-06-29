const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { LavalinkClient } = require('lavalink-client');
require('dotenv').config();

const { commands, handleGeneralCommands, handleAFKEvent, handleRemoveAFK, getPrefix } = require('./general');
const { musicCommands, handleMusicCommands, handleMusicButtons, MusicEmbed } = require('./music');
const { filterCommands, handleFilterCommands, handleFilterButtons } = require('./filters');
const { playlistCommands, handlePlaylistCommands, handlePlaylistButtons } = require('./playlist');
const { settingsCommands, handleSettingsCommands, handleSettingsButtons, isCommandAllowed, SettingsEmbed, getGuildSettings } = require('./settings');
const { favouriteCommands, handleFavouriteCommands, handleFavouriteButtons } = require('./favourite');
const { helpCommand, handleHelpCommands, handleHelpButtons } = require('./help');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

client.commands = new Collection();

// Store queue state for pagination
client.queuePages = new Map();
// Store search results for button selection
client.searchResults = new Map();

// ==================== LAVALINK SETUP (lavalink-client) ====================
client.lavalink = new LavalinkClient({
    nodes: [{
        id: 'main',
        host: process.env.LAVALINK_HOST,
        port: parseInt(process.env.LAVALINK_PORT),
        password: process.env.LAVALINK_PASSWORD,
        secure: process.env.LAVALINK_SECURE === 'true'
    }],
    sendToShard: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    },
    autoSkip: true,
    autoReconnect: true,
    reconnectInterval: 5000
});

client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} is online!`);
    console.log(`📊 Serving ${client.guilds.cache.size} servers`);
    console.log(`👥 Watching over ${client.users.cache.size} users`);
    
    // Set bot status
    client.user.setPresence({
        activities: [{
            name: `&help | ${client.guilds.cache.size} servers`,
            type: ActivityType.Listening
        }],
        status: 'online'
    });
    
    // Connect to Lavalink via lavalink-client
    try {
        await client.lavalink.init(client.user.id);
        console.log('🎵 Lavalink connected successfully!');
    } catch (error) {
        console.error('❌ Lavalink connection failed:', error);
        console.log('🔄 Trying backup node...');
        try {
            await client.lavalink.addNode({
                id: 'backup',
                host: process.env.LAVALINK_HOST2,
                port: parseInt(process.env.LAVALINK_PORT2),
                password: process.env.LAVALINK_PASSWORD2,
                secure: false
            });
            console.log('🎵 Backup Lavalink connected!');
        } catch (err) {
            console.error('❌ All Lavalink nodes failed! Music commands will not work.');
        }
    }
    
    // Register ALL slash commands
    const allCommands = [...commands, ...musicCommands, ...filterCommands, ...playlistCommands, ...settingsCommands, ...favouriteCommands, ...helpCommand];
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: allCommands });
        console.log(`✅ ${allCommands.length} slash commands registered!`);
        console.log(`   📝 General: ${commands.length} commands`);
        console.log(`   🎵 Music: ${musicCommands.length} commands`);
        console.log(`   🎛️ Filters: ${filterCommands.length} commands`);
        console.log(`   📀 Playlist: ${playlistCommands.length} commands`);
        console.log(`   ⚙️ Settings: ${settingsCommands.length} commands`);
        console.log(`   ❤️ Favourite: ${favouriteCommands.length} commands`);
        console.log(`   📚 Help: ${helpCommand.length} commands`);
    } catch (error) {
        console.error('❌ Failed to register commands:', error);
    }
});

// ==================== RAW PACKET HANDLER (Required for Lavalink) ====================
client.on('raw', (packet) => {
    client.lavalink.handleVoiceUpdate(packet);
});

// ==================== INTERACTION HANDLER ====================
client.on('interactionCreate', async interaction => {
    // Handle Slash Commands
    if (interaction.isCommand()) {
        const commandName = interaction.commandName;
        
        // Check command type
        const isMusicCommand = musicCommands.some(cmd => cmd.name === commandName);
        const isFilterCommand = filterCommands.some(cmd => cmd.name === commandName);
        const isPlaylistCommand = playlistCommands.some(cmd => cmd.name === commandName);
        const isSettingsCommand = settingsCommands.some(cmd => cmd.name === commandName);
        const isFavouriteCommand = favouriteCommands.some(cmd => cmd.name === commandName);
        const isHelpCommand = helpCommand.some(cmd => cmd.name === commandName);
        
        // Check if command is allowed (ignore system) - Skip for settings and help commands
        if (!isSettingsCommand && !isHelpCommand && interaction.guild) {
            const allowed = isCommandAllowed(interaction.guild.id, interaction.channelId, interaction.member.roles.cache.map(r => r.id));
            if (!allowed) {
                return interaction.reply({ 
                    embeds: [SettingsEmbed.error('Command Blocked', 'This channel or your role has been ignored by server administrators.')],
                    ephemeral: true
                });
            }
        }
        
        if (isHelpCommand) {
            await handleHelpCommands(interaction, client);
        } else if (isFavouriteCommand) {
            await handleFavouriteCommands(interaction, client);
        } else if (isSettingsCommand) {
            await handleSettingsCommands(interaction, client);
        } else if (isPlaylistCommand) {
            await handlePlaylistCommands(interaction, client);
        } else if (isFilterCommand) {
            await handleFilterCommands(interaction, client);
        } else if (isMusicCommand) {
            await handleMusicCommands(interaction, client);
        } else {
            await handleGeneralCommands(interaction, client);
        }
    }
    
    // Handle Button Interactions
    else if (interaction.isButton()) {
        const customId = interaction.customId;
        
        // Vote check button
        if (customId === 'check_vote') {
            const { handleGeneralCommands } = require('./general');
            const fakeInteraction = {
                ...interaction,
                commandName: 'votecheck',
                deferReply: () => interaction.deferReply({ ephemeral: true }),
                editReply: interaction.editReply.bind(interaction)
            };
            await handleGeneralCommands(fakeInteraction, client);
        }
        
        // Help buttons
        else if (customId.startsWith('help_')) {
            await handleHelpButtons(interaction, client);
        }
        
        // Music player buttons
        else if (customId.startsWith('music_') || customId.startsWith('volume_')) {
            await handleMusicButtons(interaction, client);
        }
        
        // Filter buttons
        else if (customId.startsWith('filter_')) {
            await handleFilterButtons(interaction, client);
        }
        
        // Playlist buttons
        else if (customId.startsWith('pl_')) {
            await handlePlaylistButtons(interaction, client);
        }
        
        // Settings buttons
        else if (customId.startsWith('settings_')) {
            await handleSettingsButtons(interaction, client);
        }
        
        // Favourite buttons
        else if (customId.startsWith('fav_')) {
            await handleFavouriteButtons(interaction, client);
        }
        
        // Queue pagination buttons
        else if (customId.startsWith('queue_prev_') || customId.startsWith('queue_next_')) {
            const parts = customId.split('_');
            const guildId = parts[2];
            const direction = parts[1];
            const player = client.lavalink?.players?.get(guildId);
            
            if (!player || !player.queue.length) {
                return interaction.reply({ embeds: [MusicEmbed.error('Empty Queue', 'No songs in queue!')], ephemeral: true });
            }
            
            let currentPage = client.queuePages.get(guildId) || 1;
            const itemsPerPage = 10;
            const totalPages = Math.ceil(player.queue.length / itemsPerPage);
            
            if (direction === 'prev' && currentPage > 1) currentPage--;
            if (direction === 'next' && currentPage < totalPages) currentPage++;
            
            client.queuePages.set(guildId, currentPage);
            
            const embed = MusicEmbed.queue(player.queue, player.current, currentPage, totalPages);
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId(`queue_prev_${guildId}`).setLabel('◀️ Previous').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 1),
                    new ButtonBuilder().setCustomId(`queue_next_${guildId}`).setLabel('Next ▶️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === totalPages)
                );
            
            await interaction.update({ embeds: [embed], components: [row] });
        }
        
        // Search selection buttons
        else if (customId.startsWith('search_')) {
            const parts = customId.split('_');
            const index = parseInt(parts[1]) - 1;
            const guildId = parts[2];
            const player = client.lavalink?.players?.get(guildId);
            
            if (!player) {
                return interaction.reply({ embeds: [MusicEmbed.error('Not Connected', 'Bot is not in voice channel!')], ephemeral: true });
            }
            
            // Get the stored search results
            const searchResults = client.searchResults?.get(guildId);
            if (!searchResults || !searchResults[index]) {
                return interaction.reply({ embeds: [MusicEmbed.error('Search Expired', 'Please search again using `/search`')], ephemeral: true });
            }
            
            const track = searchResults[index];
            player.queue.add(track);
            if (!player.playing) await player.play();
            
            client.searchResults.delete(guildId);
            
            const embed = MusicEmbed.success('Added to Queue', `**${track.title}** has been added to the queue!`);
            await interaction.update({ embeds: [embed], components: [] });
        }
    }
});

// ==================== PREFIX COMMAND HANDLER ====================
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    await handleAFKEvent(message);
    await handleRemoveAFK(message);
    
    const prefix = getPrefix(message.guild.id);
    if (!message.content.startsWith(prefix)) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // Helper function to create fake interaction
    const createFakeInteraction = (cmdName, options = {}) => ({
        guild: message.guild,
        channel: message.channel,
        member: message.member,
        user: message.author,
        commandName: cmdName,
        options: {
            getString: (name) => options.string || null,
            getInteger: (name) => options.integer || null,
            getUser: (name) => options.user || null,
            getBoolean: (name) => options.boolean || null,
            getRole: (name) => options.role || null,
            getChannel: (name) => options.channel || null
        },
        deferReply: () => Promise.resolve(),
        editReply: async (content) => {
            if (content.embeds) return await message.reply({ embeds: content.embeds });
            return await message.reply(content);
        },
        reply: async (content) => {
            if (content.embeds) return await message.reply({ embeds: content.embeds });
            return await message.reply(content);
        }
    });
    
    // Help command first
    if (command === 'help' || command === 'h') {
        const fakeHelp = {
            commandName: 'help',
            reply: async (content) => await message.reply(content),
            user: message.author,
            client: client,
            guild: message.guild,
            options: { getString: () => null }
        };
        await handleHelpCommands(fakeHelp, client);
        return;
    }
    
    // Music Commands
    switch(command) {
        case 'ping':
            const sent = await message.reply('🏓 Pinging...');
            await sent.edit(`🏓 Pong! \`${sent.createdTimestamp - message.createdTimestamp}ms\``);
            break;
        case 'invite':
            await message.reply(`🔗 Invite me: https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`);
            break;
        case 'support':
            await message.reply('🆘 Join our support server: https://discord.gg/melody-support');
            break;
        case 'stats':
            await message.reply('📊 Use `/stats` for detailed bot statistics!');
            break;
        
        // Music Commands
        case 'play':
        case 'p':
            if (!args.length) return message.reply('❌ Please provide a song name! Example: `&play Never Gonna Give You Up`');
            await handleMusicCommands(createFakeInteraction('play', { string: args.join(' ') }), client);
            break;
        case 'skip':
        case 's':
            await handleMusicCommands(createFakeInteraction('skip'), client);
            break;
        case 'stop':
            await handleMusicCommands(createFakeInteraction('stop'), client);
            break;
        case 'queue':
        case 'q':
            await handleMusicCommands(createFakeInteraction('queue'), client);
            break;
        case 'nowplaying':
        case 'np':
            await handleMusicCommands(createFakeInteraction('nowplaying'), client);
            break;
        case 'volume':
        case 'vol':
            if (!args.length) return message.reply('❌ Please provide a volume level! Example: `&volume 50`');
            const volume = parseInt(args[0]);
            if (isNaN(volume) || volume < 0 || volume > 100) return message.reply('❌ Volume must be between 0 and 100!');
            await handleMusicCommands(createFakeInteraction('volume', { integer: volume }), client);
            break;
        case 'pause':
            await handleMusicCommands(createFakeInteraction('pause'), client);
            break;
        case 'resume':
            await handleMusicCommands(createFakeInteraction('resume'), client);
            break;
        case 'loop':
            await handleMusicCommands(createFakeInteraction('loop', { string: args[0] || 'off' }), client);
            break;
        case 'shuffle':
            await handleMusicCommands(createFakeInteraction('shuffle'), client);
            break;
        case 'clear':
            await handleMusicCommands(createFakeInteraction('clear'), client);
            break;
        case 'join':
            await handleMusicCommands(createFakeInteraction('join'), client);
            break;
        case 'disconnect':
        case 'leave':
            await handleMusicCommands(createFakeInteraction('disconnect'), client);
            break;
        
        // Filter Commands
        case '8d':
        case 'bass':
        case 'china':
        case 'darthvader':
        case 'daycore':
        case 'doubletime':
        case 'earrape':
        case 'karaoke':
        case 'party':
        case 'pitch':
        case 'pop':
        case 'radio':
        case 'rate':
        case 'reset':
        case 'slow':
        case 'speed':
        case 'tremolo':
        case 'vaporwave':
            await handleFilterCommands(createFakeInteraction(command), client);
            break;
        case 'equalizer':
            if (!args.length) return message.reply('❌ Please provide a preset! Example: `&equalizer bass`\nAvailable: flat, boost, treble, acoustic, classical, dance, electronic, hiphop, jazz, rock, metal');
            await handleFilterCommands(createFakeInteraction('equalizer', { string: args[0] }), client);
            break;
        case 'filters':
            await handleFilterCommands(createFakeInteraction('filters'), client);
            break;
        
        // Playlist Commands
        case 'pl-create':
            if (!args.length) return message.reply('❌ Please provide a playlist name! Example: `&pl-create My Playlist`');
            await handlePlaylistCommands(createFakeInteraction('pl-create', { string: args.join(' ') }), client);
            break;
        case 'pl-delete':
        case 'pl-remove':
            if (!args.length) return message.reply('❌ Please provide a playlist name or ID!');
            await handlePlaylistCommands(createFakeInteraction('pl-delete', { string: args[0] }), client);
            break;
        case 'pl-add':
            if (!args.length) return message.reply('❌ Please provide a playlist name or ID!');
            await handlePlaylistCommands(createFakeInteraction('pl-add', { string: args[0] }), client);
            break;
        case 'pl-addnowplaying':
            if (!args.length) return message.reply('❌ Please provide a playlist name or ID!');
            await handlePlaylistCommands(createFakeInteraction('pl-addnowplaying', { string: args[0] }), client);
            break;
        case 'pl-addqueue':
            if (!args.length) return message.reply('❌ Please provide a playlist name or ID!');
            await handlePlaylistCommands(createFakeInteraction('pl-addqueue', { string: args[0] }), client);
            break;
        case 'pl-removetrack':
            if (args.length < 2) return message.reply('❌ Please provide playlist name/ID and track position! Example: `&pl-removetrack MyPlaylist 3`');
            await handlePlaylistCommands(createFakeInteraction('pl-removetrack', { string: args[0], integer: parseInt(args[1]) }), client);
            break;
        case 'pl-load':
            if (!args.length) return message.reply('❌ Please provide a playlist name or ID!');
            await handlePlaylistCommands(createFakeInteraction('pl-load', { string: args[0] }), client);
            break;
        case 'pl-list':
            await handlePlaylistCommands(createFakeInteraction('pl-list'), client);
            break;
        case 'pl-info':
            if (!args.length) return message.reply('❌ Please provide a playlist name or ID!');
            await handlePlaylistCommands(createFakeInteraction('pl-info', { string: args[0] }), client);
            break;
        case 'pl-dupes':
            if (!args.length) return message.reply('❌ Please provide a playlist name or ID!');
            await handlePlaylistCommands(createFakeInteraction('pl-dupes', { string: args[0] }), client);
            break;
        case 'playlist':
        case 'pl-search':
            await handlePlaylistCommands(createFakeInteraction('playlist', { string: args.join(' ') || null }), client);
            break;
        
        // Settings Commands
        case 'settings':
            await handleSettingsCommands(createFakeInteraction('settings'), client);
            break;
        case '247':
            await handleSettingsCommands(createFakeInteraction('247'), client);
            break;
        case 'djrole':
            const role = message.mentions.roles.first();
            await handleSettingsCommands(createFakeInteraction('djrole', { role: role || null }), client);
            break;
        case 'history':
            const limit = parseInt(args[0]) || 10;
            await handleSettingsCommands(createFakeInteraction('history', { integer: limit }), client);
            break;
        case 'clearhistory':
            await handleSettingsCommands(createFakeInteraction('clearhistory'), client);
            break;
        case 'prefix':
            if (!args.length) return message.reply('❌ Please provide a new prefix! Example: `&prefix !`');
            await handleSettingsCommands(createFakeInteraction('prefix', { string: args[0] }), client);
            break;
        case 'ignore':
            if (args.length < 1) return message.reply('❌ Please specify channel, role, list, or remove');
            if (args[0] === 'channel') {
                const channel = message.mentions.channels.first();
                if (!channel) return message.reply('❌ Please mention a channel to ignore');
                await handleSettingsCommands(createFakeInteraction('ignore', { subcommand: 'channel', channel: channel }), client);
            } else if (args[0] === 'role') {
                const role = message.mentions.roles.first();
                if (!role) return message.reply('❌ Please mention a role to ignore');
                await handleSettingsCommands(createFakeInteraction('ignore', { subcommand: 'role', role: role }), client);
            } else if (args[0] === 'list') {
                await handleSettingsCommands(createFakeInteraction('ignore', { subcommand: 'list' }), client);
            } else if (args[0] === 'remove') {
                if (args.length < 3) return message.reply('❌ Usage: `&ignore remove channel <id>` or `&ignore remove role <id>`');
                await handleSettingsCommands(createFakeInteraction('ignore', { subcommand: 'remove', string: args[1], string2: args[2] }), client);
            }
            break;
        case 'togglesource':
            if (!args.length) return message.reply('❌ Please provide a source! Example: `&togglesource youtube`\nAvailable: youtube, soundcloud, spotify, twitch');
            await handleSettingsCommands(createFakeInteraction('togglesource', { string: args[0] }), client);
            break;
        
        // Favourite Commands
        case 'like':
            await handleFavouriteCommands(createFakeInteraction('like'), client);
            break;
        case 'unlike':
            if (!args.length) return message.reply('❌ Please provide a song name or position number! Example: `&unlike 1` or `&unlike Song Name`');
            await handleFavouriteCommands(createFakeInteraction('unlike', { string: args.join(' ') }), client);
            break;
        case 'showliked':
        case 'liked':
            await handleFavouriteCommands(createFakeInteraction('showliked'), client);
            break;
        case 'playliked':
            await handleFavouriteCommands(createFakeInteraction('playliked'), client);
            break;
        case 'clearlikes':
            await handleFavouriteCommands(createFakeInteraction('clearlikes', { boolean: false }), client);
            break;
        case 'profile':
            const targetUser = message.mentions.users.first() || message.author;
            await handleFavouriteCommands(createFakeInteraction('profile', { user: targetUser }), client);
            break;
        case 'bio':
            const bioTarget = message.mentions.users.first() || message.author;
            await handleFavouriteCommands(createFakeInteraction('bio', { user: bioTarget }), client);
            break;
        case 'bioset':
            if (!args.length) return message.reply('❌ Please provide a bio! Example: `&bioset I love music!`');
            await handleFavouriteCommands(createFakeInteraction('bioset', { string: args.join(' ') }), client);
            break;
        case 'bioreset':
            await handleFavouriteCommands(createFakeInteraction('bioreset'), client);
            break;
        case 'bioshow':
            await handleFavouriteCommands(createFakeInteraction('bioshow'), client);
            break;
        
        default:
            if (command) {
                await message.reply(`❌ Unknown command! Use \`${prefix}help\` or \`/help\` for available commands.`);
            }
    }
});

// ==================== VOICE STATE UPDATE HANDLER (For 24/7) ====================
client.on('voiceStateUpdate', async (oldState, newState) => {
    // Check if bot is disconnected from voice channel
    if (oldState.member.id === client.user.id) {
        if (!newState.channelId) {
            const player = client.lavalink?.players?.get(oldState.guild.id);
            if (player) {
                // Check if 24/7 mode is enabled
                const settings = getGuildSettings(oldState.guild.id);
                if (!settings?.twenty_four_seven) {
                    await player.destroy();
                    console.log(`🔇 Left voice channel in ${oldState.guild.name} (24/7 disabled)`);
                }
            }
        }
    }
});

// ==================== ERROR HANDLER ====================
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
});

client.login(process.env.TOKEN);