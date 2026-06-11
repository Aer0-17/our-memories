#!/usr/bin/env node

/**
 * DeepSeek API 测试脚本
 * 用法: node test-deepseek.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// 读取 .env 文件
function loadEnv() {
  const envPath = path.join(__dirname, 'backend', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}

loadEnv();

// 从环境变量读取配置
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_BASE = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com';

if (!DEEPSEEK_API_KEY) {
  console.error('❌ 错误: 请在 backend/.env 文件中设置 DEEPSEEK_API_KEY');
  console.log('示例: DEEPSEEK_API_KEY=sk-...');
  process.exit(1);
}

console.log('📁 配置信息:');
console.log(`   API Base: ${DEEPSEEK_API_BASE}`);
console.log(`   API Key: ${DEEPSEEK_API_KEY.substring(0, 10)}...`);
console.log();

// 测试文本
const testText = `今天我们去了北京故宫，看到了很多古建筑，还拍了好多照片。天气很好，心情也很棒！`;

console.log('🚀 开始测试 DeepSeek API...\n');
console.log('📝 原始文本:');
console.log(testText);
console.log('\n⏳ 请求中...\n');

const data = JSON.stringify({
  model: 'deepseek-chat',
  messages: [
    {
      role: 'system',
      content: '你是一个文本润色助手。请将用户输入的文本润色得更加优美、生动，保持原意，长度适当扩展。直接返回润色后的文本，不要添加任何解释。'
    },
    {
      role: 'user',
      content: testText
    }
  ],
  temperature: 0.7,
  max_tokens: 500
});

const url = new URL('/v1/chat/completions', DEEPSEEK_API_BASE);

const options = {
  hostname: url.hostname,
  port: url.port || 443,
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = https.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    try {
      const result = JSON.parse(responseData);

      if (result.error) {
        console.error('❌ API 错误:', result.error.message);
        process.exit(1);
      }

      if (result.choices && result.choices[0] && result.choices[0].message) {
        const polishedText = result.choices[0].message.content;
        console.log('✨ 润色后文本:');
        console.log(polishedText);
        console.log('\n✅ 测试成功！');
        console.log(`📊 使用 tokens: ${result.usage?.total_tokens || 'N/A'}`);
      } else {
        console.error('❌ 响应格式错误:', result);
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ 解析响应失败:', error.message);
      console.log('原始响应:', responseData);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ 请求失败:', error.message);
  process.exit(1);
});

req.write(data);
req.end();
