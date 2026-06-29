const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const sqlite3 = require('better-sqlite3');
const ms = require('ms');
require('dotenv').config();

// ==================== DATABASE SETUP ====================
const db = new sqlite3(process.env.DB_PATH || 'melody.db');

// Create music-related tables if not exists
db.exec(`
    CREATE TABLE IF NOT EXISTS music_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT,
        user_id TEXT,
        track_title TEXT,
        track_url TEXT,
        track_duration INTEGER,
        played_at INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS saved_tracks (
        user_id TEXT,
        track_title TEXT,
        track_url TEXT,
        track_duration INTEGER,
        saved_at INTEGER,
        PRIMARY KEY (user_id, track_url)
    );
    
    CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        twenty_four_seven INTEGER DEFAULT 0,
        dj_role_id TEXT,
        default_volume INTEGER DEFAULT 50,
        autoplay INTEGER DEFAULT 0,
        history_enabled INTEGER DEFAULT 1
    );
`);

// ==================== PREMIUM EMBED DESIGN ====================
class MusicEmbed {
    static nowPlaying(track, queueLength, volume, loop, autoplay) {
        const progressBar = this.createProgressBar(track.duration, track.position || 0);
        
        return new EmbedBuilder()
            .setAuthor({ name: '🎵 MELODY • MUSIC PLAYER', iconURL: 'https://cdn.discordapp.com/attachments/xxx/music-icon.png' })
            .setTitle('🎶 **NOW PLAYING**')
            .setDescription(`> [**${track.title}**](${track.uri})`)
            .setThumbnail(track.thumbnail || 'https://i.imgur.com/music-thumb.png')
            .addFields(
                { name: '⏱️ Duration', value: `\`${ms(track.duration)}\``, inline: true },
                { name: '🔊 Volume', value: `\`${volume}%\``, inline: true },
                { name: '🔄 Loop', value: loop ? '`ON`' : '`OFF`', inline: true },
                { name: '🎲 Autoplay', value: autoplay ? '`ON`' : '`OFF`', inline: true },
                { name: '📊 Progress', value: progressBar, inline: false },
                { name: '📜 Queue Left', value: `\`${queueLength}\` songs`, inline: true },
                { name: '👤 Requested by', value: `<@${track.requester}>`, inline: true }
            )
            .setColor(0xFF00FF)
            .setImage('https://i.imgur.com/audio-wave.gif')
            .setTimestamp()
            .setFooter({ text: '🎧 Enjoy the music • Melody Premium' });
    }

    static queue(tracks, currentTrack, page = 1, totalPages) {
        const queueList = tracks.slice((page-1)*10, page*10)
            .map((t, i) => `\`${(page-1)*10 + i + 1}.\` **${t.title}** \`[${ms(t.duration)}]\` — <@${t.requester}>`)
            .join('\n');
        
        const totalDuration = tracks.reduce((acc, t) => acc + t.duration, 0);
        
        return new EmbedBuilder()
            .setAuthor({ name: '📜 MELODY • MUSIC QUEUE', iconURL: 'https://cdn.discordapp.com/attachments/xxx/queue-icon.png' })
            .setTitle('🎶 **CURRENT QUEUE**')
            .setDescription(queueList || '*Queue is empty*')
            .addFields(
                { name: '🎵 Now Playing', value: `**${currentTrack?.title || 'Nothing'}**`, inline: false },
                { name: '📊 Total Songs', value: `\`${tracks.length}\` tracks`, inline: true },
                { name: '⏱️ Total Duration', value: `\`${ms(totalDuration)}\``, inline: true },
                { name: '📄 Page', value: `\`${page}/${totalPages}\``, inline: true }
            )
            .setColor(0x9B59B6)
            .setFooter({ text: 'Use /remove to remove songs from queue' });
    }

    static playlist(playlist, tracks, page = 1, totalPages) {
        const playlistList = tracks.slice((page-1)*10, page*10)
            .map((t, i) => `\`${(page-1)*10 + i + 1}.\` **${t.title}** \`[${ms(t.duration)}]\``)
            .join('\n');
        
        const totalDuration = tracks.reduce((acc, t) => acc + t.duration, 0);
        
        return new EmbedBuilder()
            .setAuthor({ name: '📀 MELODY • PLAYLIST', iconURL: 'https://cdn.discordapp.com/attachments/xxx/playlist-icon.png' })
            .setTitle(`🎵 **${playlist.name}**`)
            .setDescription(playlistList || '*Playlist is empty*')
            .addFields(
                { name: '👤 Created by', value: `<@${playlist.owner}>`, inline: true },
                { name: '📊 Total Tracks', value: `\`${tracks.length}\` tracks`, inline: true },
                { name: '⏱️ Total Duration', value: `\`${ms(totalDuration)}\``, inline: true }
            )
            .setColor(0x3498DB);
    }

