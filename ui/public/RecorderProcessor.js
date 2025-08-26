class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._bufferSize = 4096;
    this._firstSampleFrame = null; // <-- store when first audio arrives

    this.port.onmessage = (event) => {
      if (event.data === 'reset') {
        this._buffer = [];
        this._firstSampleFrame = null; // reset timing too
      } else if (event.data.type === 'configure') {
        this._bufferSize = event.data.bufferSize || 4096;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0 && input[0].length > 0) {
      const channelData = input[0];

      // Capture the first sample’s timestamp ONCE
      if (this._firstSampleFrame === null) {
        this._firstSampleFrame = currentFrame;
        const firstSampleTime = currentTime;
        this.port.postMessage({
          type: 'first-sample',
          frame: this._firstSampleFrame,
          time: firstSampleTime
        });
      }

      // Buffer the audio data
      this._buffer.push(new Float32Array(channelData));

      const totalLength = this._buffer.reduce((sum, buf) => sum + buf.length, 0);
      if (totalLength >= this._bufferSize) {
        const merged = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of this._buffer) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }

        this.port.postMessage({ type: 'audio', data: merged });
        this._buffer = [];
      }
    }

    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
