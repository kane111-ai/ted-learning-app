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
        # ★エラーを回避するため、別の命令（最新の取得方法）に変更
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        transcript = transcript_list.find_transcript(['en']).fetch()
        
        text_list = [t['text'] for t in transcript]
        full_text = " ".join(text_list)
        
        return jsonify({"text": full_text})
        
    except Exception as e:
        # エラーの原因がさらに詳しく分かるように変更
        return jsonify({"error": str(e), "type": str(type(e))}), 500

if __name__ == '__main__':
    app.run(port=5000)
