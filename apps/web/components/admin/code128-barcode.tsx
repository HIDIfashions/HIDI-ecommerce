import type { SVGProps } from "react";

const PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112",
] as const;

function code128BValues(value: string) {
  const chars = [...value];
  if (!chars.length) throw new Error("Barcode value is required");

  const data = chars.map((char) => {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) {
      throw new Error("Code 128-B supports printable ASCII characters only");
    }
    return code - 32;
  });

  const start = 104;
  const checksum = (start + data.reduce((sum, item, index) => sum + item * (index + 1), 0)) % 103;
  return [start, ...data, checksum, 106];
}

function barcodeGeometry(value: string) {
  const quiet = 10;
  const patterns = code128BValues(value).map((code) => PATTERNS[code]);
  let x = quiet;
  const bars: Array<{ x: number; width: number }> = [];

  for (const pattern of patterns) {
    let black = true;
    for (const widthChar of pattern) {
      const width = Number(widthChar);
      if (black) bars.push({ x, width });
      x += width;
      black = !black;
    }
  }

  return { bars, width: x + quiet };
}

export function Code128Barcode({
  value,
  height = 54,
  className,
  ...props
}: {
  value: string;
  height?: number;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, "children">) {
  const { bars, width } = barcodeGeometry(value);

  return (
    <svg
      {...props}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Barcode ${value}`}
    >
      <rect width={width} height={height} fill="#fff" />
      {bars.map((bar, index) => (
        <rect key={index} x={bar.x} y={0} width={bar.width} height={height} fill="#000" />
      ))}
    </svg>
  );
}
