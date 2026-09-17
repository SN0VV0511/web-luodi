from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)

DB_PATH = 'data/guestbook.db'

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nickname TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

@app.route('/api/messages', methods=['GET'])
def get_messages():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT id, nickname, content, created_at FROM messages ORDER BY id DESC LIMIT 50')
    messages = [{'id': row[0], 'nickname': row[1], 'content': row[2], 'created_at': row[3]} for row in c.fetchall()]
    conn.close()
    return jsonify(messages)

@app.route('/api/messages', methods=['POST'])
def add_message():
    data = request.json
    nickname = data.get('nickname', '').strip()
    content = data.get('content', '').strip()
    
    if not nickname or not content:
        return jsonify({'error': '昵称和内容不能为空'}), 400
    
    if len(nickname) > 20:
        return jsonify({'error': '昵称不能超过20个字符'}), 400
    
    if len(content) > 500:
        return jsonify({'error': '内容不能超过500个字符'}), 400
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('INSERT INTO messages (nickname, content) VALUES (?, ?)', (nickname, content))
    conn.commit()
    message_id = c.lastrowid
    conn.close()
    
    return jsonify({'id': message_id, 'nickname': nickname, 'content': content}), 201

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=3002)
