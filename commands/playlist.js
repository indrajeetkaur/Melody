const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const sqlite3 = require('better-sqlite3');
const ms = require('ms');
require('dotenv').config();

// ==================== DATABASE SETUP ====================
const db = new sqlite3(process.env.DB_PATH || 'melody.db');

// Create playlist tables if not exists
db.exec(`
    CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at INTEGER,
        updated_at INTEGER,
        description TEXT,
        is_public INTEGER DEFAULT 1,
        UNIQUE(name, user_id)
    );
    
    CREATE TABLE IF NOT EXISTS playlist_tracks (
        playlist_id INTEGER,
        track_title TEXT,
        track_url TEXT,
        track_duration INTEGER,
        track_author TEXT,
        track_thumbnail TEXT,
        position INTEGER,
        added_at INTEGER,
        added_by TEXT,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS playlist_likes (
        playlist_id INTEGER,
        user_id TEXT,
        liked_at INTEGER,
        PRIMARY KEY (playlist_id, user_id)
    );
`);

// ==================== PREMIUM EMBED DESIGN ====================
class PlaylistEmbed {
    static success(title, description, fields = []) {
        return new EmbedBuilder()
            .setAuthor({ name: '📀 MELODY • PLAYLIST SYSTEM', iconURL: 'https://cdn.discordapp.com/attachments/xxx/playlist-icon.png' })
            .setTitle(`✨ ${title}`)
            .setDescription(description)
            .addFields(fields)
            .setColor(0x3498DB)
            .setTimestamp()
            .setFooter({ text: 'Melody • Premium Playlists', iconURL: 'https://cdn.discordapp.com/attachments/xxx/footer.png' });
    }

    static error(title, description, suggestion = null) {
        const embed = new EmbedBuilder()
            .setAuthor({ name: '❌ MELODY • PLAYLIST ERROR', iconURL: 'https://cdn.discordapp.com/attachments/xxx/error-icon.png' })
            .setTitle(`❌ ${title}`)
            .setDescription(description)
            .setColor(0xFF3366)
            .setTimestamp()
            .setFooter({ text: 'Melody • Playlist System' });
        
        if (suggestion) embed.addFields({ name: '💡 Suggestion', value: suggestion, inline: false });
        return embed;
    }

    static playlistInfo(playlist, tracks, likes, isOwner, page = 1, totalPages) {
        const trackList = tracks.slice((page-1)*10, page*10)
            .map((t, i) => `\`${(page-1)*10 + i + 1}.\` **${t.track_title}** \`[${ms(t.track_duration)}]\` — <@${t.added_by}>`)
            .join('\n');
        
        const totalDuration = tracks.reduce((acc, t) => acc + t.track_duration, 0);
        
        return new EmbedBuilder()
            .setAuthor({ name: '📀 MELODY • PLAYLIST', iconURL: 'https://cdn.discordapp.com/attachments/xxx/playlist-detail.png' })
            .setTitle(`🎵 **${playlist.name}**`)
            .setDescription(playlist.description || '*No description*')
            .addFields(
                { name: '👤 Owner', value: `<@${playlist.user_id}>`, inline: true },
                { name: '📊 Tracks', value: `\`${tracks.length}\` songs`, inline: true },
                { name: '⏱️ Duration', value: `\`${ms(totalDuration)}\``, inline: true },
                { name: '❤️ Likes', value: `\`${likes}\` likes`, inline: true },
                { name: '🌍 Visibility', value: playlist.is_public ? '`Public`' : '`Private`', inline: true },
                { name: '📅 Created', value: `<t:${Math.floor(playlist.created_at/1000)}:R>`, inline: true },
                { name: '📜 Tracks', value: trackList || '*No tracks in playlist*', inline: false }
            )
            .setColor(isOwner ? 0xFFD700 : 0x3498DB)
            .setThumbnail('https://i.imgur.com/playlist-thumb.png')
            .setFooter({ text: `Page ${page}/${totalPages} • Use /pl-load to play this playlist` });
    }

