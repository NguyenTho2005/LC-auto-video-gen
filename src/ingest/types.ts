export interface FeedSource {
  id: string;
  name: string;
  url: string;
  category?: string;
  enabled: boolean;
}

export interface FeedItem {
  guid: string;
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  sourceName?: string;
  domain?: string;
}

export interface BatchJob {
  id: string;
  item: FeedItem;
  status: "pending" | "running" | "completed" | "failed";
  error?: string;
  outputDir?: string;
  scriptPath?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface BatchQueueResult {
  total: number;
  completed: number;
  failed: number;
  jobs: BatchJob[];
}

export interface PublishChecklistOptions {
  channelName?: string;
  hashtags?: string[];
  suggestedTitle?: string;
  sourceUrl?: string;
  sourceName?: string;
  aiGeneratedLabelRequired?: boolean;
}
