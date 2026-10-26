export type DetailField = {key:string;label:string;stored:string;group:string;choices:string[];placeholder:string};
export const DETAIL_FIELDS: DetailField[];
export function detailLine(line:string): {key:string;value:string}|null;
export function stripDetailLines(value?:string|null): string;
export function readDetailValues(product:{description?:string|null;shortDescription?:string|null}): Record<string,string>;
