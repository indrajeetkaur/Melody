const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const sqlite3 = require('better-sqlite3');
const ms = require('ms');
require('dotenv').config();

// ==================== DATABASE SETUP ====================
const db = new sqlite3(process.env.DB_PATH || 'melody.db');

// Create favourite tables if not exists
db.exec(`
    CREATE TABLE IF NOT EXISTS liked_songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        track_title TEXT,
        track_url TEXT,
        track_duration INTEGER,
        track_author TEXT,
        track_thumbnail TEXT,
        liked_at INTEGER,
        playlist_name TEXT DEFAULT 'Favourites',
        UNIQUE(user_id, track_url)
    );
    
    CREATE TABLE IF NOT EXISTS user_bio (
        user_id TEXT PRIMARY KEY,
        bio TEXT,
        set_at INTEGER,
        last_updated INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS user_stats (
        user_id TEXT PRIMARY KEY,
        liked_count INTEGER DEFAULT 0,
        playlist_created INTEGER DEFAULT 0,
        total_playtime INTEGER DEFAULT 0
    );
`);

// ==================== PREMIUM EMBED DESIGN ====================
class FavouriteEmbed {
    static success(title, description, fields = []) {
        return new EmbedBuilder()
            .setAuthor({ name: '❤️ MELODY • FAVOURITES SYSTEM', iconURL: 'https://cdn.discordapp.com/attachments/xxx/fav-icon.png' })
            .setTitle(`✨ ${title}`)
            .setDescription(description)
            .addFields(fields)
            .setColor(0xFF69B4)
            .setTimestamp()
            .setFooter({ text: 'Melody • Your Music Library', iconURL: 'https://cdn.discordapp.com/attachments/xxx/footer.png' });
    }

    static error(title, description, suggestion = null) {
        const embed = new EmbedBuilder()
            .setAuthor({ name: '❌ MELODY • FAVOURITES ERROR', iconURL: 'https://cdn.discordapp.com/attachments/xxx/error-icon.png' })
            .setTitle(`❌ ${title}`)
            .setDescription(description)
            .setColor(0xFF3366)
            .setTimestamp()
            .setFooter({ text: 'Melody • Favourites System' });
        
        if (suggestion) embed.addFields({ name: '💡 Suggestion', value: suggestion, inline: false });
        return embed;
    }

