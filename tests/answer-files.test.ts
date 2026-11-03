import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  answerFileToken,
  answerFileUrl,
  canUpload,
  fileKindOf,
  fileQuota,
  formatDuration,
  MAX_FILES_PER_BOOK,
  parseProbe,
  posterArgs,
  targetSize,
  transcodeArgs,
  type ProbeResult,
} from "@/lib/book/answer-files";
import { normalizeMedia, parseMediaUrl } from "@/lib/book/answer-media";

describe("свой файл: что принимаем", () => {
  it("видео и аудио по типу и по расширению; голосовые WhatsApp и записи диктофона — аудио", () => {
    expect(fileKindOf("IMG_0001.MOV", "video/quicktime")).toBe("video");
    expect(fileKindOf("clip.mp4", "")).toBe("video");
    expect(fileKindOf("PTT-20261103-WA0001.opus", "")).toBe("audio");
    expect(fileKindOf("voice.ogg", "audio/ogg; codecs=opus")).toBe("audio");
    expect(fileKindOf("Запись.m4a", "audio/x-m4a")).toBe("audio");
    // Android называет m4a «video/mp4».
    expect(fileKindOf("record.m4a", "video/mp4")).toBe("audio");
    expect(fileKindOf("photo.jpg", "image/jpeg")).toBeNull();
    expect(fileKindOf("doc.pdf", "application/pdf")).toBeNull();
  });

  it("ссылка на страницу файла и токен из неё", () => {
    const url = answerFileUrl("https://mybooks.kz/", "Ab3dE9xK2m");
    expect(url).toBe("https://mybooks.kz/v/Ab3dE9xK2m");
    expect(answerFileToken(url)).toBe("Ab3dE9xK2m");
    expect(answerFileToken("https://youtu.be/dQw4w9WgXcQ")).toBeNull();
    // QR-карточка: ссылка проходит разбор как обычная, площадка — MyBooks.
    expect(parseMediaUrl(url)).toMatchObject({ url, source: "MyBooks", youtubeId: null });
  });

  it("длительность: «3:07», «1:02:05»", () => {
    expect(formatDuration(187)).toBe("3:07");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(0)).toBe("0:00");
  });

  it("карточка своего файла в ответе: вид «аудио» и fileId сохраняются, чужой fileId отбрасывается", () => {
    const fileId = "00000000-0000-4000-8000-000000000001";
    const [a, b] = normalizeMedia([
      { id: "a", kind: "audio", url: "https://mybooks.kz/v/Ab3dE9xK2m", title: "Голос деда", anchor: null, fileId },
      { id: "b", kind: "video", url: "https://mybooks.kz/v/Zz3dE9xK2m", title: "", anchor: 0, fileId: "../etc" },
    ]);
    expect(a).toEqual({ id: "a", kind: "audio", url: "https://mybooks.kz/v/Ab3dE9xK2m", fileId, title: "Голос деда", anchor: null });
    expect(b.fileId).toBeUndefined();
  });
});

describe("минуты книги", () => {
  const q = (usedSec: number, files = 1, paid = 0) => fileQuota({ freeMinutes: 30, paidMinutes: paid, usedSec, files });

  it("свободно = бесплатные + купленные − занятые", () => {
    expect(q(600)).toMatchObject({ minutes: 30, leftSec: 1200 });
    expect(q(2000, 3, 60)).toMatchObject({ minutes: 90, leftSec: 3400 });
    expect(q(5000).leftSec).toBe(0);
  });

  it("проверка до загрузки: число файлов, длина записи, минуты", () => {
    expect(canUpload(q(0), "video", 60)).toBe("ok");
    expect(canUpload(q(0), "video", null)).toBe("ok");
    expect(canUpload(q(0), "video", 11 * 60)).toBe("tooLong");
    expect(canUpload(q(0), "audio", 25 * 60)).toBe("ok");
    expect(canUpload(q(1700), "video", 200)).toBe("quota");
    expect(canUpload(q(1800), "audio", null)).toBe("quota");
    expect(canUpload(q(0, MAX_FILES_PER_BOOK), "audio", 10)).toBe("files");
  });
});

