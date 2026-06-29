const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const ms = require('ms');
require('dotenv').config();

// ==================== PREMIUM EMBED DESIGN ====================
class FilterEmbed {
    static success(title, description, filterName, thumbnail = null) {
        const embed = new EmbedBuilder()
            .setAuthor({ name: '🎛️ MELODY • AUDIO FILTERS', iconURL: 'https://cdn.discordapp.com/attachments/xxx/filter-icon.png' })
            .setTitle(`✨ ${title}`)
            .setDescription(description)
            .addFields(
                { name: '🎚️ Applied Filter', value: `\`${filterName}\``, inline: true },
                { name: '🎵 Status', value: '`Active`', inline: true },
                { name: '💡 Tip', value: 'Use `/reset` to remove all filters', inline: false }
            )
            .setColor(0x9B59B6)
            .setTimestamp()
            .setFooter({ text: 'Melody • Premium Audio Filters', iconURL: 'https://cdn.discordapp.com/attachments/xxx/footer.png' });
        
        if (thumbnail) embed.setThumbnail(thumbnail);
        return embed;
    }

    static error(title, description, suggestion = null) {
        const embed = new EmbedBuilder()
            .setAuthor({ name: '❌ MELODY • FILTER ERROR', iconURL: 'https://cdn.discordapp.com/attachments/xxx/error-icon.png' })
            .setTitle(`❌ ${title}`)
            .setDescription(description)
            .setColor(0xFF3366)
            .setTimestamp()
            .setFooter({ text: 'Please try again • Melody Premium' });
        
        if (suggestion) embed.addFields({ name: '💡 Suggestion', value: suggestion, inline: false });
        return embed;
    }

    static info(title, description, currentFilters = []) {
        const filterList = currentFilters.length ? currentFilters.map(f => `🎚️ \`${f}\``).join('\n') : '`No active filters`';
        
        return new EmbedBuilder()
            .setAuthor({ name: 'ℹ️ MELODY • FILTER STATUS', iconURL: 'https://cdn.discordapp.com/attachments/xxx/info-icon.png' })
            .setTitle(`ℹ️ ${title}`)
            .setDescription(description)
            .addFields(
                { name: '🎛️ Active Filters', value: filterList, inline: true },
                { name: '📊 Total Filters', value: `\`${currentFilters.length}\` active`, inline: true }
            )
            .setColor(0x00FFCC)
            .setTimestamp();
    }

    static filterList() {
        const filters = {
            '🎧 3D/Surround': '`8d` `tremolo`',
            '🎵 Bass/Boost': '`bass` `earrape` `pop`',
            '🎤 Vocal Effects': '`daycore` `karaoke` `vaporwave`',
            '⚡ Speed/Pitch': '`speed` `pitch` `doubletime` `slow`',
            '🎭 Character': '`china` `darthvader` `party`',
            '📻 Vintage': '`radio` `rate`',
            '🔄 Equalizer': '`equalizer` (10-band custom)'
        };
        
        let description = '> *Transform your music with premium audio filters*\n';
        for (const [category, cmds] of Object.entries(filters)) {
            description += `\n**${category}**\n${cmds}\n`;
        }
        description += '\n> **Use `/reset` to remove all filters**';
        
        return new EmbedBuilder()
            .setAuthor({ name: '🎛️ MELODY • AVAILABLE FILTERS', iconURL: 'https://cdn.discordapp.com/attachments/xxx/filters-icon.png' })
            .setTitle('🎚️ **20+ PREMIUM AUDIO FILTERS**')
            .setDescription(description)
            .setColor(0xFF00FF)
            .setThumbnail('https://i.imgur.com/filters-thumb.png')
            .setImage('https://i.imgur.com/filters-banner.gif')
            .setFooter({ text: 'Each filter is carefully tuned for the best experience' });
    }

    static filterControls(currentFilter) {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('filter_reset').setLabel('🔄 Reset All').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('filter_info').setLabel('ℹ️ Current Filter').setStyle(ButtonStyle.Secondary)
            );
        
        if (currentFilter && currentFilter !== 'reset') {
            row.addComponents(
                new ButtonBuilder().setCustomId(`filter_${currentFilter}`).setLabel(`🎚️ ${currentFilter.toUpperCase()} Active`).setStyle(ButtonStyle.Success).setDisabled(true)
            );
        }
        
        return row;
    }
}

