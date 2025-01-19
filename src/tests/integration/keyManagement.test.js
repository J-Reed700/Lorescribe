import { jest, describe } from '@jest/globals';
import Bot from '../../bot.js';
import { Client } from 'discord.js';
import { OpenAI } from 'openai';

jest.mock('discord.js');
jest.mock('openai');

describe('Key Management Integration', () => {
    let bot;
    let mockInteraction;

    beforeEach(() => {
        Client.mockImplementation(() => ({
            login: jest.fn(),
            on: jest.fn()
        }));

        mockInteraction = {
            commandName: 'setkey',
            guildId: '123',
            member: {
                permissions: {
                    has: jest.fn().mockReturnValue(true)
                }
            },
            options: {
                getString: jest.fn()
            },
            deferReply: jest.fn().mockResolvedValue(undefined),
            editReply: jest.fn().mockResolvedValue(undefined),
            reply: jest.fn().mockResolvedValue(undefined)
        };
    });

    it('should handle key setting flow', async () => {
        bot = new Bot();
        const handler = bot.client.on.mock.calls.find(
            call => call[0] === 'interactionCreate'
        )[1];

        mockInteraction.options.getString.mockReturnValue('valid-key');
        OpenAI.prototype.models.list.mockResolvedValue([]);

        await handler(mockInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: expect.stringContaining('validated and set successfully'),
            ephemeral: true
        });
    });

    it('should handle invalid keys', async () => {
        bot = new Bot();
        const handler = bot.client.on.mock.calls.find(
            call => call[0] === 'interactionCreate'
        )[1];

        mockInteraction.options.getString.mockReturnValue('invalid-key');
        OpenAI.prototype.models.list.mockRejectedValue({ response: { status: 401 } });

        await handler(mockInteraction);

        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: expect.stringContaining('Invalid OpenAI API key'),
            ephemeral: true
        });
    });
}); 