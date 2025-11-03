// 🔗 Linked Roles System - Discord Role Connections API
// Full Discord Linked Roles integration with metadata and requirements

const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('linkedroles')
        .setDescription('Manage Discord Linked Roles - shows as app in role settings')
        .addSubcommand(sub => sub
            .setName('setup')
            .setDescription('Initialize linked roles for this server')
            .addStringOption(opt => opt
                .setName('title')
                .setDescription('Title shown to users (e.g., "Gaming Server Member")')
                .setRequired(false)))
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('View linked roles status and statistics'))
        .addSubcommand(sub => sub
            .setName('link')
            .setDescription('Get your personal link to connect your account'))
        .addSubcommand(sub => sub
            .setName('prompt')
            .setDescription('Send link to user(s) via DM')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to send link to')
                .setRequired(false)))
        .addSubcommand(sub => sub
            .setName('linked')
            .setDescription('View all users who have linked'))
        .addSubcommand(sub => sub
            .setName('update-metadata')
            .setDescription('Force update metadata for all linked users'))
        .addSubcommand(sub => sub
            .setName('unlink')
            .setDescription('Unlink a user')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to unlink')
                .setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction, serverManager, dataManager, linkedRolesAPI) {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'setup':
                    await this.handleSetup(interaction, linkedRolesAPI);
                    break;
                case 'status':
                    await this.handleStatus(interaction, linkedRolesAPI);
                    break;
                case 'link':
                    await this.handleLink(interaction, linkedRolesAPI);
                    break;
                case 'prompt':
                    await this.handlePrompt(interaction, linkedRolesAPI);
                    break;
                case 'linked':
                    await this.handleLinked(interaction, linkedRolesAPI);
                    break;
                case 'update-metadata':
                    await this.handleUpdateMetadata(interaction, linkedRolesAPI);
                    break;
                case 'unlink':
                    await this.handleUnlink(interaction, linkedRolesAPI);
                    break;
                default:
                    await interaction.reply({
                        content: '❌ Unknown subcommand!',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('❌ Error in linkedroles command:', error);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ **Command Error**\n\nSomething went wrong with the linked roles command.',
                    ephemeral: true
                });
            } else if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ **Command Error**\n\nSomething went wrong with the linked roles command.'
                });
            }
        }
    },

    async handleSetup(interaction, linkedRolesAPI) {
        const title = interaction.options.getString('title') || 'Gaming Server Member';

        await interaction.deferReply({ ephemeral: true });

        try {
            // Register metadata with Discord
            const result = await linkedRolesAPI.registerMetadata();

            if (!result.success) {
                return interaction.editReply({
                    content: `❌ Failed to register linked roles metadata!\n\n**Error:** ${result.error}\n\n**Make sure:**\n• CLIENT_SECRET is set in .env\n• Bot token is valid\n• Bot has necessary permissions`
                });
            }

            const setupEmbed = new EmbedBuilder()
                .setTitle('✅ Linked Roles Configured!')
                .setDescription(
                    `**Application Title:** ${title}\n\n` +
                    `**Registered Metadata Fields:**\n` +
                    result.metadata.map(m => `• **${m.name}** - ${m.description}`).join('\n') +
                    `\n\n**What's Next?**\n` +
                    `1. Go to **Server Settings** → **Roles**\n` +
                    `2. Edit any role → **Links** tab\n` +
                    `3. Add your bot as a linked role\n` +
                    `4. Set requirements (e.g., "Join Date >= 7 days")\n` +
                    `5. Users link via \`/linkedroles link\` or DM\n\n` +
                    `**Server URL:** ${linkedRolesAPI.redirectUri}`
                )
                .setColor(0x5865F2)
                .addFields(
                    { name: '🔗 How It Works', value: 'Users link their account → Discord checks metadata → Auto-assigns roles based on requirements you set!', inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [setupEmbed] });

        } catch (error) {
            console.error('❌ Setup error:', error);
            await interaction.editReply({
                content: `❌ Setup failed: ${error.message}`
            });
        }
    },

    async handleStatus(interaction, linkedRolesAPI) {
        const stats = linkedRolesAPI.getStats();

        const statusEmbed = new EmbedBuilder()
            .setTitle('📊 Linked Roles Status')
            .addFields(
                { name: '🌐 Callback Server', value: stats.serverRunning ? '✅ Running' : '❌ Offline', inline: true },
                { name: '📋 Metadata', value: stats.metadataRegistered ? '✅ Registered' : '❌ Not Registered', inline: true },
                { name: '👥 Linked Users', value: stats.totalLinked.toString(), inline: true },
                { name: '📍 Redirect URI', value: `\`${stats.redirectUri}\``, inline: false },
                { name: '🔌 Port', value: stats.port.toString(), inline: true }
            )
            .setColor(stats.serverRunning ? 0x43B581 : 0xF04747)
            .setDescription(
                stats.metadataRegistered ?
                    '**✅ System Ready!**\n\nUsers can link their accounts and roles will be auto-assigned based on requirements.' :
                    '**⚠️ Not Configured**\n\nRun `/linkedroles setup` to register metadata with Discord.'
            )
            .setTimestamp();

        await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
    },

    async handleLink(interaction, linkedRolesAPI) {
        const authURL = linkedRolesAPI.getAuthorizationURL();

        const linkButton = new ButtonBuilder()
            .setLabel('🔗 Link Your Account')
            .setStyle(ButtonStyle.Link)
            .setURL(authURL);

        const row = new ActionRowBuilder().addComponents(linkButton);

        const linkEmbed = new EmbedBuilder()
            .setTitle('🔗 Link Your Discord Account')
            .setDescription(
                `Connect your Discord account to receive automatic roles based on your activity and status!\n\n` +
                `**What You'll Get:**\n` +
                `✅ Automatic role updates\n` +
                `✅ Verified member status\n` +
                `✅ Access to exclusive features\n\n` +
                `**Your Metadata:**\n` +
                `• **Verified** - Confirms you're a real member\n` +
                `• **Join Date** - Days since you joined\n` +
                `• **Message Count** - Total messages sent\n` +
                `• **Level** - Your current level\n` +
                `• **Supporter** - Server booster status\n\n` +
                `Click the button below to link your account!`
            )
            .setColor(0x5865F2)
            .setFooter({ text: 'Secure OAuth2 connection through Discord' })
            .setTimestamp();

        await interaction.reply({
            embeds: [linkEmbed],
            components: [row],
            ephemeral: true
        });
    },

    async handlePrompt(interaction, linkedRolesAPI) {
        const user = interaction.options.getUser('user');

        if (!user) {
            // If no user specified, give them the link to share
            const authURL = linkedRolesAPI.getAuthorizationURL();

            return interaction.reply({
                content: `📨 **Share this link with users:**\n${authURL}\n\n*Or use \`/linkedroles prompt user:@Someone\` to DM specific users.*`,
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const member = interaction.guild.members.cache.get(user.id);
            if (!member) {
                return interaction.editReply({
                    content: '❌ User not found in this server!'
                });
            }

            // Send DM
            const authURL = linkedRolesAPI.getAuthorizationURL();

            const linkButton = new ButtonBuilder()
                .setLabel('🔗 Link Your Account')
                .setStyle(ButtonStyle.Link)
                .setURL(authURL);

            const row = new ActionRowBuilder().addComponents(linkButton);

            const dmEmbed = new EmbedBuilder()
                .setTitle(`🔗 Link Your Account - ${interaction.guild.name}`)
                .setDescription(
                    `**Server:** ${interaction.guild.name}\n\n` +
                    `You've been invited to link your Discord account!\n\n` +
                    `**Benefits:**\n` +
                    `✅ Automatic role assignments\n` +
                    `✅ Verified member status\n` +
                    `✅ Access based on your activity\n\n` +
                    `**How It Works:**\n` +
                    `1. Click "Link Your Account" below\n` +
                    `2. Authorize the connection\n` +
                    `3. Roles assigned automatically!\n\n` +
                    `*This is a secure OAuth2 connection through Discord's official API.*`
                )
                .setColor(0x5865F2)
                .setThumbnail(interaction.guild.iconURL({ size: 128 }))
                .setFooter({ text: `${interaction.guild.name} • Linked Roles`, iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            await member.send({
                embeds: [dmEmbed],
                components: [row]
            });

            await interaction.editReply({
                content: `✅ Sent link to ${user.tag}!`
            });

        } catch (error) {
            console.error('❌ Failed to send DM:', error);
            await interaction.editReply({
                content: `❌ Failed to send DM to ${user.tag}!\n\n**Possible reasons:**\n• User has DMs disabled\n• User blocked the bot\n• User is no longer in the server`
            });
        }
    },

    async handleLinked(interaction, linkedRolesAPI) {
        const stats = linkedRolesAPI.getStats();

        if (stats.totalLinked === 0) {
            return interaction.reply({
                content: '📊 No users have linked their accounts yet!\n\nUse `/linkedroles link` to get started.',
                ephemeral: true
            });
        }

        const linkedEmbed = new EmbedBuilder()
            .setTitle('👥 Linked Users')
            .setDescription(`**Total Linked:** ${stats.totalLinked} users`)
            .setColor(0x43B581)
            .addFields({
                name: 'ℹ️ Info',
                value: 'Linked users have their metadata automatically updated and receive roles based on server requirements.',
                inline: false
            })
            .setTimestamp();

        await interaction.reply({ embeds: [linkedEmbed], ephemeral: true });
    },

    async handleUpdateMetadata(interaction, linkedRolesAPI) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const result = await linkedRolesAPI.updateAllUserMetadata(
                interaction.client,
                interaction.client.serverManager
            );

            const updateEmbed = new EmbedBuilder()
                .setTitle('🔄 Metadata Update Complete')
                .setDescription(
                    `**Successfully Updated:** ${result.updated} users\n` +
                    `**Errors:** ${result.errors} users\n\n` +
                    `All linked users now have their latest metadata synced with Discord!`
                )
                .setColor(result.errors === 0 ? 0x43B581 : 0xF39C12)
                .setTimestamp();

            await interaction.editReply({ embeds: [updateEmbed] });

        } catch (error) {
            console.error('❌ Update metadata error:', error);
            await interaction.editReply({
                content: `❌ Failed to update metadata: ${error.message}`
            });
        }
    },

    async handleUnlink(interaction, linkedRolesAPI) {
        const user = interaction.options.getUser('user');

        if (!linkedRolesAPI.isUserLinked(user.id)) {
            return interaction.reply({
                content: `❌ ${user.tag} has not linked their account!`,
                ephemeral: true
            });
        }

        linkedRolesAPI.unlinkUser(user.id);

        await interaction.reply({
            content: `✅ Unlinked ${user.tag}!\n\nTheir metadata will no longer be updated.`,
            ephemeral: true
        });
    }
};
