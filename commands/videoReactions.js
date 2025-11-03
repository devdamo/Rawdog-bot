// 🎬 Video Reaction Commands - OPTIMIZED VERSION
// Enhanced video detection and reaction system

const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits 
} = require('discord.js');

// Enhanced video detection patterns
const VIDEO_PATTERNS = {
    // Direct video file extensions
    extensions: /\.(mp4|webm|mov|avi|mkv|flv|wmv|m4v|3gp|ogv|m2ts|ts|mts)(\?[^&]*)?$/i,
    
    // Video hosting platforms with more comprehensive patterns
    platforms: [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)[\w-]+/i,
        /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)[\d]+/i,
        /(?:twitch\.tv\/videos\/|clips\.twitch\.tv\/)[\w-]+/i,
        /(?:tiktok\.com\/@[\w.-]+\/video\/|vm\.tiktok\.com\/)[\d]+/i,
        /(?:instagram\.com\/p\/|instagram\.com\/reel\/)[\w-]+/i,
        /(?:twitter\.com\/\w+\/status\/|x\.com\/\w+\/status\/)[\d]+/i,
        /(?:reddit\.com\/r\/\w+\/comments\/[\w\/]+|v\.redd\.it\/)[\w]+/i,
        /streamable\.com\/[\w]+/i,
        /(?:gfycat\.com\/|redgifs\.com\/)[\w]+/i,
        /(?:tenor\.com\/view\/|media\.tenor\.com\/)[\w-]+/i,
        /(?:giphy\.com\/gifs\/|media\.giphy\.com\/)[\w-]+/i,
        /(?:dailymotion\.com\/video\/|dai\.ly\/)[\w]+/i,
        /(?:facebook\.com\/watch\/|fb\.watch\/)[\w]+/i,
        /(?:rumble\.com\/|rumble\.com\/embed\/)[\w-]+/i
    ]
};

class VideoReactionManager {
    constructor(dataManager, serverManager) {
        this.dataManager = dataManager;
        this.serverManager = serverManager;
        
        console.log('🎬 Video Reaction Manager initialized');
    }

    // Enhanced video detection
    isVideoMessage(message) {
        try {
            // Check attachments for video files
            if (message.attachments.size > 0) {
                for (const attachment of message.attachments.values()) {
                    // Check file extension
                    if (VIDEO_PATTERNS.extensions.test(attachment.url) || 
                        VIDEO_PATTERNS.extensions.test(attachment.name || '')) {
                        return true;
                    }
                    
                    // Check content type
                    if (attachment.contentType?.startsWith('video/')) {
                        return true;
                    }
                    
                    // Check for video-like file sizes (rough heuristic)
                    if (attachment.size > 1000000 && // > 1MB
                        (attachment.name?.match(/\.(unknown|bin)$/i) || !attachment.name?.includes('.'))) {
                        // Might be a video with unknown extension
                        return true;
                    }
                }
            }

            // Check message content for video URLs
            if (message.content) {
                const content = message.content.toLowerCase();
                
                // Check for direct video file URLs
                if (VIDEO_PATTERNS.extensions.test(content)) {
                    return true;
                }

                // Check for video platform URLs
                for (const pattern of VIDEO_PATTERNS.platforms) {
                    if (pattern.test(content)) {
                        return true;
                    }
                }
                
                // Check for common video keywords in URLs
                if (content.includes('video') && (content.includes('http') || content.includes('www'))) {
                    return true;
                }
            }

            // Check embeds for video content
            if (message.embeds.length > 0) {
                for (const embed of message.embeds) {
                    // Direct video embed
                    if (embed.video || embed.type === 'video') {
                        return true;
                    }
                    
                    // Video provider
                    if (embed.provider?.name?.toLowerCase().includes('video') ||
                        embed.provider?.name?.toLowerCase().includes('youtube') ||
                        embed.provider?.name?.toLowerCase().includes('vimeo') ||
                        embed.provider?.name?.toLowerCase().includes('twitch')) {
                        return true;
                    }
                    
                    // Check embed URLs
                    if (embed.url) {
                        if (VIDEO_PATTERNS.extensions.test(embed.url)) {
                            return true;
                        }
                        
                        for (const pattern of VIDEO_PATTERNS.platforms) {
                            if (pattern.test(embed.url)) {
                                return true;
                            }
                        }
                    }
                    
                    // Check embed title/description for video keywords
                    const title = (embed.title || '').toLowerCase();
                    const description = (embed.description || '').toLowerCase();
                    
                    if ((title.includes('video') || description.includes('video')) &&
                        (embed.thumbnail || embed.image)) {
                        return true;
                    }
                }
            }

            return false;
            
        } catch (error) {
            console.error('❌ Error detecting video content:', error);
            return false;
        }
    }

