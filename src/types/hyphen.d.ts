declare module "hyphen/ru" {
  const hyphen: {
    hyphenateSync(text: string, options?: { hyphenChar?: string; minWordLength?: number }): string;
  };
  export default hyphen;
}
