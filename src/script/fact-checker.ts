import type { Script, TemplateDataType } from "../render/script-schema.js";
import type { FactCheckResult, FlaggedNumber } from "./types.js";

/**
 * Vietnamese word to number mappings for basic numbers.
 */
const VN_WORDS_TO_NUM: Record<string, string> = {
  "không": "0",
  "một": "1",
  "mốt": "1",
  "hai": "2",
  "ba": "3",
  "bốn": "4",
  "tư": "4",
  "năm": "5",
  "lăm": "5",
  "sáu": "6",
  "bảy": "7",
  "bẩy": "7",
  "tám": "8",
  "chín": "9",
  "mười": "10",
  "trăm": "100",
  "nghìn": "1000",
  "ngàn": "1000",
  "triệu": "1000000",
  "tỷ": "1000000000",
  "tỉ": "1000000000",
};

/**
 * Normalizes text for fact checking by stripping diacritics and non-essential punctuation.
 */
function cleanText(text: string): string {
  return text.toLowerCase().replace(/[,.:;!?'"()/\\]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Extracts numbers from a string, returns raw matched string representations.
 */
export function extractNumbersFromString(text: string): string[] {
  if (!text) return [];

  const found = new Set<string>();

  // 1. Match numeric sequences with decimal or thousands separators: e.g. "82.7", "29.990.000", "200MP", "120Hz"
  const digitRegex = /(?<![0-9])(\d+(?:[.,]\d+)*)/g;
  let digitMatch: RegExpExecArray | null;
  while ((digitMatch = digitRegex.exec(text)) !== null) {
    const cleaned = digitMatch[1].replace(/[.,]$/, "");
    if (cleaned.length > 0) {
      found.add(cleaned);
    }
  }

  // 2. Match spoken decimal expressions: e.g. "năm chấm năm", "tám mươi hai phẩy bảy"
  const spokenDecimalRegex = /([a-zà-ỹ]+)\s+(?:chấm|phẩy)\s+([a-zà-ỹ]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = spokenDecimalRegex.exec(text)) !== null) {
    const intWord = match[1].toLowerCase().trim();
    const decWord = match[2].toLowerCase().trim();
    if (VN_WORDS_TO_NUM[intWord] && VN_WORDS_TO_NUM[decWord]) {
      found.add(`${VN_WORDS_TO_NUM[intWord]}.${VN_WORDS_TO_NUM[decWord]}`);
    }
  }

  return Array.from(found);
}

/**
 * Recursively extracts numbers from templateData.
 */
export function extractNumbersFromTemplateData(td: TemplateDataType): string[] {
  const numbers: string[] = [];

  function traverse(obj: unknown) {
    if (typeof obj === "number") {
      numbers.push(String(obj));
    } else if (typeof obj === "string") {
      numbers.push(...extractNumbersFromString(obj));
    } else if (Array.isArray(obj)) {
      obj.forEach(traverse);
    } else if (obj && typeof obj === "object") {
      Object.values(obj).forEach(traverse);
    }
  }

  traverse(td);
  return Array.from(new Set(numbers));
}

/**
 * Checks if a specific number or its variant exists within source numbers set.
 */
function isNumberInSource(
  numStr: string,
  sourceNumbers: Set<string>,
  sourceNumbersStripped: Set<string>,
  sourceCleanWords: string[],
): boolean {
  // 1. Direct match
  if (sourceNumbers.has(numStr)) return true;

  // 2. Normalized stripped digits (e.g. "29.990.000" matches "29990000")
  const stripped = numStr.replace(/[.,]/g, "");
  if (sourceNumbersStripped.has(stripped)) return true;

  // 3. Decimal separator swap (. <-> ,)
  if (numStr.includes(".") && sourceNumbers.has(numStr.replace(".", ","))) return true;
  if (numStr.includes(",") && sourceNumbers.has(numStr.replace(",", "."))) return true;

  // 4. Convert number to Vietnamese word equivalent for simple digits (0-10)
  for (const [word, digit] of Object.entries(VN_WORDS_TO_NUM)) {
    if (numStr === digit && sourceCleanWords.includes(word)) {
      return true;
    }
  }

  return false;
}

/**
 * Fact-checks all numbers in a script against the original source text.
 */
export function factCheckScript(script: Script, sourceContent: string): FactCheckResult {
  const verified = new Set<string>();
  const flagged: FlaggedNumber[] = [];
  let totalChecked = 0;

  // Extract all numbers present in source content
  const sourceNumList = extractNumbersFromString(sourceContent);
  const sourceNumbers = new Set(sourceNumList);
  const sourceNumbersStripped = new Set(sourceNumList.map((n) => n.replace(/[.,]/g, "")));
  const sourceCleanWords = cleanText(sourceContent).split(" ");

  for (const scene of script.scenes) {
    const sceneNumbers = new Set<string>([
      ...extractNumbersFromString(scene.voiceText),
      ...extractNumbersFromTemplateData(scene.templateData),
    ]);

    for (const num of sceneNumbers) {
      // Ignore common single digits like 0, 1, 2 used for lists or grammatical purposes
      // unless in hook or stat-hero
      if ((num === "1" || num === "2") && scene.type !== "hook" && scene.templateData.template !== "stat-hero") {
        continue;
      }

      totalChecked++;
      if (isNumberInSource(num, sourceNumbers, sourceNumbersStripped, sourceCleanWords)) {
        verified.add(num);
      } else {
        flagged.push({
          sceneId: scene.id,
          number: num,
          context: scene.voiceText.slice(0, 100),
          reason: "not_in_source",
        });
      }
    }
  }

  return {
    verifiedNumbers: Array.from(verified),
    flaggedNumbers: flagged,
    totalChecked,
  };
}