    static search(results, query) {
        const searchList = results.map((t, i) => 
            `\`${i+1}.\` **${t.title}** \`[${ms(t.duration)}]\`\n> 👤 ${t.author}`
        ).join('\n\n');
        
        return new EmbedBuilder()
            .setAuthor({ name: '🔍 MELODY • SEARCH RESULTS', iconURL: 'https://cdn.discordapp.com/attachments/xxx/search-icon.png' })
            .setTitle(`Results for: **${query}**`)
            .setDescription(searchList || '*No results found*')
            .setColor(0x00FFCC)
            .setFooter({ text: 'Reply with the number (1-5) to select a song' });
    }

    static trackInfo(track) {
        return new EmbedBuilder()
            .setAuthor({ name: '🎵 MELODY • TRACK INFORMATION', iconURL: 'https://cdn.discordapp.com/attachments/xxx/track-icon.png' })
            .setTitle(`**${track.title}**`)
            .setThumbnail(track.thumbnail || 'https://i.imgur.com/music-thumb.png')
            .addFields(
                { name: '👤 Artist', value: track.author || 'Unknown', inline: true },
                { name: '⏱️ Duration', value: `\`${ms(track.duration)}\``, inline: true },
                { name: '🔗 Source', value: `[Click to Play](${track.uri})`, inline: true },
                { name: '📅 Uploaded', value: track.uploadDate || 'Unknown', inline: true },
                { name: '👀 Views', value: track.views ? track.views.toLocaleString() : 'Unknown', inline: true },
                { name: '👍 Likes', value: track.likes ? track.likes.toLocaleString() : 'Unknown', inline: true }
            )
            .setColor(0xFF69B4)
            .setTimestamp();
    }

    static createProgressBar(duration, current) {
        const percent = (current / duration) * 100;
        const filledBars = Math.floor(percent / 10);
        const emptyBars = 10 - filledBars;
        const timeCurrent = ms(current);
        const timeTotal = ms(duration);
        return `🔊 \`${timeCurrent}\` ${'🟣'.repeat(filledBars)}${'⚪'.repeat(emptyBars)} \`${timeTotal}\``;
    }

    static controlPanel(playerState) {
        const { playing, paused, loop, volume, autoplay } = playerState;
        
        return new EmbedBuilder()
            .setAuthor({ name: '🎮 MELODY • MUSIC CONTROLS', iconURL: 'https://cdn.discordapp.com/attachments/xxx/controls-icon.png' })
            .setTitle('🎛️ **PLAYER CONTROLS**')
            .setDescription('> *Use the buttons below to control the music player*')
            .addFields(
                { name: '▶️ Status', value: paused ? '`⏸️ Paused`' : '`▶️ Playing`', inline: true },
                { name: '🔄 Loop', value: loop ? '`✅ Enabled`' : '`❌ Disabled`', inline: true },
                { name: '🔊 Volume', value: `\`${volume}%\``, inline: true },
                { name: '🎲 Autoplay', value: autoplay ? '`✅ Enabled`' : '`❌ Disabled`', inline: true }
            )
            .setColor(0x00FF88)
            .setTimestamp();
    }
}

// ==================== BUTTONS ====================
function getMusicButtons(guildId) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId(`music_pause_${guildId}`).setLabel('⏸️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`music_resume_${guildId}`).setLabel('▶️').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`music_skip_${guildId}`).setLabel('⏭️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`music_stop_${guildId}`).setLabel('⏹️').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`music_loop_${guildId}`).setLabel('🔄').setStyle(ButtonStyle.Secondary)
        );
}

function getVolumeButtons(guildId) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId(`volume_down_${guildId}`).setLabel('🔉 -10').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`volume_mute_${guildId}`).setLabel('🔇 Mute').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`volume_up_${guildId}`).setLabel('🔊 +10').setStyle(ButtonStyle.Success)
        );
}

