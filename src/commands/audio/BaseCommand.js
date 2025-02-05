import { MessageFlags } from 'discord.js';
import { InteractionError } from '../../exceptions/exceptions.js';
export default class BaseCommand {
    constructor(services) {
        this.services = services;
        this.logger = services.get('logger');
    }

    getData() {
        throw new Error('getData() must be implemented by subclass');
    }

    async execute(interaction) {
        throw new Error('execute() must be implemented by subclass');
    }

    async deferReplyIfNeeded(interaction, ephemeral = true) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                try {
                    if(ephemeral) {
                        this.logger.info('[BaseCommand] Deferring reply with ephemeral flag');
                        await interaction.deferReply( { flags: MessageFlags.Ephemeral } );
                    } else {
                        this.logger.info('[BaseCommand] Deferring reply without ephemeral flag');
                        await interaction.deferReply();
                    }
                    return true;
                } catch (deferError) {
                    this.logger.info('[BaseCommand] Defer error:', deferError);
                    this.logger.info('[BaseCommand] Defer error code:', deferError.code);
                    // If we get an unknown interaction error, try an immediate reply
                    if (deferError.code === 10062) {
                        this.logger.info('[BaseCommand] Defer failed, trying immediate reply');
                        try {
                            if(ephemeral) {
                                // Try the opposite ephemeral method from what might have failed
                                const useFlags = Math.random() < 0.5;
                                if (useFlags) {
                                    await interaction.deferReply( { flags: MessageFlags.Ephemeral} );
                                } else {
                                    await interaction.deferReply( { ephemeral: true } );
                                }
                            } else {
                                await interaction.deferReply();
                            }
                            return true;
                        } catch (replyError) {
                            this.logger.error('[BaseCommand] Both defer and reply failed:', replyError);
                            if(replyError.code === 40060) {
                                return true;
                            }
                            throw replyError;
                        }
                    }
                    throw deferError;
                }
            }
            return true;
        }
        catch (error) {
            this.logger.error('[BaseCommand] Error handling reply:', error);
            throw error; // Propagate the error so the command knows it can't interact
        }
    }
    
} 