// ==================== FILTER CONFIGURATIONS ====================
const filters = {
    // 3D/Surround Effects
    '8d': {
        name: '8D',
        emoji: '🎧',
        description: '8D surround sound effect - music moves around your head',
        apply: () => ({
            rotation: { rotationHz: 0.2 },
            timescale: { speed: 1.0, pitch: 1.0, rate: 1.0 }
        })
    },
    'tremolo': {
        name: 'Tremolo',
        emoji: '🌊',
        description: 'Volume modulation effect - creates a trembling sensation',
        apply: () => ({
            tremolo: { frequency: 4.0, depth: 0.75 }
        })
    },
    
    // Bass/Boost Effects
    'bass': {
        name: 'Bass Boost',
        emoji: '🔊',
        description: 'Enhanced low frequencies for deeper bass',
        apply: () => ({
            equalizer: [
                { band: 0, gain: 0.2 }, { band: 1, gain: 0.15 },
                { band: 2, gain: 0.1 }, { band: 3, gain: 0.05 }
            ]
        })
    },
    'earrape': {
        name: 'Earrape',
        emoji: '⚠️',
        description: 'Maximum volume boost - LOUD!',
        apply: () => ({
            timescale: { speed: 1.0, pitch: 1.0, rate: 1.5 },
            equalizer: Array.from({ length: 15 }, (_, i) => ({ band: i, gain: 0.5 }))
        })
    },
    'pop': {
        name: 'Pop',
        emoji: '🎤',
        description: 'Pop music equalizer - punchy and clear',
        apply: () => ({
            equalizer: [
                { band: 0, gain: -0.1 }, { band: 1, gain: 0.2 },
                { band: 2, gain: 0.3 }, { band: 3, gain: 0.2 },
                { band: 4, gain: 0.1 }, { band: 5, gain: -0.1 }
            ]
        })
    },
    
    // Vocal Effects
    'daycore': {
        name: 'Daycore',
        emoji: '☀️',
        description: 'Slowed + pitched down for a dreamy effect',
        apply: () => ({
            timescale: { speed: 0.85, pitch: 0.9, rate: 0.9 }
        })
    },
    'karaoke': {
        name: 'Karaoke',
        emoji: '🎤',
        description: 'Removes vocals - perfect for karaoke!',
        apply: () => ({
            karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 }
        })
    },
    'vaporwave': {
        name: 'Vaporwave',
        emoji: '🌊',
        description: 'Slowed + reverb + pitch down - aesthetic vibes',
        apply: () => ({
            timescale: { speed: 0.8, pitch: 0.7, rate: 0.8 },
            distortion: { sinOffset: 0.0, sinScale: 0.0, cosOffset: 0.0, cosScale: 0.0, tanOffset: 0.0, tanScale: 0.0, offset: 0.0, scale: 0.0 }
        })
    },
    
    // Speed/Pitch Effects
    'speed': {
        name: 'Speed',
        emoji: '⚡',
        description: 'Increase playback speed (1.2x)',
        apply: () => ({
            timescale: { speed: 1.2, pitch: 1.2, rate: 1.0 }
        })
    },
    'doubletime': {
        name: 'Double Time',
        emoji: '⏩',
        description: '2x speed - fast forward!',
        apply: () => ({
            timescale: { speed: 2.0, pitch: 2.0, rate: 1.0 }
        })
    },
    'slow': {
        name: 'Slow',
        emoji: '🐢',
        description: 'Slow motion effect (0.7x)',
        apply: () => ({
            timescale: { speed: 0.7, pitch: 0.7, rate: 0.7 }
        })
    },
    'pitch': {
        name: 'Pitch Shift',
        emoji: '🎵',
        description: 'Change pitch without changing tempo',
        apply: () => ({
            timescale: { speed: 1.0, pitch: 1.3, rate: 1.0 }
        })
    },
    
    // Character Effects
    'china': {
        name: 'China',
        emoji: '🇨🇳',
        description: 'Chinese traditional music effect',
        apply: () => ({
            timescale: { speed: 0.95, pitch: 1.1, rate: 0.9 },
            distortion: { sinOffset: 0.1, sinScale: 0.2, cosOffset: 0.0, cosScale: 0.0, tanOffset: 0.0, tanScale: 0.0, offset: 0.0, scale: 0.0 }
        })
    },
    'darthvader': {
        name: 'Darth Vader',
        emoji: '🦹',
        description: 'Deep, menacing voice effect',
        apply: () => ({
            timescale: { speed: 0.7, pitch: 0.5, rate: 0.7 }
        })
    },
    'party': {
        name: 'Party',
        emoji: '🎉',
        description: 'Festive effect with slight echo',
        apply: () => ({
            timescale: { speed: 1.1, pitch: 1.1, rate: 1.1 },
            distortion: { sinOffset: 0.0, sinScale: 0.1, cosOffset: 0.0, cosScale: 0.1, tanOffset: 0.0, tanScale: 0.0, offset: 0.0, scale: 0.0 }
        })
    },
    
    // Vintage Effects
    'radio': {
        name: 'Radio',
        emoji: '📻',
        description: 'AM radio quality - lo-fi vintage sound',
        apply: () => ({
            equalizer: [
                { band: 0, gain: -0.2 }, { band: 1, gain: -0.1 },
                { band: 2, gain: 0.0 }, { band: 3, gain: 0.1 },
                { band: 8, gain: -0.2 }, { band: 9, gain: -0.3 }
            ],
            distortion: { sinOffset: 0.0, sinScale: 0.05, cosOffset: 0.0, cosScale: 0.05, tanOffset: 0.0, tanScale: 0.0, offset: 0.0, scale: 0.0 }
        })
    },
    'rate': {
        name: 'Rate',
        emoji: '📀',
        description: 'Vinyl record effect - warm and distorted',
        apply: () => ({
            timescale: { speed: 0.98, pitch: 0.98, rate: 0.95 },
            distortion: { sinOffset: 0.0, sinScale: 0.03, cosOffset: 0.0, cosScale: 0.03, tanOffset: 0.0, tanScale: 0.0, offset: 0.0, scale: 0.0 }
        })
    },
    
    // Reset
    'reset': {
        name: 'Reset',
        emoji: '🔄',
        description: 'Remove all filters',
        apply: () => ({})
    }
};

