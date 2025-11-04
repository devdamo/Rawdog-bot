// 🤖 Enhanced Discord Gaming Server Bot - SEPARATED COMMANDS VERSION
// Features: Role panels, Welcome system, Video reactions, Gaming sessions, Persistent data

// Load .env file if it exists (optional in Docker/production)
const fsSync = require('fs');
if (fsSync.existsSync('.env')) {
    require('dotenv').config();
}

const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    REST,
    Routes
} = require('discord.js');

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs').promises;
const path = require('path');

// Import command system and managers
const CommandLoader = require('./commands/index.js');
const { VideoReactionManager } = require('./commands/videoReactions.js');

// ═══════════════════════════════════════════════════════════════════════════════
// 📋 CONFIGURATION & INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
    DATA_DIR: './bot_data',
    PANELS_FILE: './bot_data/panels.json',
    SETTINGS_FILE: './bot_data/server_settings.json',
    COLORS: {
        blue: 0x3498DB, green: 0x2ECC71, red: 0xE74C3C,
        purple: 0x9B59B6, orange: 0xE67E22, yellow: 0xF1C40F
    },
    DANGEROUS_PERMISSIONS: [
        PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild,
        PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MentionEveryone,
        PermissionFlagsBits.ModerateMembers
    ],
    MAX_ROLES_PER_DROPDOWN: 25,
    INTERACTION_TIMEOUT: 14 * 60 * 1000 // 14 minutes
};

// Environment validation
const { BOT_TOKEN: TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!TOKEN || !CLIENT_ID) {
    console.error('❌ Missing BOT_TOKEN or CLIENT_ID in .env file!');
    process.exit(1);
}

// Bot initialization with optimized intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// Data storage
const panels = new Map();
const serverSettings = new Map();

// Initialize command system and managers
const commandLoader = new CommandLoader();
let videoManager;

// ═══════════════════════════════════════════════════════════════════════════════
// 💾 IMPROVED DATA MANAGEMENT SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

class DataManager {
    static async ensureDirectory() {
        try {
            await fs.access(CONFIG.DATA_DIR);
        } catch {
            await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
            console.log('📁 Created data directory');
        }
    }

    static async saveData() {
        try {
            await this.ensureDirectory();
            
            // Convert Maps to objects for JSON storage
            const panelsData = Object.fromEntries(
                Array.from(panels.entries()).map(([key, value]) => [
                    key, {
                        ...value,
                        buttons: value.buttons instanceof Map ? Object.fromEntries(value.buttons) : value.buttons,
                        dropdownRoles: value.dropdownRoles instanceof Map ? Object.fromEntries(value.dropdownRoles) : value.dropdownRoles
                    }
                ])
            );
            
            const settingsData = Object.fromEntries(
                Array.from(serverSettings.entries()).map(([key, value]) => [
                    key, {
                        ...value,
                        userInteractions: value.userInteractions instanceof Map ? Object.fromEntries(value.userInteractions) : value.userInteractions,
                        userRoles: value.userRoles instanceof Map ? Object.fromEntries(value.userRoles) : value.userRoles,
                        roleHistory: value.roleHistory instanceof Map ? Object.fromEntries(value.roleHistory) : value.roleHistory
                    }
                ])
            );
            
            await Promise.all([
                fs.writeFile(CONFIG.PANELS_FILE, JSON.stringify(panelsData, null, 2)),
                fs.writeFile(CONFIG.SETTINGS_FILE, JSON.stringify(settingsData, null, 2))
            ]);
            
            console.log('💾 Data saved successfully');
        } catch (error) {
            console.error('❌ Error saving data:', error);
        }
    }

