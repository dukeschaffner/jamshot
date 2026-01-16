class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Must be multiple of 128
    this._bufferSize = 4096;

    this._buffer = new Float32Array(this._bufferSize);
    this._writeIndex = 0;

    this._firstSampleFrame = null;

    this.port.onmessage = (event) => {
      if (event.data === 'reset') {
        this._writeIndex = 0;
        this._firstSampleFrame = null;
      } else if (event.data.type === 'configure') {
        // Enforce 128 alignment
        const size = event.data.bufferSize || 4096;
        this._bufferSize = Math.ceil(size / 128) * 128;

        this._buffer = new Float32Array(this._bufferSize);
        this._writeIndex = 0;
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // mono
    const frames = channelData.length;

    // Capture timing once
    if (this._firstSampleFrame === null) {
      this._firstSampleFrame = currentFrame;
      this.port.postMessage({
        type: 'first-sample',
        frame: currentFrame,
        time: currentTime
      });
    }

    let readIndex = 0;

    while (readIndex < frames) {
      const spaceLeft = this._bufferSize - this._writeIndex;
      const copyCount = Math.min(spaceLeft, frames - readIndex);

      this._buffer.set(
        channelData.subarray(readIndex, readIndex + copyCount),
        this._writeIndex
      );

      this._writeIndex += copyCount;
      readIndex += copyCount;

      if (this._writeIndex === this._bufferSize) {
        // Copy once, post once
        this.port.postMessage({
          type: 'audio',
          data: this._buffer.slice()
        });

        this._writeIndex = 0;
      }
    }

    return true;
  }
}

// option to improve buffer concencation if needed
// function deClick(prev, curr) {
//   if (!prev) return;
//   curr[0] = prev[prev.length - 1];
// }

registerProcessor('recorder-processor', RecorderProcessor);
