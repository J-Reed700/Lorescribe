import ServiceFactory from '../services/ServiceFactory.js';
import SetChannelCommand from './SetChannelCommand.js';
import SetTimeIntervalCommand from './SetTimeIntervalCommand.js';
import StopCommand from './StopCommand.js';
import StatusCommand from './StatusCommand.js';
import RecordCommand from './RecordCommand.js';
import SetKeyCommand from './SetKeyCommand.js';

const services = await new ServiceFactory().initialize();

export default [
    new SetChannelCommand(services).data.toJSON(),  
    new SetTimeIntervalCommand(services).data.toJSON(),
    new StopCommand(services).data.toJSON(),
    new StatusCommand(services).data.toJSON(),
    new RecordCommand(services).data.toJSON(),
    new SetKeyCommand(services).data.toJSON()
]; 