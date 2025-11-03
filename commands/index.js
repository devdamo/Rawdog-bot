// 📂 Command Loader - FIXED WITH PANEL MANAGER INTEGRATION
// Dynamically loads all commands and manages gaming sessions + panels

const fs = require('fs');
const path = require('path');

// Import Gaming Session Manager
const { GamingSessionManager } = require('./gamingSession.js');

class CommandLoader {
    constructor() {
        this.commands = new Map();
        this.slashCommands = [];
        
        // Initialize gaming session manager
        this.gamingManager = new GamingSessionManager();
        
        // Initialize panel manager
        this.panelManager = null;
        this.initializePanelManager();
        
        console.log('📂 Command loader initialized');
    }

    // Initialize panel manager
    initializePanelManager() {
        try {
            // Try to load panel manager
            const { PanelManager } = require('./panelManager.js');
            this.panelManager = new PanelManager();
            console.log('📋 Panel manager integrated successfully');
        } catch (error) {
            console.log('⚠️ Panel manager not found, continuing without it');
            this.panelManager = null;
        }
    }

    // Load all command files from the commands directory
    async loadCommands() {
        const commandsPath = path.join(__dirname);
        
        try {
            const commandFiles = fs.readdirSync(commandsPath)
                .filter(file => file.endsWith('.js') && 
                        file !== 'index.js' && 
                        file !== 'commandLoader.js' &&
                        file !== 'panelManager.js');

            console.log(`📂 Loading ${commandFiles.length} command files...`);

            for (const file of commandFiles) {
                try {
                    const filePath = path.join(commandsPath, file);
                    
                    // Clear require cache to allow hot reloading
                    delete require.cache[require.resolve(filePath)];
                    
                    const commandModule = require(filePath);
                    
                    // Handle different export formats
                    if (commandModule.commands) {
                        // Module exports { commands: [], handleX: function }
                        for (const command of commandModule.commands) {
                            this.slashCommands.push(command);
                            this.commands.set(command.name, commandModule);
                        }
                        console.log(`✅ Loaded ${commandModule.commands.length} commands from ${file}`);
                    } else if (commandModule.data) {
                        // Module exports { data: SlashCommandBuilder, execute: function }
                        this.slashCommands.push(commandModule.data);
                        this.commands.set(commandModule.data.name, commandModule);
                        console.log(`✅ Loaded command ${commandModule.data.name} from ${file}`);
                    } else {
                        console.log(`⚠️ ${file} doesn't export commands or data property`);
                    }
                } catch (error) {
                    console.error(`❌ Error loading ${file}:`, error);
                }
            }

            // Add gaming session command
            const gamingCommand = this.gamingManager.getSlashCommandData();
            this.slashCommands.push(gamingCommand);
            this.commands.set(gamingCommand.name, this.gamingManager);
            console.log(`✅ Loaded gaming session command`);

            // Add panel management commands
            if (this.panelManager) {
                const panelCommands = this.panelManager.getSlashCommandData();
                for (const command of panelCommands) {
                    this.slashCommands.push(command);
                    this.commands.set(command.name, this.panelManager);
                }
                console.log(`✅ Loaded ${panelCommands.length} panel management commands`);
            }

            console.log(`📂 Total commands loaded: ${this.slashCommands.length}`);
            
        } catch (error) {
            console.error('❌ Error reading commands directory:', error);
        }
    }

    // Get all slash command data for registration
    getSlashCommandData() {
        return this.slashCommands;
    }

    // Get a specific command
    getCommand(name) {
        return this.commands.get(name);
    }

