// POST /api/generate-quiz
// body: { transcript: string }
// Gemini APIで穴埋めディクテーション+4択クイズを生成する。

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POSTのみ対応しています" });
  }

  const { transcript } = req.body || {};
  if (!transcript || !String(transcript).trim()) {
    return res.status(400).json({ error: "字幕テキストがありません" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "サーバーにGEMINI_API_KEYが設定されていません(Vercelの環境変数を確認してください)",
    });
  }

  const maxChars = 12000;
  const text = String(transcript).length > maxChars ? String(transcript).slice(0, maxChars) : String(transcript);

  const prompt = `あなたは英語学習アプリの問題作成者です。以下はTEDトークの英語字幕です。
この内容にもとづいて、日本人の英語学習者向けに次の2種類の問題を作成してください。

1. dictation: 穴埋めディクテーション問題を3問。
   元の字幕から1文ずつ選び、その中で学習価値の高い単語・フレーズを1つだけ空欄にする。
   - before: 空欄より前の部分(文字列)
   - answer: 空欄の正解。字幕中の表記そのまま(文字列)
   - after: 空欄より後の部分(文字列)

2. quiz: 内容理解を問う4択クイズを3問。
   - question: 質問文(日本語)
   - options: 選択肢4つの配列(日本語。必要なら英語のフレーズを含めてよい)
   - correct_index: 正解のインデックス(0始まりの整数)
   - explanation: 簡単な解説(日本語)

出力は次のJSON形式のみとし、前置き・説明文・Markdownのコードブロック記号は一切含めないこと。

{
  "dictation": [
    {"before": "...", "answer": "...", "after": "..."}
  ],
  "quiz": [
    {"question": "...", "options": ["...", "...", "...", "..."], "correct_index": 0, "explanation": "..."}
  ]
}

--- 字幕 ---
${text}
`;

  const GEMINI_MODEL = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.4,
        },
      }),
    });

    const body = await resp.json();

    if (!resp.ok) {
      return res.status(502).json({
        error: `Gemini APIエラー: ${JSON.stringify(body).slice(0, 300)}`,
      });
    }

    const candidates = body.candidates || [];
    if (!candidates.length) {
      return res.status(502).json({ error: "Geminiから問題が生成されませんでした" });
    }

    let raw = candidates[0].content.parts[0].text.trim();
    raw = raw.replace(/^```json\s*|\s*```$/g, "");

    const quizData = JSON.parse(raw);
    return res.status(200).json(quizData);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
