export default class ChannelService {
    constructor(client) {
        this.client = client;
    }

    async getChannel(channelId) {
        return await this.client.channels.fetch(channelId);
    }

    async sendMessage(channelId, message) {
        const channel = await this.getChannel(channelId);
        if (channel) {
            await channel.send(message);
        }
    }
}   