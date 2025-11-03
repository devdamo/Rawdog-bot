// 🔗 Discord Linked Roles API Integration
// Implements proper Discord Role Connections with metadata and requirements

const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');

class LinkedRolesAPI {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.clientId = process.env.CLIENT_ID;
        this.clientSecret = process.env.CLIENT_SECRET;
        this.redirectUri = process.env.REDIRECT_URI || `http://localhost:${this.port}/discord-callback`;

        // Store OAuth tokens and metadata
        this.userTokens = new Map();
        this.metadata = null;

        console.log('🔗 Linked Roles API initialized');
        console.log(`📍 Redirect URI: ${this.redirectUri}`);
    }

    // Register application role connection metadata with Discord
    async registerMetadata() {
        try {
            // Define the metadata fields that will be shown in role requirements
            const metadata = [
                {
                    key: 'verified',
                    name: 'Verified Account',
                    description: 'User has verified their account with the bot',
                    type: 7 // Boolean type
                },
                {
                    key: 'join_date',
                    name: 'Join Date',
                    description: 'Days since user joined the server',
                    type: 2 // Integer >= type
                },
                {
                    key: 'message_count',
                    name: 'Message Count',
                    description: 'Total messages sent by user',
                    type: 2 // Integer >= type
                },
                {
                    key: 'level',
                    name: 'User Level',
                    description: 'Current level of the user',
                    type: 2 // Integer >= type
                },
                {
                    key: 'supporter',
                    name: 'Server Supporter',
                    description: 'User is a server supporter/booster',
                    type: 7 // Boolean type
                }
            ];

            const response = await fetch(
                `https://discord.com/api/v10/applications/${this.clientId}/role-connections/metadata`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bot ${process.env.BOT_TOKEN}`
                    },
                    body: JSON.stringify(metadata)
                }
            );

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to register metadata: ${error}`);
            }

            this.metadata = metadata;
            console.log('✅ Linked Roles metadata registered with Discord:');
            metadata.forEach(m => console.log(`   - ${m.name} (${m.key})`));

            return { success: true, metadata };

        } catch (error) {
            console.error('❌ Failed to register metadata:', error);
            return { success: false, error: error.message };
        }
    }

    // Start OAuth2 callback server
    startCallbackServer(client, dataManager, serverManager) {
        this.app.use(express.json());

        // Health check endpoint
        this.app.get('/', (req, res) => {
            res.send(`
                <html>
                    <head>
                        <title>Discord Linked Roles</title>
                        <style>
                            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center; }
                            .status { color: #43b581; font-size: 24px; margin: 20px; }
                            .info { background: #2c2f33; color: #fff; padding: 20px; border-radius: 8px; }
                        </style>
                    </head>
                    <body>
                        <h1>🔗 Discord Linked Roles API</h1>
                        <div class="status">✅ Server Running</div>
                        <div class="info">
                            <p><strong>Callback URL:</strong> ${this.redirectUri}</p>
                            <p>Users will be redirected here after linking their Discord account.</p>
                        </div>
                    </body>
                </html>
            `);
        });

        // OAuth2 callback endpoint
        this.app.get('/discord-callback', async (req, res) => {
            const { code, state } = req.query;

            if (!code) {
                return res.status(400).send('❌ No authorization code provided');
            }

            try {
                console.log('🔗 Processing OAuth callback...');

                // Exchange code for access token
                const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: new URLSearchParams({
                        client_id: this.clientId,
                        client_secret: this.clientSecret,
                        grant_type: 'authorization_code',
                        code: code,
                        redirect_uri: this.redirectUri
                    })
                });

                if (!tokenResponse.ok) {
                    throw new Error(`Token exchange failed: ${await tokenResponse.text()}`);
                }

                const tokens = await tokenResponse.json();

                // Get user info
                const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
                    headers: {
                        'Authorization': `Bearer ${tokens.access_token}`
                    }
                });

                if (!userResponse.ok) {
                    throw new Error('Failed to fetch user info');
                }

                const user = await userResponse.json();
                console.log(`✅ User ${user.username} (${user.id}) linked their account`);

                // Store tokens
                this.userTokens.set(user.id, {
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    expiresAt: Date.now() + (tokens.expires_in * 1000),
                    linkedAt: Date.now()
                });

                // Update user metadata with initial values
                await this.updateUserMetadata(user.id, client, serverManager);

                // Success page
                res.send(`
                    <html>
                        <head>
                            <title>Account Linked!</title>
                            <style>
                                body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center; }
                                .success { color: #43b581; font-size: 48px; }
                                .message { background: #2c2f33; color: #fff; padding: 30px; border-radius: 8px; margin: 20px; }
                                .button { display: inline-block; background: #5865F2; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                            </style>
                        </head>
                        <body>
                            <div class="success">✅</div>
                            <h1>Account Linked Successfully!</h1>
                            <div class="message">
                                <p><strong>Welcome, ${user.username}!</strong></p>
                                <p>Your Discord account has been linked.</p>
                                <p>You can now receive roles based on your activity and status!</p>
                                <p>Check your Discord servers to see your new roles.</p>
                            </div>
                            <a href="https://discord.com/channels/@me" class="button">Return to Discord</a>
                        </body>
                    </html>
                `);

            } catch (error) {
                console.error('❌ OAuth callback error:', error);
                res.status(500).send(`
                    <html>
                        <head>
                            <title>Error</title>
                            <style>
                                body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center; }
                                .error { color: #f04747; font-size: 48px; }
                                .message { background: #2c2f33; color: #fff; padding: 30px; border-radius: 8px; margin: 20px; }
                            </style>
                        </head>
                        <body>
                            <div class="error">❌</div>
                            <h1>Link Failed</h1>
                            <div class="message">
                                <p>${error.message}</p>
                                <p>Please try again or contact server administrators.</p>
                            </div>
                        </body>
                    </html>
                `);
            }
        });

        // Start server
        // Bind to 0.0.0.0 for deployment platforms (Railway, Render, etc.)
        this.app.listen(this.port, '0.0.0.0', () => {
            console.log(`🌐 Linked Roles callback server running on port ${this.port}`);
            console.log(`📍 Callback URL: ${this.redirectUri}`);
            console.log(`💡 Add this URL to Discord Developer Portal OAuth2 Redirects!`);
            console.log(`🚀 Server accessible at: http://0.0.0.0:${this.port}`);
        });
    }

    // Update user metadata (called after linking and periodically)
    async updateUserMetadata(userId, client, serverManager) {
        try {
            const tokenData = this.userTokens.get(userId);
            if (!tokenData) {
                console.log(`⚠️ No token data for user ${userId}`);
                return { success: false, error: 'No token data' };
            }

            // Calculate user's metadata
            const metadata = await this.calculateUserMetadata(userId, client, serverManager);

            console.log(`🔄 Updating metadata for user ${userId}:`, metadata);

            // Push metadata to Discord
            const response = await fetch(
                `https://discord.com/api/v10/users/@me/applications/${this.clientId}/role-connection`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${tokenData.accessToken}`
                    },
                    body: JSON.stringify({
                        platform_name: 'Gaming Server Bot',
                        metadata: metadata
                    })
                }
            );

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to update metadata: ${error}`);
            }

            console.log(`✅ Metadata updated for user ${userId}`);
            return { success: true, metadata };

        } catch (error) {
            console.error(`❌ Failed to update metadata for ${userId}:`, error);
            return { success: false, error: error.message };
        }
    }

    // Calculate user's current metadata values
    async calculateUserMetadata(userId, client, serverManager) {
        const metadata = {
            verified: 1, // User linked = verified
            join_date: 0,
            message_count: 0,
            level: 1,
            supporter: 0
        };

        try {
            // Calculate across all guilds the bot is in
            for (const [guildId, guild] of client.guilds.cache) {
                try {
                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (!member) continue;

                    // Join date (days since joined)
                    const daysSinceJoin = Math.floor((Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24));
                    metadata.join_date = Math.max(metadata.join_date, daysSinceJoin);

                    // Check if booster
                    if (member.premiumSince) {
                        metadata.supporter = 1;
                    }

                    // Get user stats from serverManager
                    const settings = serverManager.getSettings(guildId);
                    if (settings.userStats && settings.userStats[userId]) {
                        const stats = settings.userStats[userId];
                        metadata.message_count += stats.messages || 0;
                        metadata.level = Math.max(metadata.level, stats.level || 1);
                    }

                } catch (err) {
                    console.log(`⚠️ Error checking guild ${guild.name}:`, err.message);
                }
            }

            return metadata;

        } catch (error) {
            console.error('❌ Error calculating metadata:', error);
            return metadata;
        }
    }

    // Generate OAuth2 authorization URL
    getAuthorizationURL(state = null) {
        const stateParam = state || crypto.randomBytes(16).toString('hex');

        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            scope: 'identify role_connections.write',
            state: stateParam
        });

        return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    }

    // Check if user is linked
    isUserLinked(userId) {
        return this.userTokens.has(userId);
    }

    // Get user's current metadata
    getUserMetadata(userId) {
        const tokenData = this.userTokens.get(userId);
        if (!tokenData) return null;
        return tokenData;
    }

    // Periodic metadata update for all linked users
    async updateAllUserMetadata(client, serverManager) {
        console.log('🔄 Updating metadata for all linked users...');
        let updated = 0;
        let errors = 0;

        for (const [userId] of this.userTokens) {
            const result = await this.updateUserMetadata(userId, client, serverManager);
            if (result.success) {
                updated++;
            } else {
                errors++;
            }

            // Rate limit protection
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`✅ Metadata update complete: ${updated} updated, ${errors} errors`);
        return { updated, errors };
    }

    // Remove user's link
    unlinkUser(userId) {
        if (this.userTokens.has(userId)) {
            this.userTokens.delete(userId);
            console.log(`🔗 Unlinked user ${userId}`);
            return true;
        }
        return false;
    }

    // Get statistics
    getStats() {
        return {
            totalLinked: this.userTokens.size,
            serverRunning: true,
            metadataRegistered: this.metadata !== null,
            redirectUri: this.redirectUri,
            port: this.port
        };
    }
}

module.exports = LinkedRolesAPI;
