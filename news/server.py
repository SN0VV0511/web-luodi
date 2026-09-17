from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime

import re
from datetime import datetime, date

app = Flask(__name__)
CORS(app)

DB_PATH = '/app/data/news.db'

ALLOWED_CATEGORIES = {'国际新闻', 'AI资讯', '科技数码', '财经动态'}
MAX_TITLE_LEN = 200
MAX_CONTENT_LEN = 2000
MAX_SOURCE_LEN = 100

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT DEFAULT '综合',
            source TEXT DEFAULT 'OpenClaw',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

@app.route('/api/news', methods=['GET'])
def get_news():
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    category = request.args.get('category', None)
    
    offset = (page - 1) * limit
    
    conn = get_db()
    c = conn.cursor()
    
    if category:
        c.execute('SELECT * FROM news WHERE category = ? ORDER BY id DESC LIMIT ? OFFSET ?', 
                  (category, limit, offset))
    else:
        c.execute('SELECT * FROM news ORDER BY id DESC LIMIT ? OFFSET ?', (limit, offset))
    
    news = [dict(row) for row in c.fetchall()]
    
    # 获取总数
    if category:
        c.execute('SELECT COUNT(*) FROM news WHERE category = ?', (category,))
    else:
        c.execute('SELECT COUNT(*) FROM news')
    total = c.fetchone()[0]
    
    conn.close()
    
    return jsonify({
        'news': news,
        'total': total,
        'page': page,
        'limit': limit,
        'pages': (total + limit - 1) // limit
    })

@app.route('/api/news', methods=['POST'])
def add_news():
    data = request.json
    if not data:
        return jsonify({'error': '请求体不能为空'}), 400

    title = (data.get('title') or '').strip()
    content = (data.get('content') or '').strip()
    category = (data.get('category') or '综合').strip()
    source = (data.get('source') or 'OpenClaw').strip()

    # 校验
    if not title:
        return jsonify({'error': '标题不能为空'}), 400
    if not content:
        return jsonify({'error': '内容不能为空'}), 400
    if len(title) > MAX_TITLE_LEN:
        return jsonify({'error': f'标题不能超过{MAX_TITLE_LEN}字'}), 400
    if len(content) > MAX_CONTENT_LEN:
        return jsonify({'error': f'内容不能超过{MAX_CONTENT_LEN}字'}), 400
    if len(source) > MAX_SOURCE_LEN:
        return jsonify({'error': f'来源不能超过{MAX_SOURCE_LEN}字'}), 400

    # 分类归一化
    normalized = None
    for allowed in ALLOWED_CATEGORIES:
        if allowed in category or category in allowed:
            normalized = allowed
            break
    if not normalized:
        return jsonify({'error': f'分类必须是以下之一：{", ".join(sorted(ALLOWED_CATEGORIES))}，收到: {category}'}), 400

    # 去重：同一天同标题不重复插入
    today = date.today().isoformat()
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id FROM news WHERE title = ? AND date(created_at) = ?", (title, today))
    if c.fetchone():
        conn.close()
        return jsonify({'error': '该新闻今天已存在', 'duplicate': True}), 409

    c.execute('INSERT INTO news (title, content, category, source) VALUES (?, ?, ?, ?)',
              (title, content, normalized, source))
    conn.commit()
    news_id = c.lastrowid
    conn.close()

    return jsonify({'id': news_id, 'title': title, 'content': content, 'category': normalized}), 201

@app.route('/api/news/latest', methods=['GET'])
def get_latest_news():
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM news ORDER BY id DESC LIMIT 1')
    news = c.fetchone()
    conn.close()
    
    if news:
        return jsonify(dict(news))
    return jsonify(None)

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=3003)
