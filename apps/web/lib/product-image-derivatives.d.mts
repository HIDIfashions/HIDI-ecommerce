export type ProductDerivative = {
  width: number;
  key: string;
  format: "webp";
  contentType: "image/webp";
  bytes: Buffer;
};
export function renderProductDerivatives(originalKey: string, sourcePath: string): Promise<ProductDerivative[]>;
