from flask import Flask, request, jsonify
from flask_cors import CORS
from youtube_transcript_api import YouTubeTranscriptApi

app = Flask(__name__)
CORS(app)

@app.route('/api/transcript', methods=['GET'])
def get_transcript():
    video_id = request.args.get('v')
    if not video_id:
        return jsonify({"error": "動画IDがありません"}), 400
        
    try:
        # 英語の字幕を取得
        transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])
        text_list = [t['text'] for t in transcript]
        full_text = " ".join(text_list)
        
        return jsonify({"text": full_text})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)
