import type { Script, TimelineSpecType } from "../render/script-schema.js";

/**
 * Ước tính thời lượng nói (giây) dựa trên số từ nếu chưa có file audio thật
 * Tốc độ nói tiếng Việt tự nhiên ~ 3.0 - 3.5 từ/giây (lấy trung bình 3.2) + 0.3s pause/transition
 */
export function estimateVoiceDuration(text: string, speed: number = 1.0): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const rawDuration = words / (3.2 * Math.max(0.5, Math.min(2.0, speed)));
  return Math.max(1.5, Math.round((rawDuration + 0.3) * 100) / 100);
}

/**
 * Chuyển đổi kịch bản v1 sang v2 (thêm schemaVersion: 2 và khối timeline)
 * Hàm thuần, không đột biến đối tượng đầu vào.
 */
export function migrateV1toV2(
  scriptV1: Script,
  audioDurations?: Record<string, number>
): Script {
  const isV2 = scriptV1.schemaVersion === 2 && scriptV1.timeline !== undefined;
  if (isV2) {
    return JSON.parse(JSON.stringify(scriptV1));
  }

  const speed = scriptV1.voice?.speed ?? 1.0;
  const scenesTiming: Record<
    string,
    { start: number; duration: number; trimIn?: number; trimOut?: number }
  > = {};

  let currentStart = 0;
  for (const scene of scriptV1.scenes) {
    const duration =
      audioDurations?.[scene.id] ??
      estimateVoiceDuration(scene.voiceText, speed);

    scenesTiming[scene.id] = {
      start: Math.round(currentStart * 1000) / 1000,
      duration: Math.round(duration * 1000) / 1000,
      trimIn: 0,
      trimOut: 0,
    };

    currentStart += duration;
  }

  const upgradedTimeline: TimelineSpecType = {
    scenes: scenesTiming,
    captionCues: scriptV1.timeline?.captionCues ?? [],
  };

  return {
    ...JSON.parse(JSON.stringify(scriptV1)),
    schemaVersion: 2,
    timeline: upgradedTimeline,
  };
}
