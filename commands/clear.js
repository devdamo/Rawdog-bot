// 🧹 Clear Messages Command - Enhanced Discord Gaming Server Bot
// Allows moderators to clear a specified number of messages in the current channel

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const data = new SlashCommandBuilder()
    .setName('clear')
    .setDescription('🧹 Clear a specified number of messages from the current channel')
    .addIntegerOption(option =>
        option
            .setName('amount')
            .setDescription('Number of messages to delete (1-100)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100)
    )
    .addUserOption(option =>
        option
            .setName('user')
            .setDescription('Only delete messages from this specific user (optional)')
            .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false);

async function execute(interaction) {
    try {
        // Get the amount and optional user
        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('user');
        
        // Check if user has manage messages permission
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            const noPermEmbed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle('❌ Permission Denied')
                .setDescription('You need the **Manage Messages** permission to use this command.')
                .setTimestamp();
                
            return await interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
        }

        // Check if bot has manage messages permission
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
            const botNoPermEmbed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle('❌ Bot Permission Error')
                .setDescription('I need the **Manage Messages** permission to delete messages.')
                .setTimestamp();
                
            return await interaction.reply({ embeds: [botNoPermEmbed], ephemeral: true });
        }

        // Defer reply since message deletion might take time
        await interaction.deferReply({ ephemeral: true });

        // Fetch messages
        let messages;
        try {
            messages = await interaction.channel.messages.fetch({ 
                limit: targetUser ? Math.min(amount * 2, 100) : amount // Fetch more if filtering by user
            });
        } catch (error) {
            console.error('Error fetching messages:', error);
            
            const fetchErrorEmbed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle('❌ Fetch Error')
                .setDescription('Failed to fetch messages. Please try again.')
                .setTimestamp();
                
            return await interaction.editReply({ embeds: [fetchErrorEmbed] });
        }

        // Filter messages if targeting specific user
        if (targetUser) {
            messages = messages.filter(msg => msg.author.id === targetUser.id);
            messages = messages.first(amount); // Limit to requested amount
        }

        // Filter out messages older than 14 days (Discord limitation)
        const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
        const deletableMessages = messages.filter(msg => msg.createdTimestamp > twoWeeksAgo);
        const tooOldCount = messages.size - deletableMessages.size;

        if (deletableMessages.size === 0) {
            const noMessagesEmbed = new EmbedBuilder()
                .setColor(0xF39C12)
                .setTitle('⚠️ No Messages to Delete')
                .setDescription(
                    tooOldCount > 0 
                        ? `All ${tooOldCount} messages are older than 14 days and cannot be deleted.`
                        : targetUser 
                            ? `No messages found from ${targetUser.username} in the recent history.`
                            : 'No messages found to delete.'
                )
                .setTimestamp();
                
            return await interaction.editReply({ embeds: [noMessagesEmbed] });
        }

        // Delete messages
        let deletedCount = 0;
        try {
            if (deletableMessages.size === 1) {
                // Delete single message
                await deletableMessages.first().delete();
                deletedCount = 1;
            } else {
                // Bulk delete multiple messages
                const deleted = await interaction.channel.bulkDelete(deletableMessages, true);
                deletedCount = deleted.size;
            }
        } catch (error) {
            console.error('Error deleting messages:', error);
            
            const deleteErrorEmbed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle('❌ Deletion Error')
                .setDescription('Failed to delete some messages. This might be due to message age or permissions.')
                .addFields({
                    name: '💡 Tip',
                    value: 'Messages older than 14 days cannot be bulk deleted.'
                })
                .setTimestamp();
                
            return await interaction.editReply({ embeds: [deleteErrorEmbed] });
        }

        // Success response
        const successEmbed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle('🧹 Messages Cleared')
            .setDescription(
                targetUser 
                    ? `Successfully deleted **${deletedCount}** message${deletedCount !== 1 ? 's' : ''} from ${targetUser.username}`
                    : `Successfully deleted **${deletedCount}** message${deletedCount !== 1 ? 's' : ''}`
            )
            .addFields(
                {
                    name: '📍 Channel',
                    value: `${interaction.channel}`,
                    inline: true
                },
                {
                    name: '👤 Moderator',
                    value: `${interaction.user}`,
                    inline: true
                },
                {
                    name: '📊 Requested',
                    value: `${amount} message${amount !== 1 ? 's' : ''}`,
                    inline: true
                }
            )
            .setTimestamp()
            .setFooter({ 
                text: `${interaction.guild.name} • Clear Command`,
                iconURL: interaction.guild.iconURL() 
            });

        // Add warning if some messages were too old
        if (tooOldCount > 0) {
            successEmbed.addFields({
                name: '⚠️ Note',
                value: `${tooOldCount} message${tooOldCount !== 1 ? 's were' : ' was'} older than 14 days and could not be deleted.`,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [successEmbed] });

        // Optional: Log the action to console
        console.log(`🧹 [CLEAR] ${interaction.user.tag} deleted ${deletedCount} messages in #${interaction.channel.name} (${interaction.guild.name})`);

        // Optional: Send a brief confirmation message in the channel that auto-deletes
        try {
            const channelMessage = await interaction.channel.send({
                content: `🧹 Cleared **${deletedCount}** message${deletedCount !== 1 ? 's' : ''} by ${interaction.user}`,
            });
            
            // Delete the confirmation message after 5 seconds
            setTimeout(async () => {
                try {
                    await channelMessage.delete();
                } catch (err) {
                    // Ignore if message is already deleted
                }
            }, 5000);
        } catch (error) {
            // Ignore if can't send message in channel
        }

    } catch (error) {
        console.error('Error in clear command:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle('❌ Unexpected Error')
            .setDescription('An unexpected error occurred while processing the command.')
            .setTimestamp();

        try {
            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        } catch (replyError) {
            console.error('Error sending error message:', replyError);
        }
    }
}

module.exports = {
    data,
    execute
};