    // Add like/dislike reactions to a message with retry logic
    async addVideoReactions(message) {
        const maxRetries = 3;
        let retryCount = 0;
        
        while (retryCount < maxRetries) {
            try {
                const settings = this.getVideoSettings(message.guild.id);
                
                // Add reactions with delay to avoid rate limits
                await message.react(settings.likeEmoji);
                await new Promise(resolve => setTimeout(resolve, 500));
                await message.react(settings.dislikeEmoji);
                
                console.log(`🎬 Added reactions to video post by ${message.author.tag}`);
                return true;
                
            } catch (error) {
                retryCount++;
                console.error(`❌ Error adding video reactions (attempt ${retryCount}/${maxRetries}):`, error);
                
                if (retryCount < maxRetries) {
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                } else {
                    // Final attempt failed
                    if (error.code === 50013) {
                        console.error('❌ Missing permissions to add reactions');
                    } else if (error.code === 10008) {
                        console.error('❌ Message was deleted before reactions could be added');
                    }
                    return false;
                }
            }
        }
        
        return false;
    }

    // Get video reaction settings for a guild with defaults
    getVideoSettings(guildId) {
        const settings = this.serverManager.getSettings(guildId);
        if (!settings.videoReactions) {
            settings.videoReactions = {
                enabled: false,
                channels: [],
                likeEmoji: '👍',
                dislikeEmoji: '👎',
                stats: {
                    totalVideos: 0,
                    totalReactions: 0,
                    lastProcessed: null
                }
            };
        }
        return settings.videoReactions;
    }

    // Update video reaction stats
    async updateVideoStats(guildId) {
        try {
            const settings = this.getVideoSettings(guildId);
            settings.stats.totalVideos += 1;
            settings.stats.totalReactions += 2; // Like + dislike
            settings.stats.lastProcessed = new Date().toISOString();
            await this.dataManager.saveData();
        } catch (error) {
            console.error('❌ Error updating video stats:', error);
        }
    }

    // Process existing messages in a channel for video reactions
    async processChannelVideos(channel, limit = 100) {
        try {
            console.log(`🔍 Scanning ${channel.name} for videos (last ${limit} messages)...`);
            
            const messages = await channel.messages.fetch({ limit });
            let videoCount = 0;
            let successCount = 0;
            let errorCount = 0;
            let skippedCount = 0;

            for (const message of messages.values()) {
                try {
                    if (this.isVideoMessage(message)) {
                        videoCount++;
                        
                        // Check if reactions already exist
                        const settings = this.getVideoSettings(channel.guild.id);
                        const hasLike = message.reactions.cache.has(settings.likeEmoji);
                        const hasDislike = message.reactions.cache.has(settings.dislikeEmoji);
                        
                        if (!hasLike || !hasDislike) {
                            const success = await this.addVideoReactions(message);
                            if (success) {
                                successCount++;
                                await this.updateVideoStats(channel.guild.id);
                            } else {
                                errorCount++;
                            }
                            
                            // Add delay to avoid rate limits
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } else {
                            skippedCount++;
                        }
                    }
                } catch (messageError) {
                    console.error(`❌ Error processing message ${message.id}:`, messageError);
                    errorCount++;
                }
            }

            return { 
                total: messages.size, 
                videos: videoCount, 
                success: successCount, 
                errors: errorCount,
                skipped: skippedCount
            };

        } catch (error) {
            console.error('❌ Error processing channel videos:', error);
            throw error;
        }
    }

