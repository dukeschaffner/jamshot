"use client";

import { useMemo, useRef, useState } from "react";
import { TreeDataManager } from "../../tree/[trackId]/utils/treeDataManager";

export default function TreeDataManagerTestPage() {
  const managerRef = useRef(null);
  if (!managerRef.current) {
    managerRef.current = new TreeDataManager(null);
  }

  const [mode, setMode] = useState("getChildren"); // 'getChildren' | 'getSiblingTracksAroundTarget'
  const [trackIdInput, setTrackIdInput] = useState("");
  const [limitInput, setLimitInput] = useState("5");
  const [targetTrackIdInput, setTargetTrackIdInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("children"); // 'children' | 'windows'
  const [childrenText, setChildrenText] = useState("");
  const [windowsText, setWindowsText] = useState("");

  const parsed = useMemo(() => {
    const trackId = trackIdInput.trim() === "" ? null : Number(trackIdInput);
    const limit = limitInput.trim() === "" ? null : Number(limitInput);
    const targetTrackId = targetTrackIdInput.trim() === "" ? null : Number(targetTrackIdInput);
    return {
      trackId: Number.isFinite(trackId) ? trackId : null,
      limit: Number.isFinite(limit) ? limit : null,
      targetTrackId: Number.isFinite(targetTrackId) ? targetTrackId : null,
    };
  }, [trackIdInput, limitInput, targetTrackIdInput]);

  const summarizeWindows = (windows) => {
    return (windows || []).map((w) => ({
      startId: w.getStartId?.(),
      endId: w.getEndId?.(),
      startCreatedAt: w.getStartCreatedAt?.(),
      endCreatedAt: w.getEndCreatedAt?.(),
      nextNewestTrackId: w.getNextNewestTrackId?.(),
      nextOldestTrackId: w.getNextOldestTrackId?.(),
      count: w.getTracks?.()?.length ?? 0,
      ids: (w.getTracks?.() || []).map((t) => t.id),
    }));
  };

  const run = async () => {
    setError("");
    setChildrenText("");
    setWindowsText("");

    if (!parsed.trackId) {
      setError("Please enter a valid trackId.");
      return;
    }

    setIsLoading(true);
    try {
      const limit = parsed.limit ?? 5;

      let children = [];
      if (mode === "getChildren") {
        children = await managerRef.current.getChildren(parsed.trackId, limit);
      } else {
        if (!parsed.targetTrackId) {
          setError("Please enter a valid targetTrackId.");
          return;
        }
        children = await managerRef.current.getSiblingTracksAroundTarget(parsed.trackId, parsed.targetTrackId, limit);
      }

      const childIds = (children || []).map((t) => t?.id).filter((id) => id != null);
      console.log(`${mode} returned children ids`, childIds);
      setChildrenText(JSON.stringify(childIds, null, 2));

      const windows = managerRef.current.trackWindowsForParent.get(parsed.trackId) || [];
      const summarized = summarizeWindows(windows);

      console.log("trackWindowsForParent", parsed.trackId, windows);
      console.log("trackWindowsForParent summary", parsed.trackId, summarized);
      setWindowsText(JSON.stringify(summarized, null, 2));
    } catch (e) {
      console.error(`${mode} failed`, e);
      setError(e?.message || String(e));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>TreeDataManager test</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>function</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, minWidth: 260 }}
          >
            <option value="getChildren">getChildren(trackId, limit)</option>
            <option value="getSiblingTracksAroundTarget">getSiblingTracksAroundTarget(trackId, targetTrackId, limit)</option>
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>trackId</span>
          <input
            value={trackIdInput}
            onChange={(e) => setTrackIdInput(e.target.value)}
            placeholder="e.g. 123"
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, minWidth: 220 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>limit</span>
          <input
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            placeholder="e.g. 5"
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, minWidth: 220 }}
          />
        </label>

        {mode === "getSiblingTracksAroundTarget" ? (
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>targetTrackId</span>
            <input
              value={targetTrackIdInput}
              onChange={(e) => setTargetTrackIdInput(e.target.value)}
              placeholder="e.g. 456"
              style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, minWidth: 220 }}
            />
          </label>
        ) : null}

        <button
          onClick={run}
          disabled={isLoading}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #111",
            background: isLoading ? "#eee" : "#111",
            color: isLoading ? "#111" : "#fff",
            cursor: isLoading ? "not-allowed" : "pointer",
          }}
        >
          {isLoading ? "Loading..." : `${mode}()`}
        </button>
      </div>

      {error ? (
        <pre style={{ marginTop: 12, padding: 12, background: "#fff3f3", border: "1px solid #ffd1d1", borderRadius: 6 }}>
          {error}
        </pre>
      ) : null}

      {childrenText || windowsText ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <button
              onClick={() => setView((v) => (v === "children" ? "windows" : "children"))}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #111",
                background: "#fff",
                color: "#111",
                cursor: "pointer",
              }}
            >
              Toggle view (showing: {view})
            </button>
            <span style={{ fontSize: 12, opacity: 0.8 }}>
              Prints both to console; this panel shows {view === "children" ? "returned children[]" : "track windows[]"}.
            </span>
          </div>
          <pre style={{ padding: 12, background: "#f6f6f6", border: "1px solid #ddd", borderRadius: 6, overflow: "auto" }}>
            {view === "children" ? childrenText : windowsText}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