    static playlistList(playlists, user, page = 1, totalPages) {
        const list = playlists.slice((page-1)*10, page*10)
            .map(p => {
                const trackCount = db.prepare(`SELECT COUNT(*) as count FROM playlist_tracks WHERE playlist_id = ?`).get(p.id).count;
                return `**${p.name}**\n> 📊 \`${trackCount}\` tracks • ${p.is_public ? '🌍 Public' : '🔒 Private'} • <t:${Math.floor(p.created_at/1000)}:R>\n> 🆔 \`${p.id}\``;
            }).join('\n\n');
        
        return new EmbedBuilder()
            .setAuthor({ name: '📀 MELODY • YOUR PLAYLISTS', iconURL: 'https://cdn.discordapp.com/attachments/xxx/playlist-list.png' })
            .setTitle(`🎵 **${user.username}'s Playlists**`)
            .setDescription(list || '*No playlists found*')
            .addFields(
                { name: '📊 Total', value: `\`${playlists.length}\` playlists`, inline: true },
                { name: '💡 Tip', value: 'Use `/pl-create` to make a new playlist', inline: true }
            )
            .setColor(0x9B59B6)
            .setFooter({ text: `Page ${page}/${totalPages}` });
    }

    static searchResults(playlists, query, page = 1, totalPages) {
        const list = playlists.slice((page-1)*10, page*10)
            .map(p => {
                const trackCount = db.prepare(`SELECT COUNT(*) as count FROM playlist_tracks WHERE playlist_id = ?`).get(p.id).count;
                return `**${p.name}** — <@${p.user_id}>\n> 📊 \`${trackCount}\` tracks • ❤️ \`${db.prepare(`SELECT COUNT(*) as count FROM playlist_likes WHERE playlist_id = ?`).get(p.id).count}\` likes\n> 🆔 \`${p.id}\``;
            }).join('\n\n');
        
        return new EmbedBuilder()
            .setAuthor({ name: '🔍 MELODY • PLAYLIST SEARCH', iconURL: 'https://cdn.discordapp.com/attachments/xxx/search-icon.png' })
            .setTitle(`Results for: **${query}**`)
            .setDescription(list || '*No playlists found*')
            .setColor(0x00FFCC)
            .setFooter({ text: `Page ${page}/${totalPages} • Use /pl-load <id> to play` });
    }
}

// ==================== HELPER FUNCTIONS ====================
function createPlaylist(userId, name, description = null, isPublic = 1) {
    const stmt = db.prepare(`INSERT INTO playlists (name, user_id, created_at, updated_at, description, is_public) VALUES (?, ?, ?, ?, ?, ?)`);
    const result = stmt.run(name, userId, Date.now(), Date.now(), description, isPublic);
    return result.lastInsertRowid;
}

