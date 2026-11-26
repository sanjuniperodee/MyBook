// Тесты по умолчанию изображают сайт с БД (двойники container()): без DATABASE_URL webApiOnly() увёл бы страницы и
// server actions в HTTP к mybook-api (ADR 0012, A5). Режим «без БД» тесты включают сами: vi.stubEnv("DATABASE_URL", "").
process.env.DATABASE_URL ??= "postgres://test/mybook";
