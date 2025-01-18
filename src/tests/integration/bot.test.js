const { jest } = require('@jest/globals');
const Bot = require('../../bot');
const { Client } = require('discord.js');

jest.mock('discord.js');
jest.mock('openai');

describe('Bot Integration', () => {
    let bot;

    beforeEach(() => {
        Client.mockImplementation(() => ({
            login: jest.fn(),
            on: jest.fn()
        }));
    });

    it('should initialize and start correctly', async () => {
        bot = new Bot();
        await bot.start();

        expect(Client).toHaveBeenCalled();
        expect(bot.client.login).toHaveBeenCalledWith(process.env.DISCORD_TOKEN);
    });

    it('should handle voice state updates', () => {
        bot = new Bot();
        const voiceStateHandler = bot.client.on.mock.calls.find(
            call => call[0] === 'voiceStateUpdate'
        )[1];

        const mockOldState = {
            channel: { members: { size: 1 } },
            guild: { id: '123' }
        };
        const mockNewState = {};

        voiceStateHandler(mockOldState, mockNewState);
        // Add assertions based on expected behavior
    });
}); 