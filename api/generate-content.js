// POST /api/generate-content
// body: { transcript, difficulty?, dictationCount?, quizCount?, vocabCount? }
// Gemini APIで、ディクテーション・理解度クイズ(日本語+英語)・重要単語集・単語クイズ(日本語+英語)を
// まとめて1回で生成する。クイズは日英両方を生成しておき、フロント側で再取得なしに切り替えられるようにする。

const DIFFICULTY_GUIDE = {
  easy: "各問題は易しめにしてください。ディクテーションの空欄は1語だけにし、短くシンプルな文を選んでください。内容クイズは文章から直接わかる事実を問う問題にしてください。",
  normal:
    "各問題は標準的な難易度にしてください。ディクテーションの空欄は1〜3語程度のまとまりにし、なるべく12語以上の長さがある文を選んでください。内容クイズは文中の複数の情報をつなげて考えさせる問題にしてください。",
  hard: "各問題は難しめにしてください。ディクテーションの空欄はイディオムや熟語、機能表現を含む3〜7語程度のまとまりにし、できるだけ長く構造が複雑な文を選んでください。内容クイズは事実確認では答えられない、スピーカーの意図・含意・ニュアンスを問う問題にしてください。",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POSTのみ対応しています" });
  }

  const {
    transcript,
    difficulty = "normal",
    dictationCount = 5,
    quizCount = 5,
    vocabCount = 8,
  } = req.body || {};

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
  const difficultyText = DIFFICULTY_GUIDE[difficulty] || DIFFICULTY_GUIDE.normal;
  const vocabQuizCount = Math.min(Number(vocabCount) || 8, 5);

  const prompt = `あなたは英語学習アプリの問題作成者です。以下はTEDトークの英語字幕です。
この内容にもとづいて、日本人の英語学習者向けに次の5種類のコンテンツを作成してください。

【難易度の指示】
${difficultyText}

1. dictation: 穴埋めディクテーション問題を${dictationCount}問。
   元の字幕から1文ずつ選び、その中で学習価値の高い部分を空欄にする。
   - before: 空欄より前の部分(文字列)
   - answer: 空欄の正解。字幕中の表記そのまま(文字列)
   - after: 空欄より後の部分(文字列)

2. quiz: 内容理解を問う4択クイズを${quizCount}問。question・options・explanationは日本語。
   - question: 質問文(日本語)
   - options: 選択肢4つの配列(日本語)
   - correct_index: 正解のインデックス(0始まりの整数)
   - explanation: 簡単な解説(日本語)

3. quiz_en: 上記quizと同じ内容・同じ問題数・同じ正解を、question・options・explanationすべて
   英語(中〜上級の英語学習者向けの平易な英語)で書いたバージョン。日本語は一切使わないこと。
   quizと同じ順番、同じcorrect_indexにすること。

4. vocabulary: 字幕中に出てくる学習価値の高い単語・フレーズを${vocabCount}個。
   - term: 単語・フレーズ(英語、字幕中の表記そのまま)
   - pos: 品詞など(例: "動詞", "熟語", "名詞" など、日本語で簡潔に)
   - meaning_ja: 日本語の意味
   - example_en: その単語を使った例文(字幕中の文をそのまま使ってよい)

5. vocab_quiz と vocab_quiz_en: 上記vocabularyの中から${vocabQuizCount}個を使った4択クイズを
   日本語版(vocab_quiz、optionsは日本語の意味)と英語版(vocab_quiz_en、optionsは英語の同義語・
   簡単な英語の説明)の両方作成する。同じtermで、同じ順番、同じcorrect_indexにすること。
   - term: 出題する単語・フレーズ
   - options: 選択肢4つ(1つが正解、3つはもっともらしい誤答)
   - correct_index: 正解のインデックス(0始まりの整数)

出力は次のJSON形式のみとし、前置き・説明文・Markdownのコードブロック記号は一切含めないこと。

{
  "dictation": [
    {"before": "...", "answer": "...", "after": "..."}
  ],
  "quiz": [
    {"question": "...", "options": ["...", "...", "...", "..."], "correct_index": 0, "explanation": "..."}
  ],
  "quiz_en": [
    {"question": "...", "options": ["...", "...", "...", "..."], "correct_index": 0, "explanation": "..."}
  ],
  "vocabulary": [
    {"term": "...", "pos": "...", "meaning_ja": "...", "example_en": "..."}
  ],
  "vocab_quiz": [
    {"term": "...", "options": ["...", "...", "...", "..."], "correct_index": 0}
  ],
  "vocab_quiz_en": [
    {"term": "...", "options": ["...", "...", "...", "..."], "correct_index": 0}
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
          temperature: 0.5,
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

    const data = JSON.parse(raw);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
