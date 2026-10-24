import type { TimelineClip, TimelineState, TimelineTrack } from "./types.js";
import type { SceneType, TemplateDataType, MediaSpecType, TransitionSpecType } from "../render/script-schema.js";

export const MIN_CLIP_DURATION = 0.2; // in seconds
export const SNAP_TOLERANCE = 0.1; // in seconds

export interface TimelineCommand {
  readonly name: string;
  execute(state: TimelineState): TimelineState;
  undo(state: TimelineState): TimelineState;
}

/** Helper clone deep state */
function cloneState(state: TimelineState): TimelineState {
  return JSON.parse(JSON.stringify(state));
}

/** Round to frame boundary (30 fps) */
export function quantizeToFrames(time: number, fps: number = 30): number {
  return Math.round(time * fps) / fps;
}

/** Find snap target close to time */
export function findSnapTime(
  targetTime: number,
  snapPoints: number[],
  tolerance: number = SNAP_TOLERANCE
): number {
  let closest = targetTime;
  let minDiff = tolerance;

  for (const pt of snapPoints) {
    const diff = Math.abs(pt - targetTime);
    if (diff <= minDiff) {
      minDiff = diff;
      closest = pt;
    }
  }
  return closest;
}

/** Collect snap points from state */
export function getSnapPoints(
  state: TimelineState,
  excludeClipId?: string
): number[] {
  const points = new Set<number>([0, state.playhead]);

  for (const track of state.tracks) {
    for (const clip of track.clips) {
      if (clip.id === excludeClipId) continue;
      points.add(clip.start);
      points.add(clip.start + clip.duration);
    }
  }

  return Array.from(points).sort((a, b) => a - b);
}

