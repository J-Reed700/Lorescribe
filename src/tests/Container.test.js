import { describe, it, expect, beforeEach } from '@jest/globals';
import Container from '../services/Container.js';

describe('Container', () => {
    let container;

    beforeEach(() => {
        container = new Container();
    });

    describe('register and get', () => {
        it('should register and retrieve a service', () => {
            const mockService = { test: true };
            container.register('test', mockService);
            
            const retrieved = container.get('test');
            expect(retrieved).toBe(mockService);
        });

        it('should throw error when getting non-existent service', () => {
            expect(() => {
                container.get('nonexistent');
            }).toThrow('Service nonexistent not found');
        });
    });

    describe('registerImplementation and getImplementation', () => {
        it('should register and retrieve an implementation', () => {
            const mockImpl = { test: true };
            container.registerImplementation('ITest', 'default', mockImpl);
            
            const retrieved = container.getImplementation('ITest', 'default');
            expect(retrieved).toBe(mockImpl);
        });

        it('should throw error when getting non-existent implementation', () => {
            expect(() => {
                container.getImplementation('ITest', 'nonexistent');
            }).toThrow('Implementation nonexistent of ITest not found');
        });
    });
}); 