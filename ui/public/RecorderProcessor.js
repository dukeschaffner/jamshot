class RecorderProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this._buffer = [];
      this._bufferSize = 4096; // This will be overridden by the main thread
  
      this.port.onmessage = (event) => {
        if (event.data === 'reset') {
          this._buffer = [];
        } else if (event.data.type === 'configure') {
          this._bufferSize = event.data.bufferSize || 4096;
        }
      };
    }
  
    process(inputs, outputs, parameters) {
      const input = inputs[0];
  
      if (input.length > 0) {
        const channelData = input[0]; // mono for simplicity
  
        // Copy the current buffer so we can safely transfer
        this._buffer.push(new Float32Array(channelData));
  
        const totalLength = this._buffer.reduce((sum, buf) => sum + buf.length, 0);
        if (totalLength >= this._bufferSize) {
          // Flatten the buffer and send to main thread
          const merged = new Float32Array(totalLength);
          let offset = 0;
          for (const chunk of this._buffer) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }
  
          this.port.postMessage(merged);
          this._buffer = [];
        }
      }
  
      return true; // Keep processor alive
    }
  }
  
  registerProcessor('recorder-processor', RecorderProcessor); 