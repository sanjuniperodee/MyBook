/** Структурированные данные schema.org. `<` экранируется, чтобы строка из данных не могла закрыть тег script. */
export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
