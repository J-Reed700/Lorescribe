export default class Container {
    constructor() {
        this.services = new Map();
        this.factories = new Map();
        this.instances = new Map();
    }

    // Register a service instance
    register(name, instance) {
        if (this.services.has(name)) {
            throw new Error(`Service ${name} is already registered`);
        }
        this.services.set(name, instance);
    }

    // Register a factory function that creates a service
    registerFactory(name, factory) {
        if (this.factories.has(name)) {
            throw new Error(`Factory ${name} is already registered`);
        }
        this.factories.set(name, factory);
    }

    // Get a service instance, creating it if necessary
    get(name) {
        // Return existing instance if available
        if (this.instances.has(name)) {
            return this.instances.get(name);
        }

        // Return registered service instance
        if (this.services.has(name)) {
            return this.services.get(name);
        }

        // Create instance from factory if available
        if (this.factories.has(name)) {
            const factory = this.factories.get(name);
            const instance = factory(this);
            this.instances.set(name, instance);
            return instance;
        }

        throw new Error(`Service ${name} not found`);
    }

    // Check if a service exists
    has(name) {
        return this.services.has(name) || this.factories.has(name);
    }

    // Remove a service
    remove(name) {
        this.services.delete(name);
        this.factories.delete(name);
        this.instances.delete(name);
    }

    // Clear all services
    clear() {
        this.services.clear();
        this.factories.clear();
        this.instances.clear();
    }
}

