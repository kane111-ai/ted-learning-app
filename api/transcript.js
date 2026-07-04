// GET /api/transcript?v=VIDEO_ID
// Supadata (https://supadata.ai) を使って字幕を取得する。
// シャドーイング機能のため、区切り(セグメント)ごとのタイムスタンプも返す。
// 無料枠: 月100リクエストまで(2026年7月時点)。

export default async function handler(req, res) {
  const videoId = req.query.v;
  if (!videoId) {
    return res.status(400).json({ error: "動画IDがありません" });
  }

  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "サーバーにSUPADATA_API_KEYが設定されていません(Vercelの環境変数を確認してください)",
    });
  }

  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    // text=true を付けずにセグメント配列(offset/duration付き)で取得する
    const apiUrl = `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(videoUrl)}`;

    const resp = await fetch(apiUrl, {
      headers: { "x-api-key": apiKey },
    });
    const data = await resp.json();

    if (!resp.ok) {
      return res.status(resp.status).json({
        error: data.message || data.error || "字幕取得に失敗しました",
      });
    }

    let segments = [];
    if (Array.isArray(data.content)) {
      segments = data.content.map((seg) => ({
        start: (seg.offset || 0) / 1000,
        duration: (seg.duration || 0) / 1000,
        text: seg.text || "",
      }));
    } else if (typeof data.content === "string") {
      // 万が一プレーンテキストで返ってきた場合はセグメントなしで全文だけ扱う
      segments = [{ start: 0, duration: 0, text: data.content }];
    }

    const fullText = segments.map((s) => s.text).join(" ").trim();

    if (!fullText) {
      return res.status(404).json({ error: "この動画の字幕が見つかりませんでした" });
    }

    return res.status(200).json({ text: fullText, segments });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
