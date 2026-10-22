/** Opaque record ids. The clock lives here, never in the domain module. */

let counter = 0;

export function uid(prefix) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function nowIso() {
  return new Date().toISOString();
}
