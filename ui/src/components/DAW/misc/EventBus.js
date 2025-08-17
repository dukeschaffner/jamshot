// EventBus.js - Full implementation with features needed for DAW
class EventBus {
    constructor() {
      this.listeners = new Map();
      this.onceListeners = new Map();
      this.middleware = [];
      this.debug = process.env.NODE_ENV === 'development';
    }
    
    // Core event methods
    on(event, callback, options = {}) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      
      const listener = {
        callback,
        id: options.id || Math.random().toString(36),
        priority: options.priority || 0,
        context: options.context || null
      };
      
      this.listeners.get(event).push(listener);
      // Sort by priority (higher priority first)
      this.listeners.get(event).sort((a, b) => b.priority - a.priority);
      
      if (this.debug) {
        console.log(`EventBus: Registered listener for '${event}'`, listener);
      }
      
      return listener.id; // Return ID for removal
    }
    
    once(event, callback, options = {}) {
      const wrappedCallback = (data) => {
        callback(data);
        this.off(event, wrappedCallback);
      };
      
      return this.on(event, wrappedCallback, options);
    }
    
    off(event, callbackOrId) {
      const listeners = this.listeners.get(event) || [];
      
      if (typeof callbackOrId === 'string') {
        // Remove by ID
        const index = listeners.findIndex(l => l.id === callbackOrId);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      } else {
        // Remove by callback
        const index = listeners.findIndex(l => l.callback === callbackOrId);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
      
      // if (this.debug) {
      //   console.log(`EventBus: Removed listener for '${event}'`);
      // }
    }
    
    emit(event, data = null) {
      // Run middleware
      let processedData = data;
      for (const middleware of this.middleware) {
        processedData = middleware(event, processedData);
        if (processedData === null) return; // Middleware blocked event
      }
      
      const listeners = this.listeners.get(event) || [];
      
      // if (this.debug) {
      //   console.log(`EventBus: Emitting '${event}'`, processedData, `(${listeners.length} listeners)`);
      // }
      
      // Execute listeners with error handling
      listeners.forEach(listener => {
        try {
          listener.callback.call(listener.context, processedData);
        } catch (error) {
          console.error(`EventBus: Error in listener for '${event}'`, error);
          // Emit error event
          this.emit('eventbus:error', { event, error, listener });
        }
      });
    }
    
    // Middleware support
    use(middleware) {
      this.middleware.push(middleware);
    }
    
    // Utility methods
    clear(event) {
      if (event) {
        this.listeners.delete(event);
      } else {
        this.listeners.clear();
      }
    }
    
    getListenerCount(event) {
      return (this.listeners.get(event) || []).length;
    }
    
    // Debug methods
    getRegisteredEvents() {
      return Array.from(this.listeners.keys());
    }
    
    getListenersForEvent(event) {
      return this.listeners.get(event) || [];
    }
  }
  
  // Create global instance
  export const eventBus = new EventBus();