import json
import re

import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from youtube_transcript_api import YouTubeTranscriptApi

app = Flask(__name__)
# 個人利用のローカルツール前提なので全オリジン許可。
# 将来ネットに公開するなら allow したいオリジンだけに絞ること。
CORS(app)

# 2026年7月時点の現行モデル。Geminiのモデル名は変わることがあるので、
# 動かない場合は https://ai.google.dev/gemini-api/docs/models で最新名を確認して差し替える。
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
)


@app.route("/api/transcript", methods=["GET"])
def get_transcript():
    video_id = request.args.get("v")
    if not video_id:
        return jsonify({"error": "動画IDがありません"}), 400

    try:
        ytt_api = YouTubeTranscriptApi()
        # 手動字幕・自動生成字幕どちらでも、英語系の言語コードを優先順に試す
        fetched = ytt_api.fetch(video_id, languages=["en", "en-US", "en-GB"])

        segments = [
            {"start": s.start, "duration": s.duration, "text": s.text} for s in fetched
        ]
        full_text = " ".join(s["text"] for s in segments)

        return jsonify({"text": full_text, "segments": segments})

    except Exception as e:
        msg = str(e)
        # cloud IP ブロック系のエラーはメッセージにキーワードが含まれることが多いので、
        # 例外クラス名がライブラリのバージョンで変わっても拾えるようにしている
        if any(k in msg for k in ("blocking requests", "RequestBlocked", "IpBlocked", "cloud provider")):
            return jsonify({
                "error": (
                    "YouTubeにIPアドレスをブロックされました。"
                    "クラウド(Render等)からのアクセスは制限されやすいので、"
                    "このAPIサーバーをローカルPCで起動して試してください。"
                )
            }), 503
        if "TranscriptsDisabled" in msg or "NoTranscriptFound" in msg:
            return jsonify({"error": "この動画には英語字幕が見つかりませんでした"}), 404
        if "VideoUnavailable" in msg:
            return jsonify({"error": "動画が見つかりません(IDを確認してください)"}), 404
        return jsonify({"error": msg}), 500


@app.route("/api/generate-quiz", methods=["POST"])
def generate_quiz():
    data = request.get_json(silent=True) or {}
    transcript_text = (data.get("transcript") or "").strip()
    api_key = (data.get("apiKey") or "").strip()

    if not transcript_text:
        return jsonify({"error": "字幕テキストがありません"}), 400
    if not api_key:
        return jsonify({"error": "Gemini APIキーが設定されていません"}), 400

    # 長すぎる字幕はトークン節約のため先頭のみ使用
    max_chars = 12000
    if len(transcript_text) > max_chars:
        transcript_text = transcript_text[:max_chars]

    prompt = f"""あなたは英語学習アプリの問題作成者です。以下はTEDトークの英語字幕です。
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

{{
  "dictation": [
    {{"before": "...", "answer": "...", "after": "..."}}
  ],
  "quiz": [
    {{"question": "...", "options": ["...", "...", "...", "..."], "correct_index": 0, "explanation": "..."}}
  ]
}}

--- 字幕 ---
{transcript_text}
"""

    try:
        resp = requests.post(
            GEMINI_URL,
            params={"key": api_key},
            json={
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.4,
                },
            },
            timeout=60,
        )

        if resp.status_code != 200:
            return jsonify({
                "error": f"Gemini APIエラー ({resp.status_code}): {resp.text[:300]}"
            }), 502

        body = resp.json()
        candidates = body.get("candidates", [])
        if not candidates:
            return jsonify({"error": "Geminiから問題が生成されませんでした"}), 502

        raw_text = candidates[0]["content"]["parts"][0]["text"]
        raw_text = re.sub(r"^```json\s*|\s*```$", "", raw_text.strip())

        quiz_data = json.loads(raw_text)
        return jsonify(quiz_data)

    except json.JSONDecodeError:
        return jsonify({"error": "Geminiの応答をJSONとして解析できませんでした"}), 502
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Gemini API呼び出しに失敗しました: {e}"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(port=5000, debug=True)
