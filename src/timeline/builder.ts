import type { Script } from "../render/script-schema.js";
import type { TimelineClip, TimelineState, TimelineTrack } from "./types.js";
import { migrateV1toV2 } from "./migrate.js";

export function buildTimelineState(
  inputScript: Script,
  audioDurations?: Record<string, number>,
  captionCues?: Array<{ start: number; end: number; text: string }>
): TimelineState {
  const script = migrateV1toV2(inputScript, audioDurations);

  const sceneClips: TimelineClip[] = [];
  const voiceClips: TimelineClip[] = [];

  let maxTime = 0;

  for (const scene of script.scenes) {
    const timing = script.timeline?.scenes?.[scene.id] ?? {
      start: 0,
      duration: 3,
    };
    const start = timing.start ?? 0;
    const duration = timing.duration ?? 3;
    const end = start + duration;
    if (end > maxTime) maxTime = end;

    sceneClips.push({
      id: `scene-clip-${scene.id}`,
      trackId: "track-scenes",
      trackType: "scene",
      sceneId: scene.id,
      start,
      duration,
      offset: timing.trimIn ?? 0,
      name: `Scene: ${scene.templateData.template} (${scene.id})`,
      meta: {
        template: scene.templateData.template,
        type: scene.type,
      },
    });

    voiceClips.push({
      id: `voice-clip-${scene.id}`,
      trackId: "track-voice",
      trackType: "voice",
      sceneId: scene.id,
      start,
      duration,
      offset: 0,
      name: `Voice: ${scene.voiceText.slice(0, 20)}...`,
      meta: {
        text: scene.voiceText,
      },
    });
  }

  // Caption Track
  const cues =
    captionCues ??
    script.timeline?.captionCues ??
    [];

  const captionClips: TimelineClip[] = cues.map((cue, index) => {
    const start = cue.start;
    const duration = Math.max(0.1, cue.end - cue.start);
    if (cue.end > maxTime) maxTime = cue.end;

    return {
      id: `caption-clip-${index}`,
      trackId: "track-captions",
      trackType: "caption",
      cueIndex: index,
      start,
      duration,
      name: cue.text,
      meta: { text: cue.text },
    };
  });

  // BGM Track
  const bgmClips: TimelineClip[] = [];
  if (script.bgm?.src) {
    bgmClips.push({
      id: "bgm-clip-1",
      trackId: "track-bgm",
      trackType: "bgm",
      start: 0,
      duration: maxTime > 0 ? maxTime : 30,
      name: `BGM: ${script.bgm.src}`,
      meta: {
        volume: script.bgm.volume,
        duck: script.bgm.duck,
      },
    });
  }

  const tracks: TimelineTrack[] = [
    {
      id: "track-scenes",
      type: "scene",
      label: "Visual Scenes",
      clips: sceneClips,
    },
    {
      id: "track-voice",
      type: "voice",
      label: "Voice Track",
      clips: voiceClips,
    },
    {
      id: "track-captions",
      type: "caption",
      label: "Captions",
      clips: captionClips,
    },
    {
      id: "track-bgm",
      type: "bgm",
      label: "Background Music",
      clips: bgmClips,
    },
  ];

  return {
    totalDuration: Math.round(maxTime * 100) / 100,
    fps: 30,
    playhead: 0,
    tracks,
    selectedClipId: null,
    script,
  };
}

export function timelineStateToScript(state: TimelineState): Script {
  const script = JSON.parse(JSON.stringify(state.script)) as Script;
  const scenesTrack = state.tracks.find((t) => t.type === "scene");
  const captionsTrack = state.tracks.find((t) => t.type === "caption");

  if (!script.timeline) {
    script.timeline = {
      scenes: {},
      captionCues: [],
    };
  }

  if (scenesTrack) {
    const scenesTiming: Record<string, { start: number; duration: number; trimIn?: number; trimOut?: number }> = {};
    for (const clip of scenesTrack.clips) {
      if (clip.sceneId) {
        scenesTiming[clip.sceneId] = {
          start: Math.round(clip.start * 1000) / 1000,
          duration: Math.round(clip.duration * 1000) / 1000,
          trimIn: clip.offset ?? 0,
        };
      }
    }
    script.timeline.scenes = scenesTiming;
  }

  if (captionsTrack) {
    script.timeline.captionCues = captionsTrack.clips.map((clip) => ({
      start: Math.round(clip.start * 1000) / 1000,
      end: Math.round((clip.start + clip.duration) * 1000) / 1000,
      text: (clip.meta?.text as string) ?? clip.name,
    }));
  }

  return script;
}
