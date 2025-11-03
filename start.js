#!/usr/bin/env node

/**
 * 🚀 Bot Startup Script
 * Enhanced startup script with health checks and utilities
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function checkEnvironment() {
    log('🔍 Checking environment...', colors.cyan);

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

    if (majorVersion < 16) {
        log(`❌ Node.js ${nodeVersion} detected. Please upgrade to Node.js 16 or higher.`, colors.red);
        process.exit(1);
    }

    log(`✅ Node.js ${nodeVersion} - OK`, colors.green);

    // Check if .env file exists (optional in Docker/production)
    if (fs.existsSync('.env')) {
        log('✅ .env file found (loading from file)', colors.green);
        // Load .env file if it exists
        require('dotenv').config();
    } else if (process.env.BOT_TOKEN) {
        // Running in Docker/production with environment variables
        log('✅ Environment variables detected (Docker/Production mode)', colors.green);
    } else {
        log('❌ No .env file or environment variables found!', colors.red);
        log('📝 Please either:', colors.yellow);
        log('   1. Create a .env file (for local development)', colors.yellow);
        log('   2. Set environment variables (for Docker/Railway/Render)', colors.yellow);
        process.exit(1);
    }
    
    // Check essential dependencies
    const essentialDeps = ['discord.js', 'dotenv', '@napi-rs/canvas'];
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    for (const dep of essentialDeps) {
        if (!packageJson.dependencies[dep]) {
            log(`❌ Missing dependency: ${dep}`, colors.red);
            log('💡 Run: npm install', colors.yellow);
            process.exit(1);
        }
    }
    
    log('✅ Dependencies check passed', colors.green);
    
    // Check bot_data directory
    if (!fs.existsSync('./bot_data')) {
        log('📁 Creating bot_data directory...', colors.yellow);
        fs.mkdirSync('./bot_data');
        log('✅ bot_data directory created', colors.green);
    } else {
        log('✅ bot_data directory exists', colors.green);
    }
}

function showBotInfo() {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    log('\n' + '='.repeat(50), colors.cyan);
    log(`🤖 ${packageJson.name}`, colors.bright);
    log(`📦 Version: ${packageJson.version}`, colors.blue);
    log(`📝 ${packageJson.description}`, colors.reset);
    log('='.repeat(50), colors.cyan);
}

function displayStartupTips() {
    log('\n💡 Startup Tips:', colors.yellow);
    log('• Use Ctrl+C to gracefully shutdown the bot', colors.reset);
    log('• Check console for any error messages', colors.reset);
    log('• Data auto-saves every 5 minutes', colors.reset);
    log('• Use /roles sync if role data seems outdated', colors.reset);
    log('• Monitor memory usage with Task Manager', colors.reset);
    log('');
}

async function startBot() {
    try {
        showBotInfo();
        checkEnvironment();
        displayStartupTips();
        
        log('🚀 Starting Enhanced Gaming Discord Bot...', colors.bright);
        log('⏳ Loading modules and connecting to Discord...', colors.cyan);
        
        // Import and start the main bot
        require('./index.js');
        
    } catch (error) {
        log('❌ Failed to start bot:', colors.red);
        log(error.message, colors.red);
        log('\n🔧 Troubleshooting:', colors.yellow);
        log('1. Check your .env file configuration', colors.reset);
        log('2. Verify your bot token is valid', colors.reset);
        log('3. Ensure all dependencies are installed', colors.reset);
        log('4. Check console for detailed error messages', colors.reset);
        process.exit(1);
    }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
    log('🤖 Enhanced Gaming Discord Bot - Startup Script', colors.bright);
    log('\nUsage:', colors.cyan);
    log('  npm start                 Start the bot normally', colors.reset);
    log('  npm run dev               Start with auto-restart (development)', colors.reset);
    log('  node start.js --help      Show this help message', colors.reset);
    log('  node start.js --check     Run environment checks only', colors.reset);
    log('\nEnvironment:', colors.cyan);
    log('  NODE_ENV=development      Enable development mode', colors.reset);
    log('  LOG_LEVEL=debug           Enable debug logging', colors.reset);
    process.exit(0);
}

if (args.includes('--check')) {
    log('🔍 Running environment checks only...', colors.cyan);
    checkEnvironment();
    log('\n✅ All checks passed! Bot is ready to start.', colors.green);
    process.exit(0);
}

// Start the bot
startBot();