    static async loadData() {
        try {
            await this.ensureDirectory();
            
            // Load panels
            try {
                const panelsData = JSON.parse(await fs.readFile(CONFIG.PANELS_FILE, 'utf8'));
                for (const [key, value] of Object.entries(panelsData)) {
                    if (value.buttons && typeof value.buttons === 'object') {
                        value.buttons = new Map(Object.entries(value.buttons));
                    }
                    if (value.dropdownRoles && typeof value.dropdownRoles === 'object') {
                        value.dropdownRoles = new Map(Object.entries(value.dropdownRoles));
                    }
                    panels.set(key, value);
                }
                console.log(`📊 Loaded ${panels.size} panels`);
            } catch {
                console.log('📊 No existing panels found, starting fresh');
            }
            
            // Load server settings
            try {
                const settingsData = JSON.parse(await fs.readFile(CONFIG.SETTINGS_FILE, 'utf8'));
                for (const [guildId, settings] of Object.entries(settingsData)) {
                    const serverSetting = {
                        defaultRole: settings.defaultRole || null,
                        blacklistedRoles: settings.blacklistedRoles || [],
                        welcomeChannel: settings.welcomeChannel || null,
                        userInteractions: new Map(),
                        userRoles: new Map(),
                        roleHistory: new Map(),
                        roleStats: settings.roleStats || {},
                        videoReactions: settings.videoReactions || {
                            enabled: false,
                            channels: [],
                            likeEmoji: '👍',
                            dislikeEmoji: '👎',
                            stats: { totalVideos: 0, totalReactions: 0 }
                        }
                    };
                    
                    // Convert objects back to Maps
                    if (settings.userInteractions && typeof settings.userInteractions === 'object') {
                        serverSetting.userInteractions = new Map(Object.entries(settings.userInteractions));
                    }
                    
                    if (settings.userRoles && typeof settings.userRoles === 'object') {
                        serverSetting.userRoles = new Map(Object.entries(settings.userRoles));
                    }
                    
                    if (settings.roleHistory && typeof settings.roleHistory === 'object') {
                        serverSetting.roleHistory = new Map(Object.entries(settings.roleHistory));
                    }
                    
                    serverSettings.set(guildId, serverSetting);
                }
                console.log(`⚙️ Loaded settings for ${serverSettings.size} servers`);
            } catch {
                console.log('⚙️ No existing settings found, starting fresh');
            }
            
        } catch (error) {
            console.error('❌ Error loading data:', error);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🖼️ OPTIMIZED WELCOME IMAGE GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

class WelcomeImageGenerator {
    static async generateImage(member) {
        try {
            const settings = ServerManager.getSettings(member.guild.id);
            const userStats = settings.userInteractions.get(member.id) || { waves: 0, middleFingers: 0 };
            
            const canvas = createCanvas(800, 300);
            const ctx = canvas.getContext('2d');
            
            // Background gradient
            const gradient = ctx.createLinearGradient(0, 0, 800, 300);
            gradient.addColorStop(0, '#667eea');
            gradient.addColorStop(1, '#764ba2');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 800, 300);
            
            // Decorative elements
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.beginPath();
            ctx.arc(700, -50, 100, 0, Math.PI * 2);
            ctx.arc(50, 350, 150, 0, Math.PI * 2);
            ctx.fill();
            
            // Load and draw avatar
            await this.drawAvatar(ctx, member);
            
            // Draw user info
            this.drawUserInfo(ctx, member, userStats);
            
            return canvas.toBuffer('image/png');
        } catch (error) {
            console.error('❌ Error generating welcome image:', error);
            return null;
        }
    }

    static async drawAvatar(ctx, member) {
        let avatarLoaded = false;
        
        // Try custom avatar first
        if (member.user.avatar) {
            try {
                const avatarURL = `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png?size=256`;
                const avatar = await loadImage(avatarURL);
                
                // Draw avatar with circular mask
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(150, 150, 65, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.save();
                ctx.beginPath();
                ctx.arc(150, 150, 60, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(avatar, 90, 90, 120, 120);
                ctx.restore();
                
                // Avatar border
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(150, 150, 60, 0, Math.PI * 2);
                ctx.stroke();
                
                avatarLoaded = true;
            } catch (error) {
                console.log(`❌ Avatar loading failed: ${error.message}`);
            }
        }
        
        // Fallback to default avatar
        if (!avatarLoaded) {
            try {
                const defaultNum = (parseInt(member.user.id) >> 22) % 5;
                const defaultURL = `https://cdn.discordapp.com/embed/avatars/${defaultNum}.png`;
                
                const defaultAvatar = await loadImage(defaultURL);
                
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(150, 150, 65, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.save();
                ctx.beginPath();
                ctx.arc(150, 150, 60, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(defaultAvatar, 90, 90, 120, 120);
                ctx.restore();
                
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(150, 150, 60, 0, Math.PI * 2);
                ctx.stroke();
            } catch {
                // Final fallback: Simple colored circle
                this.drawFallbackAvatar(ctx, member);
            }
        }
    }

    static drawFallbackAvatar(ctx, member) {
        ctx.fillStyle = '#5865F2';
        ctx.beginPath();
        ctx.arc(150, 150, 60, 0, Math.PI * 2);
        ctx.fill();
        
        const letter = member.user.displayName.charAt(0).toUpperCase();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, 150, 150);
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(150, 150, 60, 0, Math.PI * 2);
        ctx.stroke();
    }

    static drawUserInfo(ctx, member, userStats) {
        // User name section
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(250, 70, 400, 50);
        
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        const username = member.user.displayName.length > 20 ? 
            member.user.displayName.substring(0, 17) + '...' : 
            member.user.displayName;
        ctx.fillText(username, 260, 95);
        
        // Stats sections
        this.drawStatsSection(ctx, 140, '👋 Waves', userStats.waves, '#FFD700');
        this.drawStatsSection(ctx, 190, '🖕 Fingers', userStats.middleFingers, '#FF4444');
    }

    static drawStatsSection(ctx, y, label, count, color) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(250, y, 400, 40);
        
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(`${label}: ${count}`, 260, y + 20);
        
        // Draw dots for visual representation
        ctx.fillStyle = color;
        const dotsToShow = Math.min(count, 10);
        for (let i = 0; i < dotsToShow; i++) {
            ctx.beginPath();
            ctx.arc(450 + (i % 5) * 25, y + 10 + Math.floor(i / 5) * 20, 5, 0, Math.PI * 2);
            ctx.fill();
        }
        
        if (count > 10) {
            ctx.fillStyle = '#333';
            ctx.font = 'bold 16px Arial';
            ctx.fillText('+', 580, y + 20);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ⚙️ IMPROVED SERVER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

class ServerManager {
    static getSettings(guildId) {
        if (!serverSettings.has(guildId)) {
            serverSettings.set(guildId, {
                defaultRole: null,
                blacklistedRoles: [],
                welcomeChannel: null,
                userInteractions: new Map(),
                userRoles: new Map(),
                roleHistory: new Map(),
                roleStats: {},
                videoReactions: {
                    enabled: false,
                    channels: [],
                    likeEmoji: '👍',
                    dislikeEmoji: '👎',
                    stats: { totalVideos: 0, totalReactions: 0 }
                }
            });
        }
        return serverSettings.get(guildId);
    }

    static filterRoles(guild, filter, blacklistedRoles = []) {
        const baseFilter = role => 
            role.name !== '@everyone' && 
            !role.managed && 
            role.position < guild.members.me.roles.highest.position &&
            !blacklistedRoles.includes(role.id);

        if (filter === 'safe') {
            return guild.roles.cache
                .filter(role => baseFilter(role) && 
                    !CONFIG.DANGEROUS_PERMISSIONS.some(perm => role.permissions.has(perm)))
                .map(role => role);
        }
        
        return guild.roles.cache.filter(baseFilter).map(role => role);
    }

    static async updateInteractionStats(guildId, userId, type) {
        const settings = this.getSettings(guildId);
        const userStats = settings.userInteractions.get(userId) || { waves: 0, middleFingers: 0 };
        
        userStats[type] += 1;
        settings.userInteractions.set(userId, userStats);
        
        await DataManager.saveData();
        return userStats;
    }

    static async syncUserRoles(guild) {
        const settings = this.getSettings(guild.id);
        console.log(`🔄 Syncing roles for ${guild.name}`);
        
        try {
            await guild.members.fetch();
            
            let syncedCount = 0;
            const roleStats = new Map();
            
            guild.members.cache.forEach(member => {
                if (member.user.bot) return;
                
                const userRoleIds = member.roles.cache
                    .filter(role => role.name !== '@everyone')
                    .map(role => role.id);
                
                settings.userRoles.set(member.id, {
                    roles: userRoleIds,
                    lastUpdated: new Date().toISOString(),
                    username: member.user.displayName
                });
                
                userRoleIds.forEach(roleId => {
                    const count = roleStats.get(roleId) || 0;
                    roleStats.set(roleId, count + 1);
                });
                
                syncedCount++;
            });
            
            settings.roleStats = Object.fromEntries(roleStats);
            await DataManager.saveData();
            
            console.log(`✅ Synced ${syncedCount} members with ${roleStats.size} unique roles`);
            return { syncedMembers: syncedCount, uniqueRoles: roleStats.size };
            
        } catch (error) {
            console.error('❌ Error syncing user roles:', error);
            throw error;
        }
    }

    static async trackRoleChange(member, oldRoles, newRoles) {
        const settings = this.getSettings(member.guild.id);
        
        const oldRoleIds = oldRoles ? oldRoles.cache.map(role => role.id) : [];
        const newRoleIds = newRoles.cache.map(role => role.id);
        
        const addedRoles = newRoleIds.filter(id => !oldRoleIds.includes(id));
        const removedRoles = oldRoleIds.filter(id => !newRoleIds.includes(id));
        
        if (addedRoles.length === 0 && removedRoles.length === 0) return;
        
        // Update user roles
        const userRoleData = settings.userRoles.get(member.id) || { roles: [], lastUpdated: null, username: member.user.displayName };
        userRoleData.roles = newRoleIds.filter(id => id !== member.guild.roles.everyone.id);
        userRoleData.lastUpdated = new Date().toISOString();
        userRoleData.username = member.user.displayName;
        settings.userRoles.set(member.id, userRoleData);
        
        // Track role history
        const roleHistory = settings.roleHistory.get(member.id) || [];
        const historyEntry = {
            timestamp: new Date().toISOString(),
            addedRoles: addedRoles.map(id => ({
                id,
                name: member.guild.roles.cache.get(id)?.name || 'Unknown Role'
            })),
            removedRoles: removedRoles.map(id => ({
                id,
                name: member.guild.roles.cache.get(id)?.name || 'Unknown Role'
            }))
        };
        
        roleHistory.push(historyEntry);
        if (roleHistory.length > 50) {
            roleHistory.splice(0, roleHistory.length - 50);
        }
        settings.roleHistory.set(member.id, roleHistory);
        
        await DataManager.saveData();
        
        if (addedRoles.length > 0) {
            const roleNames = addedRoles.map(id => member.guild.roles.cache.get(id)?.name).filter(name => name);
            console.log(`➕ ${member.user.tag} gained roles: ${roleNames.join(', ')}`);
        }
        if (removedRoles.length > 0) {
            const roleNames = removedRoles.map(id => member.guild.roles.cache.get(id)?.name).filter(name => name);
            console.log(`➖ ${member.user.tag} lost roles: ${roleNames.join(', ')}`);
        }
        
        return { addedRoles, removedRoles };
    }

    static getUserRoles(guildId, userId) {
        const settings = this.getSettings(guildId);
        return settings.userRoles.get(userId) || null;
    }

    static getUserRoleHistory(guildId, userId) {
        const settings = this.getSettings(guildId);
        return settings.roleHistory.get(userId) || [];
    }

    static getRoleStatistics(guildId) {
        const settings = this.getSettings(guildId);
        return settings.roleStats || {};
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 💬 WELCOME SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

class WelcomeSystem {
    static async sendWelcomeMessage(member, channel, isTest = false) {
        try {
            const settings = ServerManager.getSettings(member.guild.id);
            const userStats = settings.userInteractions.get(member.id) || { waves: 0, middleFingers: 0 };
            
            const imageBuffer = await WelcomeImageGenerator.generateImage(member);
            
            const waveButton = new ButtonBuilder()
                .setCustomId(`wave_${member.id}`)
                .setLabel(`👋 Wave (${userStats.waves})`)
                .setStyle(ButtonStyle.Primary);
            
            const middleFingerButton = new ButtonBuilder()
                .setCustomId(`middle_${member.id}`)
                .setLabel(`🖕 Middle Finger (${userStats.middleFingers})`)
                .setStyle(ButtonStyle.Danger);
            
            const row = new ActionRowBuilder().addComponents(waveButton, middleFingerButton);
            
            const welcomeContent = `# ${isTest ? '🧪 TEST: ' : ''}👋 Welcome to ${member.guild.name}!\n\n` +
                `## Hey ${member.user.displayName}, welcome to our awesome server! 🎉\n\n`;
            
            const messageOptions = {
                content: welcomeContent,
                components: [row],
                allowedMentions: { parse: ['users'] }
            };
            
            if (imageBuffer) {
                messageOptions.files = [{ attachment: imageBuffer, name: 'welcome.png' }];
            }
            
            await channel.send(messageOptions);
            console.log(`✅ Welcome message sent for ${member.user.tag}${isTest ? ' (TEST)' : ''}`);
            
        } catch (error) {
            console.error('❌ Error sending welcome message:', error);
            throw error;
        }
    }

    static async handleInteractionButton(interaction) {
        const [action, targetUserId] = interaction.customId.split('_');
        
        try {
            const stats = await ServerManager.updateInteractionStats(
                interaction.guild.id, 
                targetUserId, 
                action === 'wave' ? 'waves' : 'middleFingers'
            );
            
            const targetMember = interaction.guild.members.cache.get(targetUserId);
            if (!targetMember) {
                return interaction.reply({ content: '❌ User not found!', ephemeral: true });
            }
            
            const newImageBuffer = await WelcomeImageGenerator.generateImage(targetMember);
            
            const waveButton = new ButtonBuilder()
                .setCustomId(`wave_${targetUserId}`)
                .setLabel(`👋 Wave (${stats.waves})`)
                .setStyle(ButtonStyle.Primary);
            
            const middleFingerButton = new ButtonBuilder()
                .setCustomId(`middle_${targetUserId}`)
                .setLabel(`🖕 Middle Finger (${stats.middleFingers})`)
                .setStyle(ButtonStyle.Danger);
            
            const row = new ActionRowBuilder().addComponents(waveButton, middleFingerButton);
            
            const updatedContent = `# 👋 Welcome to ${targetMember.guild.name}!\n\n` +
                `## Hey ${targetMember.user.displayName}, welcome to our awesome server! 🎉\n\n`;
            
            const updateOptions = {
                content: updatedContent,
                components: [row]
            };
            
            if (newImageBuffer) {
                updateOptions.files = [{ 
                    attachment: newImageBuffer, 
                    name: 'welcome.png' 
                }];
            }
            
            await interaction.update(updateOptions);
            
            const emoji = action === 'wave' ? '👋' : '🖕';
            const actionText = action === 'wave' ? 'waved at' : 'gave the middle finger to';
            const count = action === 'wave' ? stats.waves : stats.middleFingers;
            
            await interaction.followUp({ 
                content: `${emoji} You ${actionText} ${targetMember.user.displayName}! Total: **${count}**`,
                ephemeral: true 
            });
            
        } catch (error) {
            console.error(`❌ Error handling ${action} button:`, error);
            
            try {
                const stats = await ServerManager.updateInteractionStats(
                    interaction.guild.id, 
                    targetUserId, 
                    action === 'wave' ? 'waves' : 'middleFingers'
                );
                
                const waveButton = new ButtonBuilder()
                    .setCustomId(`wave_${targetUserId}`)
                    .setLabel(`👋 Wave (${stats.waves})`)
                    .setStyle(ButtonStyle.Primary);
                
                const middleFingerButton = new ButtonBuilder()
                    .setCustomId(`middle_${targetUserId}`)
                    .setLabel(`🖕 Middle Finger (${stats.middleFingers})`)
                    .setStyle(ButtonStyle.Danger);
                
                const row = new ActionRowBuilder().addComponents(waveButton, middleFingerButton);
                await interaction.update({ components: [row] });
                
                await interaction.followUp({ 
                    content: '⚠️ Updated count but couldn\'t regenerate image!', 
                    ephemeral: true 
                });
            } catch (fallbackError) {
                console.error('❌ Fallback also failed:', fallbackError);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '❌ Something went wrong!', ephemeral: true });
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🎭 IMPROVED ROLE MANAGEMENT SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

class RoleManager {
    static async toggleRole(interaction, roleId) {
        const member = interaction.member;
        const role = interaction.guild.roles.cache.get(roleId);
        
        if (!role) {
            return interaction.reply({ 
                content: '❌ Role not found! It may have been deleted.', 
                ephemeral: true 
            });
        }
        
        try {
            const action = member.roles.cache.has(roleId) ? 'remove' : 'add';
            await member.roles[action](role);
            
            const embed = new EmbedBuilder()
                .setTitle(action === 'add' ? '✅ Role Added' : '❌ Role Removed')
                .setDescription(`**Role:** ${role}\n**Action:** ${action === 'add' ? 'Added to' : 'Removed from'} ${member.user}`)
                .setColor(action === 'add' ? 0x00FF99 : 0xFF6B6B)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 128 }))
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
            
        } catch (error) {
            console.error(`❌ Error toggling role:`, error);
            await interaction.reply({ 
                content: '❌ I don\'t have permission to manage this role!', 
                ephemeral: true 
            });
        }
    }

    static async handleRoleDropdown(interaction) {
        await interaction.deferUpdate();
        
        const selectedRoles = interaction.values;
        const member = interaction.member;
        
        const customIdParts = interaction.customId.split('_');
        const pageNumber = parseInt(customIdParts[customIdParts.length - 1]);
        const panelId = customIdParts.slice(2, -1).join('_');
        
        const panelData = panels.get(panelId);
        if (!panelData) {
            return interaction.editReply({ 
                content: '❌ Panel data not found! Try refreshing the panel.' 
            });
        }
        
        let currentUserRoles = [];
        try {
            const freshMember = await interaction.guild.members.fetch(interaction.user.id);
            currentUserRoles = freshMember.roles.cache
                .filter(role => role.name !== '@everyone')
                .map(role => role.id);
        } catch (error) {
            console.error('❌ Error fetching live member data:', error);
            const userRoleData = ServerManager.getUserRoles(interaction.guild.id, interaction.user.id);
            currentUserRoles = userRoleData ? userRoleData.roles : [];
        }
        
        const allPanelRoles = panelData.roles
            .map(roleId => interaction.guild.roles.cache.get(roleId))
            .filter(role => role);
        
        const rolesPerDropdown = CONFIG.MAX_ROLES_PER_DROPDOWN;
        const startIndex = pageNumber * rolesPerDropdown;
        const endIndex = startIndex + rolesPerDropdown;
        const currentDropdownRoles = allPanelRoles.slice(startIndex, endIndex);
        
        const currentDropdownUserRoles = currentUserRoles.filter(roleId => 
            currentDropdownRoles.some(role => role.id === roleId)
        );
        
        const rolesToAdd = selectedRoles.filter(roleId => !currentUserRoles.includes(roleId));
        const rolesToRemove = currentDropdownUserRoles.filter(roleId => !selectedRoles.includes(roleId));
        
        const changes = [];
        let errorCount = 0;
        
        try {
            for (const roleId of rolesToAdd) {
                try {
                    const role = interaction.guild.roles.cache.get(roleId);
                    if (role) {
                        await member.roles.add(role);
                        changes.push(`➕ Added **${role.name}**`);
                    }
                } catch (error) {
                    console.error(`❌ Error adding role ${roleId}:`, error);
                    errorCount++;
                }
            }
            
            for (const roleId of rolesToRemove) {
                try {
                    const role = interaction.guild.roles.cache.get(roleId);
                    if (role) {
                        await member.roles.remove(role);
                        changes.push(`➖ Removed **${role.name}**`);
                    }
                } catch (error) {
                    console.error(`❌ Error removing role ${roleId}:`, error);
                    errorCount++;
                }
            }
            
            let finalUserRoles = [];
            try {
                const finalMember = await interaction.guild.members.fetch(interaction.user.id);
                finalUserRoles = finalMember.roles.cache
                    .filter(role => role.name !== '@everyone')
                    .map(role => role.id);
            } catch (error) {
                console.error('❌ Error getting final user roles:', error);
                finalUserRoles = currentUserRoles;
            }
            
            try {
                await ServerManager.syncUserRoles(interaction.guild);
            } catch (error) {
                console.error('❌ Error syncing roles after changes:', error);
            }
            
            const updatedDropdowns = this.createRoleDropdowns(allPanelRoles, panelId, finalUserRoles);
            await interaction.editReply({ components: updatedDropdowns });
            
            let feedbackMessage = '';
            if (changes.length > 0) {
                feedbackMessage = `✅ **Role Changes Applied (Dropdown ${pageNumber + 1}):**\n${changes.join('\n')}`;
            } else {
                feedbackMessage = `✨ No changes made to your roles in dropdown ${pageNumber + 1}.`;
            }
            
            if (errorCount > 0) {
                feedbackMessage += `\n\n⚠️ ${errorCount} role(s) couldn't be modified due to permission issues.`;
            }
            
            feedbackMessage += '\n\n*All dropdowns updated to show your current role selections!*';
            
            const embed = new EmbedBuilder()
                .setTitle('🎭 Role Selection Updated')
                .setDescription(feedbackMessage)
                .setColor(changes.length > 0 ? 0x00FF99 : 0x3498DB)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 128 }))
                .setTimestamp();
            
            await interaction.followUp({ embeds: [embed], ephemeral: true });
            
        } catch (error) {
            console.error('❌ Error handling role dropdown:', error);
            try {
                await interaction.editReply({ 
                    content: '❌ Something went wrong while updating your roles! Please try again.' 
                });
            } catch (editError) {
                console.error('❌ Error editing reply:', editError);
            }
        }
    }

    static createRoleDropdowns(roles, panelId, userCurrentRoles = []) {
        const dropdowns = [];
        const chunks = [];
        
        for (let i = 0; i < roles.length; i += CONFIG.MAX_ROLES_PER_DROPDOWN) {
            chunks.push(roles.slice(i, i + CONFIG.MAX_ROLES_PER_DROPDOWN));
        }
        
        chunks.forEach((chunk, index) => {
            const userRolesInChunk = chunk.filter(role => userCurrentRoles.includes(role.id));
            
            const dropdown = new StringSelectMenuBuilder()
                .setCustomId(`role_select_${panelId}_${index}`)
                .setPlaceholder(`🔽 Your roles (${userRolesInChunk.length}/${chunk.length}) - Page ${index + 1}/${chunks.length}`)
                .setMinValues(0)
                .setMaxValues(Math.min(chunk.length, CONFIG.MAX_ROLES_PER_DROPDOWN));
            
            chunk.forEach(role => {
                const hasRole = userCurrentRoles.includes(role.id);
                const roleLabel = role.name.length > 95 ? role.name.substring(0, 92) + '...' : role.name;
                const statusIcon = hasRole ? '✅' : '⭕';
                
                dropdown.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${statusIcon} ${roleLabel}`)
                        .setValue(role.id)
                        .setDescription(`${hasRole ? 'Currently selected' : 'Click to select'} - ${role.name.length > 45 ? role.name.substring(0, 42) + '...' : role.name}`)
                        .setDefault(hasRole)
                );
            });
            
            dropdowns.push(new ActionRowBuilder().addComponents(dropdown));
        });
        
        return dropdowns;
    }

    static createRolePanelButton(panelId, panelTitle, roleCount) {
        const roleSelectorButton = new ButtonBuilder()
            .setCustomId(`role_panel_${panelId}`)
            .setLabel('🎭 Role Selector')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎭');
        
        return new ActionRowBuilder().addComponents(roleSelectorButton);
    }

    static async handleRolePanelButton(interaction) {
        const panelId = interaction.customId.replace('role_panel_', '');
        
        const panelData = panels.get(panelId);
        if (!panelData) {
            return interaction.reply({ 
                content: '❌ Panel data not found! The panel may have been deleted.', 
                ephemeral: true 
            });
        }
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const userCurrentRoles = await this.getUserCurrentRoles(interaction.guild, interaction.user.id);
            
            const allPanelRoles = panelData.roles
                .map(roleId => interaction.guild.roles.cache.get(roleId))
                .filter(role => role);
            
            if (allPanelRoles.length === 0) {
                return interaction.editReply({ 
                    content: '❌ No valid roles found in this panel! Roles may have been deleted.' 
                });
            }
            
            const dropdownRows = this.createRoleDropdowns(allPanelRoles, panelId, userCurrentRoles);
            
            if (dropdownRows.length > 5) {
                return interaction.editReply({ 
                    content: `❌ This panel has too many roles (${allPanelRoles.length}) and would require ${dropdownRows.length} dropdowns.\n` +
                            `Discord only allows 5 components per message. Please ask an admin to use role blacklisting to reduce the number of roles.`
                });
            }
            
            const userRolesInPanel = allPanelRoles.filter(role => userCurrentRoles.includes(role.id));
            const totalPages = Math.ceil(allPanelRoles.length / CONFIG.MAX_ROLES_PER_DROPDOWN);
            
            const privateContent = `# 🎭 ${panelData.title} - Role Selector\n\n` +
                `### Your Private Role Selection Interface\n\n` +
                `**📊 Your Status:** ${userRolesInPanel.length}/${allPanelRoles.length} roles selected\n` +
                `**🎯 Instructions:** Select/deselect roles using the dropdown${totalPages > 1 ? 's' : ''} below\n\n` +
                `**✅ Current Roles:** ${userRolesInPanel.length > 0 ? userRolesInPanel.map(r => r.name).join(', ') : '*None*'}\n\n` +
                `${totalPages > 1 ? `*Roles are organized across ${totalPages} dropdown menus*\n` : ''}` +
                `*Changes apply immediately when you make selections*`;
            
            await interaction.editReply({ 
                content: privateContent,
                components: dropdownRows
            });
            
        } catch (error) {
            console.error('❌ Error handling role panel button:', error);
            await interaction.editReply({ 
                content: '❌ Something went wrong while loading your role selector! Please try again.' 
            });
        }
    }

    static async getUserCurrentRoles(guild, userId) {
        try {
            const member = await guild.members.fetch(userId);
            const discordRoles = member.roles.cache
                .filter(role => role.name !== '@everyone')
                .map(role => role.id);
            
            return discordRoles;
            
        } catch (error) {
            console.error(`❌ Error fetching live roles for user ${userId}:`, error);
            
            const userRoleData = ServerManager.getUserRoles(guild.id, userId);
            const trackedRoles = userRoleData ? userRoleData.roles : [];
            return trackedRoles;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🎪 IMPROVED EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

// Bot ready event
client.once('ready', async () => {
    console.log(`🤖 ${client.user.tag} is online!`);
    
    videoManager = new VideoReactionManager(DataManager, ServerManager);
    console.log('🎬 Video reaction manager initialized');
    
    await commandLoader.loadCommands();
    console.log('📂 Command system loaded');
    
    await DataManager.loadData();
    
    // Migrate existing panels to button interface
    let migratedCount = 0;
    for (const [panelId, panelData] of panels.entries()) {
        if (!panelData.interfaceType) {
            panelData.interfaceType = 'button';
            panels.set(panelId, panelData);
            migratedCount++;
        }
    }
    if (migratedCount > 0) {
        await DataManager.saveData();
        console.log(`🔄 Migrated ${migratedCount} panels to button interface`);
    }
    
    // Auto-sync roles for all guilds
    console.log('🔄 Starting role sync for all servers...');
    for (const guild of client.guilds.cache.values()) {
        try {
            await ServerManager.syncUserRoles(guild);
        } catch (error) {
            console.error(`❌ Failed to sync roles for ${guild.name}:`, error);
        }
    }
    console.log('✅ Role sync completed!');
    
    // Register commands - no legacy commands now, all through loader
    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        
        const allCommands = commandLoader.getSlashCommandData();
        
        if (GUILD_ID) {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: allCommands });
            console.log(`✅ ${allCommands.length} commands registered to test server!`);
        } else {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: allCommands });
            console.log(`✅ ${allCommands.length} commands registered globally!`);
        }
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
});

// Video detection for reactions
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    
    try {
        const videoSettings = videoManager.getVideoSettings(message.guild.id);
        
        if (videoSettings.enabled && videoSettings.channels.includes(message.channel.id)) {
            if (videoManager.isVideoMessage(message)) {
                console.log(`🎬 Video detected in ${message.channel.name} by ${message.author.tag}`);
                
                const success = await videoManager.addVideoReactions(message);
                if (success) {
                    await videoManager.updateVideoStats(message.guild.id);
                }
            }
        }
    } catch (error) {
        console.error('❌ Error processing video message:', error);
    }
});

// New member join event
client.on('guildMemberAdd', async (member) => {
    const settings = ServerManager.getSettings(member.guild.id);
    
    await ServerManager.trackRoleChange(member, null, member.roles);
    
    // Give default role if set
    if (settings.defaultRole) {
        try {
            const role = member.guild.roles.cache.get(settings.defaultRole);
            if (role) {
                await member.roles.add(role);
                console.log(`👋 Gave default role ${role.name} to ${member.user.tag}`);
            }
        } catch (error) {
            console.error('❌ Error giving default role:', error);
        }
    }
    
    // Send welcome message if channel is set
    if (settings.welcomeChannel) {
        try {
            const welcomeChannel = member.guild.channels.cache.get(settings.welcomeChannel);
            if (welcomeChannel) {
                await WelcomeSystem.sendWelcomeMessage(member, welcomeChannel);
            }
        } catch (error) {
            console.error('❌ Error sending welcome message:', error);
        }
    }
});

// Member role update event
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
        const oldRoleIds = oldMember.roles.cache.map(r => r.id).sort();
        const newRoleIds = newMember.roles.cache.map(r => r.id).sort();
        
        if (JSON.stringify(oldRoleIds) !== JSON.stringify(newRoleIds)) {
            await ServerManager.trackRoleChange(newMember, oldMember.roles, newMember.roles);
        }
    } catch (error) {
        console.error('❌ Error tracking role change:', error);
    }
});

// IMPROVED INTERACTION HANDLER - Now uses separated commands
client.on('interactionCreate', async (interaction) => {
    const interactionAge = Date.now() - interaction.createdTimestamp;
    const isNearExpiry = interactionAge > CONFIG.INTERACTION_TIMEOUT;

    if (isNearExpiry) {
        console.log(`⚠️ Interaction is ${Math.round(interactionAge / 1000)}s old, may be close to expiry`);
    }

    try {
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;
            
            // Prepare dependencies for command execution
            const dependencies = {
                serverManager: ServerManager,
                dataManager: DataManager,
                videoManager: videoManager,
                welcomeSystem: WelcomeSystem,
                roleManager: RoleManager,
                panels: panels
            };
            
            // Execute command through command loader
            const executed = await commandLoader.executeCommand(interaction, dependencies);
            if (!executed && !isNearExpiry && !interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({ 
                        content: '❌ Unknown command!', 
                        ephemeral: true 
                    });
                } catch (replyError) {
                    console.error('❌ Could not reply to unknown command:', replyError);
                }
            }
            
        } else if (interaction.isButton()) {
            if (interaction.customId.startsWith('wave_') || interaction.customId.startsWith('middle_')) {
                await WelcomeSystem.handleInteractionButton(interaction);
            } else if (interaction.customId.startsWith('role_panel_')) {
                await RoleManager.handleRolePanelButton(interaction);
            } else if (interaction.customId.startsWith('role_')) {
                const roleId = interaction.customId.split('_')[1];
                await RoleManager.toggleRole(interaction, roleId);
            } else if (interaction.customId.startsWith('gaming_')) {
                try {
                    const handled = await commandLoader.handleButtonInteraction(interaction);
                    if (!handled && !isNearExpiry && !interaction.replied && !interaction.deferred) {
                        try {
                            await interaction.reply({
                                content: '❌ Gaming session not found or expired. Please create a new session.',
                                ephemeral: true
                            });
                        } catch (replyError) {
                            console.error('❌ Could not reply to failed gaming interaction:', replyError);
                        }
                    }
                } catch (gamingError) {
                    console.error('❌ Error in gaming interaction handler:', gamingError);
                    if (!interaction.replied && !interaction.deferred) {
                        try {
                            await interaction.reply({
                                content: '❌ Gaming session error. Please try creating a new session.',
                                ephemeral: true
                            });
                        } catch (replyError) {
                            console.error('❌ Could not reply with gaming error:', replyError);
                        }
                    }
                }
            } else {
                if (!isNearExpiry && !interaction.replied && !interaction.deferred) {
                    try {
                        await interaction.reply({
                            content: '❌ This button is no longer valid.',
                            ephemeral: true
                        });
                    } catch (replyError) {
                        console.error('❌ Could not reply to unknown button:', replyError);
                    }
                }
            }
        } else if (interaction.isStringSelectMenu()) {
            if (interaction.customId.startsWith('role_select')) {
                await RoleManager.handleRoleDropdown(interaction);
            } else {
                if (!isNearExpiry && !interaction.replied && !interaction.deferred) {
                    try {
                        await interaction.reply({
                            content: '❌ This selection menu is no longer valid.',
                            ephemeral: true
                        });
                    } catch (replyError) {
                        console.error('❌ Could not reply to unknown select menu:', replyError);
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Error handling interaction:', error);
        
        if (!interaction.replied && !interaction.deferred && !isNearExpiry) {
            try {
                await interaction.reply({ 
                    content: '❌ **Something went wrong!** Please try again.', 
                    ephemeral: true 
                });
            } catch (replyError) {
                console.error('❌ Error sending error response:', replyError);
            }
        } else if (interaction.deferred) {
            try {
                await interaction.editReply({ 
                    content: '❌ **Something went wrong!** Please try again.' 
                });
            } catch (editError) {
                console.error('❌ Error editing deferred reply:', editError);
            }
        }
    }
});

// Error handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 🏁 STARTUP & CLEANUP
// ═══════════════════════════════════════════════════════════════════════════════

// Auto-save every 5 minutes
setInterval(() => DataManager.saveData(), 5 * 60 * 1000);

// Auto-sync roles every 30 minutes
setInterval(async () => {
    console.log('🔄 Running periodic role sync...');
    for (const guild of client.guilds.cache.values()) {
        try {
            await ServerManager.syncUserRoles(guild);
        } catch (error) {
            console.error(`❌ Failed periodic sync for ${guild.name}:`, error);
        }
    }
}, 30 * 60 * 1000);

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down bot...');
    await DataManager.saveData();
    await commandLoader.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down bot...');
    await DataManager.saveData();
    await commandLoader.shutdown();
    process.exit(0);
});

// Start the bot
console.log('🚀 Starting Enhanced Discord Gaming Server Bot with Separated Commands...');
client.login(TOKEN);
