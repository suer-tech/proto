import React from "react";

/**
 * Форматирует markdown текст протокола в красивые React компоненты
 * Убирает видимые markdown символы и создает читабельное оформление
 */
export function formatProtocolContent(content: string): React.ReactNode {
  if (!content) return null;

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];
  let keyCounter = 0;

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${keyCounter++}`} className="space-y-2 my-4 ml-6">
          {currentList.map((item, idx) => (
            <li key={idx} className="text-slate-700 leading-relaxed flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-1 flex-shrink-0">•</span>
              <span className="flex-1">{formatInlineMarkdown(item)}</span>
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();

    // Пропускаем пустые строки и разделители
    if (!trimmed || trimmed === "---" || /^-{3,}$/.test(trimmed)) {
      flushList();
      if (!trimmed && elements.length > 0) {
        elements.push(<div key={`spacer-${keyCounter++}`} className="h-4" />);
      }
      return;
    }

    // Заголовок H1 (# Заголовок) - ПРОТОКОЛ № …
    if (trimmed.startsWith("# ")) {
      flushList();
      const text = trimmed.substring(2).trim();
      elements.push(
        <h1 key={`h1-${keyCounter++}`} className="text-3xl font-bold text-slate-900 mt-8 mb-6 first:mt-0 text-center border-b-2 border-slate-200 pb-3">
          {formatInlineMarkdown(text)}
        </h1>
      );
      return;
    }

    // Заголовок H2 (## Заголовок) - секции (ПОВЕСТКА:, РАССМОТРЕЛИ:, РЕШИЛИ:)
    if (trimmed.startsWith("## ")) {
      flushList();
      const text = trimmed.substring(3).trim();
      elements.push(
        <h2 key={`h2-${keyCounter++}`} className="text-2xl font-bold text-slate-900 mt-6 mb-4 uppercase tracking-wide">
          {formatInlineMarkdown(text)}
        </h2>
      );
      return;
    }

    // Заголовок H3 (### Заголовок)
    if (trimmed.startsWith("### ")) {
      flushList();
      const text = trimmed.substring(4).trim();
      elements.push(
        <h3 key={`h3-${keyCounter++}`} className="text-xl font-semibold text-slate-800 mt-5 mb-2">
          {formatInlineMarkdown(text)}
        </h3>
      );
      return;
    }

    // Стенограмма с временем и спикером [MM:SS - MM:SS] Спикер X: текст
    const transcriptRegex = /^\[(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\]\s*Спикер\s+([A-Z0-9]+):\s*(.+)$/i;
    const transcriptMatch = trimmed.match(transcriptRegex);
    if (transcriptMatch) {
      flushList();
      const [, startTime, endTime, speaker, text] = transcriptMatch;
      elements.push(
        <div key={`transcript-${keyCounter++}`} className="my-3 p-3 bg-blue-50 border-l-4 border-blue-500 rounded-r">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <span className="text-xs font-mono text-blue-600 bg-blue-100 px-2 py-1 rounded">
                {startTime} - {endTime}
              </span>
            </div>
            <div className="flex-1">
              <span className="font-semibold text-blue-900 mr-2">Спикер {speaker}:</span>
              <span className="text-slate-700">{text}</span>
            </div>
          </div>
        </div>
      );
      return;
    }

    // Нумерованные списки (1., 1.1., 1.2., 2., 2.1. и т.д.)
    const numberedMatch = trimmed.match(/^(\d+(?:\.\d+)*\.)\s*(.+)$/);
    if (numberedMatch) {
      flushList();
      const [, number, text] = numberedMatch;
      const level = (number.match(/\./g) || []).length;
      const indentClass = level === 1 ? "ml-6" : level === 2 ? "ml-12" : "ml-16";
      
      elements.push(
        <p key={`numbered-${keyCounter++}`} className={`text-slate-700 leading-relaxed my-2 text-base ${indentClass}`}>
          <span className="font-semibold text-slate-900">{number}</span> {formatInlineMarkdown(text)}
        </p>
      );
      return;
    }

    // Список (- элемент или • элемент)
    if (trimmed.startsWith("- ") || trimmed.startsWith("•")) {
      const item = trimmed.replace(/^[-•]\s*/, "").trim();
      if (item) {
        currentList.push(item);
      }
      return;
    }

    // Подпункты поручений (Поручение:, Ответственный:, Срок:)
    if (/^(Поручение|Ответственный|Срок|Ответственные|Сроки):/i.test(trimmed)) {
      flushList();
      elements.push(
        <p key={`instruction-${keyCounter++}`} className="text-slate-700 leading-relaxed my-2 text-base ml-12">
          {formatInlineMarkdown(trimmed)}
        </p>
      );
      return;
    }

    // Обычный параграф
    flushList();
    elements.push(
      <p key={`p-${keyCounter++}`} className="text-slate-700 leading-relaxed my-2 text-base">
        {formatInlineMarkdown(trimmed)}
      </p>
    );
  });

  // Не забываем закрыть последний список
  flushList();

  return <div className="space-y-2">{elements}</div>;
}

/**
 * Форматирует inline markdown элементы (жирный, курсив) в React компоненты
 */
function formatInlineMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  const parts: React.ReactNode[] = [];
  let currentIndex = 0;
  let keyCounter = 0;

  // Регулярные выражения для markdown элементов
  const boldRegex = /\*\*(.+?)\*\*/g;
  const italicRegex = /_(.+?)_/g;

  // Находим все совпадения
  const matches: Array<{ start: number; end: number; type: "bold" | "italic"; text: string }> = [];

  let match;
  while ((match = boldRegex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: "bold",
      text: match[1],
    });
  }

  while ((match = italicRegex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: "italic",
      text: match[1],
    });
  }

  // Сортируем по позиции
  matches.sort((a, b) => a.start - b.start);

  // Удаляем пересекающиеся совпадения (приоритет у жирного)
  const filteredMatches: typeof matches = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    let overlaps = false;
    for (const filtered of filteredMatches) {
      if (
        (current.start >= filtered.start && current.start < filtered.end) ||
        (current.end > filtered.start && current.end <= filtered.end) ||
        (current.start <= filtered.start && current.end >= filtered.end)
      ) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) {
      filteredMatches.push(current);
    }
  }

  // Формируем результат
  let lastIndex = 0;
  filteredMatches.forEach((match) => {
    // Добавляем текст до совпадения
    if (match.start > lastIndex) {
      const plainText = text.substring(lastIndex, match.start);
      if (plainText) {
        parts.push(<span key={`text-${keyCounter++}`}>{plainText}</span>);
      }
    }

    // Добавляем форматированный текст
    if (match.type === "bold") {
      parts.push(
        <strong key={`bold-${keyCounter++}`} className="font-semibold text-slate-900">
          {formatInlineMarkdown(match.text)}
        </strong>
      );
    } else if (match.type === "italic") {
      parts.push(
        <em key={`italic-${keyCounter++}`} className="italic text-slate-600">
          {match.text}
        </em>
      );
    }

    lastIndex = match.end;
  });

  // Добавляем оставшийся текст
  if (lastIndex < text.length) {
    const plainText = text.substring(lastIndex);
    if (plainText) {
      parts.push(<span key={`text-${keyCounter++}`}>{plainText}</span>);
    }
  }

  // Если не было совпадений, возвращаем оригинальный текст
  if (parts.length === 0) {
    return text;
  }

  return <>{parts}</>;
}

/**
 * Форматирует резюме протокола
 */
export function formatProtocolSummary(summary: string): React.ReactNode {
  if (!summary) return null;

  return (
    <div className="space-y-3">
      {summary.split("\n").map((paragraph, idx) => {
        const trimmed = paragraph.trim();
        if (!trimmed) return null;
        return (
          <p key={idx} className="text-slate-700 leading-relaxed">
            {formatInlineMarkdown(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Форматирует стенограмму с разделением по спикерам
 */
export function formatTranscript(transcript: string): React.ReactNode {
  if (!transcript) return null;

  const lines = transcript.split("\n");
  const elements: React.ReactNode[] = [];
  let keyCounter = 0;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={`spacer-${keyCounter++}`} className="h-2" />);
      return;
    }

    // Формат: [MM:SS - MM:SS] Спикер X: текст
    // Также поддерживаем формат с именами участников: [MM:SS - MM:SS] Имя: текст
    const transcriptRegex = /^\[(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\]\s*(?:Спикер\s+([A-Z0-9]+)|([^:]+)):\s*(.+)$/i;
    const match = trimmed.match(transcriptRegex);

    if (match) {
      const [, startTime, endTime, speakerLabel, participantName, text] = match;
      const speaker = speakerLabel || participantName;
      const isSpeakerLabel = !!speakerLabel;
      
      elements.push(
        <div key={keyCounter++} className="my-2 p-3 bg-slate-50 border-l-4 border-blue-500 rounded-r hover:bg-slate-100 transition-colors">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-shrink-0">
              <span className="text-xs font-mono text-blue-600 bg-blue-100 px-2 py-1 rounded inline-block font-semibold">
                {startTime} - {endTime}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-blue-900 mr-2">
                {isSpeakerLabel ? `Спикер ${speaker}:` : `${speaker}:`}
              </span>
              <span className="text-slate-700">{text}</span>
            </div>
          </div>
        </div>
      );
    } else {
      // Обычный текст без метаданных
      elements.push(
        <p key={keyCounter++} className="text-slate-700 leading-relaxed my-1">
          {trimmed}
        </p>
      );
    }
  });

  return <div className="space-y-1">{elements}</div>;
}

