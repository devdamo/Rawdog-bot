// Quick script to force refresh Discord slash commands
// Load .env file if it exists (optional in Docker/production)
const fs = require('fs');
if (fs.existsSync('.env')) {
    require('dotenv').config();
}
const { REST, Routes } = require('discord.js');
const CommandLoader = require('./commands/index.js');

async function refreshCommands() {
    try {
        console.log('🔄 Refreshing Discord slash commands...');
        
        // Load commands
        const loader = new CommandLoader();
        await loader.loadCommands();
        const commands = loader.getSlashCommandData();
        
        console.log(`📋 Found ${commands.length} commands to register`);
        
        // Create REST instance
        const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
        
        // Register commands globally (or replace APPLICATION_ID with your bot's client ID)
        const data = await rest.put(
            Routes.applicationCommands(process.env.APPLICATION_ID || 'YOUR_BOT_ID'),
            { body: commands.map(cmd => cmd.toJSON()) }
        );
        
        console.log(`✅ Successfully refreshed ${data.length} slash commands!`);
        console.log('Commands:', data.map(cmd => cmd.name).join(', '));
        
    } catch (error) {
        console.error('❌ Error refreshing commands:', error);
    }
}

refreshCommands();
