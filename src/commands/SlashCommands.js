const SetChannelCommand = require('./SetChannelCommand');
const SetTimeIntervalCommand = require('./SetTimeIntervalCommand');
const StopCommand = require('./StopCommand');
const StatusCommand = require('./StatusCommand');
const RecordCommand = require('./RecordCommand');
const ServiceFactory = require('../services/ServiceFactory');

const services = ServiceFactory.createContainer();

module.exports = [
    new SetChannelCommand(services).data.toJSON(),
    new SetTimeIntervalCommand(services).data.toJSON(),
    new StopCommand(services).data.toJSON(),
    new StatusCommand(services).data.toJSON(),
    new RecordCommand(services).data.toJSON()
]; 