// ==================== COMMANDS REGISTRATION ====================
const musicCommands = [
    new SlashCommandBuilder().setName('play').setDescription('🎵 Play a song from YouTube')
        .addStringOption(opt => opt.setName('song').setDescription('Song name or URL').setRequired(true)),
    
    new SlashCommandBuilder().setName('skip').setDescription('⏭️ Skip the current song'),
    
    new SlashCommandBuilder().setName('forceskip').setDescription('⏭️ Force skip the current song (admin only)'),
    
    new SlashCommandBuilder().setName('stop').setDescription('⏹️ Stop playback and clear queue'),
    
    new SlashCommandBuilder().setName('pause').setDescription('⏸️ Pause the current song'),
    
    new SlashCommandBuilder().setName('resume').setDescription('▶️ Resume the paused song'),
    
    new SlashCommandBuilder().setName('queue').setDescription('📜 Show the current music queue')
        .addIntegerOption(opt => opt.setName('page').setDescription('Page number').setRequired(false)),
    
    new SlashCommandBuilder().setName('clear').setDescription('🗑️ Clear the entire queue'),
    
    new SlashCommandBuilder().setName('remove').setDescription('❌ Remove a specific song from queue')
        .addIntegerOption(opt => opt.setName('position').setDescription('Song position in queue').setRequired(true)),
    
    new SlashCommandBuilder().setName('loop').setDescription('🔄 Toggle loop mode (off/song/queue)')
        .addStringOption(opt => opt.setName('mode').setDescription('Loop mode').setRequired(false)
            .addChoices(
                { name: 'Off', value: 'off' },
                { name: 'Song', value: 'song' },
                { name: 'Queue', value: 'queue' }
            )),
    
    new SlashCommandBuilder().setName('volume').setDescription('🔊 Adjust music volume (0-100)')
        .addIntegerOption(opt => opt.setName('level').setDescription('Volume level').setRequired(true)
            .setMinValue(0).setMaxValue(100)),
    
    new SlashCommandBuilder().setName('nowplaying').setDescription('🎶 Show currently playing song'),
    
    new SlashCommandBuilder().setName('shuffle').setDescription('🔀 Shuffle the music queue'),
    
    new SlashCommandBuilder().setName('seek').setDescription('⏩ Seek to a specific timestamp')
        .addStringOption(opt => opt.setName('time').setDescription('Time (e.g., 1:30, 90s, 2m)').setRequired(true)),
    
    new SlashCommandBuilder().setName('replay').setDescription('🔁 Replay the current song from start'),
    
    new SlashCommandBuilder().setName('join').setDescription('🔊 Make the bot join your voice channel'),
    
    new SlashCommandBuilder().setName('disconnect').setDescription('👋 Disconnect the bot from voice channel'),
    
    new SlashCommandBuilder().setName('autoplay').setDescription('🎲 Toggle autoplay (similar songs after queue ends)'),
    
    new SlashCommandBuilder().setName('search').setDescription('🔍 Search for a song and select from results')
        .addStringOption(opt => opt.setName('query').setDescription('Song to search').setRequired(true)),
    
    new SlashCommandBuilder().setName('grab').setDescription('💾 Save the current song to your library'),
    
    new SlashCommandBuilder().setName('saved').setDescription('📚 Show your saved songs library')
        .addIntegerOption(opt => opt.setName('page').setDescription('Page number').setRequired(false)),
    
    new SlashCommandBuilder().setName('247').setDescription('🕐 Toggle 24/7 mode (bot stays in voice channel)'),
    
    new SlashCommandBuilder().setName('history').setDescription('📜 Show recent song history')
];

