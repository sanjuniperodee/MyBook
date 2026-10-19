"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/i18n/config";
import { apiFetch } from "@/lib/client-api";
import { checkRules, fixSafe } from "@/lib/proofread/rules";
import { spellCandidates, spellIssues, wordsToCheck } from "@/lib/proofread/spelling";
import { applyIssue, shiftByEdit, shiftIssues, withoutOverlaps, type Issue } from "@/lib/proofread/types";

export type AiState = "idle" | "checking" | "done" | "error";

interface Ignored {
  words: string[];
  keys: string[];
}

const storageKey = (bookId: string) => `mb-proof:${bookId}`;

function loadIgnored(bookId: string): Ignored {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey(bookId)) ?? "null") as Ignored | null;
    if (v && Array.isArray(v.words) && Array.isArray(v.keys)) return v;
  } catch {}
  return { words: [], keys: [] };
}

/**
 * Проверка текста ответа «как Grammarly»: правила (мгновенно, в браузере), словарь (русские книги, через сервер)
 * и AI-корректор (по кнопке). Пропущенные замечания и слова «в словарь» запоминаются для всей книги в этом браузере.
 * Результаты AI привязаны к вопросу: при наборе сдвигаются, при возврате к вопросу с тем же текстом — восстанавливаются.
 */
export function useProofread({
  bookId,
  docId,
  text,
  language,
  ui,
  names,
  enabled,
}: {
  bookId: string;
  /** Вопрос, к которому относится текст. */
  docId: string;
  text: string;
  language: Locale;
  /** Язык интерфейса — на нём AI пишет пояснения. */
  ui: Locale;
  /** Имена из книги: словарь их не отмечает. */
  names: string[];
  enabled: boolean;
}) {
  const [ignored, setIgnored] = useState<Ignored>({ words: [], keys: [] });
  useEffect(() => {
    // Список пропущенного хранится в браузере
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIgnored(loadIgnored(bookId));
  }, [bookId]);
  const saveIgnored = (next: Ignored) => {
    setIgnored(next);
    try {
      localStorage.setItem(storageKey(bookId), JSON.stringify(next));
    } catch {}
  };

  // ── словарь: слово → null (верное) или варианты исправления ──
  const [known, setKnown] = useState<Map<string, string[] | null>>(() => new Map());
  const skipWord = useMemo(() => {
    const set = new Set([...ignored.words, ...names.flatMap((n) => n.toLowerCase().split(/\s+/))]);
    return (w: string) => set.has(w);
  }, [ignored.words, names]);
  const candidates = useMemo(() => (enabled && language === "ru" ? spellCandidates(text, skipWord) : []), [enabled, language, text, skipWord]);
  useEffect(() => {
    const words = wordsToCheck(candidates, known);
    if (!words.length) return;
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<{ wrong: Record<string, string[]> }>(`/api/books/${bookId}/proofread/spell`, { method: "POST", json: { words } });
        setKnown((prev) => {
          const next = new Map(prev);
          for (const w of words) next.set(w, res.wrong[w] ?? null);
          return next;
        });
      } catch {
        // Словарь недоступен — остаются правила; повторим при следующей правке.
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [candidates, known, bookId]);

  // ── AI-корректор ──
  type Saved = Record<string, { text: string; issues: Issue[] }>;
  const [ai, setAi] = useState<{ docId: string; text: string; issues: Issue[]; state: AiState; saved: Saved }>({ docId, text, issues: [], state: "idle", saved: {} });
  // Следим за текстом: правка сдвигает замечания AI, переход к другому вопросу — сохраняет и восстанавливает их.
  if (ai.docId !== docId) {
    const saved: Saved = ai.state === "done" ? { ...ai.saved, [ai.docId]: { text: ai.text, issues: ai.issues } } : ai.saved;
    const back = saved[docId];
    setAi(back && back.text === text ? { docId, text, issues: back.issues, state: "done", saved } : { docId, text, issues: [], state: "idle", saved });
  } else if (ai.text !== text) {
    setAi({ ...ai, text, issues: shiftIssues(ai.issues, ai.text, text) });
  }

  const runAi = useCallback(async () => {
    const sent = text;
    const forDoc = docId;
    setAi((a) => ({ ...a, state: "checking" }));
    try {
      const res = await apiFetch<{ issues: Issue[] }>(`/api/books/${bookId}/proofread/ai`, { method: "POST", json: { text: sent, ui } });
      setAi((a) => (a.docId !== forDoc ? a : { ...a, issues: shiftIssues(res.issues, sent, a.text), state: "done" }));
      return res.issues.length;
    } catch (e) {
      setAi((a) => (a.docId !== forDoc ? a : { ...a, state: "error" }));
      throw e;
    }
  }, [bookId, docId, text, ui]);

  // ── все замечания ──
  const issues = useMemo(() => {
    if (!enabled || !text.trim()) return [];
    const skip = new Set(ignored.keys);
    const list = [...spellIssues(candidates, known), ...(ai.docId === docId ? ai.issues : []), ...checkRules(text, language)];
    return withoutOverlaps(list.filter((i) => !skip.has(i.key)));
  }, [enabled, text, known, ignored.keys, candidates, ai, docId, language]);

  const skipKey = useMemo(() => new Set(ignored.keys), [ignored.keys]);

  return {
    issues,
    aiState: ai.docId === docId ? ai.state : "idle",
    runAi,
    /** Текст после замены. */
    apply: (issue: Issue, replacement: string) => applyIssue(text, issue, replacement),
    ignore: (issue: Issue) => saveIgnored({ ...ignored, keys: [...new Set([...ignored.keys, issue.key])].slice(-500) }),
    addWord: (word: string) => saveIgnored({ ...ignored, words: [...new Set([...ignored.words, word.toLowerCase()])].slice(-1000) }),
    /** Сколько безопасных правок оформления можно применить разом. */
    safeCount: issues.filter((i) => i.source === "rules" && i.safe).length,
    /** Текст со всеми безопасными правками оформления (замечания AI сдвигаются по каждой правке, а не теряются). */
    fixAll: () => {
      let aiIssues = ai.docId === docId ? ai.issues : [];
      const next = fixSafe(text, language, (i) => skipKey.has(i.key), (start, end, r) => (aiIssues = shiftByEdit(aiIssues, start, end, r.length)));
      if (ai.docId === docId) setAi({ ...ai, text: next, issues: aiIssues });
      return next;
    },
  };
}
