/**
 * Buffers remote project ops until revision order is satisfied or clip drag ends.
 * Supports async apply functions so clip.create can fetch full state before later ops run.
 */
export class ProjectRemoteOpQueue {
  constructor() {
    this.lastAppliedRevision = null;
    this.buffer = new Map();
    this.isClipDragActive = false;
    this.dragPaused = [];
    this.applyChain = Promise.resolve();
  }

  setLastAppliedRevision(revision) {
    if (revision == null) return;
    const next = Number(revision);
    if (!Number.isFinite(next)) return;
    if (this.lastAppliedRevision != null && next < this.lastAppliedRevision) {
      return;
    }
    this.lastAppliedRevision = next;
    this.pruneBufferThrough(this.lastAppliedRevision);
    void this.flushReady();
  }

  pruneBufferThrough(revision) {
    for (const key of [...this.buffer.keys()]) {
      if (key <= revision) {
        this.buffer.delete(key);
      }
    }
  }

  setClipDragActive(active) {
    this.isClipDragActive = active;
    if (!active) {
      this.flushDragPaused();
    }
  }

  /**
   * @param {object} opMessage — { revision, fromUserId, payload }
   * @param {(message: object) => void|Promise<void>} applyFn
   */
  enqueue(opMessage, applyFn) {
    const revision = Number(opMessage.revision);
    if (!Number.isFinite(revision)) return;

    if (this.isClipDragActive && this.isClipLayoutOp(opMessage.payload)) {
      this.dragPaused.push({ opMessage, applyFn });
      return;
    }

    if (this.lastAppliedRevision == null) {
      this.lastAppliedRevision = revision - 1;
    }

    if (revision <= this.lastAppliedRevision) {
      return;
    }

    if (revision === this.lastAppliedRevision + 1) {
      this.applyChain = this.applyChain
        .then(async () => {
          if (revision !== this.lastAppliedRevision + 1) {
            if (revision > this.lastAppliedRevision) {
              this.buffer.set(revision, { opMessage, applyFn });
            }
            return;
          }
          await applyFn(opMessage);
          if (this.lastAppliedRevision == null || this.lastAppliedRevision < revision) {
            this.lastAppliedRevision = revision;
          }
          this.pruneBufferThrough(this.lastAppliedRevision);
          await this.flushReady();
        })
        .catch((error) => {
          console.error('Remote op apply failed:', error);
        });
      return;
    }

    this.buffer.set(revision, { opMessage, applyFn });
  }

  async flushReady() {
    let nextRevision = this.lastAppliedRevision + 1;
    while (this.buffer.has(nextRevision)) {
      const entry = this.buffer.get(nextRevision);
      this.buffer.delete(nextRevision);
      await entry.applyFn(entry.opMessage);
      if (this.lastAppliedRevision == null || this.lastAppliedRevision < nextRevision) {
        this.lastAppliedRevision = nextRevision;
      }
      this.pruneBufferThrough(this.lastAppliedRevision);
      nextRevision = this.lastAppliedRevision + 1;
    }
  }

  flushDragPaused() {
    if (this.dragPaused.length === 0) return;
    const pending = [...this.dragPaused];
    this.dragPaused = [];
    for (const entry of pending) {
      this.enqueue(entry.opMessage, entry.applyFn);
    }
  }

  isClipLayoutOp(payload) {
    const clipKinds = new Set([
      'clip.move',
      'clip.trim',
      'clip.move_to_track',
      'clip.loop',
      'clip.delete',
    ]);
    return clipKinds.has(payload?.kind);
  }

  reset() {
    this.lastAppliedRevision = null;
    this.buffer.clear();
    this.dragPaused = [];
    this.isClipDragActive = false;
    this.applyChain = Promise.resolve();
  }
}