describe("сжатие: размеры и параметры ffmpeg", () => {
  const probe = (p: Partial<ProbeResult>): ProbeResult => ({ durationSec: 30, width: 1920, height: 1080, fps: 30, hasVideo: true, hasAudio: true, audioChannels: 2, ...p });

  it("кадр вписан в 1280×720, вертикальный — в 720×1280; маленький не растягивается", () => {
    expect(targetSize(1920, 1080)).toEqual({ width: 1280, height: 720 });
    expect(targetSize(1080, 1920)).toEqual({ width: 720, height: 1280 });
    expect(targetSize(1440, 1080)).toEqual({ width: 960, height: 720 });
    expect(targetSize(640, 360)).toEqual({ width: 640, height: 360 });
    expect(targetSize(3840, 2160)).toEqual({ width: 1280, height: 720 });
    expect(targetSize(853, 480)).toEqual({ width: 854, height: 480 });
  });

  it("разбор ffprobe: поворот телефона, обложка альбома в mp3 — не видео", () => {
    const phone = parseProbe({
      format: { duration: "12.5" },
      streams: [
        { codec_type: "video", codec_name: "hevc", width: 1920, height: 1080, avg_frame_rate: "60/1", side_data_list: [{ rotation: -90 }] },
        { codec_type: "audio", codec_name: "aac", channels: 2 },
      ],
    });
    expect(phone).toMatchObject({ durationSec: 12.5, width: 1080, height: 1920, fps: 60, hasVideo: true, hasAudio: true });
    const mp3 = parseProbe({ format: { duration: "200" }, streams: [{ codec_type: "audio", codec_name: "mp3", channels: 2 }, { codec_type: "video", codec_name: "mjpeg", disposition: { attached_pic: 1 } }] });
    expect(mp3).toMatchObject({ hasVideo: false, hasAudio: true });
    expect(parseProbe({ format: {}, streams: [] })).toBeNull();
    expect(parseProbe(null)).toBeNull();
  });

  it("видео: H.264 CRF с потолком битрейта, 30 к/с, AAC, быстрый старт, два потока", () => {
    const args = transcodeArgs("video", probe({ fps: 60, audioChannels: 6 }), "in", "out.mp4");
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toBe("scale=1280:720,fps=30,format=yuv420p");
    expect(args).toEqual(expect.arrayContaining(["-c:v", "libx264", "-crf", "26", "-maxrate", "1500k", "-c:a", "aac", "-b:a", "128k", "-ac", "2", "+faststart", "-threads", "2"]));
    expect(args.at(-1)).toBe("out.mp4");
    const silent = transcodeArgs("video", probe({ hasAudio: false }), "in", "out.mp4");
    expect(silent).not.toContain("-c:a");
    expect(silent).not.toContain("0:a:0");
  });

  it("аудио: AAC 128 кбит/с без картинки", () => {
    const args = transcodeArgs("audio", probe({ hasVideo: false, width: null, height: null, audioChannels: 1 }), "in", "out.m4a");
    expect(args).toEqual(expect.arrayContaining(["-vn", "-c:a", "aac", "-b:a", "128k"]));
    expect(args).not.toContain("-ac");
    expect(args).not.toContain("libx264");
  });

  it("обложка: кадр с первой секунды, у коротких — с середины", () => {
    expect(posterArgs("in", "p.jpg", 30)).toEqual(expect.arrayContaining(["-ss", "1.00", "-frames:v", "1"]));
    expect(posterArgs("in", "p.jpg", 0.6)).toContain("0.30");
  });
});

// Настоящий ffmpeg: на сервере и в CI он есть; где нет — проверки пропускаются.
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

describe.skipIf(!hasFfmpeg)("сжатие настоящим ffmpeg", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "answer-files-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const ffprobe = (file: string) => parseProbe(JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]).toString()));
  const codecs = (file: string) =>
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name", "-of", "csv=p=0", file])
      .toString()
      .trim()
      .split(/\s+/);

  it("вертикальное видео 1080×1920 60 к/с → H.264 720×1280 ≤30 к/с + AAC, обложка JPEG", () => {
    const src = path.join(dir, "phone.mov");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=60:duration=3", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", "-y", src]);
    const info = ffprobe(src)!;
    expect(info).toMatchObject({ width: 1080, height: 1920, hasAudio: true });
    const out = path.join(dir, "out.mp4");
    execFileSync("ffmpeg", transcodeArgs("video", info, src, out));
    const done = ffprobe(out)!;
    expect(done).toMatchObject({ width: 720, height: 1280, hasVideo: true, hasAudio: true });
    expect(done.fps).toBeLessThanOrEqual(30.01);
    expect(Math.abs(done.durationSec - 3)).toBeLessThan(0.3);
    expect(codecs(out)).toEqual(["h264", "aac"]);
    const poster = path.join(dir, "poster.jpg");
    execFileSync("ffmpeg", posterArgs(out, poster, done.durationSec));
    expect(codecs(poster)).toEqual(["mjpeg"]);
  });

  it("голосовое Ogg Opus → AAC в M4A", () => {
    const src = path.join(dir, "voice.ogg");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=2", "-c:a", "libopus", "-y", src]);
    const info = ffprobe(src)!;
    expect(info).toMatchObject({ hasVideo: false, hasAudio: true });
    const out = path.join(dir, "voice.m4a");
    execFileSync("ffmpeg", transcodeArgs("audio", info, src, out));
    expect(codecs(out)).toEqual(["aac"]);
  });
});
