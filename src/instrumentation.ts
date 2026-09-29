export async function register() {
  // Условие в таком виде вырезается из edge-сборки вместе с серверными модулями.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}