// ==================== CUSTOM EQUALIZER PRESETS ====================
const equalizers = {
    'flat': Array.from({ length: 15 }, () => 0),
    'boost': Array.from({ length: 15 }, (_, i) => i < 4 ? 0.2 : 0),
    'treble': Array.from({ length: 15 }, (_, i) => i > 8 ? 0.15 : 0),
    'acoustic': [0.1, 0.15, 0.2, 0.15, 0.1, 0.05, 0, -0.05, -0.1, -0.15, -0.1, -0.05, 0, 0.05, 0.1],
    'classical': [0.15, 0.1, 0.05, 0, -0.05, -0.1, -0.15, -0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15],
    'dance': [0.2, 0.15, 0.1, 0.05, 0, -0.05, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3],
    'electronic': [0.1, 0.15, 0.2, 0.25, 0.2, 0.15, 0.1, 0.05, 0, -0.05, -0.1, 0, 0.1, 0.15, 0.2],
    'hiphop': [0.25, 0.2, 0.15, 0.1, 0.05, 0, -0.05, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.25],
    'jazz': [0.1, 0.05, 0, -0.05, -0.1, -0.15, -0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2],
    'rock': [0.2, 0.15, 0.1, 0.05, 0, -0.05, -0.1, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2],
    'metal': [0.3, 0.25, 0.2, 0.15, 0.1, 0.05, 0, -0.05, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2]
};

