declare module "hyphen/ru/index.js" {
  const hyphen: {
    hyphenateSync(text: string, options?: { hyphenChar?: string; minWordLength?: number }): string;
  };
  export default hyphen;
}
