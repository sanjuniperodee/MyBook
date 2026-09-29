// Позволяет запускать серверные модули (с `import "server-only"`) из CLI-скриптов.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true, format: "module" };
    return nextResolve(specifier, context);
  },
});
