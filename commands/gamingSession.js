// 🎮 Gaming Session Manager - OPTIMIZED VERSION
// Enhanced gaming session system with improved error handling and performance

const { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');

class GamingSessionManager {
    constructor() {
        this.activeSessions = new Map();
        this.scheduledReminders = new Map();
        
        // Auto-cleanup every 30 minutes
        setInterval(() => this.cleanupExpiredSessions(), 30 * 60 * 1000);
        
        console.log('🎮 Gaming Session Manager initialized');
    }

    getSlashCommandData() {
        return new SlashCommandBuilder()
            .setName('startsession')
            .setDescription('🎮 Start a gaming session and invite others to join!')
            .addRoleOption(option =>
                option.setName('game')
                    .setDescription('Select the game role for this session')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('time')
                    .setDescription('When to start? (e.g., "now", "in 30 minutes", "at 8pm")')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('description')
                    .setDescription('Optional description for the gaming session')
                    .setRequired(false));
    }

    async execute(interaction) {
        // Immediate defer to prevent timeout
        if (interaction.replied || interaction.deferred) {
            console.log('⚠️ Gaming session interaction already acknowledged');
            return;
        }

        try {
            await interaction.deferReply();
            console.log('✅ Gaming session deferred successfully');
        } catch (deferError) {
            console.error('❌ Failed to defer gaming session:', deferError);
            return;
        }

        try {
            const gameRole = interaction.options.getRole('game');
            const timeInput = interaction.options.getString('time');
            const description = interaction.options.getString('description') || '';

            // Validate game role
            if (!gameRole) {
                return await interaction.editReply({
                    content: '❌ **Invalid game role!** Please select a valid role.'
                });
            }

            // Parse time input
            const parsedTime = this.parseTimeInput(timeInput);
            if (!parsedTime.success) {
                return await interaction.editReply({
                    content: '❌ **Invalid time format!**\n\n**Examples:**\n• `now` - Start immediately\n• `in 30 minutes` - Start in 30 minutes\n• `in 2 hours` - Start in 2 hours\n• `at 8pm` - Start at 8 PM today'
                });
            }

            // Check if time is too far in the future (24 hours max)
            const maxTime = Date.now() + (24 * 60 * 60 * 1000);
            if (parsedTime.timestamp > maxTime) {
                return await interaction.editReply({
                    content: '❌ **Time too far in the future!** Sessions can only be scheduled up to 24 hours ahead.'
                });
            }

            // Create session
            const sessionId = `session_${interaction.guild.id}_${Date.now()}`;
            const sessionData = {
                id: sessionId,
                hostId: interaction.user.id,
                hostName: interaction.user.displayName,
                gameRole: gameRole.id,
                gameName: gameRole.name,
                scheduledTime: parsedTime.timestamp,
                timeString: parsedTime.displayTime,
                description: description,
                participants: new Map(),
                channelId: interaction.channel.id,
                guildId: interaction.guild.id,
                createdAt: Date.now(),
                messageId: null,
                isActive: true
            };

            // Add host as first participant
            sessionData.participants.set(interaction.user.id, {
                username: interaction.user.displayName,
                joinedAt: Date.now(),
                isHost: true
            });

            this.activeSessions.set(sessionId, sessionData);

            const embed = this.createSessionEmbed(sessionData, gameRole);
            const buttons = this.createSessionButtons(sessionId, true); // Always show end button
            
            const message = await interaction.editReply({
                content: `${gameRole} **New Gaming Session Started!**`,
                embeds: [embed],
                components: [buttons],
                allowedMentions: { roles: [gameRole.id] }
            });

            sessionData.messageId = message.id;
            this.activeSessions.set(sessionId, sessionData);

            // Schedule reminder if needed
            if (parsedTime.timestamp > Date.now()) {
                this.scheduleReminder(sessionData, message);
            }

            console.log(`✅ Gaming session created: ${sessionData.gameName} by ${sessionData.hostName} (${sessionData.participants.size} initial participants)`);

        } catch (error) {
            console.error('❌ Error creating gaming session:', error);
            await interaction.editReply({
                content: '❌ **Failed to create gaming session!** Please try again in a moment.'
            }).catch(() => {});
        }
    }

    async handleButtonInteraction(interaction) {
        // Immediate defer to prevent timeout
        if (interaction.replied || interaction.deferred) {
            console.log('⚠️ Gaming button interaction already acknowledged');
            return false;
        }

        try {
            await interaction.deferUpdate();
            console.log('✅ Gaming button deferred successfully');
        } catch (deferError) {
            console.error('❌ Failed to defer gaming button:', deferError);
            return false;
        }

        try {
            const [, action, ...idParts] = interaction.customId.split('_');
            let sessionId = idParts.join('_');
            
            // Ensure proper session ID format
            if (!sessionId.startsWith('session_')) {
                sessionId = `session_${sessionId}`;
            }

            let sessionData = this.activeSessions.get(sessionId);

            // If session not found, try to find by message
            if (!sessionData) {
                const foundSession = this.findSessionByMessage(interaction);
                if (foundSession) {
                    sessionData = foundSession.data;
                    sessionId = foundSession.id;
                } else {
                    await interaction.followUp({
                        content: '❌ **Gaming Session Not Found**\n\nThis session may have expired or been deleted. Please create a new one with `/startsession`.',
                        ephemeral: true
                    });
                    return false;
                }
            }

            // Check if session is still active
            if (!sessionData.isActive) {
                await interaction.followUp({
                    content: '❌ **Session Expired**\n\nThis gaming session is no longer active. Please create a new one.',
                    ephemeral: true
                });
                return false;
            }

            return await this.handleSessionAction(interaction, action, sessionData, sessionId);

        } catch (error) {
            console.error('❌ Button interaction error:', error);
            await interaction.followUp({
                content: '❌ **Something went wrong.** Please try again or create a new session.',
                ephemeral: true
            }).catch(() => {});
            return false;
        }
    }

    findSessionByMessage(interaction) {
        for (const [id, data] of this.activeSessions.entries()) {
            if (data.guildId === interaction.guild.id && 
                data.channelId === interaction.channel.id &&
                data.messageId === interaction.message.id) {
                return { id, data };
            }
        }
        return null;
    }

    async handleSessionAction(interaction, action, sessionData, sessionId) {
        try {
            switch (action) {
                case 'join':
                    await this.handleJoin(interaction, sessionData, sessionId);
                    break;
                case 'leave':
                    await this.handleLeave(interaction, sessionData, sessionId);
                    break;
                case 'info':
                    await this.handleInfo(interaction, sessionData);
                    break;
                case 'end':
                    await this.handleEndEvent(interaction, sessionData, sessionId);
                    break;
                default:
                    await interaction.followUp({
                        content: `❌ Unknown action: ${action}`,
                        ephemeral: true
                    });
                    return false;
            }
            return true;
        } catch (error) {
            console.error(`❌ Error handling session action ${action}:`, error);
            await interaction.followUp({
                content: '❌ **Gaming Session Error**\n\nSomething went wrong. Please try again.',
                ephemeral: true
            }).catch(() => {});
            return false;
        }
    }

    parseTimeInput(input) {
        const now = new Date();
        const inputLower = input.toLowerCase().trim();

        try {
            // Handle "now"
            if (inputLower === 'now') {
                return {
                    success: true,
                    timestamp: now.getTime(),
                    displayTime: '**Right Now!** 🚀'
                };
            }

            // Handle "in X minutes/hours"
            const inMatch = inputLower.match(/^in\s+(\d+)\s+(minute|minutes|hour|hours|min|mins|hr|hrs)$/);
            if (inMatch) {
                const amount = parseInt(inMatch[1]);
                const unit = inMatch[2];
                
                if (amount <= 0 || amount > 1440) { // Max 24 hours in minutes
                    return { success: false };
                }
                
                const isHours = unit.startsWith('h');
                const milliseconds = amount * (isHours ? 60 * 60 * 1000 : 60 * 1000);
                const targetTime = new Date(now.getTime() + milliseconds);
                
                return {
                    success: true,
                    timestamp: targetTime.getTime(),
                    displayTime: `<t:${Math.floor(targetTime.getTime() / 1000)}:F> (<t:${Math.floor(targetTime.getTime() / 1000)}:R>)`
                };
            }

            // Handle "at 8pm", "at 14:30", etc.
            const atMatch = inputLower.match(/^at\s+(\d{1,2})(?::(\d{2}))?\s*(pm|am)?$/);
            if (atMatch) {
                let hours = parseInt(atMatch[1]);
                const minutes = atMatch[2] ? parseInt(atMatch[2]) : 0;
                const meridiem = atMatch[3];

                // Validate hours and minutes
                if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
                    return { success: false };
                }

                if (meridiem) {
                    if (meridiem === 'pm' && hours !== 12) hours += 12;
                    if (meridiem === 'am' && hours === 12) hours = 0;
                }

                const targetTime = new Date(now);
                targetTime.setHours(hours, minutes, 0, 0);

                // If time is in the past, assume tomorrow
                if (targetTime.getTime() <= now.getTime()) {
                    targetTime.setDate(targetTime.getDate() + 1);
                }

                return {
                    success: true,
                    timestamp: targetTime.getTime(),
                    displayTime: `<t:${Math.floor(targetTime.getTime() / 1000)}:F> (<t:${Math.floor(targetTime.getTime() / 1000)}:R>)`
                };
            }

            return { success: false };

        } catch (error) {
            console.error('❌ Error parsing time input:', error);
            return { success: false };
        }
    }

    createSessionEmbed(sessionData, gameRole) {
        const participantsList = Array.from(sessionData.participants.values());
        const participantNames = participantsList.length > 0 
            ? participantsList.map((p, index) => {
                const hostIndicator = p.isHost ? ' 👑' : '';
                return `${index + 1}. **${p.username}**${hostIndicator}`;
              }).join('\n')
            : '*No players yet - be the first to join!*';

        const isLive = sessionData.scheduledTime <= Date.now();
        const status = isLive ? '🔴 **LIVE NOW**' : '🟢 **Scheduled**';
        
        // Time until session
        let timeInfo = sessionData.timeString;
        if (!isLive) {
            const timeUntil = sessionData.scheduledTime - Date.now();
            const minutesUntil = Math.floor(timeUntil / (60 * 1000));
            if (minutesUntil <= 60) {
                timeInfo += `\n⏱️ Starting in ${minutesUntil} minutes`;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(`🎮 ${sessionData.gameName} Gaming Session`)
            .setColor(isLive ? 0xff0000 : 0x00ff00)
            .addFields(
                { name: '🎯 Game', value: sessionData.gameName, inline: true },
                { name: '👤 Host', value: sessionData.hostName, inline: true },
                { name: '📊 Status', value: status, inline: true },
                { name: '⏰ Time', value: timeInfo, inline: false },
                { name: '👥 Players', value: `**${participantsList.length}** joined`, inline: true },
                { name: '🎮 Player List', value: participantNames.length > 1000 ? participantNames.substring(0, 1000) + '...' : participantNames, inline: false }
            )
            .setFooter({ text: `Session ID: ${sessionData.id.split('_').pop()} • Created` })
            .setTimestamp(sessionData.createdAt);

        if (sessionData.description && sessionData.description.length > 0) {
            embed.addFields({ 
                name: '📝 Description', 
                value: sessionData.description.length > 1024 ? sessionData.description.substring(0, 1021) + '...' : sessionData.description, 
                inline: false 
            });
        }

        return embed;
    }

    createSessionButtons(sessionId, showEndButton = false) {
        const baseId = sessionId.replace('session_', '');
        
        const buttons = [
            new ButtonBuilder()
                .setCustomId(`gaming_join_${baseId}`)
                .setLabel('🎮 Join Session')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`gaming_leave_${baseId}`)
                .setLabel('❌ Leave Session')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`gaming_info_${baseId}`)
                .setLabel('ℹ️ Session Info')
                .setStyle(ButtonStyle.Secondary)
        ];

        // Add End Event button for session creator
        if (showEndButton) {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`gaming_end_${baseId}`)
                    .setLabel('🛑 End Event')
                    .setStyle(ButtonStyle.Danger)
            );
        }
        
        return new ActionRowBuilder().addComponents(...buttons);
    }

    async handleJoin(interaction, sessionData, sessionId) {
        const userId = interaction.user.id;
        const userName = interaction.user.displayName;

        if (sessionData.participants.has(userId)) {
            return await interaction.followUp({
                content: `✅ **Already joined!** You're already in the **${sessionData.gameName}** session.\n\n👥 **Total players:** ${sessionData.participants.size}`,
                ephemeral: true
            });
        }

        // Add participant
        sessionData.participants.set(userId, {
            username: userName,
            joinedAt: Date.now(),
            isHost: false
        });

        // Update session message
        await this.updateSessionMessage(interaction, sessionData, sessionId);

        // Send confirmation
        const timeUntil = sessionData.scheduledTime - Date.now();
        const isStartingSoon = timeUntil <= 10 * 60 * 1000; // 10 minutes
        
        let confirmationMessage = `🎮 **Joined ${sessionData.gameName}!**\n\n⏰ **Starting:** ${sessionData.timeString}\n👥 **Players:** ${sessionData.participants.size} joined`;
        
        if (isStartingSoon && timeUntil > 0) {
            confirmationMessage += `\n\n🚨 **Starting soon!** Get ready to play!`;
        } else if (timeUntil > 0) {
            confirmationMessage += `\n\n*You'll be notified when it's time to play!*`;
        } else {
            confirmationMessage += `\n\n🔴 **LIVE NOW!** Ready to play!`;
        }

        await interaction.followUp({
            content: confirmationMessage,
            ephemeral: true
        });

        console.log(`👤 ${userName} joined ${sessionData.gameName} (${sessionData.participants.size} total)`);
    }

    async handleLeave(interaction, sessionData, sessionId) {
        const userId = interaction.user.id;
        const userName = interaction.user.displayName;

        if (!sessionData.participants.has(userId)) {
            return await interaction.followUp({
                content: `⚠️ **Not in session!** You're not signed up for **${sessionData.gameName}**.\n\n👥 **Current players:** ${sessionData.participants.size}`,
                ephemeral: true
            });
        }

        // Check if user is host
        const isHost = sessionData.participants.get(userId)?.isHost;
        
        sessionData.participants.delete(userId);

        // If host left and there are other participants, transfer host
        if (isHost && sessionData.participants.size > 0) {
            const newHost = sessionData.participants.values().next().value;
            newHost.isHost = true;
            sessionData.hostId = Array.from(sessionData.participants.keys())[0];
            sessionData.hostName = newHost.username;
            
            console.log(`👑 Host transferred from ${userName} to ${newHost.username}`);
        }

        // Update session message
        await this.updateSessionMessage(interaction, sessionData, sessionId);

        // Send confirmation
        let confirmationMessage = `❌ **Left ${sessionData.gameName}**\n\n👥 **Remaining players:** ${sessionData.participants.size}`;
        
        if (isHost && sessionData.participants.size > 0) {
            confirmationMessage += `\n\n👑 **Host transferred** to ${sessionData.hostName}`;
        } else if (isHost && sessionData.participants.size === 0) {
            confirmationMessage += `\n\n⚠️ **Session will end soon** (no players left)`;
        }
        
        confirmationMessage += `\n\n*You can rejoin anytime!*`;

        await interaction.followUp({
            content: confirmationMessage,
            ephemeral: true
        });

        // End session if no participants left
        if (sessionData.participants.size === 0) {
            setTimeout(() => {
                if (this.activeSessions.has(sessionId) && this.activeSessions.get(sessionId).participants.size === 0) {
                    this.endSession(sessionId, 'No participants remaining');
                }
            }, 5 * 60 * 1000); // 5 minutes grace period
        }

        console.log(`👤 ${userName} left ${sessionData.gameName} (${sessionData.participants.size} remaining)`);
    }

    async handleInfo(interaction, sessionData) {
        const timeLeft = sessionData.scheduledTime - Date.now();
        const isLive = timeLeft <= 0;
        
        // Calculate session duration
        const sessionAge = Date.now() - sessionData.createdAt;
        const hoursAge = Math.floor(sessionAge / (60 * 60 * 1000));
        const minutesAge = Math.floor((sessionAge % (60 * 60 * 1000)) / (60 * 1000));
        
        const embed = new EmbedBuilder()
            .setTitle('ℹ️ Session Information')
            .setColor(0x3498db)
            .addFields(
                { name: '🎮 Game', value: sessionData.gameName, inline: true },
                { name: '👤 Host', value: sessionData.hostName, inline: true },
                { name: '👥 Players', value: sessionData.participants.size.toString(), inline: true },
                { name: '⏰ Scheduled Time', value: sessionData.timeString, inline: false },
                { name: '🕐 Status', value: isLive ? '🔴 **LIVE NOW!**' : `🟢 Starting <t:${Math.floor(sessionData.scheduledTime / 1000)}:R>`, inline: true },
                { name: '⏱️ Session Age', value: `${hoursAge}h ${minutesAge}m`, inline: true }
            )
            .setFooter({ text: `Session created` })
            .setTimestamp(sessionData.createdAt);

        if (sessionData.description) {
            embed.addFields({ name: '📝 Description', value: sessionData.description, inline: false });
        }

        // Add participant list if not too long
        const participantsList = Array.from(sessionData.participants.values());
        if (participantsList.length > 0 && participantsList.length <= 10) {
            const participants = participantsList.map(p => `• ${p.username}${p.isHost ? ' 👑' : ''}`).join('\n');
            embed.addFields({ name: '👥 Participants', value: participants, inline: false });
        }

        await interaction.followUp({
            embeds: [embed],
            ephemeral: true
        });
    }

    async handleEndEvent(interaction, sessionData, sessionId) {
        const userId = interaction.user.id;
        const userName = interaction.user.displayName;

        // Check if user is the session creator
        if (sessionData.hostId !== userId) {
            return await interaction.followUp({
                content: `❌ **Permission Denied**\n\nOnly the session creator (**${sessionData.hostName}**) can end this event.\n\n📝 **Note:** If you're a moderator and need to end this session, you can delete the message manually.`,
                ephemeral: true
            });
        }

        // Send confirmation message to all participants before ending
        const participantsList = Array.from(sessionData.participants.values());
        if (participantsList.length > 1) { // More than just the host
            const embed = new EmbedBuilder()
                .setTitle('🛑 Gaming Session Ended')
                .setDescription(`## 🎮 **${sessionData.gameName}** session has been ended by the host\n\n📊 **Final Stats:**\n👥 **Players:** ${participantsList.length}\n⏱️ **Duration:** ${this.getSessionDuration(sessionData)}\n\n🚀 **Thanks for playing!** Feel free to start a new session anytime.`)
                .setColor(0xff6b6b)
                .addFields(
                    { name: '👑 Host', value: sessionData.hostName, inline: true },
                    { name: '🎮 Game', value: sessionData.gameName, inline: true },
                    { name: '📅 Ended', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setTimestamp();

            // Send final message to channel
            try {
                await interaction.channel.send({
                    embeds: [embed]
                });
            } catch (error) {
                console.error('❌ Error sending end session message:', error);
            }
        }

        // Clean up the session
        this.endSession(sessionId, `Ended by host (${userName})`);

        // Send confirmation to the host
        await interaction.followUp({
            content: `✅ **Gaming Session Ended**\n\n🎮 **${sessionData.gameName}** session has been successfully ended.\n👥 **Total players:** ${participantsList.length}\n⏱️ **Duration:** ${this.getSessionDuration(sessionData)}\n\n💬 **Session message will be deleted in 5 seconds...**`,
            ephemeral: true
        });

        // Delete the original session message after a short delay
        setTimeout(async () => {
            try {
                await interaction.message.delete();
                console.log(`🗑️ Deleted session message for ${sessionData.gameName} (ended by ${userName})`);
            } catch (error) {
                console.error('❌ Error deleting session message:', error);
                // If we can't delete the message, at least disable the buttons
                try {
                    await interaction.message.edit({
                        components: []
                    });
                } catch (editError) {
                    console.error('❌ Error disabling buttons:', editError);
                }
            }
        }, 5000); // 5 second delay

        console.log(`🛑 Gaming session ${sessionData.gameName} ended by host ${userName}`);
    }

    getSessionDuration(sessionData) {
        const duration = Date.now() - sessionData.createdAt;
        const hours = Math.floor(duration / (60 * 60 * 1000));
        const minutes = Math.floor((duration % (60 * 60 * 1000)) / (60 * 1000));
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    async updateSessionMessage(interaction, sessionData, sessionId) {
        try {
            const gameRole = await interaction.guild.roles.fetch(sessionData.gameRole).catch(() => null);
            if (!gameRole) {
                console.log(`⚠️ Game role ${sessionData.gameRole} not found`);
                return;
            }
            
            const embed = this.createSessionEmbed(sessionData, gameRole);
            // Always show end button for session creator
            const buttons = this.createSessionButtons(sessionId, true);

            await interaction.message.edit({
                embeds: [embed],
                components: [buttons]
            });

            this.activeSessions.set(sessionId, sessionData);

        } catch (error) {
            console.error('❌ Failed to update session message:', error);
        }
    }

    scheduleReminder(sessionData, message) {
        const timeUntilStart = sessionData.scheduledTime - Date.now();
        
        if (timeUntilStart <= 0) return;

        const timeoutId = setTimeout(async () => {
            try {
                await this.sendGameTimeReminder(sessionData, message);
            } catch (error) {
                console.error('❌ Error sending game time reminder:', error);
            }
        }, timeUntilStart);

        this.scheduledReminders.set(sessionData.id, timeoutId);
        console.log(`⏰ Scheduled reminder for ${sessionData.gameName} in ${Math.round(timeUntilStart / 1000)}s`);
    }

    async sendGameTimeReminder(sessionData, message) {
        try {
            const participants = Array.from(sessionData.participants.keys()).filter(id => id !== sessionData.hostId);
            
            if (participants.length === 0) {
                console.log(`⏰ No participants (besides host) for ${sessionData.gameName}, skipping reminder`);
                return;
            }

            const mentions = participants.map(userId => `<@${userId}>`).join(' ');
            
            const embed = new EmbedBuilder()
                .setTitle('🚨 GAME TIME!')
                .setDescription(`## 🎮 **${sessionData.gameName}** is starting **NOW!**\n\n👥 **Players:** ${mentions}\n\n🚀 **Ready up and let's play!**`)
                .setColor(0xff0000)
                .setTimestamp();

            await message.channel.send({
                content: `<@${sessionData.hostId}> ${mentions}`,
                embeds: [embed],
                allowedMentions: { users: [sessionData.hostId, ...participants] }
            });

            // Update session to live status
            sessionData.scheduledTime = Date.now();
            const gameRole = await message.guild.roles.fetch(sessionData.gameRole).catch(() => null);
            
            if (gameRole) {
                const updatedEmbed = this.createSessionEmbed(sessionData, gameRole);
                const buttons = this.createSessionButtons(sessionData.id, true); // Show end button

                await message.edit({
                    embeds: [updatedEmbed],
                    components: [buttons]
                });
            }

            console.log(`🚨 Reminder sent for ${sessionData.gameName} to ${participants.length + 1} players`);

            // Auto-cleanup after 2 hours
            setTimeout(() => {
                this.endSession(sessionData.id, 'Auto-cleanup after game time');
            }, 2 * 60 * 60 * 1000);

        } catch (error) {
            console.error('❌ Reminder send error:', error);
        }
    }

    endSession(sessionId, reason = 'Manual end') {
        try {
            if (this.scheduledReminders.has(sessionId)) {
                clearTimeout(this.scheduledReminders.get(sessionId));
                this.scheduledReminders.delete(sessionId);
            }
            
            const sessionData = this.activeSessions.get(sessionId);
            if (sessionData) {
                sessionData.isActive = false;
            }
            
            this.activeSessions.delete(sessionId);
            console.log(`🧹 Ended session: ${sessionData?.gameName || sessionId} (${reason})`);
        } catch (error) {
            console.error('❌ Error ending session:', error);
        }
    }

    cleanupExpiredSessions() {
        const now = Date.now();
        const fourHours = 4 * 60 * 60 * 1000;
        let cleaned = 0;

        for (const [sessionId, sessionData] of this.activeSessions.entries()) {
            // Clean up old sessions
            if (now - sessionData.createdAt > fourHours) {
                this.endSession(sessionId, 'Expired (4+ hours old)');
                cleaned++;
            }
            // Clean up empty sessions that are older than 30 minutes
            else if (sessionData.participants.size === 0 && now - sessionData.createdAt > 30 * 60 * 1000) {
                this.endSession(sessionId, 'No participants for 30+ minutes');
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} expired gaming sessions`);
        }
    }

    getActiveSessionsForGuild(guildId) {
        return Array.from(this.activeSessions.values())
            .filter(session => session.guildId === guildId && session.isActive);
    }

    getStats() {
        const activeSessions = Array.from(this.activeSessions.values()).filter(s => s.isActive);
        return {
            totalSessions: activeSessions.length,
            totalReminders: this.scheduledReminders.size,
            totalParticipants: activeSessions.reduce((sum, s) => sum + s.participants.size, 0),
            sessions: activeSessions.map(s => ({
                game: s.gameName,
                players: s.participants.size,
                host: s.hostName,
                time: s.timeString,
                status: s.scheduledTime <= Date.now() ? 'LIVE' : 'SCHEDULED'
            }))
        };
    }
}

module.exports = { GamingSessionManager };
