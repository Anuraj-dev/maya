import { join } from "node:path";

const PACKAGE_ROOT = join(import.meta.dir, "..", "..");

export function docsIndexRoot(): string {
  return process.env.MAYA_DOCS_INDEX_ROOT ?? PACKAGE_ROOT;
}
