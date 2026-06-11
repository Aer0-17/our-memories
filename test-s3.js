#!/usr/bin/env node

/**
 * 阿里云OSS/S3连接测试脚本
 * 用法: node test-s3.js
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 读取 .env 文件
function loadEnv() {
  const envPaths = [
    path.join(__dirname, '.env'),
    path.join(__dirname, 'backend', '.env'),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim();
          if (value && !process.env[key]) {
            process.env[key] = value;
          }
        }
      });
    }
  }
}

loadEnv();

const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;

if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
  console.error('❌ 错误: 缺少S3配置');
  console.log('请配置 S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY');
  console.log('当前值:');
  console.log(`  S3_ENDPOINT: ${S3_ENDPOINT || '(空)'}`);
  console.log(`  S3_BUCKET: ${S3_BUCKET || '(空)'}`);
  console.log(`  S3_ACCESS_KEY_ID: ${S3_ACCESS_KEY_ID || '(空)'}`);
  console.log(`  S3_SECRET_ACCESS_KEY: ${S3_SECRET_ACCESS_KEY ? '***' : '(空)'}`);
  process.exit(1);
}

console.log('📁 S3/OSS配置:');
console.log(`   Endpoint: ${S3_ENDPOINT}`);
console.log(`   Bucket: ${S3_BUCKET}`);
console.log(`   Access Key: ${S3_ACCESS_KEY_ID.substring(0, 10)}...`);
console.log();

// 测试文件
const testFileName = 'test-' + Date.now() + '.txt';
const testContent = 'Hello from our-memories OSS test!';

console.log('🚀 开始测试上传文件...');
console.log(`   文件名: ${testFileName}`);
console.log();

// 构建上传请求
const url = new URL(S3_ENDPOINT);
const isHttps = url.protocol === 'https:';
const httpModule = isHttps ? https : http;

const date = new Date().toUTCString();
const contentType = 'text/plain';
const contentMD5 = crypto.createHash('md5').update(testContent).digest('base64');

// AWS Signature V2 (虚拟主机样式仍需包含bucket名)
const stringToSign = `PUT\n${contentMD5}\n${contentType}\n${date}\n/${S3_BUCKET}/${testFileName}`;
const signature = crypto.createHmac('sha1', S3_SECRET_ACCESS_KEY).update(stringToSign).digest('base64');
const authorization = `AWS ${S3_ACCESS_KEY_ID}:${signature}`;

const options = {
  hostname: url.hostname,
  port: url.port || (isHttps ? 443 : 80),
  path: `/${testFileName}`,
  method: 'PUT',
  headers: {
    'Host': url.hostname,
    'Date': date,
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(testContent),
    'Content-MD5': contentMD5,
    'Authorization': authorization,
  },
};

const req = httpModule.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('✅ 上传成功！');
      console.log(`📊 状态码: ${res.statusCode}`);
      console.log(`🔗 文件URL: ${S3_ENDPOINT}/${S3_BUCKET}/${testFileName}`);
      console.log();
      console.log('💡 请访问阿里云OSS控制台确认文件已上传');
    } else {
      console.error(`❌ 上传失败 (${res.statusCode})`);
      console.log('响应头:', res.headers);
      console.log('响应体:', responseData);
      console.log();
      console.log('🔍 常见问题:');
      console.log('  1. AccessKey ID 或 Secret 错误');
      console.log('  2. Bucket名称错误');
      console.log('  3. Bucket权限不足');
      console.log('  4. Endpoint地址错误');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ 请求失败:', error.message);
  console.log();
  console.log('🔍 可能的原因:');
  console.log('  1. 网络连接问题');
  console.log('  2. Endpoint地址错误');
  console.log('  3. 防火墙阻止');
});

req.write(testContent);
req.end();