// ==================== COMMANDS REGISTRATION ====================
const filterCommands = [
    new SlashCommandBuilder().setName('8d').setDescription('🎧 Apply 8D surround sound effect'),
    new SlashCommandBuilder().setName('bass').setDescription('🔊 Apply bass boost effect'),
    new SlashCommandBuilder().setName('china').setDescription('🇨🇳 Apply Chinese traditional effect'),
    new SlashCommandBuilder().setName('darthvader').setDescription('🦹 Apply Darth Vader voice effect'),
    new SlashCommandBuilder().setName('daycore').setDescription('☀️ Apply daycore (slowed + pitched) effect'),
    new SlashCommandBuilder().setName('doubletime').setDescription('⏩ Apply double time (2x speed) effect'),
    new SlashCommandBuilder().setName('earrape').setDescription('⚠️ Apply earrape (maximum volume) effect'),
    new SlashCommandBuilder().setName('equalizer').setDescription('🎛️ Apply custom equalizer preset')
        .addStringOption(opt => opt.setName('preset').setDescription('Equalizer preset').setRequired(true)
            .addChoices(
                { name: 'Flat', value: 'flat' },
                { name: 'Bass Boost', value: 'boost' },
                { name: 'Treble Boost', value: 'treble' },
                { name: 'Acoustic', value: 'acoustic' },
                { name: 'Classical', value: 'classical' },
                { name: 'Dance', value: 'dance' },
                { name: 'Electronic', value: 'electronic' },
                { name: 'Hip Hop', value: 'hiphop' },
                { name: 'Jazz', value: 'jazz' },
                { name: 'Rock', value: 'rock' },
                { name: 'Metal', value: 'metal' }
            )),
    new SlashCommandBuilder().setName('karaoke').setDescription('🎤 Apply karaoke (vocal removal) effect'),
    new SlashCommandBuilder().setName('party').setDescription('🎉 Apply party effect'),
    new SlashCommandBuilder().setName('pitch').setDescription('🎵 Apply pitch shift effect'),
    new SlashCommandBuilder().setName('pop').setDescription('🎤 Apply pop music equalizer'),
    new SlashCommandBuilder().setName('radio').setDescription('📻 Apply radio (vintage AM) effect'),
    new SlashCommandBuilder().setName('rate').setDescription('📀 Apply rate (vinyl) effect'),
    new SlashCommandBuilder().setName('reset').setDescription('🔄 Reset all active filters'),
    new SlashCommandBuilder().setName('slow').setDescription('🐢 Apply slow motion effect'),
    new SlashCommandBuilder().setName('speed').setDescription('⚡ Apply speed effect (1.2x)'),
    new SlashCommandBuilder().setName('tremolo').setDescription('🌊 Apply tremolo (volume modulation) effect'),
    new SlashCommandBuilder().setName('vaporwave').setDescription('🌊 Apply vaporwave aesthetic effect'),
    new SlashCommandBuilder().setName('filters').setDescription('🎛️ Show all available filters with descriptions')
];

// ==================== FILTER COMMAND HANDLER ====================
async function handleFilterCommands(interaction, client) {
    const command = interaction.commandName;
    const player = client.wavelink?.players?.get(interaction.guild.id);
    
    // Check if player exists and is playing
    if (command !== 'filters' && command !== 'reset') {
        if (!player || !player.playing) {
            return interaction.reply({ 
                embeds: [FilterEmbed.error('Nothing Playing', 'No song is currently playing!', 'Use `/play` to start playing music first')],
                ephemeral: true 
            });
        }
    }
    
    // ==================== SHOW ALL FILTERS ====================
    if (command === 'filters') {
        const embed = FilterEmbed.filterList();
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('filter_reset_all').setLabel('🔄 Reset All Filters').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('filter_current').setLabel('🎚️ Current Filters').setStyle(ButtonStyle.Secondary)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
        return;
    }
    
    // ==================== RESET FILTERS ====================
    if (command === 'reset') {
        await player.setFilter({});
        
        const embed = FilterEmbed.success(
            'Filters Reset',
            'All audio filters have been removed!',
            'None',
            'https://i.imgur.com/reset-icon.png'
        );
        
        const row = FilterEmbed.filterControls('reset');
        await interaction.reply({ embeds: [embed], components: [row] });
        return;
    }
    
    // ==================== CUSTOM EQUALIZER ====================
    if (command === 'equalizer') {
        const preset = interaction.options.getString('preset');
        const bands = equalizers[preset];
        
        if (!bands) {
            return interaction.reply({ 
                embeds: [FilterEmbed.error('Invalid Preset', 'That equalizer preset does not exist!')],
                ephemeral: true
            });
        }
        
        const equalizerBands = bands.map((gain, index) => ({ band: index, gain }));
        await player.setFilter({ equalizer: equalizerBands });
        
        const embed = new EmbedBuilder()
            .setAuthor({ name: '🎛️ MELODY • EQUALIZER', iconURL: 'https://cdn.discordapp.com/attachments/xxx/eq-icon.png' })
            .setTitle(`🔊 ${preset.toUpperCase()} EQUALIZER`)
            .setDescription(`Applied **${preset}** equalizer preset to the current track`)
            .addFields(
                { name: '📊 Frequency Response', value: createEqualizerBar(bands), inline: false },
                { name: '🎚️ Preset', value: `\`${preset}\``, inline: true },
                { name: '💡 Tip', value: 'Try different presets for different genres!', inline: true }
            )
            .setColor(0x00FF88)
            .setTimestamp();
        
        function createEqualizerBar(bands) {
            const bars = bands.slice(0, 10).map(gain => {
                const level = Math.floor((gain + 0.3) * 10);
                const clamped = Math.min(10, Math.max(0, level));
                return '█'.repeat(clamped) + '░'.repeat(10 - clamped);
            }).join('\n');
            return `\`\`\`\n${bars}\n\`\`\``;
        }
        
        await interaction.reply({ embeds: [embed] });
        return;
    }
    
    // ==================== APPLY NAMED FILTERS ====================
    const filter = filters[command];
    if (!filter) {
        return interaction.reply({ 
            embeds: [FilterEmbed.error('Unknown Filter', `Filter **${command}** does not exist!`, 'Use `/filters` to see all available filters')],
            ephemeral: true
        });
    }
    
    try {
        const filterConfig = filter.apply();
        await player.setFilter(filterConfig);
        
        // Store active filter in player for tracking
        if (!player.activeFilters) player.activeFilters = [];
        if (!player.activeFilters.includes(command) && command !== 'reset') {
            player.activeFilters.push(command);
        }
        
        const embed = new EmbedBuilder()
            .setAuthor({ name: '🎛️ MELODY • FILTER APPLIED', iconURL: 'https://cdn.discordapp.com/attachments/xxx/filter-active.png' })
            .setTitle(`${filter.emoji} ${filter.name} FILTER`)
            .setDescription(filter.description)
            .addFields(
                { name: '🎵 Current Track', value: `**${player.current?.title || 'Unknown'}**`, inline: false },
                { name: '🎚️ Effect', value: `\`${filter.name}\``, inline: true },
                { name: '🔄 Status', value: '`Active`', inline: true },
                { name: '💡 Pro Tip', value: 'Stack multiple filters for unique sounds!', inline: false }
            )
            .setColor(0x9B59B6)
            .setThumbnail('https://i.imgur.com/filter-thumb.gif')
            .setTimestamp()
            .setFooter({ text: 'Use /reset to remove all filters • Melody Premium' });
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('filter_reset').setLabel('🔄 Reset Filter').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('filter_info').setLabel('ℹ️ Filter Info').setStyle(ButtonStyle.Secondary)
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
        
    } catch (error) {
        console.error(`Error applying filter ${command}:`, error);
        await interaction.reply({ 
            embeds: [FilterEmbed.error('Filter Failed', 'Could not apply the filter. Please try again!', 'Make sure Lavalink is connected properly')],
            ephemeral: true
        });
    }
}

