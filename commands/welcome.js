// 👋 Welcome System Commands
// Handles welcome messages, default roles, and member onboarding

const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits 
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('welcome')
        .setDescription('Manage welcome system and default roles')
        .addSubcommand(sub => sub
            .setName('setup')
            .setDescription('Set welcome channel')
            .addChannelOption(opt => opt
                .setName('channel')
                .setDescription('Channel for welcome messages')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('test')
            .setDescription('Test welcome message'))
        .addSubcommand(sub => sub
            .setName('disable')
            .setDescription('Disable welcome messages'))
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('View welcome settings'))
        .addSubcommand(sub => sub
            .setName('defaultrole')
            .setDescription('Manage default role for new members')
            .addStringOption(opt => opt
                .setName('action')
                .setDescription('Action to perform')
                .setRequired(true)
                .addChoices(
                    { name: 'Set Role', value: 'set' },
                    { name: 'View Current', value: 'view' },
                    { name: 'Remove/Disable', value: 'remove' }
                ))
            .addRoleOption(opt => opt
                .setName('role')
                .setDescription('Role to assign to new members'))
            .addBooleanOption(opt => opt
                .setName('force')
                .setDescription('Force set role even if it has dangerous permissions')))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction, serverManager, dataManager, welcomeSystem) {
        const subcommand = interaction.options.getSubcommand();
        const settings = serverManager.getSettings(interaction.guild.id);
        
        try {
            switch (subcommand) {
                case 'setup':
                    await this.handleSetup(interaction, settings, dataManager);
                    break;
                case 'test':
                    await this.handleTest(interaction, settings, welcomeSystem);
                    break;
                case 'disable':
                    await this.handleDisable(interaction, settings, dataManager);
                    break;
                case 'status':
                    await this.handleStatus(interaction, settings);
                    break;
                case 'defaultrole':
                    await this.handleDefaultRole(interaction, settings, dataManager);
                    break;
                default:
                    await interaction.reply({
                        content: '❌ Unknown subcommand!',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('❌ Error in welcome command:', error);
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ **Command Error**\n\nSomething went wrong while processing the welcome command.',
                    ephemeral: true
                });
            } else if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ **Command Error**\n\nSomething went wrong while processing the welcome command.'
                });
            }
        }
    },

    async handleSetup(interaction, settings, dataManager) {
        const channel = interaction.options.getChannel('channel');
        
        if (!channel.permissionsFor(interaction.guild.members.me).has(['SendMessages', 'AttachFiles'])) {
            return interaction.reply({ 
                content: '❌ I need Send Messages and Attach Files permissions in that channel!', 
                ephemeral: true
            });
        }
        
        settings.welcomeChannel = channel.id;
        await dataManager.saveData();
        
        const setupEmbed = new EmbedBuilder()
            .setTitle('👋 Welcome Channel Set!')
            .setDescription(`Welcome messages will be sent to ${channel}`)
            .setColor(0x00FF99)
            .setTimestamp();
        
        await interaction.reply({ embeds: [setupEmbed], ephemeral: true });
    },

    async handleTest(interaction, settings, welcomeSystem) {
        if (!settings.welcomeChannel) {
            return interaction.reply({ content: '❌ No welcome channel set!', ephemeral: true });
        }
        
        const welcomeChannel = interaction.guild.channels.cache.get(settings.welcomeChannel);
        if (!welcomeChannel) {
            return interaction.reply({ content: '❌ Welcome channel not found!', ephemeral: true });
        }
        
        await interaction.reply({ content: '🧪 Sending test welcome...', ephemeral: true });
        await welcomeSystem.sendWelcomeMessage(interaction.member, welcomeChannel, true);
    },

    async handleDisable(interaction, settings, dataManager) {
        settings.welcomeChannel = null;
        await dataManager.saveData();
        await interaction.reply({ content: '🚫 Welcome messages disabled!', ephemeral: true });
    },

    async handleStatus(interaction, settings) {
        const defaultRoleText = settings.defaultRole ? 
            `<@&${settings.defaultRole}>` : 
            '*No default role set*';
        
        const statusEmbed = new EmbedBuilder()
            .setTitle('👋 Welcome System Status')
            .addFields(
                { 
                    name: '📺 Welcome Channel', 
                    value: settings.welcomeChannel ? `<#${settings.welcomeChannel}>` : '*Disabled*', 
                    inline: true 
                },
                { 
                    name: '🎭 Default Role', 
                    value: defaultRoleText, 
                    inline: true 
                },
                { 
                    name: '📊 System Status', 
                    value: (settings.welcomeChannel || settings.defaultRole) ? '✅ Active' : '❌ Inactive', 
                    inline: true 
                }
            )
            .setColor(settings.welcomeChannel || settings.defaultRole ? 0x3498DB : 0x95A5A6)
            .setTimestamp();
        
        await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
    },

    async handleDefaultRole(interaction, settings, dataManager) {
        const action = interaction.options.getString('action');
        const role = interaction.options.getRole('role');
        const force = interaction.options.getBoolean('force') || false;
        
        await interaction.deferReply({ ephemeral: true });
        
        // Dangerous permissions list
        const DANGEROUS_PERMISSIONS = [
            PermissionFlagsBits.Administrator,
            PermissionFlagsBits.ManageGuild,
            PermissionFlagsBits.ManageRoles,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.KickMembers,
            PermissionFlagsBits.BanMembers,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.MentionEveryone,
            PermissionFlagsBits.ModerateMembers
        ];
        
        switch (action) {
            case 'set':
                if (!role) {
                    return interaction.editReply({ 
                        content: '❌ Please specify a role to set as the default!'
                    });
                }
                
                if (role.managed || role.position >= interaction.guild.members.me.roles.highest.position || role.name === '@everyone') {
                    return interaction.editReply({ 
                        content: '❌ Cannot set this role as default! (managed role, higher than bot, or @everyone)'
                    });
                }
                
                if (!force && DANGEROUS_PERMISSIONS.some(perm => role.permissions.has(perm))) {
                    const dangerousPermNames = DANGEROUS_PERMISSIONS
                        .filter(perm => role.permissions.has(perm))
                        .map(perm => {
                            const permMap = {
                                [PermissionFlagsBits.Administrator]: 'Administrator',
                                [PermissionFlagsBits.ManageGuild]: 'Manage Server',
                                [PermissionFlagsBits.ManageRoles]: 'Manage Roles',
                                [PermissionFlagsBits.ManageChannels]: 'Manage Channels',
                                [PermissionFlagsBits.KickMembers]: 'Kick Members',
                                [PermissionFlagsBits.BanMembers]: 'Ban Members',
                                [PermissionFlagsBits.ManageMessages]: 'Manage Messages',
                                [PermissionFlagsBits.MentionEveryone]: 'Mention Everyone',
                                [PermissionFlagsBits.ModerateMembers]: 'Moderate Members'
                            };
                            return permMap[perm] || 'Unknown Permission';
                        });
                    
                    return interaction.editReply({ 
                        content: `⚠️ **This role has dangerous permissions:**\n• ${dangerousPermNames.join('\n• ')}\n\n` +
                               `**To override, use:**\n\`/welcome defaultrole action:Set Role role:${role.name} force:True\``
                    });
                }
                
                settings.defaultRole = role.id;
                await dataManager.saveData();
                
                const setEmbed = new EmbedBuilder()
                    .setTitle('✅ Default Role Set!')
                    .setDescription(`**New members will now receive:** ${role}\n\n*This role will be automatically assigned when users join the server.*${force ? '\n\n⚠️ *Safety check was bypassed with force option*' : ''}`)
                    .setColor(0x00FF99)
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [setEmbed] });
                break;
                
            case 'view':
                if (!settings.defaultRole) {
                    return interaction.editReply({ 
                        content: '📋 No default role is currently set for new members.'
                    });
                }
                
                const currentRole = interaction.guild.roles.cache.get(settings.defaultRole);
                if (!currentRole) {
                    settings.defaultRole = null;
                    await dataManager.saveData();
                    return interaction.editReply({ 
                        content: '⚠️ The default role was deleted. Default role setting has been cleared.'
                    });
                }
                
                const viewEmbed = new EmbedBuilder()
                    .setTitle('🎭 Current Default Role')
                    .setDescription(`**Role:** ${currentRole}\n**Members with this role:** ${currentRole.members.size}\n**Position:** ${currentRole.position}\n\n*New members automatically receive this role when they join.*`)
                    .setColor(currentRole.color || 0x3498DB)
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [viewEmbed] });
                break;
                
            case 'remove':
                if (!settings.defaultRole) {
                    return interaction.editReply({ 
                        content: '📋 No default role is currently set.'
                    });
                }
                
                const removedRole = interaction.guild.roles.cache.get(settings.defaultRole);
                const removedRoleName = removedRole ? removedRole.name : 'Unknown Role';
                
                settings.defaultRole = null;
                await dataManager.saveData();
                
                const removeEmbed = new EmbedBuilder()
                    .setTitle('🚫 Default Role Removed')
                    .setDescription(`**Previous role:** ${removedRoleName}\n\n*New members will no longer automatically receive a role when joining.*`)
                    .setColor(0xFF6B6B)
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [removeEmbed] });
                break;
        }
    }
};
