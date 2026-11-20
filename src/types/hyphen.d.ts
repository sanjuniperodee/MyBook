declare module "hyphen/ru/index.js" {
  const hyphen: {
    hyphenateSync(text: string, options?: { hyphenChar?: string; minWordLength?: number }): string;
  };
  export default hyphen;
}

declare module "hyphen/en-us/index.js" {
  const hyphen: {
    hyphenateSync(text: string, options?: { hyphenChar?: string; minWordLength?: number }): string;
  };
  export default hyphen;
}