function addTrackToPlaylist(playlistId, track, position, addedBy) {
    const stmt = db.prepare(`INSERT INTO playlist_tracks (playlist_id, track_title, track_url, track_duration, track_author, track_thumbnail, position, added_at, added_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(playlistId, track.title, track.uri, track.duration, track.author, track.thumbnail || null, position, Date.now(), addedBy);
}

function getPlaylistTracks(playlistId) {
    return db.prepare(`SELECT * FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC`).all(playlistId);
}

function getUserPlaylists(userId) {
    return db.prepare(`SELECT * FROM playlists WHERE user_id = ? ORDER BY created_at DESC`).all(userId);
}

function getPublicPlaylists() {
    return db.prepare(`SELECT * FROM playlists WHERE is_public = 1 ORDER BY created_at DESC`).all();
}

function searchPlaylists(query) {
    return db.prepare(`SELECT * FROM playlists WHERE is_public = 1 AND (name LIKE ? OR description LIKE ?) ORDER BY created_at DESC`).all(`%${query}%`, `%${query}%`);
}

function deletePlaylist(playlistId, userId) {
    const playlist = db.prepare(`SELECT * FROM playlists WHERE id = ?`).get(playlistId);
    if (!playlist) return { success: false, error: 'Playlist not found' };
    if (playlist.user_id !== userId) return { success: false, error: 'Only the owner can delete this playlist' };
    
    db.prepare(`DELETE FROM playlist_tracks WHERE playlist_id = ?`).run(playlistId);
    db.prepare(`DELETE FROM playlist_likes WHERE playlist_id = ?`).run(playlistId);
    db.prepare(`DELETE FROM playlists WHERE id = ?`).run(playlistId);
    return { success: true };
}

// ==================== COMMANDS REGISTRATION ====================
const playlistCommands = [
    new SlashCommandBuilder().setName('pl-create').setDescription('📀 Create a new playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('Playlist description').setRequired(false))
        .addBooleanOption(opt => opt.setName('public').setDescription('Make playlist public? (default: true)').setRequired(false)),
    
    new SlashCommandBuilder().setName('pl-delete').setDescription('🗑️ Delete a playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name or ID').setRequired(true)),
    
    new SlashCommandBuilder().setName('pl-add').setDescription('➕ Add current song to a playlist')
        .addStringOption(opt => opt.setName('playlist').setDescription('Playlist name or ID').setRequired(true)),
    
    new SlashCommandBuilder().setName('pl-addnowplaying').setDescription('🎵 Add currently playing song to a playlist')
        .addStringOption(opt => opt.setName('playlist').setDescription('Playlist name or ID').setRequired(true)),
    
    new SlashCommandBuilder().setName('pl-addqueue').setDescription('📜 Add entire queue to a playlist')
        .addStringOption(opt => opt.setName('playlist').setDescription('Playlist name or ID').setRequired(true)),
    
    new SlashCommandBuilder().setName('pl-remove').setDescription('❌ Remove a playlist'),
    
    new SlashCommandBuilder().setName('pl-removetrack').setDescription('🎵 Remove a track from playlist')
        .addStringOption(opt => opt.setName('playlist').setDescription('Playlist name or ID').setRequired(true))
        .addIntegerOption(opt => opt.setName('position').setDescription('Track position number').setRequired(true)),
    
    new SlashCommandBuilder().setName('pl-load').setDescription('▶️ Load and play a playlist')
        .addStringOption(opt => opt.setName('playlist').setDescription('Playlist name or ID').setRequired(true)),
    
    new SlashCommandBuilder().setName('pl-list').setDescription('📋 List your playlists')
        .addIntegerOption(opt => opt.setName('page').setDescription('Page number').setRequired(false)),
    
    new SlashCommandBuilder().setName('pl-info').setDescription('ℹ️ Get playlist information')
        .addStringOption(opt => opt.setName('playlist').setDescription('Playlist name or ID').setRequired(true))
        .addIntegerOption(opt => opt.setName('page').setDescription('Page number').setRequired(false)),
    
    new SlashCommandBuilder().setName('pl-dupes').setDescription('🔄 Find duplicate tracks in playlist')
        .addStringOption(opt => opt.setName('playlist').setDescription('Playlist name or ID').setRequired(true)),
    
    new SlashCommandBuilder().setName('playlist').setDescription('📀 Search public playlists')
        .addStringOption(opt => opt.setName('query').setDescription('Search query').setRequired(false))
];

// ==================== PLAYLIST COMMAND HANDLER ====================
async function handlePlaylistCommands(interaction, client) {
    const command = interaction.commandName;
    const player = client.wavelink?.players?.get(interaction.guild.id);
    
    // ==================== PL-CREATE ====================
    if (command === 'pl-create') {
        const name = interaction.options.getString('name');
        const description = interaction.options.getString('description');
        const isPublic = interaction.options.getBoolean('public') !== false;
        
        // Check if playlist already exists
        const existing = db.prepare(`SELECT * FROM playlists WHERE name = ? AND user_id = ?`).get(name, interaction.user.id);
        if (existing) {
            return interaction.reply({ 
                embeds: [PlaylistEmbed.error('Playlist Exists', `You already have a playlist named **${name}**!`, 'Use a different name or delete the existing one')],
                ephemeral: true
            });
        }
        
        const playlistId = createPlaylist(interaction.user.id, name, description, isPublic ? 1 : 0);
        
        const embed = PlaylistEmbed.success(
            'Playlist Created',
            `**${name}** has been created successfully!`,
            [
                { name: '🆔 Playlist ID', value: `\`${playlistId}\``, inline: true },
                { name: '🌍 Visibility', value: isPublic ? '`Public`' : '`Private`', inline: true },
                { name: '💡 Next Step', value: 'Use `/pl-add` to add songs to your playlist', inline: false }
            ]
        );
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setLabel('Add Songs').setStyle(ButtonStyle.Primary).setCustomId(`pl_add_${playlistId}`),
                new ButtonBuilder().setLabel('View Playlist').setStyle(ButtonStyle.Secondary).setCustomId(`pl_view_${playlistId}`)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== PL-DELETE ====================
    else if (command === 'pl-delete' || command === 'pl-remove') {
        const identifier = interaction.options.getString('name');
        
        // Find playlist by name or ID
        let playlist = db.prepare(`SELECT * FROM playlists WHERE name = ? AND user_id = ?`).get(identifier, interaction.user.id);
        if (!playlist && !isNaN(identifier)) {
            playlist = db.prepare(`SELECT * FROM playlists WHERE id = ? AND user_id = ?`).get(parseInt(identifier), interaction.user.id);
        }
        
        if (!playlist) {
            return interaction.reply({ 
                embeds: [PlaylistEmbed.error('Not Found', `No playlist found with name/ID **${identifier}**`, 'Use `/pl-list` to see your playlists')],
                ephemeral: true
            });
        }
        
        const trackCount = db.prepare(`SELECT COUNT(*) as count FROM playlist_tracks WHERE playlist_id = ?`).get(playlist.id).count;
        
        const confirmEmbed = new EmbedBuilder()
            .setTitle('⚠️ Delete Playlist?')
            .setDescription(`Are you sure you want to delete **${playlist.name}**?\nThis will remove **${trackCount}** tracks from your playlist.`)
            .setColor(0xFF0000);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId(`pl_confirm_delete_${playlist.id}`).setLabel('✅ Yes, Delete').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`pl_cancel_delete`).setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary)
            );
        
        await interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });
    }
    
    // ==================== PL-ADD (Add current song from queue) ====================
    else if (command === 'pl-add') {
        if (!player || !player.playing) {
            return interaction.reply({ 
                embeds: [PlaylistEmbed.error('Nothing Playing', 'No song is currently playing!', 'Play a song first using `/play`')],
                ephemeral: true
            });
        }
        
        const identifier = interaction.options.getString('playlist');
        
        // Find playlist
        let playlist = db.prepare(`SELECT * FROM playlists WHERE name = ? AND user_id = ?`).get(identifier, interaction.user.id);
        if (!playlist && !isNaN(identifier)) {
            playlist = db.prepare(`SELECT * FROM playlists WHERE id = ? AND user_id = ?`).get(parseInt(identifier), interaction.user.id);
        }
        
        if (!playlist) {
            return interaction.reply({ 
                embeds: [PlaylistEmbed.error('Not Found', `No playlist found with name/ID **${identifier}**`, 'Use `/pl-list` to see your playlists')],
                ephemeral: true
            });
        }
        
        const track = player.current;
        const tracks = getPlaylistTracks(playlist.id);
        const position = tracks.length + 1;
        
        addTrackToPlaylist(playlist.id, track, position, interaction.user.id);
        
        const embed = PlaylistEmbed.success(
            'Track Added',
            `**${track.title}** has been added to **${playlist.name}**`,
            [
                { name: '📌 Position', value: `\`${position}\``, inline: true },
                { name: '📊 Total Tracks', value: `\`${tracks.length + 1}\``, inline: true }
            ]
        );
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== PL-ADDNOWPLAYING ====================
    else if (command === 'pl-addnowplaying') {
        if (!player || !player.playing) {
            return interaction.reply({ 
                embeds: [PlaylistEmbed.error('Nothing Playing', 'No song is currently playing!', 'Play a song first using `/play`')],
                ephemeral: true
            });
        }
        
        const identifier = interaction.options.getString('playlist');
        
        let playlist = db.prepare(`SELECT * FROM playlists WHERE name = ? AND user_id = ?`).get(identifier, interaction.user.id);
        if (!playlist && !isNaN(identifier)) {
            playlist = db.prepare(`SELECT * FROM playlists WHERE id = ? AND user_id = ?`).get(parseInt(identifier), interaction.user.id);
        }
        
        if (!playlist) {
            return interaction.reply({ 
                embeds: [PlaylistEmbed.error('Not Found', `No playlist found with name/ID **${identifier}**`, 'Use `/pl-list` to see your playlists')],
                ephemeral: true
            });
        }
        
        const track = player.current;
        const tracks = getPlaylistTracks(playlist.id);
        const position = tracks.length + 1;
        
        addTrackToPlaylist(playlist.id, track, position, interaction.user.id);
        
        const embed = PlaylistEmbed.success(
            'Current Song Added',
            `**${track.title}** has been added to **${playlist.name}**`,
            [
                { name: '📌 Position', value: `\`${position}\``, inline: true },
                { name: '🎵 Track', value: `[Click to Play](${track.uri})`, inline: false }
            ]
        );
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== PL-ADDQUEUE ====================
    else if (command === 'pl-addqueue') {
        if (!player || !player.queue.length) {
            return interaction.reply({ 
                embeds: [PlaylistEmbed.error('Empty Queue', 'No songs in the queue!', 'Add some songs using `/play` first')],
                ephemeral: true
            });
        }
        
        const identifier = interaction.options.getString('playlist');
        
        let playlist = db.prepare(`SELECT * FROM playlists WHERE name = ? AND user_id = ?`).get(identifier, interaction.user.id);
        if (!playlist && !isNaN(identifier)) {
            playlist = db.prepare(`SELECT * FROM playlists WHERE id = ? AND user_id = ?`).get(parseInt(identifier), interaction.user.id);
        }
        
        if (!playlist) {
            return interaction.reply({ 
                embeds: [PlaylistEmbed.error('Not Found', `No playlist found with name/ID **${identifier}**`, 'Use `/pl-list` to see your playlists')],
                ephemeral: true
            });
        }
        
        const tracks = getPlaylistTracks(playlist.id);
        let position = tracks.length + 1;
        let addedCount = 0;
        
        for (const track of player.queue) {
            addTrackToPlaylist(playlist.id, track, position++, interaction.user.id);
            addedCount++;
        }
        
        const embed = PlaylistEmbed.success(
            'Queue Added',
            `**${addedCount}** songs from queue have been added to **${playlist.name}**`,
            [
                { name: '📊 Total Tracks', value: `\`${tracks.length + addedCount}\``, inline: true },
                { name: '🎵 Playlist', value: playlist.name, inline: true }
            ]
        );
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== PL-REMOVETRACK ====================
    else if (command === 'pl-removetrack') {
        const identifier = interaction.options.getString('playlist');
        const position = interaction.options.getInteger('position');
        
        let playlist = db.prepare(`SELECT * FROM playlists WHERE name = ? AND user_id = ?`).get(identifier, interaction.user.id);
        if (!playlist && !isNaN(identifier)) {
            playlist = db.prepare(`SELECT * FROM playlists WHERE id = ? AND user_id = ?`).get(parseInt(identifier), interaction.user.id);
        }
        
        if (!playlist) {
            return interaction.reply({ 
                embeds: [PlaylistEmbed.error('Not Found', `No playlist found with name/ID **${identifier}**`, 'Use `/pl-list` to see your playlists')],
                ephemeral: true
            });
        }
        
        const tracks = getPlaylistTracks(playlist.id);
        
        if (position < 1 || position > tracks.length) {
            return interaction.reply({ 
                embeds: [PlaylistEmbed.error('Invalid Position', `Position must be between 1 and ${tracks.length}`)],
                ephemeral: true
            });
        }
        
        const removedTrack = tracks[position - 1];
        db.prepare(`DELETE FROM playlist_tracks WHERE playlist_id = ? AND position = ?`).run(playlist.id, position);
        
        // Reorder positions
        db.prepare(`UPDATE playlist_tracks SET position = position - 1 WHERE playlist_id = ? AND position > ?`).run(playlist.id, position);
        
        const embed = PlaylistEmbed.success(
            'Track Removed',
            `**${removedTrack.track_title}** has been removed from **${playlist.name}**`,
            [
                { name: '📌 Original Position', value: `\`${position}\``, inline: true },
                { name: '📊 Remaining Tracks', value: `\`${tracks.length - 1}\``, inline: true }
            ]
        );
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== PL-LOAD ====================
    else if (command === 'pl-load') {
        await interaction.deferReply();
        
        const identifier = interaction.options.getString('playlist');
        
        // Find playlist (can be user's own or public)
        let playlist = db.prepare(`SELECT * FROM playlists WHERE name = ? AND (user_id = ? OR is_public = 1)`).get(identifier, interaction.user.id);
        if (!playlist && !isNaN(identifier)) {
            playlist = db.prepare(`SELECT * FROM playlists WHERE id = ? AND (user_id = ? OR is_public = 1)`).get(parseInt(identifier), interaction.user.id);
        }
        
        if (!playlist) {
            return interaction.editReply({ 
                embeds: [PlaylistEmbed.error('Not Found', `No playlist found with name/ID **${identifier}**`, 'Make sure the playlist exists and is public')]
            });
        }
        
        if (!interaction.member.voice.channel) {
            return interaction.editReply({ 
                embeds: [PlaylistEmbed.error('No Voice Channel', 'Please join a voice channel first!')]
            });
        }
        
        const tracks = getPlaylistTracks(playlist.id);
        
        if (!tracks.length) {
            return interaction.editReply({ 
                embeds: [PlaylistEmbed.error('Empty Playlist', `**${playlist.name}** has no tracks!`, 'Add tracks using `/pl-add`')]
            });
        }
        
        // Create or get player
        let player = client.wavelink.players.get(interaction.guild.id);
        if (!player) {
            player = await client.wavelink.createPlayer({
                guildId: interaction.guild.id,
                voiceChannelId: interaction.member.voice.channel.id,
                textChannelId: interaction.channel.id,
                selfDeaf: true
            });
        } else if (!player.voiceChannelId) {
            await player.connect(interaction.member.voice.channel.id);
        }
        
        // Add all tracks to queue
        let addedCount = 0;
        for (const track of tracks) {
            const wavelinkTrack = {
                title: track.track_title,
                uri: track.track_url,
                duration: track.track_duration,
                author: track.track_author,
                requester: playlist.user_id,
                thumbnail: track.track_thumbnail
            };
            player.queue.add(wavelinkTrack);
            addedCount++;
        }
        
        if (!player.playing) await player.play();
        
        const totalDuration = tracks.reduce((acc, t) => acc + t.track_duration, 0);
        
        const embed = PlaylistEmbed.success(
            'Playlist Loaded',
            `**${playlist.name}** has been added to the queue!`,
            [
                { name: '📊 Tracks Added', value: `\`${addedCount}\` songs`, inline: true },
                { name: '⏱️ Total Duration', value: `\`${ms(totalDuration)}\``, inline: true },
                { name: '👤 Owner', value: `<@${playlist.user_id}>`, inline: true }
            ]
        );
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setLabel('🎵 Now Playing').setStyle(ButtonStyle.Primary).setCustomId(`np_${interaction.guild.id}`),
                new ButtonBuilder().setLabel('📜 Queue').setStyle(ButtonStyle.Secondary).setCustomId(`queue_${interaction.guild.id}`)
            );
        
        await interaction.editReply({ embeds: [embed], components: [row] });
    }
    
    // ==================== PL-LIST ====================
    else if (command === 'pl-list') {
        const page = interaction.options.getInteger('page') || 1;
        const playlists = getUserPlaylists(interaction.user.id);
        
        if (!playlists.length) {
            return interaction.reply({ 
                embeds: [PlaylistEmbed.error('No Playlists', 'You haven\'t created any playlists yet!', 'Use `/pl-create` to make your first playlist')],
                ephemeral: true
            });
        }
        
        const itemsPerPage = 5;
        const totalPages = Math.ceil(playlists.length / itemsPerPage);
        
        if (page < 1 || page > totalPages) {
            return interaction.reply({ 
                embeds: [PlaylistEmbed.error('Invalid Page', `Page must be between 1 and ${totalPages}`)],
                ephemeral: true
            });
        }
        
        const embed = PlaylistEmbed.playlistList(playlists, interaction.user, page, totalPages);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId(`pl_list_prev_${page}`).setLabel('◀️ Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
                new ButtonBuilder().setCustomId(`pl_list_next_${page}`).setLabel('Next ▶️').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages)
            );
        
        await interaction.reply({ embeds: [embed], components: row });
    }
    
    // ==================== PL-INFO ====================
    else if (command === 'pl-info') {
        const identifier = interaction.options.getString('playlist');
        const page = interaction.options.getInteger('page') || 1;
        
        let playlist = db.prepare(`SELECT * FROM playlists WHERE name = ? AND (user_id = ? OR is_public = 1)`).get(identifier, interaction.user.id);
        if (!playlist && !isNaN(identifier)) {
            playlist = db.prepare(`SELECT * FROM playlists WHERE id = ? AND (user_id = ? OR is_public = 1)`).get(parseInt(identifier), interaction.user.id);
        }
        
        if (!playlist) {
            return interaction.reply({ 
                embeds: [PlaylistEmbed.error('Not Found', `No playlist found with name/ID **${identifier}**`)],
                ephemeral: true
            });
        }
        
        const tracks = getPlaylistTracks(playlist.id);
        const likes = db.prepare(`SELECT COUNT(*) as count FROM playlist_likes WHERE playlist_id = ?`).get(playlist.id).count;
        const isOwner = playlist.user_id === interaction.user.id;
        
        if (!tracks.length) {
            const embed = PlaylistEmbed.playlistInfo(playlist, [], likes, isOwner, 1, 1);
            return interaction.reply({ embeds: [embed] });
        }
        
        const itemsPerPage = 10;
        const totalPages = Math.ceil(tracks.length / itemsPerPage);
        
        if (page < 1 || page > totalPages) {
            return interaction.reply({ 
                embeds: [PlaylistEmbed.error('Invalid Page', `Page must be between 1 and ${totalPages}`)],
                ephemeral: true
            });
        }
        
        const embed = PlaylistEmbed.playlistInfo(playlist, tracks, likes, isOwner, page, totalPages);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId(`pl_info_prev_${playlist.id}_${page}`).setLabel('◀️ Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
                new ButtonBuilder().setCustomId(`pl_info_next_${playlist.id}_${page}`).setLabel('Next ▶️').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages),
                new ButtonBuilder().setCustomId(`pl_load_${playlist.id}`).setLabel('▶️ Play').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`pl_like_${playlist.id}`).setLabel(`❤️ ${likes}`).setStyle(ButtonStyle.Danger)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== PL-DUPES ====================
    else if (command === 'pl-dupes') {
        const identifier = interaction.options.getString('playlist');
        
        let playlist = db.prepare(`SELECT * FROM playlists WHERE name = ? AND user_id = ?`).get(identifier, interaction.user.id);
        if (!playlist && !isNaN(identifier)) {
            playlist = db.prepare(`SELECT * FROM playlists WHERE id = ? AND user_id = ?`).get(parseInt(identifier), interaction.user.id);
        }
        
        if (!playlist) {
            return interaction.reply({ 
                embeds: [PlaylistEmbed.error('Not Found', `No playlist found with name/ID **${identifier}**`, 'Use `/pl-list` to see your playlists')],
                ephemeral: true
            });
        }
        
        const tracks = getPlaylistTracks(playlist.id);
        const dupes = {};
        const duplicates = [];
        
        for (const track of tracks) {
            if (dupes[track.track_url]) {
                duplicates.push(track);
            } else {
                dupes[track.track_url] = true;
            }
        }
        
        if (!duplicates.length) {
            const embed = PlaylistEmbed.success('No Duplicates', `**${playlist.name}** has no duplicate tracks!`, [
                { name: '📊 Total Tracks', value: `\`${tracks.length}\``, inline: true }
            ]);
            return interaction.reply({ embeds: [embed] });
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`🔄 Duplicate Tracks in ${playlist.name}`)
            .setDescription(duplicates.map((t, i) => `\`${i+1}.\` **${t.track_title}**`).join('\n'))
            .addFields(
                { name: '📊 Duplicates Found', value: `\`${duplicates.length}\` duplicate tracks`, inline: true },
                { name: '💡 Tip', value: 'Use `/pl-removetrack` to remove duplicates', inline: true }
            )
            .setColor(0xFFA500);
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== PLAYLIST (Search) ====================
    else if (command === 'playlist') {
        const query = interaction.options.getString('query');
        
        if (!query) {
            const playlists = getPublicPlaylists();
            
            if (!playlists.length) {
                return interaction.reply({ 
                    embeds: [PlaylistEmbed.error('No Public Playlists', 'No public playlists available yet!', 'Create your own using `/pl-create`')],
                    ephemeral: true
                });
            }
            
            const page = 1;
            const itemsPerPage = 5;
            const totalPages = Math.ceil(playlists.length / itemsPerPage);
            const embed = PlaylistEmbed.searchResults(playlists, 'all', page, totalPages);
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId(`pl_search_prev`).setLabel('◀️ Previous').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId(`pl_search_next`).setLabel('Next ▶️').setStyle(ButtonStyle.Secondary).setDisabled(totalPages === 1)
                );
            
            return interaction.reply({ embeds: [embed], components: row });
        }
        
        const playlists = searchPlaylists(query);
        
        if (!playlists.length) {
            return interaction.reply({ 
                embeds: [PlaylistEmbed.error('No Results', `No playlists found for **${query}**`, 'Try a different search term')],
                ephemeral: true
            });
        }
        
        const page = 1;
        const itemsPerPage = 5;
        const totalPages = Math.ceil(playlists.length / itemsPerPage);
        const embed = PlaylistEmbed.searchResults(playlists, query, page, totalPages);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId(`pl_search_prev`).setLabel('◀️ Previous').setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId(`pl_search_next`).setLabel('Next ▶️').setStyle(ButtonStyle.Secondary).setDisabled(totalPages === 1)
            );
        
        await interaction.reply({ embeds: [embed], components: row });
    }
}