    // Validate emoji for reactions
    isValidEmoji(emoji) {
        try {
            // Check if it's a Unicode emoji (simple check)
            if (/^[\u{1F000}-\u{1F9FF}]|^[\u{2600}-\u{26FF}]|^[\u{2700}-\u{27BF}]/u.test(emoji)) {
                return true;
            }
            
            // Check if it's a custom emoji format <:name:id>
            if (/^<a?:\w+:\d+>$/.test(emoji)) {
                return true;
            }
            
            // Check if it's a simple emoji name/character
            if (emoji.length <= 4 && emoji.trim().length > 0) {
                return true;
            }
            
            return false;
        } catch (error) {
            return false;
        }
    }
}

// Export the command definitions
module.exports = {
    VideoReactionManager,
    
    commands: [
        new SlashCommandBuilder()
            .setName('videoreact')
            .setDescription('🎬 Manage automatic video reactions')
            .addSubcommand(sub => sub
                .setName('setup')
                .setDescription('Set up video reactions for a channel')
                .addChannelOption(opt => opt
                    .setName('channel')
                    .setDescription('Channel to monitor for videos')
                    .setRequired(true))
                .addStringOption(opt => opt
                    .setName('like')
                    .setDescription('Like emoji (default: 👍)')
                    .setRequired(false))
                .addStringOption(opt => opt
                    .setName('dislike')
                    .setDescription('Dislike emoji (default: 👎)')
                    .setRequired(false)))
            .addSubcommand(sub => sub
                .setName('remove')
                .setDescription('Remove video monitoring from a channel')
                .addChannelOption(opt => opt
                    .setName('channel')
                    .setDescription('Channel to stop monitoring')
                    .setRequired(true)))
            .addSubcommand(sub => sub
                .setName('list')
                .setDescription('List channels being monitored for videos'))
            .addSubcommand(sub => sub
                .setName('process')
                .setDescription('Add reactions to existing videos in a channel')
                .addChannelOption(opt => opt
                    .setName('channel')
                    .setDescription('Channel to process')
                    .setRequired(true))
                .addIntegerOption(opt => opt
                    .setName('limit')
                    .setDescription('Number of recent messages to check (default: 100, max: 1000)')
                    .setMinValue(1)
                    .setMaxValue(1000)
                    .setRequired(false)))
            .addSubcommand(sub => sub
                .setName('stats')
                .setDescription('View video reaction statistics'))
            .addSubcommand(sub => sub
                .setName('test')
                .setDescription('Test video detection on a message')
                .addStringOption(opt => opt
                    .setName('message_id')
                    .setDescription('Message ID to test')
                    .setRequired(true))
                .addChannelOption(opt => opt
                    .setName('channel')
                    .setDescription('Channel containing the message')
                    .setRequired(false)))
            .addSubcommand(sub => sub
                .setName('settings')
                .setDescription('View or modify video reaction settings')
                .addStringOption(opt => opt
                    .setName('like_emoji')
                    .setDescription('New like emoji')
                    .setRequired(false))
                .addStringOption(opt => opt
                    .setName('dislike_emoji')
                    .setDescription('New dislike emoji')
                    .setRequired(false)))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    ],

    // Command handler function
    async handleVideoReact(interaction, videoManager) {
        const subcommand = interaction.options.getSubcommand();
        
        try {
            switch (subcommand) {
                case 'setup':
                    await this.handleSetup(interaction, videoManager);
                    break;
                case 'remove':
                    await this.handleRemove(interaction, videoManager);
                    break;
                case 'list':
                    await this.handleList(interaction, videoManager);
                    break;
                case 'process':
                    await this.handleProcess(interaction, videoManager);
                    break;
                case 'stats':
                    await this.handleStats(interaction, videoManager);
                    break;
                case 'test':
                    await this.handleTest(interaction, videoManager);
                    break;
                case 'settings':
                    await this.handleSettings(interaction, videoManager);
                    break;
                default:
                    await interaction.reply({
                        content: '❌ Unknown subcommand!',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('❌ Error in video react command:', error);
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ **Command Error**\n\nSomething went wrong while processing the video reaction command.',
                    ephemeral: true
                });
            } else if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ **Command Error**\n\nSomething went wrong while processing the video reaction command.'
                });
            }
        }
    },

    async handleSetup(interaction, videoManager) {
        const channel = interaction.options.getChannel('channel');
        const likeEmoji = interaction.options.getString('like') || '👍';
        const dislikeEmoji = interaction.options.getString('dislike') || '👎';

        // Validate emojis
        if (!videoManager.isValidEmoji(likeEmoji)) {
            return interaction.reply({ 
                content: '❌ Invalid like emoji! Please use a valid emoji.', 
                ephemeral: true 
            });
        }

        if (!videoManager.isValidEmoji(dislikeEmoji)) {
            return interaction.reply({ 
                content: '❌ Invalid dislike emoji! Please use a valid emoji.', 
                ephemeral: true 
            });
        }

        // Check bot permissions
        const requiredPermissions = ['ViewChannel', 'ReadMessageHistory', 'AddReactions'];
        const missingPermissions = requiredPermissions.filter(perm => 
            !channel.permissionsFor(interaction.guild.members.me).has(perm)
        );

        if (missingPermissions.length > 0) {
            return interaction.reply({ 
                content: `❌ I need the following permissions in ${channel}: ${missingPermissions.join(', ')}`, 
                ephemeral: true 
            });
        }

        const videoSettings = videoManager.getVideoSettings(interaction.guild.id);
        
        // Add channel to monitoring list
        if (!videoSettings.channels.includes(channel.id)) {
            videoSettings.channels.push(channel.id);
        }
        
        videoSettings.enabled = true;
        videoSettings.likeEmoji = likeEmoji;
        videoSettings.dislikeEmoji = dislikeEmoji;
        
        await videoManager.dataManager.saveData();

        const setupEmbed = new EmbedBuilder()
            .setTitle('🎬 Video Reactions Enabled!')
            .setDescription(`**Channel:** ${channel}\n**Like Emoji:** ${likeEmoji}\n**Dislike Emoji:** ${dislikeEmoji}\n\n*New videos posted in this channel will automatically get reactions!*`)
            .setColor(0x00FF99)
            .setTimestamp();

        await interaction.reply({ embeds: [setupEmbed], ephemeral: true });
    },

    async handleRemove(interaction, videoManager) {
        const channel = interaction.options.getChannel('channel');
        const videoSettings = videoManager.getVideoSettings(interaction.guild.id);

        const index = videoSettings.channels.indexOf(channel.id);
        if (index === -1) {
            return interaction.reply({ 
                content: `❌ ${channel.name} is not being monitored for videos!`, 
                ephemeral: true 
            });
        }

        videoSettings.channels.splice(index, 1);
        
        // Disable if no channels left
        if (videoSettings.channels.length === 0) {
            videoSettings.enabled = false;
        }
        
        await videoManager.dataManager.saveData();

        await interaction.reply({ 
            content: `✅ Removed video monitoring from ${channel.name}!`, 
            ephemeral: true 
        });
    },

    async handleList(interaction, videoManager) {
        const videoSettings = videoManager.getVideoSettings(interaction.guild.id);

        if (!videoSettings.enabled || videoSettings.channels.length === 0) {
            return interaction.reply({ 
                content: '📺 No channels are currently being monitored for videos.\n\nUse `/videoreact setup` to start monitoring a channel!', 
                ephemeral: true 
            });
        }

        const channelList = videoSettings.channels
            .map(channelId => {
                const channel = interaction.guild.channels.cache.get(channelId);
                return channel ? `• ${channel.name}` : `• *Deleted Channel (${channelId})*`;
            })
            .join('\n');

        const listEmbed = new EmbedBuilder()
            .setTitle('🎬 Video Monitoring Status')
            .setDescription(`**Status:** ${videoSettings.enabled ? '✅ Enabled' : '❌ Disabled'}\n**Like Emoji:** ${videoSettings.likeEmoji}\n**Dislike Emoji:** ${videoSettings.dislikeEmoji}\n\n**Monitored Channels:**\n${channelList}`)
            .setColor(0x3498DB)
            .addFields({
                name: '📊 Statistics',
                value: `Videos Processed: ${videoSettings.stats.totalVideos}\nReactions Added: ${videoSettings.stats.totalReactions}`,
                inline: true
            })
            .setTimestamp();

        await interaction.reply({ embeds: [listEmbed], ephemeral: true });
    },

    async handleProcess(interaction, videoManager) {
        const channel = interaction.options.getChannel('channel');
        const limit = interaction.options.getInteger('limit') || 100;

        // Check permissions
        const requiredPermissions = ['ViewChannel', 'ReadMessageHistory', 'AddReactions'];
        const missingPermissions = requiredPermissions.filter(perm => 
            !channel.permissionsFor(interaction.guild.members.me).has(perm)
        );

        if (missingPermissions.length > 0) {
            return interaction.reply({ 
                content: `❌ I need the following permissions in ${channel}: ${missingPermissions.join(', ')}`, 
                ephemeral: true 
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const result = await videoManager.processChannelVideos(channel, limit);

            const processEmbed = new EmbedBuilder()
                .setTitle('🎬 Video Processing Complete!')
                .setDescription(`**Channel:** ${channel.name}\n**Messages Scanned:** ${result.total}\n**Videos Found:** ${result.videos}\n**Reactions Added:** ${result.success}\n**Already Had Reactions:** ${result.skipped}\n**Errors:** ${result.errors}`)
                .setColor(result.errors === 0 ? 0x00FF99 : 0xFF6B6B)
                .setTimestamp();

            if (result.errors > 0) {
                processEmbed.addFields({
                    name: '⚠️ Notes',
                    value: 'Some reactions could not be added due to permissions or deleted messages.',
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [processEmbed] });

        } catch (error) {
            console.error('❌ Error processing videos:', error);
            await interaction.editReply({ 
                content: '❌ Failed to process videos! Check bot permissions and try again.' 
            });
        }
    },

    async handleStats(interaction, videoManager) {
        const videoSettings = videoManager.getVideoSettings(interaction.guild.id);

        const statsEmbed = new EmbedBuilder()
            .setTitle('📊 Video Reaction Statistics')
            .setDescription(`**Status:** ${videoSettings.enabled ? '✅ Enabled' : '❌ Disabled'}\n**Monitored Channels:** ${videoSettings.channels.length}\n**Total Videos Processed:** ${videoSettings.stats.totalVideos}\n**Total Reactions Added:** ${videoSettings.stats.totalReactions}`)
            .setColor(0x3498DB)
            .addFields({
                name: '⚙️ Current Settings',
                value: `Like Emoji: ${videoSettings.likeEmoji}\nDislike Emoji: ${videoSettings.dislikeEmoji}`,
                inline: true
            })
            .setTimestamp();

        if (videoSettings.stats.lastProcessed) {
            const lastProcessed = new Date(videoSettings.stats.lastProcessed);
            statsEmbed.addFields({
                name: '🕒 Last Activity',
                value: `<t:${Math.floor(lastProcessed.getTime() / 1000)}:R>`,
                inline: true
            });
        }

        await interaction.reply({ embeds: [statsEmbed], ephemeral: true });
    },

    async handleTest(interaction, videoManager) {
        const messageId = interaction.options.getString('message_id');
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        try {
            const message = await channel.messages.fetch(messageId);
            const isVideo = videoManager.isVideoMessage(message);

            const testEmbed = new EmbedBuilder()
                .setTitle('🧪 Video Detection Test')
                .setDescription(`**Message:** [Jump to Message](${message.url})\n**Author:** ${message.author.tag}\n**Is Video:** ${isVideo ? '✅ Yes' : '❌ No'}\n**Attachments:** ${message.attachments.size}\n**Embeds:** ${message.embeds.length}\n**Content Length:** ${message.content.length}`)
                .setColor(isVideo ? 0x00FF99 : 0xFF6B6B)
                .setTimestamp();

            if (message.content && message.content.length > 0) {
                testEmbed.addFields({ 
                    name: 'Message Content', 
                    value: message.content.length > 1000 ? message.content.substring(0, 1000) + '...' : message.content
                });
            }

            if (message.attachments.size > 0) {
                const attachmentInfo = Array.from(message.attachments.values())
                    .map(a => `• ${a.name || 'Unknown'} (${a.contentType || 'Unknown type'})`)
                    .join('\n');
                testEmbed.addFields({
                    name: 'Attachments',
                    value: attachmentInfo.length > 1000 ? attachmentInfo.substring(0, 1000) + '...' : attachmentInfo
                });
            }

            await interaction.reply({ embeds: [testEmbed], ephemeral: true });

        } catch (error) {
            console.error('❌ Error testing message:', error);
            await interaction.reply({ 
                content: '❌ Could not find that message! Make sure the message ID is correct and I have access to the channel.', 
                ephemeral: true 
            });
        }
    },

    async handleSettings(interaction, videoManager) {
        const likeEmoji = interaction.options.getString('like_emoji');
        const dislikeEmoji = interaction.options.getString('dislike_emoji');
        const videoSettings = videoManager.getVideoSettings(interaction.guild.id);

        // If no new settings provided, just show current settings
        if (!likeEmoji && !dislikeEmoji) {
            const settingsEmbed = new EmbedBuilder()
                .setTitle('⚙️ Video Reaction Settings')
                .setDescription(`**Status:** ${videoSettings.enabled ? '✅ Enabled' : '❌ Disabled'}\n**Like Emoji:** ${videoSettings.likeEmoji}\n**Dislike Emoji:** ${videoSettings.dislikeEmoji}\n**Monitored Channels:** ${videoSettings.channels.length}`)
                .setColor(0x3498DB)
                .setTimestamp();

            return interaction.reply({ embeds: [settingsEmbed], ephemeral: true });
        }

        // Update settings
        let updated = [];

        if (likeEmoji) {
            if (!videoManager.isValidEmoji(likeEmoji)) {
                return interaction.reply({ 
                    content: '❌ Invalid like emoji! Please use a valid emoji.', 
                    ephemeral: true 
                });
            }
            videoSettings.likeEmoji = likeEmoji;
            updated.push(`Like emoji: ${likeEmoji}`);
        }

        if (dislikeEmoji) {
            if (!videoManager.isValidEmoji(dislikeEmoji)) {
                return interaction.reply({ 
                    content: '❌ Invalid dislike emoji! Please use a valid emoji.', 
                    ephemeral: true 
                });
            }
            videoSettings.dislikeEmoji = dislikeEmoji;
            updated.push(`Dislike emoji: ${dislikeEmoji}`);
        }

        await videoManager.dataManager.saveData();

        const updateEmbed = new EmbedBuilder()
            .setTitle('✅ Settings Updated!')
            .setDescription(`**Updated:**\n• ${updated.join('\n• ')}\n\n**Current Settings:**\nLike: ${videoSettings.likeEmoji}\nDislike: ${videoSettings.dislikeEmoji}`)
            .setColor(0x00FF99)
            .setTimestamp();

        await interaction.reply({ embeds: [updateEmbed], ephemeral: true });
    }
};
