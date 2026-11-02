-- Свой текст приглашения близких написать письмо (src/lib/content/letter-invite.ts): вместо «Её получит …», например
-- у книги в память о человеке. У всех книг пусто — приглашение по умолчанию, как раньше.
ALTER TABLE "books" ADD COLUMN "invite_text" text DEFAULT '' NOT NULL;
