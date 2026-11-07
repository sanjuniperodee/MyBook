import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Одинаковые вложения WhatsApp в каталоге шлюза — жёсткие ссылки на один файл.
 *
 * Менеджеры шлют с телефона магазина одни и те же фото и видео (примеры книг) каждому клиенту, а шлюз скачивает
 * каждую копию в свой файл (`statics/media/<время>-<uuid>.<расширение>`): за сутки это ~0,5 ГБ, из них больше половины —
 * копии. Проход группирует файлы по размеру, у групп с несколькими разными файлами считает SHA-256 (один раз на файл,
 * кэш в памяти процесса) и заменяет копии жёсткими ссылками на один файл: путь каждого сообщения остаётся прежним,
 * для шлюза и CRM это обычные файлы, место на диске занимает одна копия.
 *
 * Не трогает: файлы моложе minAgeMs (шлюз может его ещё писать), меньше minSize и то, что уже ссылается на тот же файл.
 * Замена атомарная: ссылка создаётся рядом под временным именем и переименовывается поверх копии.
 */
export interface DedupResult {
  /** Сколько файлов просмотрено. */
  files: number;
  /** Сколько копий заменено ссылками. */
  linked: number;
  /** Сколько байт освобождено. */
  freed: number;
}

interface Entry {
  path: string;
  size: number;
  ino: number;
  nlink: number;
  mtimeMs: number;
}

const TMP_SUFFIX = ".dedup-tmp";

export class MediaDedup {
  /** «inode:размер:mtime» → SHA-256: файл шлюза не меняется, хэш считается один раз за жизнь процесса. */
  private readonly hashes = new Map<string, string>();

  constructor(
    private readonly dir: string,
    private readonly opts: { minSize?: number; minAgeMs?: number; now?: () => number } = {},
  ) {}

  async sweep(): Promise<DedupResult> {
    const minSize = this.opts.minSize ?? 1024;
    const minAgeMs = this.opts.minAgeMs ?? 60_000;
    const now = (this.opts.now ?? Date.now)();
    const entries = await this.walk(this.dir, now - minAgeMs);
    const result: DedupResult = { files: entries.length, linked: 0, freed: 0 };

    const bySize = new Map<number, Entry[]>();
    for (const e of entries) {
      if (e.size < minSize || now - e.mtimeMs < minAgeMs) continue;
      let group = bySize.get(e.size);
      if (!group) bySize.set(e.size, (group = []));
      group.push(e);
    }

    const seen = new Set<string>();
    for (const group of bySize.values()) {
      // Разные файлы одного размера: один представитель на inode (ссылки на один файл уже склеены).
      const byInode = new Map<number, Entry[]>();
      for (const e of group) {
        let same = byInode.get(e.ino);
        if (!same) byInode.set(e.ino, (same = []));
        same.push(e);
      }
      if (byInode.size < 2) continue;
      const byHash = new Map<string, Entry[][]>();
      for (const same of byInode.values()) {
        const rep = same[0];
        const key = `${rep.ino}:${rep.size}:${rep.mtimeMs}`;
        seen.add(key);
        let hash = this.hashes.get(key);
        if (!hash) {
          hash = await sha256(rep.path).catch(() => "");
          if (!hash) continue;
          this.hashes.set(key, hash);
        }
        let inodes = byHash.get(hash);
        if (!inodes) byHash.set(hash, (inodes = []));
        inodes.push(same);
      }
      for (const inodes of byHash.values()) {
        if (inodes.length < 2) continue;
        // Оставляем файл, на который ссылок уже больше всего, при равенстве — самый старый.
        inodes.sort((a, b) => b[0].nlink - a[0].nlink || a[0].mtimeMs - b[0].mtimeMs);
        const canonical = inodes[0][0];
        for (const same of inodes.slice(1)) {
          let replaced = 0;
          for (const copy of same) {
            try {
              await replaceWithLink(canonical.path, copy.path);
            } catch {
              continue; // файл уже удалён чисткой — следующий проход
            }
            replaced++;
          }
          result.linked += replaced;
          // Место освобождается, когда у копии не остаётся имён: все они теперь ссылаются на canonical.
          if (replaced === same.length) result.freed += same[0].size;
        }
      }
    }
    for (const key of this.hashes.keys()) if (!seen.has(key)) this.hashes.delete(key);
    return result;
  }

  /** Все файлы каталога (шлюз кладёт вложения и в подпапки <номер>/<дата>/); брошенные временные ссылки — удаляются. */
  private async walk(dir: string, staleBefore: number): Promise<Entry[]> {
    const out: Entry[] = [];
    const names = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const d of names) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) {
        out.push(...(await this.walk(p, staleBefore)));
        continue;
      }
      if (!d.isFile()) continue;
      const s = await stat(p).catch(() => null);
      if (!s) continue;
      if (d.name.endsWith(TMP_SUFFIX)) {
        if (s.mtimeMs < staleBefore) await unlink(p).catch(() => {});
        continue;
      }
      out.push({ path: p, size: s.size, ino: s.ino, nlink: s.nlink, mtimeMs: s.mtimeMs });
    }
    return out;
  }
}

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("error", reject)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")));
  });
}

/** Копия становится ещё одним именем canonical: ссылка под временным именем, затем атомарное переименование поверх. */
async function replaceWithLink(canonical: string, copy: string) {
  const tmp = `${copy}${TMP_SUFFIX}`;
  await link(canonical, tmp);
  try {
    await rename(tmp, copy);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}
