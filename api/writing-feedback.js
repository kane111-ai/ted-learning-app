// POST /api/writing-feedback
// body: { transcript: string, summary: string }
// 学習者が書いた英語の要約をGeminiに採点・添削してもらう。

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POSTのみ対応しています" });
  }

  const { transcript, summary } = req.body || {};
  if (!summary || !String(summary).trim()) {
    return res.status(400).json({ error: "要約文が入力されていません" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "サーバーにGEMINI_API_KEYが設定されていません(Vercelの環境変数を確認してください)",
    });
  }

  const trimmedTranscript = String(transcript || "").slice(0, 8000);

  const prompt = `あなたは英語ライティングの先生です。以下はTEDトークの英語字幕(抜粋)と、
学習者がその内容を英語で要約した文章です。

--- 字幕(参考) ---
${trimmedTranscript}

--- 学習者が書いた要約 ---
${summary}

学習者の要約を、(1)内容が字幕の内容と合っているか、(2)英文としての正確さ・自然さ、
の2点から評価してください。

次のJSON形式のみで出力してください。前置き・説明文・Markdownのコードブロック記号は一切含めないこと。

{
  "score": 0から100の整数(内容の正確さと英文の質を総合した点数),
  "good_points": "良かった点(日本語で2〜3文)",
  "improvements": "改善点(日本語で2〜3文。具体的な文法・語彙・内容の指摘)",
  "corrected_version": "学習者の要約を自然な英語に添削したバージョン(英語のみ)"
}`;

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
          temperature: 0.3,
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
      return res.status(502).json({ error: "フィードバックを生成できませんでした" });
    }

    let raw = candidates[0].content.parts[0].text.trim();
    raw = raw.replace(/^```json\s*|\s*```$/g, "");

    const data = JSON.parse(raw);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
