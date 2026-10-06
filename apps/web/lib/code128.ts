export type Code128Bar = { x: number; width: number };
export type Code128Encoding = {
  bars: Code128Bar[];
  width: number;
  height: number;
  checksum: number;
  symbols: number[];
};

// Code 128 module-width patterns for symbols 0–106. The stop symbol has seven
// elements; every other symbol has six. The first element is always a bar.
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
] as const;

const cache = new Map<string, Code128Encoding>();

/** Encode printable ASCII as Code 128 Set B with ten-module quiet zones. */
export function encodeCode128B(rawValue: string): Code128Encoding {
  const value = rawValue.trim();
  const cached = cache.get(value);
  if (cached) return cached;
  if (!value) throw new Error("Barcode value is required.");
  if (value.length > 80 || !/^[\x20-\x7e]+$/.test(value)) {
    throw new Error("Code 128B supports 1–80 printable ASCII characters.");
  }

  const data = Array.from(value, (character) => character.charCodeAt(0) - 32);
  const checksum = (104 + data.reduce((sum, symbol, index) => sum + symbol * (index + 1), 0)) % 103;
  const symbols = [104, ...data, checksum, 106];
  const bars: Code128Bar[] = [];
  const quietZone = 10;
  let x = quietZone;

  for (const symbol of symbols) {
    const pattern = PATTERNS[symbol];
    if (!pattern) throw new Error(`Unsupported Code 128 symbol: ${symbol}.`);
    for (let index = 0; index < pattern.length; index++) {
      const width = Number(pattern[index]);
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    }
  }

  const encoding = { bars, width: x + quietZone, height: 48, checksum, symbols };
  cache.set(value, encoding);
  return encoding;
}