// ==================== BUTTON HANDLER ====================
async function handlePlaylistButtons(interaction, client) {
    const customId = interaction.customId;
    const player = client.wavelink?.players?.get(interaction.guild.id);
    
    // Confirm delete
    if (customId.startsWith('pl_confirm_delete_')) {
        const playlistId = parseInt(customId.split('_')[3]);
        const result = deletePlaylist(playlistId, interaction.user.id);
        
        if (result.success) {
            const embed = PlaylistEmbed.success('Playlist Deleted', 'Your playlist has been deleted successfully!');
            await interaction.update({ embeds: [embed], components: [] });
        } else {
            const embed = PlaylistEmbed.error('Delete Failed', result.error);
            await interaction.update({ embeds: [embed], components: [] });
        }
    }
    
    else if (customId === 'pl_cancel_delete') {
        const embed = PlaylistEmbed.success('Cancelled', 'Playlist deletion cancelled');
        await interaction.update({ embeds: [embed], components: [] });
    }
    
    // Load playlist button
    else if (customId.startsWith('pl_load_')) {
        const playlistId = parseInt(customId.split('_')[2]);
        const fakeInteraction = {
            ...interaction,
            commandName: 'pl-load',
            options: { getString: () => playlistId.toString() },
            deferReply: () => interaction.deferReply(),
            editReply: interaction.editReply.bind(interaction)
        };
        await handlePlaylistCommands(fakeInteraction, client);
    }
    
    // Like playlist button
    else if (customId.startsWith('pl_like_')) {
        const playlistId = parseInt(customId.split('_')[2]);
        const existing = db.prepare(`SELECT * FROM playlist_likes WHERE playlist_id = ? AND user_id = ?`).get(playlistId, interaction.user.id);
        
        if (existing) {
            db.prepare(`DELETE FROM playlist_likes WHERE playlist_id = ? AND user_id = ?`).run(playlistId, interaction.user.id);
            const newLikes = db.prepare(`SELECT COUNT(*) as count FROM playlist_likes WHERE playlist_id = ?`).get(playlistId).count;
            const embed = PlaylistEmbed.success('Unliked', 'You removed your like from this playlist');
            await interaction.update({ embeds: [embed], components: [] });
        } else {
            db.prepare(`INSERT INTO playlist_likes (playlist_id, user_id, liked_at) VALUES (?, ?, ?)`).run(playlistId, interaction.user.id, Date.now());
            const newLikes = db.prepare(`SELECT COUNT(*) as count FROM playlist_likes WHERE playlist_id = ?`).get(playlistId).count;
            const embed = PlaylistEmbed.success('Liked', 'You liked this playlist!');
            await interaction.update({ embeds: [embed], components: [] });
        }
    }
}

// ==================== EXPORTS ====================
module.exports = {
    playlistCommands,
    handlePlaylistCommands,
    handlePlaylistButtons,
    PlaylistEmbed
};