// ==================== MUSIC COMMAND HANDLER ====================
async function handleMusicCommands(interaction, client) {
    const command = interaction.commandName;
    const player = client.wavelink?.players?.get(interaction.guild.id);
    
    // Update guild settings table if needed
    const settings = db.prepare(`SELECT * FROM guild_settings WHERE guild_id = ?`).get(interaction.guild.id);
    if (!settings) {
        db.prepare(`INSERT INTO guild_settings (guild_id) VALUES (?)`).run(interaction.guild.id);
    }
    
    // ==================== PLAY COMMAND ====================
    if (command === 'play') {
        await interaction.deferReply();
        
        const query = interaction.options.getString('song');
        const member = interaction.member;
        const guild = interaction.guild;
        const channel = interaction.channel;
        
        if (!member.voice.channel) {
            return interaction.editReply({ 
                embeds: [MusicEmbed.error('No Voice Channel', 'Please join a voice channel first!', 'Use `/join` to make the bot join automatically')] 
            });
        }
        
        // Create or get player
        let player = client.wavelink.players.get(guild.id);
        if (!player) {
            player = await client.wavelink.createPlayer({
                guildId: guild.id,
                voiceChannelId: member.voice.channel.id,
                textChannelId: channel.id,
                selfDeaf: true,
                volume: settings?.default_volume || 50
            });
        } else if (!player.voiceChannelId) {
            await player.connect(member.voice.channel.id);
        }
        
        // Search for track
        const result = await player.search(query, { requester: member.id });
        
        if (!result.tracks.length) {
            return interaction.editReply({ 
                embeds: [MusicEmbed.error('No Results', `No songs found for: **${query}**`, 'Try different keywords or check your spelling')] 
            });
        }
        
        const track = result.tracks[0];
        player.queue.add(track);
        
        // Save to history
        if (settings?.history_enabled) {
            db.prepare(`INSERT INTO music_history (guild_id, user_id, track_title, track_url, track_duration, played_at) VALUES (?, ?, ?, ?, ?, ?)`)
                .run(guild.id, member.id, track.title, track.uri, track.duration, Date.now());
        }
        
        if (!player.playing) await player.play();
        
        const embed = MusicEmbed.success(
            'Added to Queue',
            `**[${track.title}](${track.uri})**`,
            [
                { name: '⏱️ Duration', value: `\`${ms(track.duration)}\``, inline: true },
                { name: '📌 Position', value: `\`${player.queue.length}\` in queue`, inline: true },
                { name: '👤 Requested by', value: `<@${member.id}>`, inline: true }
            ]
        );
        
        const row = getMusicButtons(guild.id);
        await interaction.editReply({ embeds: [embed], components: [row] });
    }
    
    // ==================== SKIP COMMAND ====================
    else if (command === 'skip') {
        if (!player || !player.playing) {
            return interaction.reply({ embeds: [MusicEmbed.error('Nothing Playing', 'No song is currently playing!', 'Use `/play` to start playing music')] });
        }
        
        const skippedTrack = player.current;
        await player.skip();
        
        const embed = MusicEmbed.success('Skipped', `**${skippedTrack.title}** has been skipped!`, [
            { name: '⏭️ Next Song', value: player.queue.length ? `**${player.queue[0]?.title}**` : 'Nothing in queue', inline: true }
        ]);
        
        const row = getMusicButtons(interaction.guild.id);
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== FORCESKIP COMMAND ====================
    else if (command === 'forceskip') {
        if (!player || !player.playing) {
            return interaction.reply({ embeds: [MusicEmbed.error('Nothing Playing', 'No song is currently playing!')] });
        }
        
        const djRole = settings?.dj_role_id;
        const isDJ = djRole && interaction.member.roles.cache.has(djRole);
        const isAdmin = interaction.member.permissions.has('Administrator');
        
        if (!isDJ && !isAdmin && interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ embeds: [MusicEmbed.error('Permission Denied', 'You need the DJ role or Admin permissions to force skip!')] });
        }
        
        const skippedTrack = player.current;
        await player.skip();
        
        const embed = MusicEmbed.success('Force Skipped', `**${skippedTrack.title}** has been force skipped by ${interaction.user.tag}!`, [
            { name: '⏭️ Next Song', value: player.queue.length ? `**${player.queue[0]?.title}**` : 'Nothing in queue', inline: true }
        ]);
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== STOP COMMAND ====================
    else if (command === 'stop') {
        if (!player) {
            return interaction.reply({ embeds: [MusicEmbed.error('Nothing Playing', 'No player is active!')] });
        }
        
        await player.destroy();
        
        const embed = MusicEmbed.success('Stopped', 'Playback stopped and queue cleared!', [
            { name: '👋 Status', value: 'Bot has left the voice channel', inline: true }
        ]);
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== PAUSE COMMAND ====================
    else if (command === 'pause') {
        if (!player || !player.playing) {
            return interaction.reply({ embeds: [MusicEmbed.error('Nothing Playing', 'No song is currently playing!')] });
        }
        
        if (player.paused) {
            return interaction.reply({ embeds: [MusicEmbed.error('Already Paused', 'The player is already paused!', 'Use `/resume` to unpause')] });
        }
        
        await player.pause();
        
        const embed = MusicEmbed.success('Paused', `**${player.current?.title}** has been paused!`, [
            { name: '⏸️ Resume', value: 'Use `/resume` to continue playing', inline: true }
        ]);
        
        const row = getMusicButtons(interaction.guild.id);
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== RESUME COMMAND ====================
    else if (command === 'resume') {
        if (!player || !player.playing) {
            return interaction.reply({ embeds: [MusicEmbed.error('Nothing Playing', 'No song is currently playing!')] });
        }
        
        if (!player.paused) {
            return interaction.reply({ embeds: [MusicEmbed.error('Already Playing', 'The player is already playing!', 'Use `/pause` to pause')] });
        }
        
        await player.resume();
        
        const embed = MusicEmbed.success('Resumed', `**${player.current?.title}** has been resumed!`);
        const row = getMusicButtons(interaction.guild.id);
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== QUEUE COMMAND ====================
    else if (command === 'queue') {
        if (!player || !player.queue.length) {
            return interaction.reply({ embeds: [MusicEmbed.error('Empty Queue', 'No songs in the queue!', 'Use `/play` to add some songs')] });
        }
        
        const page = interaction.options.getInteger('page') || 1;
        const itemsPerPage = 10;
        const totalPages = Math.ceil(player.queue.length / itemsPerPage);
        
        if (page < 1 || page > totalPages) {
            return interaction.reply({ embeds: [MusicEmbed.error('Invalid Page', `Page must be between 1 and ${totalPages}`)] });
        }
        
        const embed = MusicEmbed.queue(player.queue, player.current, page, totalPages);
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId(`queue_prev_${interaction.guild.id}`).setLabel('◀️ Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
                new ButtonBuilder().setCustomId(`queue_next_${interaction.guild.id}`).setLabel('Next ▶️').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== CLEAR COMMAND ====================
    else if (command === 'clear') {
        if (!player || !player.queue.length) {
            return interaction.reply({ embeds: [MusicEmbed.error('Empty Queue', 'No songs to clear!')] });
        }
        
        const queueSize = player.queue.length;
        player.queue.clear();
        
        const embed = MusicEmbed.success('Queue Cleared', `Removed **${queueSize}** songs from the queue!`, [
            { name: '🎵 Now Playing', value: player.current?.title || 'Nothing', inline: true }
        ]);
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== REMOVE COMMAND ====================
    else if (command === 'remove') {
        if (!player || !player.queue.length) {
            return interaction.reply({ embeds: [MusicEmbed.error('Empty Queue', 'No songs to remove!')] });
        }
        
        const position = interaction.options.getInteger('position');
        
        if (position < 1 || position > player.queue.length) {
            return interaction.reply({ embeds: [MusicEmbed.error('Invalid Position', `Position must be between 1 and ${player.queue.length}`)] });
        }
        
        const removedTrack = player.queue[position - 1];
        player.queue.splice(position - 1, 1);
        
        const embed = MusicEmbed.success('Song Removed', `Removed **${removedTrack.title}** from position \`${position}\``);
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== LOOP COMMAND ====================
    else if (command === 'loop') {
        if (!player || !player.playing) {
            return interaction.reply({ embeds: [MusicEmbed.error('Nothing Playing', 'No song is currently playing!')] });
        }
        
        const mode = interaction.options.getString('mode');
        let modeText = '';
        
        if (!mode || mode === 'off') {
            player.setLoop(false);
            modeText = 'OFF';
        } else if (mode === 'song') {
            player.setLoop(true);
            player.setLoopMode('track');
            modeText = 'SONG';
        } else if (mode === 'queue') {
            player.setLoop(true);
            player.setLoopMode('queue');
            modeText = 'QUEUE';
        }
        
        const embed = MusicEmbed.success('Loop Mode', `Loop mode set to: **${modeText}**`, [
            { name: '🔄 Current Mode', value: `\`${modeText}\``, inline: true }
        ]);
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== VOLUME COMMAND ====================
    else if (command === 'volume') {
        if (!player || !player.playing) {
            return interaction.reply({ embeds: [MusicEmbed.error('Nothing Playing', 'No song is currently playing!')] });
        }
        
        const volume = interaction.options.getInteger('level');
        
        await player.setVolume(volume);
        
        const embed = new EmbedBuilder()
            .setTitle('🔊 **VOLUME CHANGED**')
            .setDescription(`> Volume set to **${volume}%**`)
            .addFields(
                { name: '📊 Volume Bar', value: this.createVolumeBar(volume), inline: false },
                { name: '⚠️ Warning', value: volume > 80 ? 'High volume may cause distortion!' : 'Optimal volume level', inline: false }
            )
            .setColor(0x00FF88);
        
        const row = getVolumeButtons(interaction.guild.id);
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // Helper for volume bar
    function createVolumeBar(volume) {
        const filledBars = Math.floor(volume / 10);
        const emptyBars = 10 - filledBars;
        return `🔊 ${'🟩'.repeat(filledBars)}${'⬜'.repeat(emptyBars)} \`${volume}%\``;
    }
    
    // ==================== NOWPLAYING COMMAND ====================
    else if (command === 'nowplaying') {
        if (!player || !player.playing) {
            return interaction.reply({ embeds: [MusicEmbed.error('Nothing Playing', 'No song is currently playing!')] });
        }
        
        const settings = db.prepare(`SELECT * FROM guild_settings WHERE guild_id = ?`).get(interaction.guild.id);
        
        const embed = MusicEmbed.nowPlaying(
            player.current,
            player.queue.length,
            player.volume || 50,
            player.loop || false,
            settings?.autoplay || false
        );
        
        const row = getMusicButtons(interaction.guild.id);
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== SHUFFLE COMMAND ====================
    else if (command === 'shuffle') {
        if (!player || !player.queue.length) {
            return interaction.reply({ embeds: [MusicEmbed.error('Empty Queue', 'No songs to shuffle!', 'Add more songs to queue first')] });
        }
        
        player.queue.shuffle();
        
        const embed = MusicEmbed.success('Queue Shuffled', `**${player.queue.length}** songs have been shuffled!`);
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== SEEK COMMAND ====================
    else if (command === 'seek') {
        if (!player || !player.playing) {
            return interaction.reply({ embeds: [MusicEmbed.error('Nothing Playing', 'No song is currently playing!')] });
        }
        
        const timeStr = interaction.options.getString('time');
        let seconds = 0;
        
        if (timeStr.includes(':')) {
            const parts = timeStr.split(':');
            seconds = parts.reduce((acc, part) => acc * 60 + parseInt(part), 0);
        } else if (timeStr.endsWith('s')) {
            seconds = parseInt(timeStr);
        } else if (timeStr.endsWith('m')) {
            seconds = parseInt(timeStr) * 60;
        } else {
            seconds = parseInt(timeStr);
        }
        
        if (isNaN(seconds) || seconds < 0 || seconds > player.current.duration / 1000) {
            return interaction.reply({ embeds: [MusicEmbed.error('Invalid Time', `Time must be between 0 and ${ms(player.current.duration)}`)] });
        }
        
        await player.seek(seconds * 1000);
        
        const embed = MusicEmbed.success('Seeked', `Seeked to **${ms(seconds * 1000)}**`, [
            { name: '⏱️ New Position', value: `${ms(seconds * 1000)} / ${ms(player.current.duration)}`, inline: true }
        ]);
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== REPLAY COMMAND ====================
    else if (command === 'replay') {
        if (!player || !player.playing) {
            return interaction.reply({ embeds: [MusicEmbed.error('Nothing Playing', 'No song is currently playing!')] });
        }
        
        await player.seek(0);
        
        const embed = MusicEmbed.success('Replaying', `**${player.current?.title}** is now playing from the beginning!`);
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== JOIN COMMAND ====================
    else if (command === 'join') {
        if (!interaction.member.voice.channel) {
            return interaction.reply({ embeds: [MusicEmbed.error('No Voice Channel', 'You need to be in a voice channel!')] });
        }
        
        let player = client.wavelink.players.get(interaction.guild.id);
        if (!player) {
            player = await client.wavelink.createPlayer({
                guildId: interaction.guild.id,
                voiceChannelId: interaction.member.voice.channel.id,
                textChannelId: interaction.channel.id,
                selfDeaf: true
            });
        } else {
            await player.connect(interaction.member.voice.channel.id);
        }
        
        const embed = MusicEmbed.success('Joined', `Joined **${interaction.member.voice.channel.name}**!`, [
            { name: '🎵 Next Step', value: 'Use `/play <song>` to start playing music', inline: true }
        ]);
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== DISCONNECT COMMAND ====================
    else if (command === 'disconnect') {
        const player = client.wavelink.players.get(interaction.guild.id);
        
        if (!player) {
            return interaction.reply({ embeds: [MusicEmbed.error('Not Connected', 'Bot is not in any voice channel!')] });
        }
        
        await player.destroy();
        
        const embed = MusicEmbed.success('Disconnected', 'Bot has left the voice channel!', [
            { name: '👋 Goodbye', value: 'Use `/join` to bring me back', inline: true }
        ]);
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== AUTOPLAY COMMAND ====================
    else if (command === 'autoplay') {
        if (!player || !player.playing) {
            return interaction.reply({ embeds: [MusicEmbed.error('Nothing Playing', 'Start playing music first to enable autoplay!')] });
        }
        
        const currentStatus = settings?.autoplay || 0;
        const newStatus = currentStatus ? 0 : 1;
        
        db.prepare(`UPDATE guild_settings SET autoplay = ? WHERE guild_id = ?`).run(newStatus, interaction.guild.id);
        
        // Toggle player autoplay if supported
        if (player.setAutoplay) player.setAutoplay(newStatus);
        
        const embed = MusicEmbed.success('Autoplay', `Autoplay has been **${newStatus ? 'ENABLED' : 'DISABLED'}**`, [
            { name: '🎲 What is Autoplay?', value: 'When queue ends, automatically plays similar songs based on current track', inline: false }
        ]);
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== SEARCH COMMAND ====================
    else if (command === 'search') {
        const query = interaction.options.getString('query');
        
        await interaction.deferReply();
        
        const player = client.wavelink.players.get(interaction.guild.id);
        const result = await player?.search(query, { requester: interaction.member.id });
        
        if (!result || !result.tracks.length) {
            return interaction.editReply({ embeds: [MusicEmbed.error('No Results', `No songs found for: **${query}**`)] });
        }
        
        const tracks = result.tracks.slice(0, 5);
        const embed = MusicEmbed.search(tracks, query);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId(`search_1_${interaction.guild.id}`).setLabel('1').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`search_2_${interaction.guild.id}`).setLabel('2').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`search_3_${interaction.guild.id}`).setLabel('3').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`search_4_${interaction.guild.id}`).setLabel('4').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`search_5_${interaction.guild.id}`).setLabel('5').setStyle(ButtonStyle.Primary)
            );
        
        await interaction.editReply({ embeds: [embed], components: [row] });
    }
    
    // ==================== GRAB COMMAND ====================
    else if (command === 'grab') {
        if (!player || !player.playing) {
            return interaction.reply({ embeds: [MusicEmbed.error('Nothing Playing', 'No song to save!', 'Play something first')] });
        }
        
        const track = player.current;
        
        try {
            db.prepare(`INSERT INTO saved_tracks (user_id, track_title, track_url, track_duration, saved_at) VALUES (?, ?, ?, ?, ?)`)
                .run(interaction.user.id, track.title, track.uri, track.duration, Date.now());
            
            const embed = MusicEmbed.success('Song Saved', `**${track.title}** has been saved to your library!`, [
                { name: '📚 View Saved', value: 'Use `/saved` to see all your saved songs', inline: true }
            ]);
            
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
                return interaction.reply({ embeds: [MusicEmbed.error('Already Saved', 'This song is already in your library!')] });
            }
            throw error;
        }
    }
    
    // ==================== SAVED COMMAND ====================
    else if (command === 'saved') {
        const page = interaction.options.getInteger('page') || 1;
        const itemsPerPage = 10;
        
        const savedTracks = db.prepare(`SELECT * FROM saved_tracks WHERE user_id = ? ORDER BY saved_at DESC`).all(interaction.user.id);
        
        if (!savedTracks.length) {
            return interaction.reply({ embeds: [MusicEmbed.error('Empty Library', 'You haven\'t saved any songs yet!', 'Use `/grab` to save currently playing songs')] });
        }
        
        const totalPages = Math.ceil(savedTracks.length / itemsPerPage);
        const start = (page - 1) * itemsPerPage;
        const tracks = savedTracks.slice(start, start + itemsPerPage);
        
        const embed = new EmbedBuilder()
            .setAuthor({ name: '📚 MELODY • SAVED SONGS', iconURL: 'https://cdn.discordapp.com/attachments/xxx/library-icon.png' })
            .setTitle(`**${interaction.user.username}'s Music Library**`)
            .setDescription(tracks.map((t, i) => `\`${start + i + 1}.\` **${t.track_title}** \`[${ms(t.track_duration)}]\``).join('\n'))
            .addFields(
                { name: '📊 Total Saved', value: `\`${savedTracks.length}\` songs`, inline: true },
                { name: '📄 Page', value: `\`${page}/${totalPages}\``, inline: true }
            )
            .setColor(0xFF69B4)
            .setFooter({ text: 'Use /grab to save more songs!' });
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== 247 COMMAND ====================
    else if (command === '247') {
        const currentStatus = settings?.twenty_four_seven || 0;
        const newStatus = currentStatus ? 0 : 1;
        
        db.prepare(`UPDATE guild_settings SET twenty_four_seven = ? WHERE guild_id = ?`).run(newStatus, interaction.guild.id);
        
        const embed = MusicEmbed.success('24/7 Mode', `24/7 mode has been **${newStatus ? 'ENABLED' : 'DISABLED'}**`, [
            { name: '🕐 What is 24/7?', value: 'Bot stays in voice channel even when idle. Use `/disconnect` to manually remove.', inline: false }
        ]);
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== HISTORY COMMAND ====================
    else if (command === 'history') {
        const history = db.prepare(`SELECT * FROM music_history WHERE guild_id = ? ORDER BY played_at DESC LIMIT 10`).all(interaction.guild.id);
        
        if (!history.length) {
            return interaction.reply({ embeds: [MusicEmbed.error('No History', 'No songs have been played in this server yet!')] });
        }
        
        const embed = new EmbedBuilder()
            .setAuthor({ name: '📜 MELODY • RECENT HISTORY', iconURL: 'https://cdn.discordapp.com/attachments/xxx/history-icon.png' })
            .setTitle('Recently Played Songs')
            .setDescription(history.map((h, i) => `\`${i+1}.\` **${h.track_title}** \`[${ms(h.track_duration)}]\` — <@${h.user_id}>`).join('\n'))
            .setColor(0x00FFCC)
            .setFooter({ text: 'History is saved for the last 100 songs' });
        
        await interaction.reply({ embeds: [embed] });
    }
}

// ==================== BUTTON INTERACTION HANDLER ====================
async function handleMusicButtons(interaction, client) {
    const customId = interaction.customId;
    const guildId = interaction.guild.id;
    const player = client.wavelink?.players?.get(guildId);
    
    if (!player) {
        return interaction.reply({ embeds: [MusicEmbed.error('Not Connected', 'Bot is not active in any voice channel!')], ephemeral: true });
    }
    
    if (customId.startsWith('music_pause_')) {
        if (!player.playing) return;
        await player.pause();
        await interaction.update({ embeds: [MusicEmbed.success('Paused', 'Playback paused!')], components: [getMusicButtons(guildId)] });
    }
    
    else if (customId.startsWith('music_resume_')) {
        if (!player.playing) return;
        await player.resume();
        await interaction.update({ embeds: [MusicEmbed.success('Resumed', 'Playback resumed!')], components: [getMusicButtons(guildId)] });
    }
    
    else if (customId.startsWith('music_skip_')) {
        await player.skip();
        await interaction.update({ embeds: [MusicEmbed.success('Skipped', 'Song skipped!')], components: [getMusicButtons(guildId)] });
    }
    
    else if (customId.startsWith('music_stop_')) {
        await player.destroy();
        await interaction.update({ embeds: [MusicEmbed.success('Stopped', 'Playback stopped and queue cleared!')], components: [] });
    }
    
    else if (customId.startsWith('music_loop_')) {
        player.setLoop(!player.loop);
        await interaction.update({ embeds: [MusicEmbed.success('Loop Toggled', `Loop is now ${player.loop ? 'ON' : 'OFF'}`)], components: [getMusicButtons(guildId)] });
    }
    
    else if (customId.startsWith('volume_down_')) {
        const newVol = Math.max(0, player.volume - 10);
        await player.setVolume(newVol);
        await interaction.update({ embeds: [MusicEmbed.success('Volume Down', `Volume decreased to ${newVol}%`)], components: [getVolumeButtons(guildId)] });
    }
    
    else if (customId.startsWith('volume_up_')) {
        const newVol = Math.min(100, player.volume + 10);
        await player.setVolume(newVol);
        await interaction.update({ embeds: [MusicEmbed.success('Volume Up', `Volume increased to ${newVol}%`)], components: [getVolumeButtons(guildId)] });
    }
    
    else if (customId.startsWith('volume_mute_')) {
        const newVol = player.volume === 0 ? 50 : 0;
        await player.setVolume(newVol);
        await interaction.update({ embeds: [MusicEmbed.success('Volume', `Volume ${newVol === 0 ? 'muted' : `set to ${newVol}%`}`)], components: [getVolumeButtons(guildId)] });
    }
}

// ==================== EXPORTS ====================
module.exports = {
    musicCommands,
    handleMusicCommands,
    handleMusicButtons,
    MusicEmbed
};