// ==================== BUTTON HANDLER ====================
async function handleFilterButtons(interaction, client) {
    const customId = interaction.customId;
    const player = client.wavelink?.players?.get(interaction.guild.id);
    
    if (!player || !player.playing) {
        return interaction.reply({ 
            embeds: [FilterEmbed.error('No Player', 'No song is currently playing!', 'Start playing music first')],
            ephemeral: true
        });
    }
    
    if (customId === 'filter_reset' || customId === 'filter_reset_all') {
        await player.setFilter({});
        if (player.activeFilters) player.activeFilters = [];
        
        const embed = FilterEmbed.success('Filters Reset', 'All audio filters have been removed from the current track!', 'None');
        await interaction.update({ embeds: [embed], components: [] });
    }
    
    else if (customId === 'filter_info' || customId === 'filter_current') {
        const activeFilters = player.activeFilters || [];
        
        if (activeFilters.length === 0) {
            const embed = FilterEmbed.info('No Active Filters', 'No filters are currently applied to the music.', []);
            await interaction.update({ embeds: [embed], components: [FilterEmbed.filterControls('none')] });
        } else {
            const filterDetails = activeFilters.map(f => {
                const filterInfo = filters[f];
                return `**${filterInfo?.emoji || '🎚️'} ${filterInfo?.name || f}**: ${filterInfo?.description || 'No description'}`;
            }).join('\n\n');
            
            const embed = new EmbedBuilder()
                .setAuthor({ name: '🎛️ MELODY • ACTIVE FILTERS', iconURL: 'https://cdn.discordapp.com/attachments/xxx/filters-active.png' })
                .setTitle('🔊 CURRENTLY ACTIVE FILTERS')
                .setDescription(filterDetails || 'No detailed information available')
                .addFields(
                    { name: '📊 Total Filters', value: `\`${activeFilters.length}\` active`, inline: true },
                    { name: '🎵 Playing', value: `**${player.current?.title}**`, inline: true },
                    { name: '🔄 Reset', value: 'Use `/reset` or click the reset button', inline: false }
                )
                .setColor(0x00FFCC)
                .setTimestamp();
            
            await interaction.update({ embeds: [embed], components: [FilterEmbed.filterControls(activeFilters[0])] });
        }
    }
}

// ==================== EXPORTS ====================
module.exports = {
    filterCommands,
    handleFilterCommands,
    handleFilterButtons,
    FilterEmbed,
    filters,
    equalizers
};