    // Execute a command with proper dependency injection
    async executeCommand(interaction, dependencies = {}) {
        const { commandName } = interaction;
        
        try {
            // Handle gaming session command
            if (commandName === 'startsession') {
                await this.gamingManager.execute(interaction);
                return true;
            }

            // Handle panel management commands
            if (this.panelManager && (commandName === 'registerpanel' || commandName === 'panels')) {
                await this.panelManager.execute(interaction);
                return true;
            }

            // Handle other commands
            const command = this.commands.get(commandName);
            if (!command) {
                console.log(`⚠️ Command not found: ${commandName}`);
                return false;
            }

            // Execute the command with dependencies
            if (command.execute) {
                // For separated command files (welcome.js, roles.js, linkedroles.js)
                // Pass appropriate dependencies based on command
                if (commandName === 'roles') {
                    // roles.js needs: serverManager, dataManager, roleManager, panels
                    await command.execute(interaction,
                        dependencies.serverManager,
                        dependencies.dataManager,
                        dependencies.roleManager,
                        dependencies.panels
                    );
                } else if (commandName === 'welcome') {
                    // welcome.js needs: serverManager, dataManager, welcomeSystem
                    await command.execute(interaction,
                        dependencies.serverManager,
                        dependencies.dataManager,
                        dependencies.welcomeSystem
                    );
                } else if (commandName === 'linkedroles') {
                    // linkedroles.js needs: serverManager, dataManager, linkedRolesAPI
                    await command.execute(interaction,
                        dependencies.serverManager,
                        dependencies.dataManager,
                        dependencies.linkedRolesAPI
                    );
                } else {
                    // Other commands - generic dependency pass
                    await command.execute(interaction,
                        dependencies.serverManager,
                        dependencies.dataManager,
                        dependencies.welcomeSystem || dependencies.roleManager,
                        dependencies.panels || this.panelManager
                    );
                }
            } else if (command.handleVideoReact && commandName === 'videoreact') {
                // For video reactions
                await command.handleVideoReact(interaction, dependencies.videoManager);
            } else {
                console.log(`⚠️ Command ${commandName} has no execute method`);
                return false;
            }

            return true;

        } catch (error) {
            console.error(`❌ Error executing command ${commandName}:`, error);
            
            // Try to respond with error if possible
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: '❌ **Command Error**\n\nSomething went wrong while executing this command. Please try again.',
                        ephemeral: true
                    });
                } catch (replyError) {
                    console.error('❌ Could not send error reply:', replyError);
                }
            } else if (interaction.deferred) {
                try {
                    await interaction.editReply({
                        content: '❌ **Command Error**\n\nSomething went wrong while executing this command. Please try again.'
                    });
                } catch (editError) {
                    console.error('❌ Could not edit error reply:', editError);
                }
            }
            
            return false;
        }
    }

    // Handle button interactions (gaming + panels)
    async handleButtonInteraction(interaction) {
        try {
            // Handle gaming session interactions
            if (interaction.customId.startsWith('gaming_')) {
                const result = await this.gamingManager.handleButtonInteraction(interaction);
                return result;
            }

            // Handle panel interactions
            if (this.panelManager) {
                // Record interaction for any button on a registered panel
                this.panelManager.recordInteraction(interaction.message.id, interaction.user.id);
            }

            return false; // Not handled by this system

        } catch (error) {
            console.error('❌ Error handling button interaction:', error);
            
            // Try to send error response if possible
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: '❌ **Interaction Error**\n\nSomething went wrong with this interaction. Please try again.',
                        ephemeral: true
                    });
                } catch (replyError) {
                    console.error('❌ Could not send interaction error reply:', replyError);
                }
            }
            
            return false;
        }
    }

    // Auto-detect panels on bot startup
    async autoDetectExistingPanels(client) {
        if (!this.panelManager) return;

        try {
            console.log('🔍 Auto-detecting existing panels...');
            
            // Auto-register the specific panel ID mentioned
            const targetMessageId = '1383194983527616602';
            
            // Search through all guilds for this message
            for (const [guildId, guild] of client.guilds.cache) {
                for (const [channelId, channel] of guild.channels.cache) {
                    if (channel.isTextBased()) {
                        try {
                            const message = await channel.messages.fetch(targetMessageId);
                            if (message && message.author.id === client.user.id) {
                                await this.panelManager.registerPanel(targetMessageId, guildId, channelId, {
                                    name: 'Pre-existing Panel',
                                    description: 'Auto-detected on startup',
                                    type: this.panelManager.determinePanelType(message)
                                });
                                console.log(`📋 Auto-registered panel ${targetMessageId} in ${guild.name}`);
                                return; // Found it, no need to continue
                            }
                        } catch (error) {
                            // Message not found in this channel, continue
                        }
                    }
                }
            }
            
        } catch (error) {
            console.error('❌ Error during panel auto-detection:', error);
        }
    }

    // Get panel manager (for external access)
    getPanelManager() {
        return this.panelManager;
    }

    // Get gaming session statistics
    getGamingStats() {
        try {
            return this.gamingManager.getStats();
        } catch (error) {
            console.error('❌ Error getting gaming stats:', error);
            return {
                totalSessions: 0,
                totalReminders: 0,
                totalParticipants: 0,
                sessions: []
            };
        }
    }

    // Get panel statistics
    getPanelStats() {
        try {
            return this.panelManager ? this.panelManager.getStats() : {
                totalPanels: 0,
                totalGuilds: 0,
                totalInteractions: 0,
                panels: []
            };
        } catch (error) {
            console.error('❌ Error getting panel stats:', error);
            return {
                totalPanels: 0,
                totalGuilds: 0,
                totalInteractions: 0,
                panels: []
            };
        }
    }

    // Get active sessions for a guild
    getActiveSessionsForGuild(guildId) {
        try {
            return this.gamingManager.getActiveSessionsForGuild(guildId);
        } catch (error) {
            console.error('❌ Error getting active sessions:', error);
            return [];
        }
    }

    // Cleanup expired sessions manually
    cleanupExpiredSessions() {
        try {
            this.gamingManager.cleanupExpiredSessions();
        } catch (error) {
            console.error('❌ Error during manual cleanup:', error);
        }
    }

    // Hot reload commands (useful for development)
    async reloadCommands() {
        try {
            console.log('🔄 Hot reloading commands...');
            
            // Clear current commands
            this.commands.clear();
            this.slashCommands = [];
            
            // Reinitialize panel manager
            this.initializePanelManager();
            
            // Reload all commands
            await this.loadCommands();
            
            console.log('✅ Commands hot reloaded successfully');
            return true;
            
        } catch (error) {
            console.error('❌ Error hot reloading commands:', error);
            return false;
        }
    }

    // Get command statistics
    getCommandStats() {
        return {
            totalCommands: this.commands.size,
            slashCommands: this.slashCommands.length,
            commandNames: Array.from(this.commands.keys()),
            gamingSessions: this.getGamingStats(),
            panels: this.getPanelStats()
        };
    }

    // Validate all commands
    validateCommands() {
        const issues = [];
        
        for (const [name, command] of this.commands.entries()) {
            if (!command.execute && 
                !command.handleVideoReact && 
                name !== 'startsession' && 
                name !== 'registerpanel' && 
                name !== 'panels') {
                issues.push(`Command ${name} has no execute method`);
            }
        }
        
        if (issues.length > 0) {
            console.warn('⚠️ Command validation issues:', issues);
        } else {
            console.log('✅ All commands validated successfully');
        }
        
        return issues;
    }

    // Shutdown cleanup
    async shutdown() {
        try {
            console.log('🛑 Shutting down command loader...');
            
            // Cleanup gaming sessions
            this.gamingManager.cleanupExpiredSessions();
            
            // Clear maps
            this.commands.clear();
            this.slashCommands = [];
            
            console.log('✅ Command loader shutdown complete');
            
        } catch (error) {
            console.error('❌ Error during command loader shutdown:', error);
        }
    }
}

// Proper module export to fix constructor issue
module.exports = CommandLoader;