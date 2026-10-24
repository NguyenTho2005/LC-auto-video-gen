import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { ScriptSchema, type Script } from "../render/script-schema.js";
import {
  migrateV1toV2,
  estimateVoiceDuration,
  buildTimelineState,
  timelineStateToScript,
  TimelineHistoryManager,
  MoveClipCommand,
  TrimClipCommand,
  SplitClipCommand,
  RippleDeleteCommand,
  EditCueCommand,
  UpdateSceneVoiceTextCommand,
  SetBgmCommand,
  MIN_CLIP_DURATION,
} from "./index.js";

describe("Timeline Module (M6)", () => {
  const sampleV1Path = resolve("tests/fixtures/sample-script-no-image.json");
  const rawV1 = JSON.parse(readFileSync(sampleV1Path, "utf-8"));
  const sampleV1: Script = ScriptSchema.parse(rawV1);

  describe("migrateV1toV2", () => {
    it("nâng cấp script v1 sang v2 có khối timeline và schemaVersion: 2", () => {
      const v2 = migrateV1toV2(sampleV1);
      expect(v2.schemaVersion).toBe(2);
      expect(v2.timeline).toBeDefined();
      expect(v2.timeline?.scenes).toBeDefined();
      expect(Object.keys(v2.timeline!.scenes!)).toEqual(
        sampleV1.scenes.map((s) => s.id)
      );

      // Tương thích ngược: schema parse thành công
      const parsed = ScriptSchema.parse(v2);
      expect(parsed.schemaVersion).toBe(2);
    });

    it("sử dụng audioDurations thật nếu được cung cấp", () => {
      const audioDurations = {
        hook: 4.5,
        "body-1": 6.2,
      };
      const v2 = migrateV1toV2(sampleV1, audioDurations);
      expect(v2.timeline?.scenes?.hook?.duration).toBe(4.5);
      expect(v2.timeline?.scenes?.hook?.start).toBe(0);
      expect(v2.timeline?.scenes?.["body-1"]?.duration).toBe(6.2);
      expect(v2.timeline?.scenes?.["body-1"]?.start).toBe(4.5);
    });

    it("tính thời lượng dựa trên số từ nếu chưa có audioDurations", () => {
      const est = estimateVoiceDuration("Xin chào các bạn đây là bài test", 1.0);
      expect(est).toBeGreaterThanOrEqual(1.5);
    });

    it("không biến đổi script nếu đã là v2", () => {
      const v2 = migrateV1toV2(sampleV1);
      const v2Again = migrateV1toV2(v2);
      expect(v2Again).toEqual(v2);
    });
  });

  describe("buildTimelineState & timelineStateToScript", () => {
    it("dựng state timeline với 4 track chuẩn (scene, voice, caption, bgm)", () => {
      const state = buildTimelineState(sampleV1, undefined, [
        { start: 0.5, end: 1.5, text: "Việt Nam" },
        { start: 1.6, end: 3.0, text: "phóng vệ tinh" },
      ]);

      expect(state.tracks.length).toBe(4);
      expect(state.tracks.map((t) => t.type)).toEqual([
        "scene",
        "voice",
        "caption",
        "bgm",
      ]);

      const sceneTrack = state.tracks.find((t) => t.type === "scene");
      expect(sceneTrack?.clips.length).toBe(sampleV1.scenes.length);

      const captionTrack = state.tracks.find((t) => t.type === "caption");
      expect(captionTrack?.clips.length).toBe(2);

      // Chuyển ngược lại script
      const scriptBack = timelineStateToScript(state);
      expect(scriptBack.schemaVersion).toBe(2);
      expect(scriptBack.timeline?.captionCues?.length).toBe(2);
    });
  });

  describe("Commands & Constraints", () => {
    it("MoveClipCommand di chuyển clip và hỗ trợ Snap", () => {
      const state = buildTimelineState(sampleV1, {
        hook: 3.0,
        "body-1": 4.0,
        "body-2": 5.0,
      });

      // Clip 1: [0 -> 3], Clip 2: [3 -> 7], Clip 3: [7 -> 12]
      // Thử move clip 1 sang vị trí gần 0.05s -> tự động snap về 0s
      const cmd = new MoveClipCommand("scene-clip-hook", 0.05, true);
      const next = cmd.execute(state);
      const clip1 = next.tracks[0].clips.find((c) => c.id === "scene-clip-hook");
      expect(clip1?.start).toBe(0);

      // Thử move clip 1 đè lên clip 2 -> ném lỗi overlap
      const invalidCmd = new MoveClipCommand("scene-clip-hook", 2.0, false);
      expect(() => invalidCmd.execute(state)).toThrow(/overlap/i);
    });

    it("TrimClipCommand chặn clip duration < 0.2s và kiểm tra va chạm", () => {
      const state = buildTimelineState(sampleV1, {
        hook: 3.0,
        "body-1": 4.0,
      });

      const trimCmd = new TrimClipCommand("scene-clip-hook", 2.5);
      const next = trimCmd.execute(state);
      const clip1 = next.tracks[0].clips.find((c) => c.id === "scene-clip-hook");
      expect(clip1?.duration).toBe(2.5);

      // Duration < 0.2s -> ném lỗi
      const invalidTrim = new TrimClipCommand("scene-clip-hook", 0.1);
      expect(() => invalidTrim.execute(state)).toThrow(/below minimum/i);
    });

    it("SplitClipCommand tách clip thành 2 phần và có thể Undo", () => {
      const state = buildTimelineState(sampleV1, {
        hook: 4.0,
      });

      const splitCmd = new SplitClipCommand("scene-clip-hook", 2.0);
      const next = splitCmd.execute(state);

      const sceneTrack = next.tracks[0];
      expect(sceneTrack.clips.length).toBe(sampleV1.scenes.length + 1);

      const part1 = sceneTrack.clips.find((c) => c.id === "scene-clip-hook");
      expect(part1?.duration).toBe(2.0);

      // Undo phục hồi clip nguyên vẹn
      const undone = splitCmd.undo(next);
      const originalTrack = undone.tracks[0];
      expect(originalTrack.clips.length).toBe(sampleV1.scenes.length);
      const restored = originalTrack.clips.find((c) => c.id === "scene-clip-hook");
      expect(restored?.duration).toBe(4.0);
    });

    it("RippleDeleteCommand xoá clip và dồn các clip phía sau sang trái", () => {
      const state = buildTimelineState(sampleV1, {
        hook: 3.0,
        "body-1": 4.0,
        "body-2": 5.0,
      });

      // Ban đầu: hook [0-3], body-1 [3-7], body-2 [7-12]
      const rippleCmd = new RippleDeleteCommand("scene-clip-body-1");
      const next = rippleCmd.execute(state);

      const sceneTrack = next.tracks[0];
      expect(sceneTrack.clips.find((c) => c.id === "scene-clip-body-1")).toBeUndefined();

      // body-2 trước đó bắt đầu lúc 7s, sau khi xoá body-1 (duration 4s) thì phải bắt đầu lúc 3s
      const body2 = sceneTrack.clips.find((c) => c.id === "scene-clip-body-2");
      expect(body2?.start).toBe(3.0);

      // Undo phục hồi
      const undone = rippleCmd.undo(next);
      const restoredTrack = undone.tracks[0];
      expect(restoredTrack.clips.find((c) => c.id === "scene-clip-body-1")).toBeDefined();
      const restoredBody2 = restoredTrack.clips.find((c) => c.id === "scene-clip-body-2");
      expect(restoredBody2?.start).toBe(7.0);
    });

    it("EditCueCommand cập nhật text và timing của caption", () => {
      const state = buildTimelineState(sampleV1, undefined, [
        { start: 0, end: 2, text: "Gốc" },
      ]);

      const editCmd = new EditCueCommand(0, "Cập nhật mới", 0.5, 2.5);
      const next = editCmd.execute(state);

      const capTrack = next.tracks.find((t) => t.type === "caption");
      expect(capTrack?.clips[0].name).toBe("Cập nhật mới");
      expect(capTrack?.clips[0].start).toBe(0.5);
      expect(capTrack?.clips[0].duration).toBe(2.5);

      // Undo
      const undone = editCmd.undo(next);
      const undoneCap = undone.tracks.find((t) => t.type === "caption");
      expect(undoneCap?.clips[0].name).toBe("Gốc");
      expect(undoneCap?.clips[0].start).toBe(0);
    });

    it("SetBgmCommand cập nhật thông số BGM", () => {
      const state = buildTimelineState(sampleV1);
      const bgmCmd = new SetBgmCommand("assets/bgm/custom.mp3", 0.25, false);
      const next = bgmCmd.execute(state);

      expect(next.script.bgm?.src).toBe("assets/bgm/custom.mp3");
      expect(next.script.bgm?.volume).toBe(0.25);
      expect(next.script.bgm?.duck).toBe(false);

      const undone = bgmCmd.undo(next);
      expect(undone.script.bgm?.src).toBe(sampleV1.bgm?.src);
    });

    it("UpdateSceneVoiceTextCommand cập nhật kịch bản giọng đọc", () => {
      const state = buildTimelineState(sampleV1);
      const updateCmd = new UpdateSceneVoiceTextCommand(
        "hook",
        "Câu chào đầu tiên đã được cập nhật"
      );
      const next = updateCmd.execute(state);

      expect(next.script.scenes[0].voiceText).toBe(
        "Câu chào đầu tiên đã được cập nhật"
      );

      const undone = updateCmd.undo(next);
      expect(undone.script.scenes[0].voiceText).toBe(
        sampleV1.scenes[0].voiceText
      );
    });
  });

  describe("TimelineHistoryManager", () => {
    it("quản lý Undo / Redo theo chuỗi lệnh tuần tự", () => {
      const state = buildTimelineState(sampleV1, {
        hook: 3.0,
        "body-1": 4.0,
      });

      const manager = new TimelineHistoryManager(state);
      expect(manager.canUndo()).toBe(false);
      expect(manager.canRedo()).toBe(false);

      // 1. Thực hiện lệnh Trim
      manager.execute(new TrimClipCommand("scene-clip-hook", 2.0));
      expect(manager.canUndo()).toBe(true);
      expect(manager.canRedo()).toBe(false);
      expect(
        manager.getState().tracks[0].clips.find((c) => c.id === "scene-clip-hook")?.duration
      ).toBe(2.0);

      // 2. Thực hiện lệnh Update Voice Text
      manager.execute(
        new UpdateSceneVoiceTextCommand("hook", "Nội dung mới cho scene 1")
      );
      expect(manager.getState().script.scenes[0].voiceText).toBe(
        "Nội dung mới cho scene 1"
      );

      // 3. Undo lệnh Update Voice Text
      expect(manager.undo()).toBe(true);
      expect(manager.getState().script.scenes[0].voiceText).toBe(
        sampleV1.scenes[0].voiceText
      );
      expect(manager.canRedo()).toBe(true);

      // 4. Undo tiếp lệnh Trim
      expect(manager.undo()).toBe(true);
      expect(
        manager.getState().tracks[0].clips.find((c) => c.id === "scene-clip-hook")?.duration
      ).toBe(3.0);

      // 5. Redo lệnh Trim
      expect(manager.redo()).toBe(true);
      expect(
        manager.getState().tracks[0].clips.find((c) => c.id === "scene-clip-hook")?.duration
      ).toBe(2.0);

      // 6. Redo tiếp lệnh Update Voice Text
      expect(manager.redo()).toBe(true);
      expect(manager.getState().script.scenes[0].voiceText).toBe(
        "Nội dung mới cho scene 1"
      );
      expect(manager.canRedo()).toBe(false);
    });
  });
});