/** Recalculate totalDuration of state */
function updateDuration(state: TimelineState): void {
  let max = 0;
  for (const track of state.tracks) {
    for (const clip of track.clips) {
      const end = clip.start + clip.duration;
      if (end > max) max = end;
    }
  }
  state.totalDuration = Math.round(max * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. MoveClipCommand (với snap & non-overlapping constraint)
// ─────────────────────────────────────────────────────────────────────────────
export class MoveClipCommand implements TimelineCommand {
  readonly name = "MoveClip";
  private prevStart: number = 0;

  constructor(
    private clipId: string,
    private newStart: number,
    private enableSnap: boolean = true
  ) {}

  execute(state: TimelineState): TimelineState {
    const next = cloneState(state);
    let targetTrack: TimelineTrack | undefined;
    let targetClip: TimelineClip | undefined;

    for (const track of next.tracks) {
      const found = track.clips.find((c) => c.id === this.clipId);
      if (found) {
        targetTrack = track;
        targetClip = found;
        break;
      }
    }

    if (!targetTrack || !targetClip) {
      throw new Error(`Clip not found: ${this.clipId}`);
    }

    this.prevStart = targetClip.start;
    let startCandidate = Math.max(0, this.newStart);

    if (this.enableSnap) {
      const snapPoints = getSnapPoints(next, this.clipId);
      // Snap both clip start and clip end
      const snappedStart = findSnapTime(startCandidate, snapPoints);
      const snappedEnd = findSnapTime(startCandidate + targetClip.duration, snapPoints);

      if (Math.abs(snappedStart - startCandidate) <= SNAP_TOLERANCE) {
        startCandidate = snappedStart;
      } else if (Math.abs(snappedEnd - (startCandidate + targetClip.duration)) <= SNAP_TOLERANCE) {
        startCandidate = Math.max(0, snappedEnd - targetClip.duration);
      }
    }

    startCandidate = quantizeToFrames(startCandidate, next.fps);
    const endCandidate = startCandidate + targetClip.duration;

    // Check non-overlapping constraint with other clips in the same track
    const otherClips = targetTrack.clips
      .filter((c) => c.id !== this.clipId)
      .sort((a, b) => a.start - b.start);

    for (const other of otherClips) {
      const otherEnd = other.start + other.duration;
      const overlaps = Math.max(startCandidate, other.start) < Math.min(endCandidate, otherEnd) - 0.001;
      if (overlaps) {
        throw new Error(
          `Cannot move clip: overlap detected with clip '${other.name}' [${other.start.toFixed(2)} - ${otherEnd.toFixed(2)}]`
        );
      }
    }

    targetClip.start = startCandidate;
    updateDuration(next);

    // Đồng bộ nếu là scene clip thì cập nhật timing trong script
    if (targetClip.trackType === "scene" && targetClip.sceneId && next.script.timeline?.scenes) {
      if (!next.script.timeline.scenes[targetClip.sceneId]) {
        next.script.timeline.scenes[targetClip.sceneId] = {};
      }
      next.script.timeline.scenes[targetClip.sceneId].start = startCandidate;
    }

    return next;
  }

  undo(state: TimelineState): TimelineState {
    const prev = new MoveClipCommand(this.clipId, this.prevStart, false);
    return prev.execute(state);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. TrimClipCommand (min duration >= 0.2s, non-overlapping)
// ─────────────────────────────────────────────────────────────────────────────
export class TrimClipCommand implements TimelineCommand {
  readonly name = "TrimClip";
  private prevStart: number = 0;
  private prevDuration: number = 0;

  constructor(
    private clipId: string,
    private newDuration: number,
    private newStart?: number
  ) {}

  execute(state: TimelineState): TimelineState {
    if (this.newDuration < MIN_CLIP_DURATION) {
      throw new Error(`Trim rejected: duration ${this.newDuration.toFixed(2)}s is below minimum ${MIN_CLIP_DURATION}s`);
    }

    const next = cloneState(state);
    let targetTrack: TimelineTrack | undefined;
    let targetClip: TimelineClip | undefined;

    for (const track of next.tracks) {
      const found = track.clips.find((c) => c.id === this.clipId);
      if (found) {
        targetTrack = track;
        targetClip = found;
        break;
      }
    }

    if (!targetTrack || !targetClip) {
      throw new Error(`Clip not found: ${this.clipId}`);
    }

    this.prevStart = targetClip.start;
    this.prevDuration = targetClip.duration;

    const finalStart = this.newStart !== undefined ? quantizeToFrames(this.newStart, next.fps) : targetClip.start;
    const finalDuration = quantizeToFrames(this.newDuration, next.fps);
    const finalEnd = finalStart + finalDuration;

    // Check non-overlapping with next clips
    const otherClips = targetTrack.clips.filter((c) => c.id !== this.clipId);
    for (const other of otherClips) {
      const otherEnd = other.start + other.duration;
      const overlaps = Math.max(finalStart, other.start) < Math.min(finalEnd, otherEnd) - 0.001;
      if (overlaps) {
        throw new Error(`Trim rejected: overlap with '${other.name}'`);
      }
    }

    targetClip.start = finalStart;
    targetClip.duration = finalDuration;
    updateDuration(next);

    if (targetClip.trackType === "scene" && targetClip.sceneId && next.script.timeline?.scenes) {
      if (!next.script.timeline.scenes[targetClip.sceneId]) {
        next.script.timeline.scenes[targetClip.sceneId] = {};
      }
      next.script.timeline.scenes[targetClip.sceneId].start = finalStart;
      next.script.timeline.scenes[targetClip.sceneId].duration = finalDuration;
    }

    return next;
  }

  undo(state: TimelineState): TimelineState {
    const prev = new TrimClipCommand(this.clipId, this.prevDuration, this.prevStart);
    return prev.execute(state);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SplitClipCommand
// ─────────────────────────────────────────────────────────────────────────────
export class SplitClipCommand implements TimelineCommand {
  readonly name = "SplitClip";
  private generatedClipId: string | null = null;

  constructor(private clipId: string, private splitTime: number) {}

  execute(state: TimelineState): TimelineState {
    const next = cloneState(state);
    let targetTrack: TimelineTrack | undefined;
    let targetClip: TimelineClip | undefined;

    for (const track of next.tracks) {
      const found = track.clips.find((c) => c.id === this.clipId);
      if (found) {
        targetTrack = track;
        targetClip = found;
        break;
      }
    }

    if (!targetTrack || !targetClip) {
      throw new Error(`Clip not found: ${this.clipId}`);
    }

    const t = quantizeToFrames(this.splitTime, next.fps);
    const clipEnd = targetClip.start + targetClip.duration;

    if (t <= targetClip.start + MIN_CLIP_DURATION || t >= clipEnd - MIN_CLIP_DURATION) {
      throw new Error(
        `Split position ${t}s must leave at least ${MIN_CLIP_DURATION}s on both sides of clip [${targetClip.start} - ${clipEnd}]`
      );
    }

    const firstDuration = quantizeToFrames(t - targetClip.start, next.fps);
    const secondDuration = quantizeToFrames(clipEnd - t, next.fps);

    targetClip.duration = firstDuration;

    this.generatedClipId = `${targetClip.id}-split-${Date.now()}`;
    const secondClip: TimelineClip = {
      ...targetClip,
      id: this.generatedClipId,
      start: t,
      duration: secondDuration,
      name: `${targetClip.name} (Part 2)`,
    };

    targetTrack.clips.push(secondClip);
    targetTrack.clips.sort((a, b) => a.start - b.start);
    updateDuration(next);

    return next;
  }

  undo(state: TimelineState): TimelineState {
    if (!this.generatedClipId) return state;

    const next = cloneState(state);
    for (const track of next.tracks) {
      const idx = track.clips.findIndex((c) => c.id === this.generatedClipId);
      if (idx !== -1) {
        const removed = track.clips[idx];
        track.clips.splice(idx, 1);
        const original = track.clips.find((c) => c.id === this.clipId);
        if (original) {
          original.duration = quantizeToFrames(original.duration + removed.duration, next.fps);
        }
        break;
      }
    }
    updateDuration(next);
    return next;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. RippleDeleteCommand (xoá clip và dồn các clip phía sau sang trái)
// ─────────────────────────────────────────────────────────────────────────────
export class RippleDeleteCommand implements TimelineCommand {
  readonly name = "RippleDelete";
  private deletedClip: TimelineClip | null = null;
  private trackId: string | null = null;
  private originalClipsOrder: TimelineClip[] = [];

  constructor(private clipId: string) {}

  execute(state: TimelineState): TimelineState {
    const next = cloneState(state);
    let targetTrack: TimelineTrack | undefined;
    let targetIndex = -1;

    for (const track of next.tracks) {
      const idx = track.clips.findIndex((c) => c.id === this.clipId);
      if (idx !== -1) {
        targetTrack = track;
        targetIndex = idx;
        break;
      }
    }

    if (!targetTrack || targetIndex === -1) {
      throw new Error(`Clip not found: ${this.clipId}`);
    }

    this.trackId = targetTrack.id;
    this.originalClipsOrder = JSON.parse(JSON.stringify(targetTrack.clips));
    const [removed] = targetTrack.clips.splice(targetIndex, 1);
    this.deletedClip = removed;

    const shiftAmount = removed.duration;

    // Dồn tất cả các clip có start >= removed.start + removed.duration sang trái
    for (const clip of targetTrack.clips) {
      if (clip.start >= removed.start) {
        clip.start = quantizeToFrames(Math.max(0, clip.start - shiftAmount), next.fps);
      }
    }

    updateDuration(next);

    // Nếu là scene, xóa timing khỏi script timeline
    if (removed.sceneId && next.script.timeline?.scenes) {
      delete next.script.timeline.scenes[removed.sceneId];
    }

    return next;
  }

  undo(state: TimelineState): TimelineState {
    if (!this.trackId || !this.originalClipsOrder) return state;

    const next = cloneState(state);
    const track = next.tracks.find((t) => t.id === this.trackId);
    if (track) {
      track.clips = JSON.parse(JSON.stringify(this.originalClipsOrder));
    }
    if (this.deletedClip?.sceneId && next.script.timeline?.scenes) {
      next.script.timeline.scenes[this.deletedClip.sceneId] = {
        start: this.deletedClip.start,
        duration: this.deletedClip.duration,
      };
    }
    updateDuration(next);
    return next;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. EditCueCommand (sửa text hoặc timing của cue caption)
// ─────────────────────────────────────────────────────────────────────────────
export class EditCueCommand implements TimelineCommand {
  readonly name = "EditCue";
  private prevText: string = "";
  private prevStart: number = 0;
  private prevDuration: number = 0;

  constructor(
    private cueIndex: number,
    private newText: string,
    private newStart?: number,
    private newDuration?: number
  ) {}

  execute(state: TimelineState): TimelineState {
    const next = cloneState(state);
    const captionsTrack = next.tracks.find((t) => t.type === "caption");
    if (!captionsTrack) throw new Error("Captions track not found");

    const clip = captionsTrack.clips.find((c) => c.cueIndex === this.cueIndex);
    if (!clip) throw new Error(`Cue index ${this.cueIndex} not found`);

    this.prevText = clip.name;
    this.prevStart = clip.start;
    this.prevDuration = clip.duration;

    clip.name = this.newText;
    if (clip.meta) clip.meta.text = this.newText;
    if (this.newStart !== undefined) clip.start = quantizeToFrames(this.newStart, next.fps);
    if (this.newDuration !== undefined) clip.duration = quantizeToFrames(this.newDuration, next.fps);

    // Đồng bộ lại vào script.timeline.captionCues
    if (next.script.timeline?.captionCues && next.script.timeline.captionCues[this.cueIndex]) {
      next.script.timeline.captionCues[this.cueIndex].text = this.newText;
      if (this.newStart !== undefined) next.script.timeline.captionCues[this.cueIndex].start = clip.start;
      if (this.newDuration !== undefined) next.script.timeline.captionCues[this.cueIndex].end = clip.start + clip.duration;
    }

    updateDuration(next);
    return next;
  }

  undo(state: TimelineState): TimelineState {
    const prev = new EditCueCommand(this.cueIndex, this.prevText, this.prevStart, this.prevDuration);
    return prev.execute(state);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. UpdateSceneVoiceTextCommand (sửa voiceText và templateData của scene)
// ─────────────────────────────────────────────────────────────────────────────
export class UpdateSceneVoiceTextCommand implements TimelineCommand {
  readonly name = "UpdateSceneVoiceText";
  private prevVoiceText: string = "";
  private prevTemplateData: TemplateDataType | null = null;

  constructor(
    private sceneId: string,
    private newVoiceText: string,
    private newTemplateData?: TemplateDataType
  ) {}

  execute(state: TimelineState): TimelineState {
    const next = cloneState(state);
    const scene = next.script.scenes.find((s: SceneType) => s.id === this.sceneId);
    if (!scene) throw new Error(`Scene not found: ${this.sceneId}`);

    this.prevVoiceText = scene.voiceText;
    this.prevTemplateData = JSON.parse(JSON.stringify(scene.templateData));

    scene.voiceText = this.newVoiceText;
    if (this.newTemplateData) {
      scene.templateData = this.newTemplateData;
    }

    // Đồng bộ tên clip trong track voice
    const voiceTrack = next.tracks.find((t) => t.type === "voice");
    const voiceClip = voiceTrack?.clips.find((c) => c.sceneId === this.sceneId);
    if (voiceClip) {
      voiceClip.name = `Voice: ${this.newVoiceText.slice(0, 20)}...`;
      if (voiceClip.meta) voiceClip.meta.text = this.newVoiceText;
    }

    return next;
  }

  undo(state: TimelineState): TimelineState {
    if (!this.prevTemplateData) return state;
    const prev = new UpdateSceneVoiceTextCommand(this.sceneId, this.prevVoiceText, this.prevTemplateData);
    return prev.execute(state);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. SetBgmCommand (cập nhật volume, src, ducking)
// ─────────────────────────────────────────────────────────────────────────────
export class SetBgmCommand implements TimelineCommand {
  readonly name = "SetBgm";
  private prevBgm: { src: string; volume?: number; duck?: boolean; duckVolume?: number } | undefined;

  constructor(
    private src: string,
    private volume: number = 0.18,
    private duck: boolean = true,
    private duckVolume: number = 0.06
  ) {}

  execute(state: TimelineState): TimelineState {
    const next = cloneState(state);
    this.prevBgm = next.script.bgm ? JSON.parse(JSON.stringify(next.script.bgm)) : undefined;

    next.script.bgm = {
      src: this.src,
      volume: this.volume,
      duck: this.duck,
      duckVolume: this.duckVolume,
    };

    let bgmTrack = next.tracks.find((t) => t.type === "bgm");
    if (!bgmTrack) {
      bgmTrack = {
        id: "track-bgm",
        type: "bgm",
        label: "Background Music",
        clips: [],
      };
      next.tracks.push(bgmTrack);
    }

    bgmTrack.clips = [
      {
        id: "bgm-clip-1",
        trackId: "track-bgm",
        trackType: "bgm",
        start: 0,
        duration: next.totalDuration > 0 ? next.totalDuration : 30,
        name: `BGM: ${this.src}`,
        meta: { volume: this.volume, duck: this.duck },
      },
    ];

    return next;
  }

  undo(state: TimelineState): TimelineState {
    const next = cloneState(state);
    if (this.prevBgm) {
      next.script.bgm = {
        src: this.prevBgm.src,
        volume: this.prevBgm.volume ?? 0.18,
        duck: this.prevBgm.duck ?? true,
        duckVolume: this.prevBgm.duckVolume ?? 0.06,
      };
      const bgmTrack = next.tracks.find((t) => t.type === "bgm");
      if (bgmTrack) {
        bgmTrack.clips = [
          {
            id: "bgm-clip-1",
            trackId: "track-bgm",
            trackType: "bgm",
            start: 0,
            duration: next.totalDuration,
            name: `BGM: ${this.prevBgm.src}`,
          },
        ];
      }
    } else {
      delete next.script.bgm;
      const bgmTrack = next.tracks.find((t) => t.type === "bgm");
      if (bgmTrack) bgmTrack.clips = [];
    }
    return next;
  }
}