    static likedSongs(songs, user, page = 1, totalPages, totalDuration) {
        const songList = songs.slice((page-1)*10, page*10)
            .map((s, i) => `\`${(page-1)*10 + i + 1}.\` **${s.track_title}** \`[${ms(s.track_duration)}]\` — ${s.track_author}\n> ❤️ Liked <t:${Math.floor(s.liked_at/1000)}:R>`)
            .join('\n\n');
        
        return new EmbedBuilder()
            .setAuthor({ name: '❤️ MELODY • YOUR LIKED SONGS', iconURL: 'https://cdn.discordapp.com/attachments/xxx/liked-icon.png' })
            .setTitle(`🎵 **${user.username}'s Music Library**`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setDescription(songList || '*No liked songs yet*')
            .addFields(
                { name: '📊 Total Songs', value: `\`${songs.length}\` tracks`, inline: true },
                { name: '⏱️ Total Duration', value: `\`${ms(totalDuration)}\``, inline: true },
                { name: '📄 Page', value: `\`${page}/${totalPages}\``, inline: true },
                { name: '💡 Tip', value: 'Use `/playliked` to play all your liked songs', inline: false }
            )
            .setColor(0xFF69B4)
            .setFooter({ text: '❤️ Your personal music collection' });
    }

    static profile(user, stats, bio) {
        const badgeEmojis = {
            music_lover: '🎵', veteran: '🏆', contributor: '🤝', early: '🌟', supporter: '❤️'
        };
        
        const badges = [];
        if (stats.liked_count >= 100) badges.push('music_lover');
        if (stats.liked_count >= 50) badges.push('veteran');
        if (stats.total_playtime >= 86400000) badges.push('supporter');
        
        const badgeText = badges.length ? badges.map(b => badgeEmojis[b] || '📌').join(' ') : '`None`';
        
        return new EmbedBuilder()
            .setAuthor({ name: '📜 MELODY • USER PROFILE', iconURL: 'https://cdn.discordapp.com/attachments/xxx/profile-icon.png' })
            .setTitle(`✨ **${user.username}'s Profile**`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 1024 }))
            .addFields(
                { name: '🆔 User ID', value: `\`${user.id}\``, inline: true },
                { name: '📅 Joined Discord', value: `<t:${Math.floor(user.createdTimestamp/1000)}:R>`, inline: true },
                { name: '🏆 Badges', value: badgeText, inline: true },
                { name: '📝 Bio', value: bio || '`No bio set`', inline: false },
                { name: '📊 **Music Statistics**', value: '```yaml\n' +
                    `Liked Songs: ${stats.liked_count || 0}\n` +
                    `Playlists Created: ${stats.playlist_created || 0}\n` +
                    `Total Playtime: ${ms(stats.total_playtime || 0)}\n` +
                    `Commands Used: ${stats.commands_used || 0}` +
                    '```', inline: false }
            )
            .setColor(0xFF69B4)
            .setTimestamp()
            .setFooter({ text: '❤️ Melody Premium • User Profile' });
    }

    static bioPreview(bio, user, setAt) {
        return new EmbedBuilder()
            .setAuthor({ name: '📝 MELODY • USER BIO', iconURL: 'https://cdn.discordapp.com/attachments/xxx/bio-icon.png' })
            .setTitle(`📜 **${user.username}'s Bio**`)
            .setDescription(`> ${bio}`)
            .addFields(
                { name: '📅 Last Updated', value: `<t:${Math.floor(setAt/1000)}:R>`, inline: true },
                { name: '❤️ Favourites', value: `\`${db.prepare(`SELECT COUNT(*) as count FROM liked_songs WHERE user_id = ?`).get(user.id).count}\` songs`, inline: true }
            )
            .setColor(0x9B59B6)
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }));
    }
}

