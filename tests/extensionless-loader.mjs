/**
 * Minimal Node ESM loader to support TypeScript-style extensionless relative imports
 * in the emitted `.test-dist` JavaScript (e.g. `../src/config_schema` -> `../src/config_schema.js`).
 *
 * This keeps the repo dependency-free (no vitest/jest) while still running unit tests via `node --test`.
 */

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const isNotFound = err && typeof err === "object" && err.code === "ERR_MODULE_NOT_FOUND";
    const isRelative = typeof specifier === "string" && (specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/"));
    const hasExtension = typeof specifier === "string" && /\.[a-z0-9]+($|\?)/i.test(specifier);

    if (isNotFound && isRelative && !hasExtension) {
      return nextResolve(`${specifier}.js`, context);
    }
    throw err;
  }
}

