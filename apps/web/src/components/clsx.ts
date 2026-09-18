export type ClsxValue = string | number | boolean | null | undefined;

export function clsx(...parts: ClsxValue[]): string {
  return parts.filter((p): p is Exclude<ClsxValue, boolean | null | undefined> => typeof p === "string" && p.length > 0).join(" ");
}
