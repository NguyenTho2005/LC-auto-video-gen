import { z } from "zod";

// ── Template data shapes (discriminated by template field) ─────────────────

const HookData = z.object({
  template: z.literal("hook"),
  headline: z.string().min(1).max(40),
  subhead: z.string().max(40).optional(),
  /** background image path (literal "$source.image" → substituted at pipeline level) */
  bgSrc: z.string().optional(),
  /** Ken Burns effect class */
  kenBurns: z.enum(["zoom-in", "zoom-out", "pan-left", "pan-right"]).default("zoom-in"),
});

const ComparisonSide = z.object({
  label: z.string().min(1).max(30),
  value: z.string().min(1).max(20),
  color: z.enum(["cyan", "purple"]),
});

const ComparisonData = z.object({
  template: z.literal("comparison"),
  left: ComparisonSide,
  right: ComparisonSide.extend({ winner: z.boolean().optional() }),
});

const StatHeroData = z.object({
  template: z.literal("stat-hero"),
  value: z.string().min(1).max(20),
  label: z.string().min(1).max(40),
  context: z.string().max(50).optional(),
});

const FeatureListData = z.object({
  template: z.literal("feature-list"),
  title: z.string().min(1).max(40),
  bullets: z.array(z.string().min(1).max(50)).min(1).max(4),
  icon: z.string().optional(),
});

const CalloutData = z.object({
  template: z.literal("callout"),
  statement: z.string().min(1).max(80),
  tag: z.string().max(20).optional(),
});

const OutroData = z.object({
  template: z.literal("outro"),
  ctaTop: z.string().min(1).max(30),
  channelName: z.string().min(1).max(30),
  source: z.string().min(1).max(40),
});

// ── Review Templates (M3) ──────────────────────────────────────────────────
const SpecItem = z.object({
  label: z.string().min(1).max(30),
  value: z.string().min(1).max(40),
});

const SpecTableData = z.object({
  template: z.literal("spec-table"),
  productName: z.string().min(1).max(40),
  specs: z.array(SpecItem).min(1).max(6),
});

const ProsConsData = z.object({
  template: z.literal("pros-cons"),
  title: z.string().min(1).max(40).optional(),
  pros: z.array(z.string().min(1).max(50)).min(1).max(4),
  cons: z.array(z.string().min(1).max(50)).min(1).max(4),
});

const VerdictScoreData = z.object({
  template: z.literal("verdict-score"),
  productName: z.string().min(1).max(40),
  score: z.number().min(0).max(100),
  scale: z.enum(["10", "100"]).default("10"),
  verdict: z.string().min(1).max(30),
  summary: z.string().min(1).max(80),
});

const PriceTagData = z.object({
  template: z.literal("price-tag"),
  productName: z.string().min(1).max(40),
  price: z.string().min(1).max(30),
  variant: z.string().max(40).optional(),
  note: z.string().max(50).optional(),
});

const GalleryImage = z.object({
  src: z.string().min(1),
  caption: z.string().max(40).optional(),
});

const ImageGalleryData = z.object({
  template: z.literal("image-gallery"),
  title: z.string().min(1).max(40).optional(),
  images: z.array(GalleryImage).min(1).max(3),
});

const PhoneMockupData = z.object({
  template: z.literal("phone-mockup"),
  title: z.string().min(1).max(40).optional(),
  screenSrc: z.string().min(1),
  caption: z.string().max(50).optional(),
});

export const TemplateData = z.discriminatedUnion("template", [
  HookData,
  ComparisonData,
  StatHeroData,
  FeatureListData,
  CalloutData,
  OutroData,
  SpecTableData,
  ProsConsData,
  VerdictScoreData,
  PriceTagData,
  ImageGalleryData,
  PhoneMockupData,
]);

export type TemplateDataType = z.infer<typeof TemplateData>;

// ── SFX schema ─────────────────────────────────────────────────────────────
/**
 * Per-scene sound effect override. If omitted, the pipeline picks a default
 * SFX based on the template type (see SKILL.md / pipeline DEFAULT_SFX).
 *
 * `name` examples: "transition/whoosh-soft", "emphasis/ding", "alert/notification"
 *   → resolves to assets/sfx/<name>.mp3
 * Set `name: "none"` to explicitly disable SFX for this scene.
 */
const SfxSpec = z.object({
  name: z.string().min(1),
  /** Volume 0–1, default 0.4 (so SFX doesn't drown the voice) */
  volume: z.number().min(0).max(1).default(0.4),
  /** Seconds offset from scene start (default 0). Negative = before scene. */
  startOffsetSec: z.number().default(0),
});

export type SfxSpecType = z.infer<typeof SfxSpec>;

// ── Media schema (M2) ──────────────────────────────────────────────────────
export const MediaSpec = z.object({
  type: z.enum(["image", "video", "screenshot"]),
  src: z.string().min(1),
  fit: z.enum(["cover", "contain"]).default("cover"),
  fx: z.enum(["none", "kenburns"]).default("kenburns"),
  credit: z.string().optional(),
  license: z.string().optional(),
});

export type MediaSpecType = z.infer<typeof MediaSpec>;

// ── Scene schema ───────────────────────────────────────────────────────────

const Scene = z.object({
  id: z.string().min(1),
  type: z.enum(["hook", "body", "outro"]),
  voiceText: z.string().min(1),
  templateData: TemplateData,
  /** Optional sound effect override (else pipeline picks per template) */
  sfx: SfxSpec.optional(),
  /** Optional media asset (image/video/screenshot) for this scene (M2) */
  media: MediaSpec.optional(),
});

// ── Caption schema (M1) ────────────────────────────────────────────────────
export const CaptionOptions = z.object({
  enabled: z.boolean().default(true),
  style: z.enum(["tiktok-bold", "classic-sub", "minimal"]).default("tiktok-bold"),
});

export type CaptionOptionsType = z.infer<typeof CaptionOptions>;

// ── Root schema ────────────────────────────────────────────────────────────

export const ScriptSchema = z.object({
  version: z.string().optional(),
  schemaVersion: z.union([z.literal(1), z.literal(2)]).optional(),
  captions: CaptionOptions.optional(),
  metadata: z.object({
    title: z.string().min(1),
    source: z.object({
      url: z.string(),
      domain: z.string(),
      image: z.string().url().nullable(),
    }),
    channel: z.string().min(1),
    /** Explicit flag to allow using og:image (default false) */
    useOgImage: z.boolean().optional(),
  }),
  voice: z.object({
    provider: z.string().min(1),
    voiceId: z.string().min(1),
    speed: z.number().min(0.5).max(2.0),
  }),
  scenes: z
    .array(Scene)
    .min(5)
    .max(8, "scenes must have at most 8 items")
    .refine(
      (s) => s[0]?.type === "hook",
      { message: "scenes[0] must be type=hook" }
    )
    .refine(
      (s) => s[s.length - 1]?.type === "outro",
      { message: "last scene must be type=outro" }
    ),
});

export type Script = z.infer<typeof ScriptSchema>;