// ==================== HELPER FUNCTIONS ====================
function likeSong(userId, track) {
    try {
        const stmt = db.prepare(`INSERT INTO liked_songs (user_id, track_title, track_url, track_duration, track_author, track_thumbnail, liked_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        stmt.run(userId, track.title, track.uri, track.duration, track.author, track.thumbnail || null, Date.now());
        
        // Update user stats
        db.prepare(`UPDATE user_stats SET liked_count = liked_count + 1 WHERE user_id = ?`).run(userId);
        
        return { success: true };
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT') {
            return { success: false, error: 'already_liked' };
        }
        return { success: false, error: 'unknown' };
    }
}

function unlikeSong(userId, trackUrl) {
    const result = db.prepare(`DELETE FROM liked_songs WHERE user_id = ? AND track_url = ?`).run(userId, trackUrl);
    
    if (result.changes > 0) {
        db.prepare(`UPDATE user_stats SET liked_count = liked_count - 1 WHERE user_id = ?`).run(userId);
        return { success: true };
    }
    return { success: false };
}

function getLikedSongs(userId, limit = 50) {
    return db.prepare(`SELECT * FROM liked_songs WHERE user_id = ? ORDER BY liked_at DESC LIMIT ?`).all(userId, limit);
}

function getAllLikedSongs(userId) {
    return db.prepare(`SELECT * FROM liked_songs WHERE user_id = ? ORDER BY liked_at DESC`).all(userId);
}

function clearLikedSongs(userId) {
    const count = db.prepare(`SELECT COUNT(*) as count FROM liked_songs WHERE user_id = ?`).get(userId).count;
    db.prepare(`DELETE FROM liked_songs WHERE user_id = ?`).run(userId);
    db.prepare(`UPDATE user_stats SET liked_count = 0 WHERE user_id = ?`).run(userId);
    return count;
}

function setBio(userId, bio) {
    const stmt = db.prepare(`INSERT OR REPLACE INTO user_bio (user_id, bio, set_at, last_updated) VALUES (?, ?, ?, ?)`);
    stmt.run(userId, bio, Date.now(), Date.now());
}

function getBio(userId) {
    return db.prepare(`SELECT * FROM user_bio WHERE user_id = ?`).get(userId);
}

function resetBio(userId) {
    db.prepare(`DELETE FROM user_bio WHERE user_id = ?`).run(userId);
}

function getUserStats(userId) {
    let stats = db.prepare(`SELECT * FROM user_stats WHERE user_id = ?`).get(userId);
    if (!stats) {
        db.prepare(`INSERT INTO user_stats (user_id) VALUES (?)`).run(userId);
        stats = db.prepare(`SELECT * FROM user_stats WHERE user_id = ?`).get(userId);
    }
    return stats;
}

// ==================== COMMANDS REGISTRATION ====================
const favouriteCommands = [
    new SlashCommandBuilder().setName('like').setDescription('❤️ Like/Save current playing song to your favourites'),
    
    new SlashCommandBuilder().setName('unlike').setDescription('💔 Remove a song from your favourites')
        .addStringOption(opt => opt.setName('query').setDescription('Song name or position number').setRequired(true)),
    
    new SlashCommandBuilder().setName('showliked').setDescription('📋 Show your liked songs')
        .addIntegerOption(opt => opt.setName('page').setDescription('Page number').setRequired(false)),
    
    new SlashCommandBuilder().setName('playliked').setDescription('▶️ Play all your liked songs'),
    
    new SlashCommandBuilder().setName('clearlikes').setDescription('🗑️ Clear all your liked songs')
        .addBooleanOption(opt => opt.setName('confirm').setDescription('Type true to confirm').setRequired(true)),
    
    new SlashCommandBuilder().setName('profile').setDescription('📜 View user profile and statistics')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(false)),
    
    new SlashCommandBuilder().setName('bio').setDescription('📝 View a user\'s bio')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(false)),
    
    new SlashCommandBuilder().setName('bioset').setDescription('✏️ Set your profile bio')
        .addStringOption(opt => opt.setName('bio').setDescription('Your bio (max 200 characters)').setRequired(true)),
    
    new SlashCommandBuilder().setName('bioreset').setDescription('🗑️ Reset your profile bio'),
    
    new SlashCommandBuilder().setName('bioshow').setDescription('👀 Show your current bio')
];

// ==================== FAVOURITE COMMAND HANDLER ====================
async function handleFavouriteCommands(interaction, client) {
    const command = interaction.commandName;
    const player = client.wavelink?.players?.get(interaction.guild.id);
    
    // ==================== LIKE COMMAND ====================
    if (command === 'like') {
        if (!player || !player.playing) {
            return interaction.reply({ 
                embeds: [FavouriteEmbed.error('Nothing Playing', 'No song is currently playing!', 'Play a song first using `/play`')],
                ephemeral: true
            });
        }
        
        const track = player.current;
        const result = likeSong(interaction.user.id, track);
        
        if (!result.success) {
            if (result.error === 'already_liked') {
                return interaction.reply({ 
                    embeds: [FavouriteEmbed.error('Already Liked', `**${track.title}** is already in your favourites!`, 'Use `/unlike` to remove it')],
                    ephemeral: true
                });
            }
            return interaction.reply({ 
                embeds: [FavouriteEmbed.error('Failed', 'Could not like the song. Please try again.')],
                ephemeral: true
            });
        }
        
        const likedCount = db.prepare(`SELECT COUNT(*) as count FROM liked_songs WHERE user_id = ?`).get(interaction.user.id).count;
        
        const embed = new EmbedBuilder()
            .setAuthor({ name: '❤️ MELODY • SONG LIKED', iconURL: 'https://cdn.discordapp.com/attachments/xxx/like-icon.png' })
            .setTitle(`❤️ **Added to Favourites**`)
            .setDescription(`[**${track.title}**](${track.uri})`)
            .addFields(
                { name: '🎤 Artist', value: track.author || 'Unknown', inline: true },
                { name: '⏱️ Duration', value: `\`${ms(track.duration)}\``, inline: true },
                { name: '📊 Total Likes', value: `\`${likedCount}\` songs`, inline: true },
                { name: '💡 Next Step', value: 'Use `/showliked` to see all your liked songs', inline: false }
            )
            .setThumbnail(track.thumbnail || 'https://i.imgur.com/music-thumb.png')
            .setColor(0xFF69B4)
            .setTimestamp();
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('fav_showliked').setLabel('📋 View Likes').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('fav_playliked').setLabel('▶️ Play All').setStyle(ButtonStyle.Success)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== UNLIKE COMMAND ====================
    else if (command === 'unlike') {
        const query = interaction.options.getString('query');
        const likedSongs = getLikedSongs(interaction.user.id, 100);
        
        if (!likedSongs.length) {
            return interaction.reply({ 
                embeds: [FavouriteEmbed.error('No Likes', 'You haven\'t liked any songs yet!', 'Use `/like` to save your favourite songs')],
                ephemeral: true
            });
        }
        
        let trackToRemove = null;
        
        // Check if query is a number (position)
        if (!isNaN(query) && parseInt(query) >= 1 && parseInt(query) <= likedSongs.length) {
            trackToRemove = likedSongs[parseInt(query) - 1];
        } else {
            // Search by title
            trackToRemove = likedSongs.find(s => s.track_title.toLowerCase().includes(query.toLowerCase()));
        }
        
        if (!trackToRemove) {
            return interaction.reply({ 
                embeds: [FavouriteEmbed.error('Not Found', `No liked song found matching **${query}**`, 'Use `/showliked` to see your liked songs with positions')],
                ephemeral: true
            });
        }
        
        const result = unlikeSong(interaction.user.id, trackToRemove.track_url);
        
        if (result.success) {
            const remainingCount = db.prepare(`SELECT COUNT(*) as count FROM liked_songs WHERE user_id = ?`).get(interaction.user.id).count;
            
            const embed = FavouriteEmbed.success(
                'Song Unliked',
                `**${trackToRemove.track_title}** has been removed from your favourites`,
                [
                    { name: '📊 Remaining Likes', value: `\`${remainingCount}\` songs`, inline: true },
                    { name: '💡 Tip', value: 'Use `/showliked` to see your updated list', inline: true }
                ]
            );
            
            await interaction.reply({ embeds: [embed] });
        } else {
            await interaction.reply({ 
                embeds: [FavouriteEmbed.error('Failed', 'Could not unlike the song. Please try again.')],
                ephemeral: true
            });
        }
    }
    
    // ==================== SHOWLIKED COMMAND ====================
    else if (command === 'showliked') {
        const page = interaction.options.getInteger('page') || 1;
        const likedSongs = getAllLikedSongs(interaction.user.id);
        
        if (!likedSongs.length) {
            return interaction.reply({ 
                embeds: [FavouriteEmbed.error('No Likes', 'You haven\'t liked any songs yet!', 'Use `/like` to save your favourite songs')],
                ephemeral: true
            });
        }
        
        const itemsPerPage = 10;
        const totalPages = Math.ceil(likedSongs.length / itemsPerPage);
        
        if (page < 1 || page > totalPages) {
            return interaction.reply({ 
                embeds: [FavouriteEmbed.error('Invalid Page', `Page must be between 1 and ${totalPages}`)],
                ephemeral: true
            });
        }
        
        const totalDuration = likedSongs.reduce((acc, s) => acc + s.track_duration, 0);
        const embed = FavouriteEmbed.likedSongs(likedSongs, interaction.user, page, totalPages, totalDuration);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId(`fav_prev_${page}`).setLabel('◀️ Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
                new ButtonBuilder().setCustomId(`fav_next_${page}`).setLabel('Next ▶️').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages),
                new ButtonBuilder().setCustomId('fav_playliked').setLabel('▶️ Play All').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('fav_clear').setLabel('🗑️ Clear All').setStyle(ButtonStyle.Danger)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== PLAYLIKED COMMAND ====================
    else if (command === 'playliked') {
        await interaction.deferReply();
        
        const likedSongs = getAllLikedSongs(interaction.user.id);
        
        if (!likedSongs.length) {
            return interaction.editReply({ 
                embeds: [FavouriteEmbed.error('No Likes', 'You haven\'t liked any songs yet!', 'Use `/like` to save your favourite songs')]
            });
        }
        
        if (!interaction.member.voice.channel) {
            return interaction.editReply({ 
                embeds: [FavouriteEmbed.error('No Voice Channel', 'Please join a voice channel first!')]
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
        
        // Add all liked songs to queue
        let addedCount = 0;
        for (const song of likedSongs) {
            const track = {
                title: song.track_title,
                uri: song.track_url,
                duration: song.track_duration,
                author: song.track_author,
                requester: interaction.user.id,
                thumbnail: song.track_thumbnail
            };
            player.queue.add(track);
            addedCount++;
        }
        
        if (!player.playing) await player.play();
        
        const totalDuration = likedSongs.reduce((acc, s) => acc + s.track_duration, 0);
        
        const embed = FavouriteEmbed.success(
            'Playing Your Likes',
            `**${addedCount}** liked songs have been added to the queue!`,
            [
                { name: '⏱️ Total Duration', value: `\`${ms(totalDuration)}\``, inline: true },
                { name: '❤️ Enjoying', value: 'Your personal playlist is now playing!', inline: true }
            ]
        );
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('nowplaying').setLabel('🎵 Now Playing').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('queue').setLabel('📜 Queue').setStyle(ButtonStyle.Secondary)
            );
        
        await interaction.editReply({ embeds: [embed], components: [row] });
    }
    
    // ==================== CLEARLIKES COMMAND ====================
    else if (command === 'clearlikes') {
        const confirm = interaction.options.getBoolean('confirm');
        
        if (!confirm) {
            const count = db.prepare(`SELECT COUNT(*) as count FROM liked_songs WHERE user_id = ?`).get(interaction.user.id).count;
            
            if (count === 0) {
                return interaction.reply({ 
                    embeds: [FavouriteEmbed.error('No Likes', 'You don\'t have any liked songs to clear!')],
                    ephemeral: true
                });
            }
            
            const embed = new EmbedBuilder()
                .setTitle('⚠️ Clear All Liked Songs?')
                .setDescription(`Are you sure you want to clear all **${count}** liked songs?\nThis action cannot be undone.`)
                .setColor(0xFF0000);
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('fav_confirm_clear').setLabel('✅ Yes, Clear All').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('fav_cancel_clear').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary)
                );
            
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }
        
        const count = clearLikedSongs(interaction.user.id);
        
        const embed = FavouriteEmbed.success(
            'Likes Cleared',
            `**${count}** song${count !== 1 ? 's' : ''} have been removed from your favourites`,
            [
                { name: '📊 Previous Count', value: `\`${count}\` songs`, inline: true },
                { name: '🔄 New Status', value: '`Empty library`', inline: true }
            ]
        );
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== PROFILE COMMAND ====================
    else if (command === 'profile') {
        const target = interaction.options.getUser('user') || interaction.user;
        const stats = getUserStats(target.id);
        const bio = getBio(target.id);
        
        // Also get command stats from general.js's user_stats
        const generalStats = db.prepare(`SELECT commands_used FROM user_stats WHERE user_id = ?`).get(target.id);
        if (generalStats) {
            stats.commands_used = generalStats.commands_used;
        } else {
            stats.commands_used = 0;
        }
        
        const embed = FavouriteEmbed.profile(target, stats, bio?.bio);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId(`fav_profile_${target.id}`).setLabel('❤️ View Likes').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`fav_bio_${target.id}`).setLabel('📝 View Bio').setStyle(ButtonStyle.Primary)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== BIO COMMAND ====================
    else if (command === 'bio') {
        const target = interaction.options.getUser('user') || interaction.user;
        const bio = getBio(target.id);
        
        if (!bio) {
            const embed = FavouriteEmbed.error('No Bio', `${target.username} hasn't set a bio yet!`);
            return interaction.reply({ embeds: [embed] });
        }
        
        const embed = FavouriteEmbed.bioPreview(bio.bio, target, bio.set_at);
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== BIOSET COMMAND ====================
    else if (command === 'bioset') {
        let bio = interaction.options.getString('bio');
        
        if (bio.length > 200) {
            return interaction.reply({ 
                embeds: [FavouriteEmbed.error('Bio Too Long', 'Your bio cannot exceed 200 characters!', `Current length: ${bio.length}/200`)],
                ephemeral: true
            });
        }
        
        setBio(interaction.user.id, bio);
        
        const embed = FavouriteEmbed.success(
            'Bio Updated',
            'Your profile bio has been set successfully!',
            [
                { name: '📝 Your Bio', value: `> ${bio}`, inline: false },
                { name: '💡 Tip', value: 'Use `/profile` to see how it looks', inline: true }
            ]
        );
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('fav_profile_self').setLabel('👤 View Profile').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('fav_bioreset').setLabel('🗑️ Reset Bio').setStyle(ButtonStyle.Danger)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    // ==================== BIORESET COMMAND ====================
    else if (command === 'bioreset') {
        resetBio(interaction.user.id);
        
        const embed = FavouriteEmbed.success('Bio Reset', 'Your profile bio has been removed successfully!');
        await interaction.reply({ embeds: [embed] });
    }
    
    // ==================== BIOSHOW COMMAND ====================
    else if (command === 'bioshow') {
        const bio = getBio(interaction.user.id);
        
        if (!bio) {
            const embed = FavouriteEmbed.error('No Bio', 'You haven\'t set a bio yet!', 'Use `/bioset` to add a bio to your profile');
            return interaction.reply({ embeds: [embed] });
        }
        
        const embed = FavouriteEmbed.bioPreview(bio.bio, interaction.user, bio.set_at);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('fav_bio_edit').setLabel('✏️ Edit Bio').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('fav_bioreset').setLabel('🗑️ Reset').setStyle(ButtonStyle.Danger)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
}

// ==================== BUTTON HANDLER ====================
async function handleFavouriteButtons(interaction, client) {
    const customId = interaction.customId;
    
    // Show liked songs button
    if (customId === 'fav_showliked') {
        const fakeInteraction = {
            ...interaction,
            commandName: 'showliked',
            options: { getInteger: () => null },
            reply: interaction.update.bind(interaction),
            deferReply: () => Promise.resolve(),
            editReply: interaction.editReply.bind(interaction)
        };
        await handleFavouriteCommands(fakeInteraction, client);
    }
    
    // Play liked songs button
    else if (customId === 'fav_playliked') {
        const fakeInteraction = {
            ...interaction,
            guild: interaction.guild,
            channel: interaction.channel,
            member: interaction.member,
            commandName: 'playliked',
            deferReply: () => interaction.deferReply(),
            editReply: interaction.editReply.bind(interaction),
            reply: interaction.reply.bind(interaction)
        };
        await handleFavouriteCommands(fakeInteraction, client);
    }
    
    // Clear confirmation buttons
    else if (customId === 'fav_confirm_clear') {
        const count = clearLikedSongs(interaction.user.id);
        const embed = FavouriteEmbed.success('Likes Cleared', `**${count}** songs have been removed from your favourites`);
        await interaction.update({ embeds: [embed], components: [] });
    }
    
    else if (customId === 'fav_cancel_clear') {
        const embed = FavouriteEmbed.success('Cancelled', 'Clear operation cancelled');
        await interaction.update({ embeds: [embed], components: [] });
    }
    
    // Pagination buttons
    else if (customId.startsWith('fav_prev_') || customId.startsWith('fav_next_')) {
        const parts = customId.split('_');
        const direction = parts[1];
        let currentPage = parseInt(parts[2]);
        
        if (direction === 'prev') currentPage--;
        if (direction === 'next') currentPage++;
        
        const likedSongs = getAllLikedSongs(interaction.user.id);
        const itemsPerPage = 10;
        const totalPages = Math.ceil(likedSongs.length / itemsPerPage);
        const totalDuration = likedSongs.reduce((acc, s) => acc + s.track_duration, 0);
        
        const embed = FavouriteEmbed.likedSongs(likedSongs, interaction.user, currentPage, totalPages, totalDuration);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId(`fav_prev_${currentPage}`).setLabel('◀️ Previous').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 1),
                new ButtonBuilder().setCustomId(`fav_next_${currentPage}`).setLabel('Next ▶️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === totalPages),
                new ButtonBuilder().setCustomId('fav_playliked').setLabel('▶️ Play All').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('fav_clear').setLabel('🗑️ Clear All').setStyle(ButtonStyle.Danger)
            );
        
        await interaction.update({ embeds: [embed], components: [row] });
    }
    
    // Profile buttons
    else if (customId === 'fav_profile_self') {
        const fakeInteraction = {
            ...interaction,
            commandName: 'profile',
            options: { getUser: () => interaction.user },
            reply: interaction.update.bind(interaction),
            deferReply: () => Promise.resolve(),
            editReply: interaction.editReply.bind(interaction)
        };
        await handleFavouriteCommands(fakeInteraction, client);
    }
    
    else if (customId.startsWith('fav_profile_')) {
        const userId = customId.split('_')[2];
        const user = await client.users.fetch(userId).catch(() => null);
        if (user) {
            const fakeInteraction = {
                ...interaction,
                commandName: 'profile',
                options: { getUser: () => user },
                reply: interaction.update.bind(interaction),
                deferReply: () => Promise.resolve(),
                editReply: interaction.editReply.bind(interaction)
            };
            await handleFavouriteCommands(fakeInteraction, client);
        }
    }
    
    // Bio buttons
    else if (customId === 'fav_bio_edit') {
        const embed = new EmbedBuilder()
            .setTitle('✏️ Edit Your Bio')
            .setDescription('Use `/bioset <your bio>` to update your profile bio\n\n**Max 200 characters**')
            .setColor(0x9B59B6);
        await interaction.update({ embeds: [embed], components: [] });
    }
    
    else if (customId === 'fav_bioreset') {
        const fakeInteraction = {
            ...interaction,
            commandName: 'bioreset',
            reply: interaction.update.bind(interaction),
            deferReply: () => Promise.resolve(),
            editReply: interaction.editReply.bind(interaction)
        };
        await handleFavouriteCommands(fakeInteraction, client);
    }
    
    else if (customId.startsWith('fav_bio_')) {
        const userId = customId.split('_')[2];
        const user = await client.users.fetch(userId).catch(() => null);
        if (user) {
            const bio = getBio(userId);
            if (bio) {
                const embed = FavouriteEmbed.bioPreview(bio.bio, user, bio.set_at);
                await interaction.update({ embeds: [embed] });
            }
        }
    }
}

// ==================== EXPORTS ====================
module.exports = {
    favouriteCommands,
    handleFavouriteCommands,
    handleFavouriteButtons,
    FavouriteEmbed,
    likeSong,
    unlikeSong,
    getLikedSongs,
    setBio,
    getBio
};