// 🎭 Role Management Commands
// Handles role panels, blacklisting, statistics, and user role management

const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits 
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roles')
        .setDescription('Manage server roles and panels')
        .addSubcommand(sub => sub
            .setName('panel')
            .setDescription('Create a role selection panel')
            .addStringOption(opt => opt
                .setName('title')
                .setDescription('Panel title')
                .setRequired(true))
            .addChannelOption(opt => opt
                .setName('channel')
                .setDescription('Channel to send panel')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('type')
                .setDescription('Panel type')
                .setRequired(true)
                .addChoices(
                    { name: 'Safe Roles Only', value: 'safe' },
                    { name: 'All Roles', value: 'all' }
                )))
        .addSubcommand(sub => sub
            .setName('blacklist')
            .setDescription('Manage blacklisted roles')
            .addStringOption(opt => opt
                .setName('action')
                .setDescription('Action to perform')
                .setRequired(true)
                .addChoices(
                    { name: 'View', value: 'view' },
                    { name: 'Add Role', value: 'add' },
                    { name: 'Remove Role', value: 'remove' },
                    { name: 'Clear All', value: 'clear' }
                ))
            .addRoleOption(opt => opt
                .setName('role')
                .setDescription('Role to add/remove from blacklist')))
        .addSubcommand(sub => sub
            .setName('sync')
            .setDescription('Manually sync all user roles'))
        .addSubcommand(sub => sub
            .setName('stats')
            .setDescription('View role statistics'))
        .addSubcommand(sub => sub
            .setName('user')
            .setDescription('View user role information')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to check (leave empty for yourself)')))
        .addSubcommand(sub => sub
            .setName('refresh')
            .setDescription('Refresh and update all role panels in this server'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction, serverManager, dataManager, roleManager, panels) {
        const subcommand = interaction.options.getSubcommand();
        
        try {
            switch (subcommand) {
                case 'panel':
                    await this.handleCreatePanel(interaction, serverManager, dataManager, roleManager, panels);
                    break;
                case 'blacklist':
                    await this.handleBlacklist(interaction, serverManager, dataManager);
                    break;
                case 'sync':
                    await this.handleRoleSync(interaction, serverManager, panels, dataManager);
                    break;
                case 'stats':
                    await this.handleRoleStats(interaction, serverManager);
                    break;
                case 'user':
                    await this.handleUserRoles(interaction, serverManager);
                    break;
                case 'refresh':
                    await this.handlePanelRefresh(interaction, serverManager, dataManager, roleManager, panels);
                    break;
                default:
                    await interaction.reply({
                        content: '❌ Unknown subcommand!',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('❌ Error in roles command:', error);
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ **Command Error**\n\nSomething went wrong while processing the roles command.',
                    ephemeral: true
                });
            } else if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ **Command Error**\n\nSomething went wrong while processing the roles command.'
                });
            }
        }
    },

    async handleCreatePanel(interaction, serverManager, dataManager, roleManager, panels) {
        const title = interaction.options.getString('title');
        const channel = interaction.options.getChannel('channel');
        const type = interaction.options.getString('type');
        const settings = serverManager.getSettings(interaction.guild.id);
        
        const roles = serverManager.filterRoles(interaction.guild, type, settings.blacklistedRoles);
        
        if (roles.length === 0) {
            return interaction.reply({ content: '❌ No available roles found!', ephemeral: true });
        }
        
        const panelId = `${interaction.guild.id}_${Date.now()}`;
        
        panels.set(panelId, {
            guildId: interaction.guild.id,
            channelId: channel.id,
            title: title,
            type: type,
            interfaceType: 'button',
            roles: roles.map(r => r.id),
            createdAt: new Date().toISOString(),
            createdBy: interaction.user.id
        });
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
            await serverManager.syncUserRoles(interaction.guild);
        } catch (error) {
            console.error('❌ Error syncing roles before panel creation:', error);
        }
        
        const buttonRow = roleManager.createRolePanelButton(panelId, title, roles.length);

        // Build role list with character limit handling (Discord limit: 2000 chars)
        const baseContent = `# 🎭 ${title}\n\n` +
            `### Click the **Role Selector** button below to manage your roles!\n\n` +
            `**📋 Available Roles (${roles.length}):**\n`;
        const footer = `\n\n---\n*Use the button to open your private role selector!*`;

        const maxLength = 1900; // Leave buffer for safety
        let rolesList = '';
        let shownRoles = 0;

        // Try to fit all roles within character limit
        for (let i = 0; i < roles.length; i++) {
            const roleEntry = `• **${roles[i].name}**\n`;
            const testContent = baseContent + rolesList + roleEntry +
                (i < roles.length - 1 ? `\n*...and ${roles.length - i - 1} more roles*` : '') + footer;

            if (testContent.length > maxLength) {
                // Can't fit more roles, add truncation notice
                rolesList += `\n*...and ${roles.length - shownRoles} more roles*`;
                break;
            }

            rolesList += roleEntry;
            shownRoles++;
        }

        const panelContent = baseContent + rolesList + footer;
        
        try {
            const panelMessage = await channel.send({ 
                content: panelContent, 
                components: [buttonRow],
                allowedMentions: { parse: [] }
            });
            
            const panelData = panels.get(panelId);
            panelData.messageId = panelMessage.id;
            panels.set(panelId, panelData);
            await dataManager.saveData();
            
            const confirmEmbed = new EmbedBuilder()
                .setTitle('✅ Role Panel Created!')
                .setDescription(`**Location:** ${channel}\n**Roles:** ${roles.length}\n**Type:** ${type}\n**Interface:** Button-based selector`)
                .setColor(0x00FF99)
                .setTimestamp();
            
            await interaction.editReply({ embeds: [confirmEmbed] });
            
        } catch (error) {
            console.error('❌ Error creating role panel:', error);
            await interaction.editReply({ 
                content: '❌ Failed to create role panel! Check bot permissions and try again.'
            });
        }
    },

    async handleBlacklist(interaction, serverManager, dataManager) {
        const action = interaction.options.getString('action');
        const role = interaction.options.getRole('role');
        const settings = serverManager.getSettings(interaction.guild.id);
        
        switch (action) {
            case 'view':
                const blacklistedRoles = settings.blacklistedRoles
                    .map(id => interaction.guild.roles.cache.get(id))
                    .filter(role => role)
                    .map(role => `• **${role.name}**`)
                    .join('\n') || '*No blacklisted roles*';
                
                const viewEmbed = new EmbedBuilder()
                    .setTitle('🚫 Blacklisted Roles')
                    .setDescription(blacklistedRoles)
                    .setColor(0xFF6B6B)
                    .setTimestamp();
                
                await interaction.reply({ embeds: [viewEmbed], ephemeral: true });
                break;
                
            case 'add':
                if (!role) return interaction.reply({ content: '❌ Please specify a role!', ephemeral: true });
                
                if (settings.blacklistedRoles.includes(role.id)) {
                    return interaction.reply({ content: `❌ ${role.name} is already blacklisted!`, ephemeral: true });
                }
                
                settings.blacklistedRoles.push(role.id);
                await dataManager.saveData();
                await interaction.reply({ content: `✅ Added ${role.name} to blacklist!`, ephemeral: true });
                break;
                
            case 'remove':
                if (!role) return interaction.reply({ content: '❌ Please specify a role!', ephemeral: true });
                
                const index = settings.blacklistedRoles.indexOf(role.id);
                if (index === -1) {
                    return interaction.reply({ content: `❌ ${role.name} is not blacklisted!`, ephemeral: true });
                }
                
                settings.blacklistedRoles.splice(index, 1);
                await dataManager.saveData();
                await interaction.reply({ content: `✅ Removed ${role.name} from blacklist!`, ephemeral: true });
                break;
                
            case 'clear':
                const count = settings.blacklistedRoles.length;
                settings.blacklistedRoles = [];
                await dataManager.saveData();
                await interaction.reply({ content: `✅ Cleared ${count} roles from blacklist!`, ephemeral: true });
                break;
        }
    },

    async handleRoleSync(interaction, serverManager, panels, dataManager) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const result = await serverManager.syncUserRoles(interaction.guild);

            // Also try to recover lost panels
            let panelsRecovered = 0;
            const recoveryResults = await this.recoverLostPanels(interaction.guild, panels);
            if (recoveryResults.recovered > 0) {
                panelsRecovered = recoveryResults.recovered;
                console.log(`🔍 Recovered ${panelsRecovered} lost panels during sync`);
                // Save recovered panels to disk
                await dataManager.saveData();

                // Refresh the recovered panels to show all roles
                await this.refreshRecoveredPanels(interaction.guild, panels, serverManager);
            }

            const syncEmbed = new EmbedBuilder()
                .setTitle('✅ Role Sync Complete!')
                .setDescription(
                    `**Members Synced:** ${result.syncedMembers}\n` +
                    `**Unique Roles:** ${result.uniqueRoles}\n` +
                    (panelsRecovered > 0 ? `**Panels Recovered:** ${panelsRecovered} 🔍` : '')
                )
                .setColor(0x00FF99)
                .setTimestamp();

            if (panelsRecovered > 0) {
                syncEmbed.addFields({
                    name: '🔍 Panel Recovery',
                    value: `Found and recovered ${panelsRecovered} panel(s) that were missing from memory!`,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [syncEmbed] });

        } catch (error) {
            console.error('❌ Error in role sync command:', error);
            await interaction.editReply({ content: '❌ Failed to sync roles! Check console for details.' });
        }
    },

    async recoverLostPanels(guild, panels) {
        let recovered = 0;
        const errors = [];

        try {
            console.log(`🔍 Scanning ${guild.name} for lost panels...`);

            // Get all text channels
            const textChannels = guild.channels.cache.filter(
                channel => channel.isTextBased() && channel.viewable
            );

            for (const [channelId, channel] of textChannels) {
                try {
                    // Fetch recent messages (last 100)
                    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
                    if (!messages) continue;

                    // Look for bot messages with role panel buttons
                    for (const [messageId, message] of messages) {
                        if (message.author.id !== guild.members.me.id) continue;

                        // Check if this message has role panel buttons
                        const hasRolePanelButton = message.components.some(row =>
                            row.components.some(component =>
                                component.customId?.startsWith('role_panel_')
                            )
                        );

                        if (hasRolePanelButton) {
                            // Extract panel ID from button
                            const button = message.components
                                .flatMap(row => row.components)
                                .find(c => c.customId?.startsWith('role_panel_'));

                            if (button) {
                                const panelId = button.customId.replace('role_panel_', '');

                                // Check if this panel is missing from memory
                                if (!panels.has(panelId)) {
                                    // Try to recover panel info from message content
                                    const titleMatch = message.content.match(/# 🎭 (.+?)\n/);
                                    const roleCountMatch = message.content.match(/Available Roles \((\d+)\)/);

                                    const title = titleMatch ? titleMatch[1] : 'Recovered Panel';
                                    const roleCount = roleCountMatch ? parseInt(roleCountMatch[1]) : 0;

                                    // Extract role names from message content
                                    const roleMatches = message.content.matchAll(/• \*\*(.+?)\*\*/g);
                                    const roleNames = [...roleMatches].map(match => match[1]);

                                    // Match role names to actual guild roles
                                    const recoveredRoles = [];
                                    for (const roleName of roleNames) {
                                        const role = guild.roles.cache.find(r => r.name === roleName);
                                        if (role) {
                                            recoveredRoles.push(role.id);
                                        }
                                    }

                                    // If we couldn't extract roles from message, get all non-dangerous roles
                                    if (recoveredRoles.length === 0) {
                                        console.log(`⚠️ Could not extract roles from message, using safe roles`);
                                        const safeRoles = guild.roles.cache.filter(role =>
                                            role.name !== '@everyone' &&
                                            !role.managed &&
                                            role.position < guild.members.me.roles.highest.position &&
                                            !role.permissions.has(['Administrator', 'ManageGuild', 'ManageRoles'])
                                        );
                                        recoveredRoles.push(...safeRoles.map(r => r.id));
                                    }

                                    // Create recovered panel entry
                                    panels.set(panelId, {
                                        guildId: guild.id,
                                        channelId: channel.id,
                                        messageId: messageId,
                                        title: title,
                                        type: 'safe', // Default assumption
                                        interfaceType: 'button',
                                        roles: recoveredRoles,
                                        createdAt: message.createdAt.toISOString(),
                                        createdBy: 'recovered',
                                        recovered: true
                                    });

                                    recovered++;
                                    console.log(`✅ Recovered panel: ${panelId} in #${channel.name} with ${recoveredRoles.length} roles`);
                                }
                            }
                        }
                    }
                } catch (channelError) {
                    console.log(`⚠️ Could not scan #${channel.name}:`, channelError.message);
                    errors.push(`${channel.name}: ${channelError.message}`);
                }
            }

            return { recovered, errors };

        } catch (error) {
            console.error('❌ Error recovering panels:', error);
            return { recovered, errors: [error.message] };
        }
    },

    async refreshRecoveredPanels(guild, panels, serverManager) {
        try {
            console.log('🔄 Refreshing recovered panels...');

            for (const [panelId, panelData] of panels.entries()) {
                // Only refresh recovered panels in this guild
                if (panelData.guildId !== guild.id || !panelData.recovered) continue;

                try {
                    const channel = guild.channels.cache.get(panelData.channelId);
                    if (!channel) continue;

                    const message = await channel.messages.fetch(panelData.messageId).catch(() => null);
                    if (!message) continue;

                    // Get all the roles for this panel
                    const roles = panelData.roles
                        .map(roleId => guild.roles.cache.get(roleId))
                        .filter(role => role);

                    if (roles.length === 0) continue;

                    // Build role list with character limit handling
                    const baseContent = `# 🎭 ${panelData.title}\n\n` +
                        `### Click the **Role Selector** button below to manage your roles!\n\n` +
                        `**📋 Available Roles (${roles.length}):**\n`;
                    const footer = `\n\n---\n*Use the button to open your private role selector!*`;

                    const maxLength = 1900;
                    let rolesList = '';
                    let shownRoles = 0;

                    for (let i = 0; i < roles.length; i++) {
                        const roleEntry = `• **${roles[i].name}**\n`;
                        const testContent = baseContent + rolesList + roleEntry +
                            (i < roles.length - 1 ? `\n*...and ${roles.length - i - 1} more roles*` : '') + footer;

                        if (testContent.length > maxLength) {
                            rolesList += `\n*...and ${roles.length - shownRoles} more roles*`;
                            break;
                        }

                        rolesList += roleEntry;
                        shownRoles++;
                    }

                    const panelContent = baseContent + rolesList + footer;

                    // Update the message
                    await message.edit({
                        content: panelContent,
                        components: message.components
                    });

                    console.log(`✅ Refreshed panel ${panelId} with ${shownRoles} roles displayed`);

                } catch (error) {
                    console.error(`❌ Error refreshing panel ${panelId}:`, error);
                }
            }

        } catch (error) {
            console.error('❌ Error refreshing recovered panels:', error);
        }
    },

    async reloadSinglePanel(guild, panelId, panelData, serverManager) {
        try {
            const channel = guild.channels.cache.get(panelData.channelId);
            if (!channel) {
                return { success: false, error: 'Channel not found' };
            }

            const message = await channel.messages.fetch(panelData.messageId).catch(() => null);
            if (!message) {
                return { success: false, error: 'Message not found' };
            }

            // RE-FETCH roles from server based on panel type
            // This ensures new roles are included!
            const settings = serverManager.getSettings(guild.id);
            const panelType = panelData.type || 'safe'; // Default to safe if not specified

            console.log(`🔄 Re-fetching ${panelType} roles for panel ${panelId}`);

            // Store old count for logging
            const oldRoleCount = panelData.roles.length;

            // Get fresh roles from the server
            const freshRoles = serverManager.filterRoles(guild, panelType, settings.blacklistedRoles);

            if (freshRoles.length === 0) {
                return { success: false, error: 'No roles available' };
            }

            // Update panel data with new role IDs (this adds newly created roles!)
            panelData.roles = freshRoles.map(r => r.id);

            const rolesAdded = freshRoles.length - oldRoleCount;
            console.log(`✅ Panel ${panelId} updated: ${freshRoles.length} roles (${rolesAdded > 0 ? '+' + rolesAdded : rolesAdded} from before)`);

            const roles = freshRoles;

            // Build role list with character limit handling
            const baseContent = `# 🎭 ${panelData.title}\n\n` +
                `### Click the **Role Selector** button below to manage your roles!\n\n` +
                `**📋 Available Roles (${roles.length}):**\n`;
            const footer = `\n\n---\n*Use the button to open your private role selector!*`;

            const maxLength = 1900;
            let rolesList = '';
            let shownRoles = 0;

            for (let i = 0; i < roles.length; i++) {
                const roleEntry = `• **${roles[i].name}**\n`;
                const testContent = baseContent + rolesList + roleEntry +
                    (i < roles.length - 1 ? `\n*...and ${roles.length - i - 1} more roles*` : '') + footer;

                if (testContent.length > maxLength) {
                    rolesList += `\n*...and ${roles.length - shownRoles} more roles*`;
                    break;
                }

                rolesList += roleEntry;
                shownRoles++;
            }

            const panelContent = baseContent + rolesList + footer;

            // Update the message
            await message.edit({
                content: panelContent,
                components: message.components
            });

            console.log(`✅ Reloaded panel ${panelId} with ${shownRoles}/${roles.length} roles displayed`);

            return {
                success: true,
                shownRoles: shownRoles,
                totalRoles: roles.length
            };

        } catch (error) {
            console.error(`❌ Error reloading panel ${panelId}:`, error);
            return { success: false, error: error.message };
        }
    },

    async handleRoleStats(interaction, serverManager) {
        const roleStats = serverManager.getRoleStatistics(interaction.guild.id);
        
        if (Object.keys(roleStats).length === 0) {
            return interaction.reply({ 
                content: '📊 No role statistics available! Use `/roles sync` to generate statistics.', 
                ephemeral: true 
            });
        }
        
        const sortedRoles = Object.entries(roleStats)
            .map(([roleId, count]) => ({
                role: interaction.guild.roles.cache.get(roleId),
                count
            }))
            .filter(item => item.role)
            .sort((a, b) => b.count - a.count)
            .slice(0, 15);
        
        const statsDescription = sortedRoles
            .map((item, index) => `${index + 1}. **${item.role.name}** - ${item.count} members`)
            .join('\n');
        
        const settings = serverManager.getSettings(interaction.guild.id);
        const totalMembers = settings.userRoles.size;
        const totalRoles = Object.keys(roleStats).length;
        
        const statsEmbed = new EmbedBuilder()
            .setTitle('📊 Role Statistics')
            .setDescription(`**Total Members Tracked:** ${totalMembers}\n**Total Roles:** ${totalRoles}\n\n**Top Roles by Member Count:**\n${statsDescription}`)
            .setColor(0x3498DB)
            .setTimestamp();
        
        await interaction.reply({ embeds: [statsEmbed], ephemeral: true });
    },

    async handleUserRoles(interaction, serverManager) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const member = interaction.guild.members.cache.get(targetUser.id);
        
        if (!member) {
            return interaction.reply({ content: '❌ User not found in this server!', ephemeral: true });
        }
        
        const userRoleData = serverManager.getUserRoles(interaction.guild.id, targetUser.id);
        const roleHistory = serverManager.getUserRoleHistory(interaction.guild.id, targetUser.id);
        
        if (!userRoleData) {
            return interaction.reply({ 
                content: `📋 No role data found for ${targetUser.displayName}. Use \`/roles sync\` to update data.`, 
                ephemeral: true 
            });
        }
        
        const currentRoles = userRoleData.roles
            .map(roleId => interaction.guild.roles.cache.get(roleId))
            .filter(role => role)
            .map(role => `• **${role.name}**`)
            .join('\n') || '*No roles*';
        
        const recentChanges = roleHistory
            .slice(-5)
            .reverse()
            .map(entry => {
                const timestamp = new Date(entry.timestamp);
                const added = entry.addedRoles.map(r => `+${r.name}`).join(', ');
                const removed = entry.removedRoles.map(r => `-${r.name}`).join(', ');
                const changes = [added, removed].filter(c => c).join(', ');
                return `<t:${Math.floor(timestamp.getTime() / 1000)}:R> ${changes}`;
            })
            .join('\n') || '*No recent changes*';
        
        const userEmbed = new EmbedBuilder()
            .setTitle(`👤 Role Info: ${targetUser.displayName}`)
            .addFields(
                { name: '🎭 Current Roles', value: currentRoles.substring(0, 1024), inline: false },
                { name: '📈 Recent Changes', value: recentChanges.substring(0, 1024), inline: false },
                { name: '📅 Last Updated', value: userRoleData.lastUpdated ? `<t:${Math.floor(new Date(userRoleData.lastUpdated).getTime() / 1000)}:R>` : 'Never', inline: true },
                { name: '📊 Total Role Changes', value: `${roleHistory.length}`, inline: true }
            )
            .setColor(0x7289DA)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 128 }))
            .setTimestamp();
        
        await interaction.reply({ embeds: [userEmbed], ephemeral: true });
    },

    async handlePanelRefresh(interaction, serverManager, dataManager, roleManager, panels) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const guildPanels = Array.from(panels.entries())
                .filter(([panelId, panelData]) => panelData.guildId === interaction.guild.id);

            if (guildPanels.length === 0) {
                return interaction.editReply({ content: '📋 No role panels found in this server!' });
            }

            let refreshedCount = 0;
            let errorCount = 0;
            const results = [];

            for (const [panelId, panelData] of guildPanels) {
                const result = await this.reloadSinglePanel(interaction.guild, panelId, panelData, serverManager);
                if (result.success) {
                    refreshedCount++;
                    results.push(`✅ ${panelData.title} - ${result.shownRoles}/${result.totalRoles} roles`);
                } else {
                    errorCount++;
                    results.push(`❌ ${panelData.title}: ${result.error}`);
                }
            }

            const refreshEmbed = new EmbedBuilder()
                .setTitle('🔄 Panel Refresh & Update Complete!')
                .setDescription(
                    `**Panels Found:** ${guildPanels.length}\n` +
                    `**Successfully Refreshed:** ${refreshedCount}\n` +
                    `**Errors:** ${errorCount}\n\n` +
                    `**Results:**\n${results.slice(0, 10).join('\n')}` +
                    (results.length > 10 ? `\n*...and ${results.length - 10} more*` : '')
                )
                .setColor(errorCount === 0 ? 0x00FF99 : 0xF39C12)
                .setTimestamp();

            await interaction.editReply({ embeds: [refreshEmbed] });

            // Save data after refresh
            await dataManager.saveData();

        } catch (error) {
            console.error('❌ Error in panel refresh:', error);
            await interaction.editReply({ content: '❌ Failed to refresh panels! Check console for details.' });
        }
    }
};
