// Minimal ambient typing for the one Node API the validation report writer uses.
// The repo does not depend on @types/node (the app is browser-only); if it is
// added later this declaration simply merges with the real one.
declare module 'node:fs' {
  export function writeFileSync(path: string | URL, data: string, encoding?: 'utf8'): void;
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
}
