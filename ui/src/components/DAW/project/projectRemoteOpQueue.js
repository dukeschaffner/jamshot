/**
 * Buffers remote project ops until revision order is satisfied or clip drag ends.
 */
export class ProjectRemoteOpQueue {
  constructor() {
    this.lastAppliedRevision = null;
    this.buffer = new Map();
    this.isClipDragActive = false;
    this.dragPaused = [];
  }

  setLastAppliedRevision(revision) {
    if (revision == null) return;
    this.lastAppliedRevision = Number(revision);
    this.flushReady();
  }

  setClipDragActive(active) {
    this.isClipDragActive = active;
    if (!active) {
      this.flushDragPaused();
    }
  }

  /**
   * @param {object} opMessage — { revision, fromUserId, payload }
   * @param {(message: object) => void} applyFn
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
      applyFn(opMessage);
      this.lastAppliedRevision = revision;
      this.flushReady(applyFn);
      return;
    }

    this.buffer.set(revision, { opMessage, applyFn });
  }

  flushReady(applyFn) {
    let nextRevision = this.lastAppliedRevision + 1;
    while (this.buffer.has(nextRevision)) {
      const entry = this.buffer.get(nextRevision);
      this.buffer.delete(nextRevision);
      entry.applyFn(entry.opMessage);
      this.lastAppliedRevision = nextRevision;
      nextRevision += 1;
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
      'clip.delete',
    ]);
    return clipKinds.has(payload?.kind);
  }

  reset() {
    this.lastAppliedRevision = null;
    this.buffer.clear();
    this.dragPaused = [];
    this.isClipDragActive = false;
  }
}
